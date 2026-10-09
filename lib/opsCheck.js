// lib/opsCheck.js — 결제 대조 · 자동 복구(2026-10-08 · 앱 운영 · 서버 전용 · 매일 결제 작업 끝에 돈다).
// -----------------------------------------------------------------------------
// 자동으로 처리(돈이 잘못 나가지 않는 것만):
//   ① 환불 실패(payment REFUND_FAILED) → 먼저 토스에 실제로 취소됐는지 확인(됐으면 기록만 고침) → 아니면 다시 시도(하루 1번 · 3번까지)
//   ② 정기결제 실패로 기간이 지난 계정 → 대표에게 '카드 바꿔 주세요' 폰 알림(이용 기간마다 한 번)
// 사람이 볼 것(ops_alert status open → 회사 업무 사이트):
//   ③ 같은 계정 20일 안 구독 결제 2건(환불 기록 없음) = 이중 결제 의심
//   ④ 구독 결제 금액이 요금표와 다름
//   ⑤ 결제 실패 3일째
//   ⑥ 토스엔 결제됐는데 우리 기록에 없음(최근 3일)
//   ⑦ 환불을 3번 다시 시도해도 실패
// 같은 이상은 key(unique)로 한 번만 만든다. 시연 계정은 뺀다. 오류 기록은 90일 뒤 지운다.
// -----------------------------------------------------------------------------
import { cancelPayment, getPayment, listTransactions, tossReady } from "@/lib/toss";
import { planAmount, MAX_EXTRA_SEATS } from "@/lib/plans";
import { isDemoAccount } from "@/lib/demo";
import { sendPush, ownerIds } from "@/lib/pushServer";
import { fetchAllRows } from "@/lib/fetchAllRows";

