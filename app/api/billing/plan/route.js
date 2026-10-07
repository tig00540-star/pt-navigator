// app/api/billing/plan/route.js — 요금제 바꾸기 · 센터 트레이너 자리(2026-10-07 · 요금제 개편 계획서 3)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만. account UPDATE 정책은 열지 않고 여기(service_role)서만 쓴다.
//   action 'upgrade'     = 베이직 → 프로: 남은 기간 차액만 바로 결제(빌링키) → 바로 프로 · 남은 기간을 프로로 · 다음 결제일부터 59,000원
//   action 'downgrade'   = 프로 → 베이직: 다음 결제일부터(그때까지 프로 · 환불 없음)
//   action 'keep'        = 내리기 예약 취소
//   action 'seat_add'    = 센터 트레이너 자리 +1: 남은 기간 일할 금액을 바로 결제 → 성공해야 열림 · 다음 결제일부터 39,900원 포함
//   action 'seat_remove' = 자리 -1: 다음 결제일부터(쓰는 트레이너 수보다 적게는 못 줄임)
// 체험 중(실결제 없음)은 결제 없이 바로 바뀐다(체험이 끝나면 바뀐 금액으로 첫 결제).
// GET = 지금 바꾸면 얼마인지 미리 보기(?action=upgrade|seat_add).
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { chargeBilling, tossReady } from "@/lib/toss";
import { PLANS, SEAT_PRICE, MAX_EXTRA_SEATS, proratedDiff } from "@/lib/plans";

export const runtime = "nodejs";

const SUB = ["basic", "solo", "center"];

async function load(sb, me) {
  const { data: acc } = await sb.from("account")
    .select("id, type, subscription_status, current_period_end, billing_key, billing_customer_key, billing_plan, next_billing_plan, extra_seats, next_extra_seats, cancel_at_period_end")
    .eq("id", me.account_id).maybeSingle();
  if (!acc) return null;
  const { data: pays } = await sb.from("payment").select("id, status, plan, period_start, period_end, paid_at")
    .eq("account_id", acc.id).eq("status", "DONE").in("plan", SUB).order("paid_at", { ascending: false }).limit(1);
  const last = pays?.[0] || null;
  const end = acc.current_period_end ? Date.parse(acc.current_period_end) : null;
  // 이번 결제 기간의 시작 = 마지막 월 구독 결제의 시작(없으면 끝에서 한 달 전)
  let start = last?.period_start ? Date.parse(last.period_start) : null;
  if (!start && end) { const d = new Date(end); d.setUTCMonth(d.getUTCMonth() - 1); start = d.getTime(); }
  const trial = !last;
  const running = acc.subscription_status === "active" && (end == null || end > Date.now());
  return { acc, end, start, trial, running };
}

function quote(ctx, action) {
  const { acc, end, start, trial } = ctx;
  if (trial || !end || !start) return 0;
  if (action === "upgrade") return proratedDiff(PLANS.solo.amount - PLANS.basic.amount, start, end);
  if (action === "seat_add") return proratedDiff(SEAT_PRICE, start, end);
  return 0;
}

async function guard(req) {
  const sb = serviceClient();
  if (!sb) return { res: Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 }) };
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return { res: Response.json({ error: "다시 로그인해 주세요." }, { status: 401 }) };
  if (me.role !== "owner") return { res: Response.json({ error: "대표만 구독을 바꿀 수 있어요." }, { status: 403 }) };
  const ctx = await load(sb, me);
  if (!ctx) return { res: Response.json({ error: "계정을 찾지 못했어요." }, { status: 404 }) };
  if (!ctx.running) return { res: Response.json({ error: "이용 기간이 끝났어요. 카드를 등록하면 고른 요금제로 다시 시작해요." }, { status: 409 }) };
  return { sb, me, ctx };
}

export async function GET(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const action = new URL(req.url).searchParams.get("action");
  return Response.json({ amount: quote(g.ctx, action), trial: g.ctx.trial, periodEnd: g.ctx.acc.current_period_end });
}

