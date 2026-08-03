// 카드 등록 성공 → 빌링키 발급 + 7일 무료체험 시작(계정 활성). ⚠️ owner만. service_role.
// create-trainer 라우트와 동일한 보안 패턴(Bearer→getUser→owner 검증→service_role write).
// 첫 실청구는 없음(7일 무료) — 만료 임박 시 크론(Phase 2)이 billingKey로 자동 청구.
import { createClient } from "@supabase/supabase-js";
import { issueBillingKey, tossReady } from "@/lib/toss";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

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
    return Response.json({ error: "원장만 결제를 설정할 수 있습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const authKey = (body.authKey || "").trim();
  const customerKey = (body.customerKey || "").trim();
  const planKey = (body.plan || "").trim();
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

  // 2) 7일 무료체험 시작 — 계정 활성 + 결제수단 저장. plan='premium'(회원앱 포함) · billing_plan=좌석등급.
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
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
