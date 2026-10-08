// app/api/cron/charge-subscriptions/route.js
// -----------------------------------------------------------------------------
// 정기결제 자동 청구(Phase 2 · Vercel Cron 매일). 체험/구독 만료 임박 계정을
// 등록된 빌링키로 청구하고 이용기간을 한 달 연장한다.
// - 대상: billing_key 있고 subscription_status='active'이며 current_period_end 가
//         곧(≤ now+1일) 만료되는 계정. 창을 1일로 둬 만료 직전에 청구 → 잠김 없음.
// - 연장 기준 = 기존 만료일(과거면 now)에서 +1개월 → 청구일이 앞당겨져도 경계는 고정.
// - 멱등(2026-10-08): orderId = sub_{account}_{이번 만료일}(+ _2 · _3 실패 재시도) · 이 기간 DONE이 있으면 청구 없이 연장만 보정.
// - 해지예약(cancel_at_period_end)+실제만료 → 청구 안 하고 subscription_status='inactive'.
// - 결제 실패: payment FAILED 로그, 연장 안 함(자연 만료 → 잠김). 다음날 재시도 · 만료 뒤 7일 넘으면 멈추고 inactive.
// 인증: Vercel Cron 이 Authorization: Bearer <CRON_SECRET> 을 실어 보냄.
// ⚠️ access 판정(my_account_status)= subscription_status='active' AND period_end>now.
//    그래서 성공 시 반드시 active 유지 + period_end 연장.
// -----------------------------------------------------------------------------
import { bearerOk } from "@/lib/bearerOk";
import { createClient } from "@supabase/supabase-js";
import { chargeBilling, tossReady } from "@/lib/toss";
import { PLANS, planAmount } from "@/lib/plans";
import { sendPush, ownerIds } from "@/lib/pushServer";
import { trainerCloseAt, kstDay } from "@/lib/trainerClose";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400000;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 시크릿 미설정 = fail-closed
  return bearerOk(req, secret);
}

