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

// 일반결제(결제창) 승인 — 추가 팩(2026-10-07). 결제창이 successUrl로 돌려준 paymentKey · orderId · amount를 서버가 확인하고 승인.
//   amount는 반드시 서버가 정한 값과 비교한 뒤 넘긴다(화면 값 위조 방지). orderId가 같으면 토스가 중복 승인을 막는다.
export async function confirmPayment({ paymentKey, orderId, amount }) {
  const res = await fetch(`${BASE}/payments/confirm`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data }; // data.status === 'DONE'
}

// 결제 한 건 조회(2026-10-08) — 승인 직후 인터넷이 끊겨 '이미 처리된 결제'가 나왔을 때, 실제로 승인됐는지 확인해 이어 처리한다.
export async function getPayment(paymentKey) {
  const res = await fetch(`${BASE}/payments/${encodeURIComponent(paymentKey)}`, {
    headers: { Authorization: authHeader() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data }; // data.status · data.orderId · data.totalAmount
}

// 거래 내역 조회(2026-10-08 · 앱 운영 결제 대조) — startDate · endDate는 한국 시간 'YYYY-MM-DDTHH:mm:ss'.
//   토스에 결제됐는데 우리 기록(payment)에 없는 주문을 찾는 데 쓴다. 최대 limit건(기본 1000) · 더 있으면 startingAfter로 이어 받는다.
export async function listTransactions({ startDate, endDate, limit = 1000 }) {
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ startDate, endDate, limit: String(limit) });
    if (after) q.set("startingAfter", after);
    const res = await fetch(`${BASE}/transactions?${q}`, { headers: { Authorization: authHeader() } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return { ok: false, status: res.status, error: data, data: out };
    out.push(...data);
    if (data.length < limit) break;
    after = data[data.length - 1]?.transactionKey;
    if (!after) break;
  }
  return { ok: true, data: out };
}
