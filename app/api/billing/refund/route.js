// app/api/billing/refund/route.js — 첫 결제 7일 안 전액 환불(2026-10-07 대표 결정 · 무료 체험 대신)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만. 계정당 한 번 · 첫 구독 결제에만 · 써 봤어도 전액.
//   대상 결제 = 첫 구독 결제(basic · solo · center) + 그 뒤 7일 안의 요금제 올리기 · 자리 추가(upgrade · seat).
//   추가 팩은 따로(안 쓴 팩만 · /api/billing/pack). 예전 무료 체험(TRIAL)을 쓴 계정은 대상 아님(체험 + 환불 = 두 번 무료).
// 환불하면: 토스 결제 취소 → 이용 종료(지금) → 30일 볼 수만 · 내려받기(약관 11조와 같은 흐름) · 카드(빌링키) 지움.
// GET = 지금 환불할 수 있는지(구독 관리 화면 버튼) · POST = 환불.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { cancelPayment, tossReady } from "@/lib/toss";
import { REFUND_DAYS } from "@/lib/plans";

export const runtime = "nodejs";

const SUB = ["basic", "solo", "center"];
const WITH_SUB = ["basic", "solo", "center", "upgrade", "seat"];

async function state(sb, accountId) {
  const { data: pays, error } = await sb.from("payment")
    .select("id, order_id, toss_payment_key, amount, status, plan, paid_at")
    .eq("account_id", accountId).order("paid_at", { ascending: true });
  if (error) return { error };
  const list = pays || [];
  if (list.some((p) => p.status === "TRIAL")) return { eligible: false, reason: "trial" };
  if (list.some((p) => String(p.order_id || "").startsWith("refund7_"))) return { eligible: false, reason: "refunded" };
  const first = list.find((p) => p.status === "DONE" && SUB.includes(p.plan));
  if (!first) return { eligible: false, reason: "none" };
  const start = Date.parse(first.paid_at);
  const until = start + REFUND_DAYS * 86400000;
  if (Date.now() >= until) return { eligible: false, reason: "expired", until: new Date(until).toISOString() };
  const targets = list.filter((p) => p.status === "DONE" && WITH_SUB.includes(p.plan) && Date.parse(p.paid_at) >= start && Date.parse(p.paid_at) < until);
  const amount = targets.reduce((s, p) => s + (p.amount || 0), 0);
  return { eligible: true, until: new Date(until).toISOString(), amount, targets };
}

async function guard(req) {
  const sb = serviceClient();
  if (!sb) return { res: Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 }) };
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return { res: Response.json({ error: "다시 로그인해 주세요." }, { status: 401 }) };
  if (me.role !== "owner") return { res: Response.json({ error: "대표만 환불을 요청할 수 있어요." }, { status: 403 }) };
  return { sb, me };
}

export async function GET(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const s = await state(g.sb, g.me.account_id);
  if (s.error) { console.error("[billing/refund] 조회 실패", s.error.message); return Response.json({ error: "확인하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }
  return Response.json({ eligible: s.eligible, reason: s.reason || null, until: s.until || null, amount: s.amount || 0 });
}

export async function POST(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { sb, me } = g;
  if (!tossReady()) return Response.json({ error: "결제 설정이 아직 준비되지 않았어요. 고객센터로 알려 주세요." }, { status: 503 });
  const s = await state(sb, me.account_id);
  if (s.error) { console.error("[billing/refund] 조회 실패", s.error.message); return Response.json({ error: "확인하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }
  if (!s.eligible) {
    const msg = s.reason === "expired" ? "첫 결제 뒤 7일이 지나 전액 환불 기간이 끝났어요."
      : s.reason === "refunded" ? "이미 한 번 환불받은 계정이에요."
      : s.reason === "trial" ? "무료 체험을 쓴 계정은 7일 전액 환불 대상이 아니에요. 고객센터로 문의해 주세요."
      : "환불할 결제가 없어요.";
    return Response.json({ error: msg }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  // 1) 먼저 이용을 멈춘다(그 사이 자동 결제 · 쓰기가 안 되게) — 카드도 지움. 환불이 하나도 안 되면 되돌린다.
  const nowIso = new Date().toISOString();
  const { data: acc } = await sb.from("account").select("subscription_status, current_period_end, billing_key, cancel_at_period_end").eq("id", me.account_id).maybeSingle();
  const { data: stopped, error: se } = await sb.from("account").update({
    subscription_status: "inactive", current_period_end: nowIso, billing_key: null, cancel_at_period_end: false,
    cancel_requested_at: nowIso, cancel_reason: reason ? `[7일 환불] ${reason}` : "[7일 환불]",
  }).eq("id", me.account_id).select("id");
  if (se || !stopped?.length) { console.error("[billing/refund] 이용 멈춤 실패", se?.message); return Response.json({ error: "환불하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }

  // 2) 결제마다 전액 취소(멱등 키 = 결제 id)
  let done = 0, refunded = 0; const failed = [];
  for (const p of s.targets) {
    if (!p.toss_payment_key) { failed.push(p.id); continue; }
    const r = await cancelPayment(p.toss_payment_key, { cancelReason: "첫 결제 7일 안 전액 환불", idempotencyKey: `refund7_${p.id}` });
    if (!r.ok) { console.error("[billing/refund] 취소 실패", p.id, r.status, r.error?.code || r.error?.message); failed.push(p.id); continue; }
    done++; refunded += p.amount || 0;
    await sb.from("payment").insert({ account_id: me.account_id, order_id: `refund7_${p.id}`, toss_payment_key: p.toss_payment_key,
      amount: -(p.amount || 0), status: "CANCELED", plan: p.plan, raw: { canceledAt: nowIso, kind: "refund7" } });
  }

  if (done === 0) {
    // 하나도 못 돌려줬으면 이용을 원래대로
    await sb.from("account").update({ subscription_status: acc?.subscription_status ?? "active", current_period_end: acc?.current_period_end ?? null,
      billing_key: acc?.billing_key ?? null, cancel_at_period_end: acc?.cancel_at_period_end ?? false, cancel_requested_at: null, cancel_reason: null }).eq("id", me.account_id);
    return Response.json({ error: "환불하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
  if (failed.length) {
    console.error("[billing/refund] 일부 환불 실패 — 수동 처리 필요", me.account_id, failed);
    return Response.json({ ok: true, partial: true, refunded, error: "일부 금액을 환불하지 못했어요. 고객센터로 알려 주시면 바로 처리해 드릴게요." });
  }
  return Response.json({ ok: true, refunded });
}