// 만료일 + 1개월(말일 오버플로 보정: 1/31 → 2/28).
function addOneMonth(date) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "supabase 키 미설정" }, { status: 503 });
  if (!tossReady()) return Response.json({ error: "TOSS_SECRET_KEY 미설정" }, { status: 503 });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const now = Date.now();
  const dueBeforeIso = new Date(now + DAY).toISOString(); // 만료 1일 전부터 청구

  // 청구 대상 — 빌링키 있고 활성이며 곧 만료. (해지예약도 active라 여기 잡혀 아래서 분기.)
  const { data: accounts, error: ae } = await sb
    .from("account")
    .select("id, type, billing_key, billing_customer_key, billing_plan, extra_seats, next_billing_plan, next_extra_seats, current_period_end, cancel_at_period_end, subscription_status")
    .not("billing_key", "is", null)
    .eq("subscription_status", "active")
    .lte("current_period_end", dueBeforeIso)
    .limit(500);
  if (ae) return Response.json({ error: `account 조회 실패: ${ae.message}` }, { status: 500 });

  let charged = 0, canceled = 0, failed = 0, skipped = 0, repaired = 0, stopped = 0;
  const errors = [];
  const note = (m) => { if (errors.length < 8) errors.push(m); };

  for (const acc of accounts || []) {
    try {
      const periodEnd = acc.current_period_end ? new Date(acc.current_period_end) : null;
      if (!periodEnd) { skipped++; continue; }

      // 해지 예약 + 실제 만료 → 청구 없이 비활성(만료 전이면 다음 실행에서 처리).
      if (acc.cancel_at_period_end) {
        if (periodEnd.getTime() <= now) {
          await sb.from("account").update({ subscription_status: "inactive" }).eq("id", acc.id);
          canceled++;
        } else {
          skipped++;
        }
        continue;
      }

      // 카드 결제가 만료일 뒤 7일 넘게 계속 실패 = 재시도 멈춤(2026-10-08 · 떠난 고객이 몇 주 뒤 갑자기 결제되던 것 막기)
      if (periodEnd.getTime() < now - 7 * DAY) {
        await sb.from("account").update({ subscription_status: "inactive" }).eq("id", acc.id);
        stopped++;
        continue;
      }

      // 다음 결제일부터 바뀌는 것(프로 → 베이직 내리기 · 센터 자리 줄이기 · 2026-10-07) — 이번 청구부터 새 값으로
      const planKey = acc.type === "center" ? "center" : (acc.next_billing_plan || acc.billing_plan || "solo");
      const seats = acc.type === "center" ? (acc.next_extra_seats ?? acc.extra_seats ?? 0) : 0;
      const amount = planAmount(planKey, seats);
      if (!amount) { failed++; note(`${acc.id}: 알 수 없는 플랜(${planKey})`); continue; }

      // 연장 기준: 만료일(과거면 now)에서 +1개월 → 경계 고정, 과거 만료는 now부터.
      const base = periodEnd.getTime() > now ? periodEnd : new Date(now);
      const newEnd = addOneMonth(base);

      // 멱등(2026-10-08): 주문번호를 '오늘'이 아니라 '이 이용 기간(만료일)'으로 묶는다.
      //   예전엔 결제 성공 뒤 연장 저장이 실패하면 다음 날 주문번호가 달라져 한 번 더 청구됐다.
      //   이 기간에 DONE이 이미 있으면 청구하지 않고 연장만 보정한다. 실패한 시도는 _2 · _3 … 로 새 번호(같은 번호 재사용 금지).
      const periodKey = periodEnd.toISOString().slice(0, 10);
      const prefix = `sub_${acc.id}_${periodKey}`;
      const { data: prev } = await sb.from("payment").select("order_id, status, period_end").like("order_id", `${prefix}%`);
      const done = (prev || []).find((p) => p.status === "DONE");
      if (done) {
        const fixEnd = done.period_end || newEnd.toISOString();
        if (Date.parse(fixEnd) > periodEnd.getTime()) {
          await sb.from("account").update({
            current_period_end: fixEnd, subscription_status: "active",
            billing_plan: planKey, extra_seats: seats, next_billing_plan: null, next_extra_seats: null,
          }).eq("id", acc.id);
          repaired++;
          note(`${acc.id}: 이미 청구된 기간 · 연장만 보정`);
        } else skipped++;
        continue;
      }
      const attempt = (prev || []).length + 1;
      const orderId = attempt === 1 ? prefix : `${prefix}_${attempt}`;
      const orderName = `${PLANS[planKey]?.name || "구독"} 월 구독`;

      const res = await chargeBilling(acc.billing_key, {
        customerKey: acc.billing_customer_key,
        amount,
        orderId,
        orderName,
      });

      if (res.ok && res.data?.status === "DONE") {
        // 결제 기록을 먼저 남긴다 — 그래야 아래 연장 저장이 실패해도 내일 이 기간을 다시 청구하지 않는다.
        const { error: pe } = await sb.from("payment").insert({
          account_id: acc.id,
          order_id: orderId,
          toss_payment_key: res.data.paymentKey || null,
          amount,
          status: "DONE",
          plan: planKey,
          period_start: new Date(now).toISOString(),
          period_end: newEnd.toISOString(),
          raw: { approvedAt: res.data.approvedAt ?? null },
        });
        if (pe) note(`${acc.id}: 청구 성공 · 결제 기록 실패(수동 확인)`);
        const upd = await sb.from("account").update({
          current_period_end: newEnd.toISOString(),
          last_payment_at: new Date(now).toISOString(),
          subscription_status: "active",
          billing_plan: planKey, extra_seats: seats, next_billing_plan: null, next_extra_seats: null,
        }).eq("id", acc.id).select();
        if (upd.error || !upd.data || upd.data.length === 0) note(`${acc.id}: 청구 성공 · 연장 실패(내일 자동 보정)`);
        charged++;
      } else {
        await sb.from("payment").insert({
          account_id: acc.id,
          order_id: orderId,
          amount,
          status: "FAILED",
          plan: planKey,
          raw: { error: res.error ?? null, status: res.status ?? null },
        });
        failed++;
        note(`${acc.id}: 청구 실패(${res.error?.code || res.status || "unknown"})`);
      }
    } catch (e) {
      // 한 계정에서 터져도 다음 계정은 계속(예전엔 루프 전체가 멈췄다)
      failed++;
      note(`${acc.id}: 처리 중 오류(${e?.message || e})`);
      console.error("[charge-subscriptions]", acc.id, e);
    }
  }

  // ── 읽기 전용 30일이 끝나기 하루 전 — 대표에게 '내일 기록이 지워져요' 알림(2026-10-07 · 한 번만 · purge_notified_at) ──
  //   ⚠️ 실제 파기는 아직 자동으로 하지 않는다(대표 확인 뒤 별도 작업). 대상 수만 돌려준다(purgeDue).
  let purgeNotified = 0, purgeDue = 0;
  const RO = 30 * DAY;
  const { data: ro } = await sb.from("account")
    .select("id, current_period_end, purge_notified_at, subscription_status")
    .not("current_period_end", "is", null)
    .lte("current_period_end", new Date(now - RO + DAY).toISOString())   // 끝 + 30일 ≤ 내일
    .limit(500);
  for (const a of ro || []) {
    const end = Date.parse(a.current_period_end);
    if (a.subscription_status === "active" && end > now) continue;      // 다시 결제해서 이용 중
    if (end + RO <= now) { purgeDue++; continue; }                       // 이미 30일 지남 = 파기 대상(보고만)
    if (a.purge_notified_at) continue;
    const ids = await ownerIds(sb, a.id);
    const day = new Date(end + RO + 9 * 3600000);
    await sendPush(sb, {
      trainerIds: ids, type: "account", url: "/settings",
      title: "내일 기록이 지워져요",
      body: `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일에 회원 · 기록이 지워져요. 필요하면 오늘 '내 데이터 내려받기'를 해 주세요.`,
    });
    await sb.from("account").update({ purge_notified_at: new Date(now).toISOString() }).eq("id", a.id);
    purgeNotified++;
  }

  // ── 끈 트레이너 아이디 한 달 보관(2026-10-08 · lib/trainerClose) — 7일 전 대표 알림 · 지나면 정리 ──
  //   정리 = 로그인 영구 차단 + 이메일을 '정리됨' 주소로(같은 이메일로 새로 가입 가능) + 폰 알림 구독 삭제 + closed_at.
  //   트레이너 행 · 이름은 지난 수업 · 매출 · 급여 기록 때문에 남긴다. 회원은 센터에 그대로(넘기기는 기한 없음).
  let trainerClosed = 0, trainerReminded = 0;
  const { data: offs } = await sb.from("trainer").select("id, name, account_id, deactivated_at, close_notified_at")
    .eq("active", false).is("closed_at", null).not("deactivated_at", "is", null).limit(500);
  for (const t of offs || []) {
    try {
      const end = trainerCloseAt(t.deactivated_at);
      const { count: left } = await sb.from("user_table").select("id", { count: "exact", head: true })
        .eq("account_id", t.account_id).eq("trainer_id", t.id).or("hidden.is.null,hidden.eq.false").neq("status", "inactive");
      const leftTxt = left ? ` 담당 회원 ${left}명을 아직 넘기지 않았어요.` : "";
      if (end <= now) {
        const { error: ue } = await sb.auth.admin.updateUserById(t.id, { email: `closed-${t.id}@closed.onlytrainer.invalid`, email_confirm: true, ban_duration: "876000h" });
        if (ue) { errors.push({ trainer: t.id, error: `정리 실패: ${ue.message}` }); continue; }
        await sb.from("push_subscription").delete().eq("trainer_id", t.id);
        await sb.from("trainer").update({ closed_at: new Date(now).toISOString() }).eq("id", t.id);
        await sendPush(sb, { trainerIds: await ownerIds(sb, t.account_id), type: "account", url: "/admin?tab=ops",
          title: "트레이너 아이디를 정리했어요", body: `${t.name || "트레이너"} 아이디를 정리했어요. 다시 오면 새 아이디로 추가해 주세요.${leftTxt}` });
        trainerClosed++;
      } else if (!t.close_notified_at && end - now <= 7 * DAY) {
        await sendPush(sb, { trainerIds: await ownerIds(sb, t.account_id), type: "account", url: "/admin?tab=ops",
          title: "트레이너 아이디가 곧 정리돼요", body: `${t.name || "트레이너"} 아이디가 ${kstDay(end)}에 정리돼요. 그 뒤엔 다시 켤 수 없어요.${leftTxt}` });
        await sb.from("trainer").update({ close_notified_at: new Date(now).toISOString() }).eq("id", t.id);
        trainerReminded++;
      }
    } catch (e) {
      errors.push({ trainer: t.id, error: String(e?.message || e) });
    }
  }

  return Response.json({ ok: true, total: (accounts || []).length, charged, canceled, failed, skipped, repaired, stopped, errors, purgeNotified, purgeDue, trainerClosed, trainerReminded });
}
