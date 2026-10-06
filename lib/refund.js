// 남은 구독 기간 일할 환불 금액(2026-10-07 · 센터 합류 A안) — 서버 · 화면 같은 계산.
//   마지막 실제 결제(DONE · paymentKey 있음)의 기간 중 남은 몫 = 금액 × 남은 시간 ÷ 결제 기간 · 10원 단위 내림.
//   체험 중(실결제 없음) · 기간이 이미 끝났으면 0.
export function proratedRefund(payment, nowMs = Date.now()) {
  if (!payment || payment.status !== "DONE" || !payment.toss_payment_key) return { amount: 0, days: 0 };
  const start = Date.parse(payment.period_start || payment.paid_at), end = Date.parse(payment.period_end);
  if (!(end > nowMs) || !(end > start)) return { amount: 0, days: 0 };
  const ratio = (end - nowMs) / (end - start);
  const amount = Math.floor((payment.amount * ratio) / 10) * 10;
  return { amount: Math.max(0, Math.min(amount, payment.amount)), days: Math.ceil((end - nowMs) / 86400000) };
}