const DAY = 86400000;
const SUB_PLANS = ["basic", "solo", "center"];
const PRICE_SINCE = "2026-10-08T00:00:00+09:00";   // 지금 요금표가 적용된 뒤의 결제만 금액 대조(그 전은 옛 가격)
const kstDay = (ms) => { const d = new Date(ms + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const kstStamp = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 19);
const short = (id) => String(id || "").slice(0, 8);

export async function runOpsChecks(sb, { now = Date.now(), dry = false } = {}) {
  const out = { refundFixed: 0, refundRetried: 0, refundStill: 0, duplicate: 0, mismatch: 0, failing: 0, cardNotices: 0, missing: 0, errors: [], dry, would: [] };
  // dry = 미리 보기(쓰기 · 알림 · 환불 없이 '무엇을 할지'만) — 점검 · 시험용
  const addAlert = async (_sb, row) => {
    if (dry) {
      const { data } = await sb.from("ops_alert").select("id").eq("key", row.key).maybeSingle();
      if (data) return false;
      out.would.push({ kind: row.kind, status: row.status || "open", title: row.title, amount: row.amount ?? null, account: row.account_id ? short(row.account_id) : null });
      return true;
    }
    const { error } = await sb.from("ops_alert").insert(row);
    return !error;   // key가 겹치면(이미 있음) false
  };
  const payUpdate = (id, patch) => (dry ? Promise.resolve() : sb.from("payment").update(patch).eq("id", id));
  const fail = (m) => { if (out.errors.length < 8) out.errors.push(m); };

  // ① 환불 실패 다시 시도
  try {
    const { data: rf } = await sb.from("payment").select("id, account_id, order_id, toss_payment_key, amount, raw").eq("status", "REFUND_FAILED").limit(50);
    for (const p of rf || []) {
      const amt = Math.abs(Number(p.amount) || 0);
      const tries = Number(p.raw?.ops_retries || 0);
      const base = { account_id: p.account_id, payment_id: p.id, amount: amt, detail: { order_id: p.order_id, account: short(p.account_id) } };
      if (!p.toss_payment_key || !amt) {
        if (await addAlert(sb, { ...base, key: `refund_failed_${p.id}`, kind: "refund_failed", severity: "urgent", title: "환불 실패 · 토스 결제 번호가 없어 자동으로 다시 할 수 없어요" })) out.refundStill++;
        continue;
      }
      if (p.raw?.ops_last_try && now - Date.parse(p.raw.ops_last_try) < 20 * 3600000) continue;   // 하루 한 번
      const g = await getPayment(p.toss_payment_key);
      const cancels = g.ok ? (g.data.cancels || []) : [];
      if (cancels.some((c) => Number(c.cancelAmount) === amt)) {
        await payUpdate(p.id, { status: "CANCELED", raw: { ...(p.raw || {}), ops_fixed: "already_canceled", ops_fixed_at: new Date(now).toISOString() } });
        await addAlert(sb, { ...base, key: `refund_fixed_${p.id}`, kind: "refund_retried", severity: "info", status: "auto", title: "환불은 실제로 됐었어요 · 기록만 고쳤어요" });
        out.refundFixed++;
        continue;
      }
      if (tries >= 3) {
        if (await addAlert(sb, { ...base, key: `refund_failed_${p.id}`, kind: "refund_failed", severity: "urgent", title: "환불을 3번 다시 시도해도 실패했어요 · 토스 확인 필요" })) out.refundStill++;
        continue;
      }
      if (dry) { out.would.push({ kind: "refund_retry", title: `환불 다시 시도 ${amt}원`, account: short(p.account_id) }); continue; }
      const r = await cancelPayment(p.toss_payment_key, { cancelReason: "환불 다시 시도", cancelAmount: amt, idempotencyKey: `opsretry_${p.id}_${tries}` });
      if (r.ok) {
        await sb.from("payment").update({ status: "CANCELED", raw: { ...(p.raw || {}), ops_retry_ok_at: new Date(now).toISOString() } }).eq("id", p.id);
        await addAlert(sb, { ...base, key: `refund_retried_${p.id}`, kind: "refund_retried", severity: "info", status: "auto", title: `환불 실패 건을 다시 시도해 환불했어요(${tries + 1}번째)` });
        out.refundRetried++;
      } else {
        await sb.from("payment").update({ raw: { ...(p.raw || {}), ops_retries: tries + 1, ops_last_try: new Date(now).toISOString(), ops_last_error: r.error?.code || r.status || null } }).eq("id", p.id);
      }
    }
  } catch (e) { fail(`환불 재시도: ${e?.message || e}`); }

  // ③ ④ 구독 결제 대조(최근 60일)
  try {
    const since = new Date(now - 60 * DAY).toISOString();
    const { data: pays } = await fetchAllRows(() => sb.from("payment").select("id, account_id, order_id, amount, status, plan, paid_at").gte("paid_at", since));
    const refunded = new Set((pays || []).filter((p) => /^(refund7_|refund_|opsrefund_)/.test(p.order_id || "") && ["CANCELED", "REFUND_FAILED"].includes(p.status))
      .map((p) => p.order_id.replace(/^(refund7_|refund_|opsrefund_)/, "")));
    const subs = (pays || []).filter((p) => p.status === "DONE" && SUB_PLANS.includes(p.plan) && Number(p.amount) > 0 && !isDemoAccount(p.account_id));
    const byAcc = new Map();
    for (const p of subs) { if (!byAcc.has(p.account_id)) byAcc.set(p.account_id, []); byAcc.get(p.account_id).push(p); }
    for (const list of byAcc.values()) {
      list.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)));
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        if (Date.parse(b.paid_at) - Date.parse(a.paid_at) >= 20 * DAY) continue;
        if (refunded.has(a.id) || refunded.has(b.id)) continue;
        if (await addAlert(sb, { key: `dup_${b.id}`, kind: "duplicate_charge", severity: "urgent", account_id: b.account_id, payment_id: b.id, amount: Number(b.amount),
          title: `20일 안에 구독 결제가 2번 됐어요 · 이중 결제 의심`, detail: { account: short(b.account_id), first: { id: a.id, paid_at: a.paid_at, amount: a.amount }, second: { id: b.id, paid_at: b.paid_at, amount: b.amount } } })) out.duplicate++;
      }
    }
    for (const p of subs) {
      if (String(p.paid_at) < PRICE_SINCE) continue;
      const allowed = p.plan === "center" ? Array.from({ length: (MAX_EXTRA_SEATS ?? 7) + 1 }, (_, n) => planAmount("center", n)) : [planAmount(p.plan, 0)];
      if (allowed.includes(Number(p.amount))) continue;
      if (await addAlert(sb, { key: `amt_${p.id}`, kind: "amount_mismatch", severity: "check", account_id: p.account_id, payment_id: p.id, amount: Number(p.amount),
        title: "구독 결제 금액이 요금표와 달라요", detail: { account: short(p.account_id), plan: p.plan, expected: allowed.slice(0, 3) } })) out.mismatch++;
    }
  } catch (e) { fail(`결제 대조: ${e?.message || e}`); }

  // ② ⑤ 정기결제 실패로 기간이 지난 계정
  try {
    // 카드가 등록돼 있고(실제로 결제를 시도하는 계정) 결제일이 지난 지 8일 안인 계정만 — 그보다 오래되면 결제 작업이 이미 이용을 멈춘다.
    //   카드 없는 옛 시범 · 테스트 계정에 '카드 바꿔 주세요'가 나가던 것 막기(2026-10-09 배포 확인에서 발견).
    const { data: due } = await sb.from("account").select("id, type, current_period_end, cancel_at_period_end")
      .eq("subscription_status", "active").eq("cancel_at_period_end", false).not("billing_key", "is", null)
      .lt("current_period_end", new Date(now).toISOString()).gt("current_period_end", new Date(now - 8 * DAY).toISOString()).limit(500);
    for (const a of due || []) {
      if (isDemoAccount(a.id)) continue;
      const end = Date.parse(a.current_period_end);
      const days = Math.floor((now - end) / DAY);
      const periodKey = String(a.current_period_end).slice(0, 10);
      if (await addAlert(sb, { key: `cardnotice_${a.id}_${periodKey}`, kind: "card_notice", severity: "info", status: "auto", account_id: a.id,
        title: "정기결제가 안 돼서 대표에게 '카드 바꿔 주세요' 알림을 보냈어요", detail: { account: short(a.id), type: a.type } })) {
        if (!dry) await sendPush(sb, { trainerIds: await ownerIds(sb, a.id), type: "account", url: "/settings",
          title: "카드 결제가 안 됐어요", body: `이번 달 구독료를 결제하지 못했어요. 설정 › 구독 관리에서 카드를 바꿔 주세요. ${kstDay(end + 7 * DAY)}까지 안 되면 이용이 멈춰요.` }).catch(() => {});
        out.cardNotices++;
      }
      if (days >= 3 && await addAlert(sb, { key: `failing_${a.id}_${periodKey}`, kind: "charge_failing", severity: "check", account_id: a.id,
        title: `정기결제 ${days}일째 실패 · ${kstDay(end + 7 * DAY)}에 이용이 멈춰요`, detail: { account: short(a.id), type: a.type, since: a.current_period_end } })) out.failing++;
    }
  } catch (e) { fail(`결제 실패 계정: ${e?.message || e}`); }

  // ⑥ 토스엔 있는데 우리 기록에 없음(최근 3일)
  if (tossReady()) {
    try {
      const r = await listTransactions({ startDate: kstStamp(now - 3 * DAY), endDate: kstStamp(now) });
      const done = (r.data || []).filter((t) => t.status === "DONE" && t.orderId);
      const ids = [...new Set(done.map((t) => t.orderId))];
      const have = new Set();
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await sb.from("payment").select("order_id").in("order_id", ids.slice(i, i + 100));
        for (const x of data || []) have.add(x.order_id);
      }
      for (const t of done) {
        if (have.has(t.orderId)) continue;
        if (Date.parse(t.transactionAt) > now - 30 * 60000) continue;   // 방금 결제(아직 저장 중일 수 있음)
        if (await addAlert(sb, { key: `missing_${t.orderId}`, kind: "toss_missing", severity: "urgent", amount: Number(t.amount) || null,
          title: "토스에는 결제됐는데 앱 기록에 없어요", detail: { order_id: t.orderId, at: t.transactionAt, method: t.method || null } })) out.missing++;
      }
      if (!r.ok) fail(`토스 거래 조회 실패(${r.status})`);
    } catch (e) { fail(`토스 대조: ${e?.message || e}`); }
  }

  // 오래된 오류 기록 정리(90일)
  if (!dry) try { await sb.from("app_error").delete().lt("created_at", new Date(now - 90 * DAY).toISOString()); } catch { /* 표 없음 */ }
  return out;
}