export async function POST(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { sb, ctx } = g;
  const { acc } = ctx;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const isCenter = acc.type === "center";
  const tier = isCenter ? "center" : (acc.billing_plan || "solo");

  const save = async (patch) => {
    const { data, error } = await sb.from("account").update(patch).eq("id", acc.id)
      .select("billing_plan, next_billing_plan, extra_seats, next_extra_seats");
    if (error || !data?.length) { console.error("[billing/plan] 저장 실패", error?.message); return null; }
    return data[0];
  };
  // 남은 기간 금액을 바로 결제(빌링키) — 체험 중이거나 0원이면 결제 없이 통과
  const pay = async (amount, kind, orderName) => {
    if (!amount) return { ok: true, paid: 0 };
    if (!tossReady()) return { ok: false, error: "결제 설정이 아직 준비되지 않았어요. 고객센터로 알려 주세요." };
    if (!acc.billing_key) return { ok: false, error: "등록된 카드가 없어요. 카드를 다시 등록해 주세요." };
    const orderId = `${kind}_${acc.id}_${Date.now()}`;
    const r = await chargeBilling(acc.billing_key, { customerKey: acc.billing_customer_key, amount, orderId, orderName });
    const done = r.ok && r.data?.status === "DONE";
    await sb.from("payment").insert({
      account_id: acc.id, order_id: orderId, toss_payment_key: done ? (r.data.paymentKey || null) : null, amount,
      status: done ? "DONE" : "FAILED", plan: kind, period_start: new Date().toISOString(), period_end: acc.current_period_end,
      raw: done ? { approvedAt: r.data.approvedAt ?? null } : { error: r.error ?? null, status: r.status ?? null },
    });
    if (!done) { console.error("[billing/plan] 결제 실패", kind, r.status, r.error?.code || r.error?.message); return { ok: false, error: "카드 결제에 실패했어요. 카드 정보를 확인하고 다시 시도해 주세요." }; }
    return { ok: true, paid: amount };
  };

  if (action === "upgrade") {
    if (isCenter || tier !== "basic") return Response.json({ error: "베이직에서만 프로로 올릴 수 있어요." }, { status: 409 });
    const amount = quote(ctx, "upgrade");
    const p = await pay(amount, "upgrade", "프로로 올리기(남은 기간)");
    if (!p.ok) return Response.json({ error: p.error }, { status: 402 });
    const row = await save({ billing_plan: "solo", next_billing_plan: null });
    if (!row) return Response.json({ error: p.paid ? "결제는 됐지만 바꾸지 못했어요. 고객센터로 알려 주세요." : "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
    return Response.json({ ok: true, paid: p.paid, plan: "solo" });
  }

  if (action === "downgrade" || action === "keep") {
    if (isCenter || tier !== "solo") return Response.json({ error: "프로에서만 베이직으로 바꿀 수 있어요." }, { status: 409 });
    const row = await save({ next_billing_plan: action === "downgrade" ? "basic" : null });
    if (!row) return Response.json({ error: "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
    return Response.json({ ok: true, nextPlan: row.next_billing_plan, periodEnd: acc.current_period_end });
  }

  if (action === "seat_add" || action === "seat_remove") {
    if (!isCenter) return Response.json({ error: "센터 요금제에서만 트레이너 자리를 바꿀 수 있어요." }, { status: 409 });
    const cur = acc.extra_seats || 0;
    if (action === "seat_add") {
      if (cur >= MAX_EXTRA_SEATS) return Response.json({ error: `트레이너는 최대 ${3 + MAX_EXTRA_SEATS}명까지예요. 더 필요하면 고객센터로 알려 주세요.` }, { status: 409 });
      const amount = quote(ctx, "seat_add");
      const p = await pay(amount, "seat", "트레이너 자리 추가(남은 기간)");
      if (!p.ok) return Response.json({ error: p.error }, { status: 402 });
      const row = await save({ extra_seats: cur + 1, next_extra_seats: null });
      if (!row) return Response.json({ error: p.paid ? "결제는 됐지만 자리를 열지 못했어요. 고객센터로 알려 주세요." : "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
      return Response.json({ ok: true, paid: p.paid, extraSeats: row.extra_seats });
    }
    const target = Math.max(0, (acc.next_extra_seats ?? cur) - 1);
    const { count: used } = await sb.from("trainer").select("id", { count: "exact", head: true })
      .eq("account_id", acc.id).eq("role", "trainer").eq("active", true);
    if ((used ?? 0) > PLANS.center.trainerSeats + target) {
      return Response.json({ error: "쓰는 트레이너가 자리보다 많아요. 먼저 트레이너를 정리한 뒤 줄여 주세요." }, { status: 409 });
    }
    const row = await save({ next_extra_seats: target === cur ? null : target });
    if (!row) return Response.json({ error: "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
    return Response.json({ ok: true, nextExtraSeats: row.next_extra_seats, periodEnd: acc.current_period_end });
  }

  return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
}
