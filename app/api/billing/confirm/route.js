// 카드 등록 성공 → 빌링키 발급 + 바로 첫 달 결제(계정 활성). ⚠️ owner만. service_role.
// 2026-10-07 대표 결정: 무료 체험 없앰 → 등록 즉시 첫 결제 · 첫 결제 7일 안 전액 환불(/api/billing/refund · 계정당 한 번).
//   (옛 체험 계정은 이미 기간이 잡혀 있어 결제 작업 charge-subscriptions가 이어 받는다.)
// 2026-10-06 오류 점검: ① 결제 실패면 활성화 안 함.
//   ② 요금제는 화면이 아니라 계정 종류(account.type: solo · center)로 서버가 정한다(센터가 솔로 가격으로 결제되던 구멍).
// create-trainer 라우트와 동일한 보안 패턴(Bearer→getUser→owner 검증→service_role write).
// 다음 달부터는 결제 작업(charge-subscriptions)이 billingKey로 자동 청구.
import { createClient } from "@supabase/supabase-js";
import { issueBillingKey, chargeBilling, tossReady } from "@/lib/toss";
import { PLANS, planAmount } from "@/lib/plans";
import { sendPush } from "@/lib/pushServer";

// 달 더하기 — 말일 넘침 보정(크론 charge-subscriptions와 같은 규칙).
function addOneMonth(d) {
  const x = new Date(d.getTime());
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + 1);
  if (x.getUTCDate() < day) x.setUTCDate(0);
  return x;
}

export const runtime = "nodejs";

// 독립한 트레이너가 결제를 마쳐 계정이 열리면 — 옮길지 기다리던 회원에게 '기록을 함께 옮길까요?' 알림(2026-10-07)
async function notifyWaitingMembers(sb, accountId) {
  try {
    const { data: mt } = await sb.from("member_transfer").select("member_id, to_name").eq("to_account", accountId).eq("status", "pending");
    if (!mt?.length) return;
    const { data: ms } = await sb.from("user_table").select("id, member_token").in("id", mt.map((m) => m.member_id));
    for (const m of ms || []) {
      if (!m.member_token) continue;
      await sendPush(sb, { memberIds: [m.id], type: "transfer", url: `/m/${m.member_token}`,
        title: "기록을 함께 옮길까요?", body: `앞으로 ${mt[0].to_name || "담당 트레이너"}가 직접 기록을 관리해요. 회원 페이지에서 옮길지 골라 주세요.` });
    }
  } catch (e) { console.error("[billing/confirm] 회원 알림 실패(비차단)", e); }
}

// 결제벽이 '이 계정에 맞는 요금제'를 고르려고 부른다(2026-10-07 토스 심사 중 발견):
//   결제 전(inactive) 계정은 account SELECT 규칙에 막혀 화면이 계정 종류를 못 읽었다 → 센터 계정에도 개인 요금제(프로 · 베이직)가 떠서
//   화면은 59,000원인데 서버(POST)는 계정 종류대로 149,000원을 청구할 뻔했다. 계정 종류의 정본은 여기(service_role).
export async function GET(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return Response.json({ error: "인증 필요" }, { status: 401 });
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return Response.json({ error: "세션 무효" }, { status: 401 });
  const { data: me } = await sb.from("trainer").select("role, account_id").eq("id", u.user.id).maybeSingle();
  if (!me?.account_id) return Response.json({ role: me?.role ?? null, type: null, noTrial: false });
  const { data: acct } = await sb.from("account").select("type, no_trial, extra_seats").eq("id", me.account_id).maybeSingle();
  // 센터 = 추가 자리까지 더한 실제 결제 금액(2026-10-08 · 화면 149,000원인데 자리 값까지 결제되던 것 막기)
  const extraSeats = acct?.type === "center" ? Math.max(0, Number(acct?.extra_seats) || 0) : 0;
  return Response.json({ role: me.role, type: acct?.type ?? null, noTrial: Boolean(acct?.no_trial), extraSeats,
    centerAmount: acct?.type === "center" ? planAmount("center", extraSeats) : null });
}

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
  // 요금제 = 계정 종류가 정하는 범위 안에서(서버가 검증). 센터 계정 = center · 개인 계정 = basic | solo(프로 · 기본값).
  //   2026-10-07 요금제 개편 — 개인은 화면에서 베이직/프로를 고른다. 그 밖의 값은 무시.
  const { data: acct } = await sb.from("account").select("type, extra_seats, subscription_status, current_period_end").eq("id", me.account_id).maybeSingle();
  const planKey = acct?.type === "center" ? "center" : body.plan === "basic" ? "basic" : "solo";
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

  // 1.5) 이미 이용 중인 계정 = 카드만 바꾼다(2026-10-08 · 예전엔 한 달 치를 또 결제하고 남은 기간이 사라졌다 · 두 탭 · 뒤로 가기)
  const activeNow = acct?.subscription_status === "active" && acct?.current_period_end && Date.parse(acct.current_period_end) > Date.now();
  if (activeNow) {
    const { data: upc, error: uec } = await sb.from("account").update({ billing_provider: "toss", billing_key: billingKey, billing_customer_key: customerKey })
      .eq("id", me.account_id).select("id");
    if (uec || !upc?.length) {
      console.error("[billing/confirm] 카드 변경 저장 실패:", uec?.message);
      return Response.json({ error: "카드를 바꾸지 못했어요. 다시 시도해 주세요." }, { status: 500 });
    }
    return Response.json({ ok: true, paid: false, cardUpdated: true, periodEnd: acct.current_period_end, plan: planKey });
  }

  // 2) 바로 첫 달 결제(2026-10-07 · 무료 체험 없음) — 결제 이력이 없던 계정이면 7일 안 전액 환불 대상(화면 안내용 · 판정은 /api/billing/refund)
  const { data: past } = await sb.from("payment").select("id").eq("account_id", me.account_id).in("status", ["TRIAL", "DONE", "CANCELED"]).limit(1);
  const refundable = !(past && past.length > 0);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const amount = planAmount(planKey, acct?.extra_seats);
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
    billing_provider: "toss", billing_key: billingKey, billing_customer_key: customerKey, billing_plan: planKey, next_billing_plan: null, cancel_at_period_end: false,
    next_extra_seats: null, purge_notified_at: null,   // 다시 시작 = 지난번 줄이기 예약 · 파기 알림 기록은 지움(2026-10-08)
  }).eq("id", me.account_id).select();
  await sb.from("payment").insert({ account_id: me.account_id, order_id: orderId, toss_payment_key: res.data.paymentKey || null, amount, status: "DONE",
    plan: planKey, period_start: nowIso, period_end: end, raw: { approvedAt: res.data.approvedAt ?? null } });
  if (ue3 || !up2 || up2.length === 0) {
    console.error("[billing/confirm] 결제 성공 · 계정 활성 실패(수동 보정 필요):", ue3?.message);
    return Response.json({ error: "결제는 됐지만 이용 시작이 늦어지고 있어요. 고객센터로 알려 주세요." }, { status: 500 });
  }
  await notifyWaitingMembers(sb, me.account_id);
  return Response.json({ ok: true, paid: true, refundable, periodEnd: end, plan: planKey });
}
