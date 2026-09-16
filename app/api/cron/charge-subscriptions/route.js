// app/api/cron/charge-subscriptions/route.js
// -----------------------------------------------------------------------------
// 정기결제 자동 청구(Phase 2 · Vercel Cron 매일). 체험/구독 만료 임박 계정을
// 등록된 빌링키로 청구하고 이용기간을 한 달 연장한다.
// - 대상: billing_key 있고 subscription_status='active'이며 current_period_end 가
//         곧(≤ now+1일) 만료되는 계정. 창을 1일로 둬 만료 직전에 청구 → 잠김 없음.
// - 연장 기준 = 기존 만료일(과거면 now)에서 +1개월 → 청구일이 앞당겨져도 경계는 고정.
// - 멱등: orderId = sub_{account}_{오늘} + payment.order_id unique + 사전조회. 하루 1회만.
// - 해지예약(cancel_at_period_end)+실제만료 → 청구 안 하고 subscription_status='inactive'.
// - 결제 실패: payment FAILED 로그, 연장 안 함(자연 만료 → 잠김). 다음날 재시도.
// 인증: Vercel Cron 이 Authorization: Bearer <CRON_SECRET> 을 실어 보냄.
// ⚠️ access 판정(my_account_status)= subscription_status='active' AND period_end>now.
//    그래서 성공 시 반드시 active 유지 + period_end 연장.
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { chargeBilling, tossReady } from "@/lib/toss";
import { PLANS, planAmount } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400000;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 시크릿 미설정 = fail-closed
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
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
  const today = new Date(now).toISOString().slice(0, 10);

  // 청구 대상 — 빌링키 있고 활성이며 곧 만료. (해지예약도 active라 여기 잡혀 아래서 분기.)
  const { data: accounts, error: ae } = await sb
    .from("account")
    .select("id, billing_key, billing_customer_key, billing_plan, current_period_end, cancel_at_period_end, subscription_status")
    .not("billing_key", "is", null)
    .eq("subscription_status", "active")
    .lte("current_period_end", dueBeforeIso)
    .limit(500);
  if (ae) return Response.json({ error: `account 조회 실패: ${ae.message}` }, { status: 500 });

  let charged = 0, canceled = 0, failed = 0, skipped = 0;
  const errors = [];

  for (const acc of accounts || []) {
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

    const amount = planAmount(acc.billing_plan);
    if (!amount) { failed++; if (errors.length < 5) errors.push(`${acc.id}: 알 수 없는 플랜(${acc.billing_plan})`); continue; }

    const orderId = `sub_${acc.id}_${today}`;
    const orderName = `${PLANS[acc.billing_plan]?.name || "구독"} 월 구독`;

    // 멱등 사전조회 — 오늘 이미 성공 청구했으면 연장만 보장하고 재청구 안 함.
    const { data: dup } = await sb.from("payment").select("id, status").eq("order_id", orderId).maybeSingle();
    if (dup?.status === "DONE") { skipped++; continue; }

    // 연장 기준: 만료일(과거면 now)에서 +1개월 → 경계 고정, 과거 만료는 now부터.
    const base = periodEnd.getTime() > now ? periodEnd : new Date(now);
    const newEnd = addOneMonth(base);

    const res = await chargeBilling(acc.billing_key, {
      customerKey: acc.billing_customer_key,
      amount,
      orderId,
      orderName,
    });

    if (res.ok && res.data?.status === "DONE") {
      const upd = await sb.from("account").update({
        current_period_end: newEnd.toISOString(),
        last_payment_at: new Date(now).toISOString(),
        subscription_status: "active",
      }).eq("id", acc.id).select();
      if (upd.error || !upd.data || upd.data.length === 0) {
        // 청구는 됐는데 DB 연장 실패 — 반드시 로깅(수동 보정 신호). payment 는 DONE 으로 남겨 다음날 재청구 방지.
        if (errors.length < 5) errors.push(`${acc.id}: 청구 성공/연장 실패`);
      }
      await sb.from("payment").insert({
        account_id: acc.id,
        order_id: orderId,
        toss_payment_key: res.data.paymentKey || null,
        amount,
        status: "DONE",
        plan: acc.billing_plan,
        period_start: new Date(now).toISOString(),
        period_end: newEnd.toISOString(),
        raw: { approvedAt: res.data.approvedAt ?? null },
      });
      charged++;
    } else {
      await sb.from("payment").insert({
        account_id: acc.id,
        order_id: orderId,
        amount,
        status: "FAILED",
        plan: acc.billing_plan,
        raw: { error: res.error ?? null, status: res.status ?? null },
      });
      failed++;
      if (errors.length < 5) errors.push(`${acc.id}: 청구 실패(${res.error?.code || res.status || "unknown"})`);
    }
  }

  return Response.json({ ok: true, total: (accounts || []).length, charged, canceled, failed, skipped, errors });
}
