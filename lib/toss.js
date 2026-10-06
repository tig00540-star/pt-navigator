// 토스페이먼츠 정기결제(빌링) 서버 헬퍼. ⚠️ 서버 전용(SECRET 키 사용) — API 라우트에서만 import.
// 흐름: 클라 카드등록창(requestBillingAuth) → authKey → [issueBillingKey] → billingKey 저장
//       → 매 회차 [chargeBilling]로 청구. Basic 인증 = base64(secretKey + ":").
const BASE = "https://api.tosspayments.com/v1";

function secret() {
  return process.env.TOSS_SECRET_KEY || "";
}
function authHeader() {
  return "Basic " + Buffer.from(secret() + ":").toString("base64");
}

export function tossReady() {
  return Boolean(secret());
}

// authKey(카드등록 인증) + customerKey → billingKey(정기결제 수단) 발급
export async function issueBillingKey({ authKey, customerKey }) {
  const res = await fetch(`${BASE}/billing/authorizations/issue`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ authKey, customerKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data }; // data.billingKey · data.card 등
}

// billingKey로 실제 청구(정기결제 회차). orderId = 멱등키.
export async function chargeBilling(billingKey, { customerKey, amount, orderId, orderName }) {
  const res = await fetch(`${BASE}/billing/${encodeURIComponent(billingKey)}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ customerKey, amount, orderId, orderName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data }; // data.status === 'DONE' · data.paymentKey · data.approvedAt
}

// 결제 부분 취소(환불) — 센터 합류 시 남은 개인 구독 기간 일할 환불(2026-10-07 · A안).
//   cancelAmount 없으면 전액 취소. 멱등 키(Idempotency-Key)로 같은 요청이 두 번 가도 한 번만 취소된다.
export async function cancelPayment(paymentKey, { cancelReason, cancelAmount, idempotencyKey }) {
  const headers = { Authorization: authHeader(), "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE}/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers,
    body: JSON.stringify(cancelAmount ? { cancelReason, cancelAmount } : { cancelReason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data };
}
