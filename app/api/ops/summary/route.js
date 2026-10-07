// app/api/ops/summary/route.js — 운영자(회사 업무 사이트)용 앱 매출 · 환불 · AI 원가 합계(2026-10-07)
// -----------------------------------------------------------------------------
// 인증: Authorization: Bearer <OPS_SECRET>(Vercel 환경 변수 · 업무 사이트 .env에 같은 값). 없으면 503 · 틀리면 401.
// 돌려주는 건 **합계 숫자만**(개인정보 · 계정 이름 없음) — 업무 사이트 규칙 '앱 데이터는 통계 숫자만'.
// 달 = KST. 결제 = payment.status DONE(구독 · 올리기 · 자리 · 팩) · 환불 = CANCELED 음수 행(종류별) · 환불 실패 = REFUND_FAILED(수동 처리 필요).
// 시연 계정(lib/demo) 결제는 뺀다. 라이브 키 전 결제는 모두 토스 시험 결제라는 점은 화면이 안내한다.
// -----------------------------------------------------------------------------
import { serviceClient } from "@/lib/serverCaller";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isDemoAccount } from "@/lib/demo";
import { planAmount } from "@/lib/plans";

export const runtime = "nodejs";

const kstYm = (iso) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 7);
function lastMonths(n) {
  const d = new Date(Date.now() + 9 * 3600000);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}
const SALE_KIND = (plan) => (plan === "basic" || plan === "solo" || plan === "center" ? "subscription"
  : plan === "upgrade" ? "upgrade" : plan === "seat" ? "seat" : String(plan || "").startsWith("pack_") ? "pack" : "other");
function refundKind(p) {
  const o = String(p.order_id || "");
  if (o.startsWith("refund7_")) return "first7";
  if (String(p.plan || "").startsWith("pack_")) return "pack";
  if (p.raw?.reason === "join_center") return "join";
  return "other";
}

export async function GET(req) {
  const secret = process.env.OPS_SECRET;
  if (!secret) return Response.json({ error: "OPS_SECRET 미설정" }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });

  const months = lastMonths(6);
  const since = new Date(Date.parse(`${months[0]}-01T00:00:00+09:00`)).toISOString();
  const [{ data: pays, error: pe }, { data: usage, error: ue }, { data: accts, error: ae }] = await Promise.all([
    fetchAllRows(() => sb.from("payment").select("id, account_id, order_id, amount, status, plan, paid_at, raw").gte("paid_at", since)),
    fetchAllRows(() => sb.from("ai_usage").select("id, account_id, ym, cost_usd").gte("ym", months[0])),
    fetchAllRows(() => sb.from("account").select("id, type, billing_plan, extra_seats, subscription_status, current_period_end, cancel_at_period_end")),
  ]);
  if (pe || ue || ae) {
    console.error("[ops/summary] 조회 실패", pe?.message, ue?.message, ae?.message);
    return Response.json({ error: "조회 실패" }, { status: 500 });
  }

  const blank = () => ({ gross: 0, sales: 0, byKind: { subscription: 0, upgrade: 0, seat: 0, pack: 0, other: 0 },
    refund: 0, refunds: 0, refundByKind: { first7: 0, pack: 0, join: 0, other: 0 }, refundFailed: 0, refundFailedCount: 0, aiUsd: 0 });
  const by = Object.fromEntries(months.map((m) => [m, blank()]));
  for (const p of pays || []) {
    if (isDemoAccount(p.account_id)) continue;
    const m = by[kstYm(p.paid_at)];
    if (!m) continue;
    if (p.status === "DONE" && p.amount > 0) {
      m.gross += p.amount; m.sales += 1; m.byKind[SALE_KIND(p.plan)] += p.amount;
    } else if (p.status === "CANCELED" && p.amount < 0) {
      m.refund += -p.amount; m.refunds += 1; m.refundByKind[refundKind(p)] += -p.amount;
    } else if (p.status === "REFUND_FAILED") {
      m.refundFailed += Math.abs(p.amount || 0); m.refundFailedCount += 1;
    }
  }
  for (const u of usage || []) {
    if (isDemoAccount(u.account_id)) continue;
    if (by[u.ym]) by[u.ym].aiUsd += Number(u.cost_usd) || 0;
  }

  // 지금 구독 중인 계정(시연 제외) · 다음 달 정기 결제 예상(해지 예약 제외)
  const nowMs = Date.now();
  const subs = { basic: 0, solo: 0, center: 0, extraSeats: 0, canceling: 0 };
  let mrr = 0;
  for (const a of accts || []) {
    if (isDemoAccount(a.id)) continue;
    const live = a.subscription_status === "active" && (!a.current_period_end || Date.parse(a.current_period_end) > nowMs);
    if (!live || !a.current_period_end) continue;   // 기간 없는 시범 계정은 결제 대상 아님
    const plan = a.billing_plan || (a.type === "center" ? "center" : "solo");
    if (subs[plan] != null) subs[plan] += 1;
    if (plan === "center") subs.extraSeats += a.extra_seats || 0;
    if (a.cancel_at_period_end) { subs.canceling += 1; continue; }
    mrr += planAmount(plan, a.extra_seats) || 0;
  }

  const round = (x) => Math.round(x * 100) / 100;
  return Response.json({
    generatedAt: new Date().toISOString(),
    months: months.map((ym) => ({ ym, ...by[ym], net: by[ym].gross - by[ym].refund, aiUsd: round(by[ym].aiUsd) })),
    subs, mrr,
  });
}
