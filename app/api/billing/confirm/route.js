// 카드 등록 성공 → 빌링키 발급 + 7일 무료체험 시작(계정 활성). ⚠️ owner만. service_role.
// 2026-10-06 오류 점검: ① 무료체험은 계정당 한 번 — 체험이나 결제 이력이 있으면 바로 첫 달 결제(실패면 활성화 안 함).
//   ② 요금제는 화면이 아니라 계정 종류(account.type: solo · center)로 서버가 정한다(센터가 솔로 가격으로 결제되던 구멍).
// create-trainer 라우트와 동일한 보안 패턴(Bearer→getUser→owner 검증→service_role write).
// 첫 실청구는 없음(7일 무료) — 만료 임박 시 크론(Phase 2)이 billingKey로 자동 청구.
import { createClient } from "@supabase/supabase-js";
import { issueBillingKey, chargeBilling, tossReady } from "@/lib/toss";
import { PLANS, TRIAL_DAYS, planAmount } from "@/lib/plans";

// 달 더하기 — 말일 넘침 보정(크론 charge-subscriptions와 같은 규칙).
function addOneMonth(d) {
  const x = new Date(d.getTime());
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + 1);
  if (x.getUTCDate() < day) x.setUTCDate(0);
  return x;
}

export const runtime = "nodejs";

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[billing/confirm] 503 서버키 미설정");
    return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  }
  if (!tossReady()) {
    console.error("[billing/confirm] 503 TOSS_SECRET_KEY 미설정");
    return Response.json({ error: "결제 키 미설정" }, { status: 503 });
  }

  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return Response.json({ error: "인증 필요" }, { status: 401 });

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return Response.json({ error: "세션 무효" }, { status: 401 });

  // 결제(구독 설정)는 원장만 — 계정 구독을 원장이 책임(센터 트레이너는 원장 결제로 커버).
  const { data: me } = await sb.from("trainer").select("role, account_id").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "owner" || !me.account_id) {
    console.warn(`[billing/confirm] 403 owner 아님 uid=${u.user.id} role=${me?.role ?? "none"}`);
    return Response.json({ error: "대표만 결제를 설정할 수 있어요." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const authKey = (body.authKey || "").trim();
  const customerKey = (body.customerKey || "").trim();
  // 요금제 = 계정 종류(서버가 정함). 화면이 보낸 plan은 참고하지 않는다.
  const { data: acct } = await sb.from("account").select("type, current_period_end").eq("id", me.account_id).maybeSingle();
  const planKey = acct?.type === "center" ? "center" : "solo";
  const plan = PLANS[planKey];
  if (!authKey || !customerKey || !plan) {
    return Response.json({ error: "결제 정보가 올바르지 않습니다." }, { status: 400 });
  }
  // customerKey 위조 방지 — 반드시 호출자 본인 uid여야 함.
  if (customerKey !== u.user.id) {
    console.warn(`[billing/confirm] 403 customerKey 불일치 uid=${u.user.id}`);
    return Response.json({ error: "결제 사용자 불일치" }, { status: 403 });
  }

  // 1) 빌링키 발급(카드 등록 확정)
  const issued = await issueBillingKey({ authKey, customerKey });
  if (!issued.ok) {
    console.error("[billing/confirm] 빌링키 발급 실패:", issued.status, issued.error?.message || issued.error?.code);
    return Response.json({ error: "카드 등록에 실패했습니다.", detail: issued.error?.message }, { status: 400 });
  }
  const billingKey = issued.data.billingKey;
  if (!billingKey) {
    console.error("[billing/confirm] 응답에 billingKey 없음");
    return Response.json({ error: "카드 등록 응답이 올바르지 않습니다." }, { status: 400 });
  }

  // 1.5) 무료체험은 한 번만 — 체험 · 결제 이력이 있거나 기간이 한 번이라도 잡혔던 계정은 바로 첫 달 결제.
  const { data: past } = await sb.from("payment").select("id").eq("account_id", me.account_id).in("status", ["TRIAL", "DONE"]).limit(1);
  const trialUsed = (past && past.length > 0) || Boolean(acct?.current_period_end);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  if (trialUsed) {
    const amount = planAmount(planKey);
    const orderId = `sub_${me.account_id}_${now}`;
    const res = await chargeBilling(billingKey, { customerKey, amount, orderId, orderName: `${plan.name} 월 구독` });
    if (!(res.ok && res.data?.status === "DONE")) {
      console.error("[billing/confirm] 첫 결제 실패:", res.status, res.error?.code || res.error?.message);
      await sb.from("payment").insert({ account_id: me.account_id, order_id: orderId, amount, status: "FAILED", plan: planKey, raw: { error: res.error ?? null, status: res.status ?? null } });
      return Response.json({ error: "카드 결제에 실패했어요. 카드 정보를 확인하고 다시 시도해 주세요." }, { status: 402 });
    }
    const end = addOneMonth(new Date(now)).toISOString();
    const { data: up2, error: ue3 } = await sb.from("account").update({
      subscription_status: "active", plan: "premium", current_period_end: end, last_payment_at: nowIso,
      billing_provider: "toss", billing_key: billingKey, billing_customer_key: customerKey, billing_plan: planKey, cancel_at_period_end: false,
    }).eq("id", me.account_id).select();
    await sb.from("payment").insert({ account_id: me.account_id, order_id: orderId, toss_payment_key: res.data.paymentKey || null, amount, status: "DONE",
      plan: planKey, period_start: nowIso, period_end: end, raw: { approvedAt: res.data.approvedAt ?? null } });
    if (ue3 || !up2 || up2.length === 0) {
      console.error("[billing/confirm] 결제 성공 · 계정 활성 실패(수동 보정 필요):", ue3?.message);
      return Response.json({ error: "결제는 됐지만 이용 시작이 늦어지고 있어요. 고객센터로 알려 주세요." }, { status: 500 });
    }
    return Response.json({ ok: true, paid: true, periodEnd: end, plan: planKey });
  }

  // 2) 7일 무료체험 시작(처음 한 번) — 계정 활성 + 결제수단 저장. plan='premium'(회원앱 포함) · billing_plan=좌석등급.
  const trialEnd = new Date(now + TRIAL_DAYS * 86400000).toISOString();
  const { data: upd, error: ue2 } = await sb
    .from("account")
    .update({
      subscription_status: "active",
      plan: "premium",
      current_period_end: trialEnd,
      billing_provider: "toss",
      billing_key: billingKey,
      billing_customer_key: customerKey,
      billing_plan: plan.key,
      cancel_at_period_end: false,
    })
    .eq("id", me.account_id)
    .select();
  if (ue2 || !upd || upd.length === 0) {
    console.error("[billing/confirm] account 업데이트 실패(RLS/스코프?):", ue2?.message);
    return Response.json({ error: "구독 활성에 실패했습니다." }, { status: 400 });
  }

  // 3) 감사 로그(체험 시작). orderId=멱등키. 실패해도 활성은 유지(비차단).
  const orderId = `trial_${me.account_id}_${now}`;
  const { error: pe } = await sb.from("payment").insert({
    account_id: me.account_id,
    order_id: orderId,
    amount: 0,
    status: "TRIAL",
    plan: plan.key,
    period_start: nowIso,
    period_end: trialEnd,
    raw: { card: issued.data.card ?? null },
  }).select();
  if (pe) console.warn("[billing/confirm] payment 로그 실패(비차단):", pe.message);

  return Response.json({ ok: true, trialEnd, plan: plan.key });
}
