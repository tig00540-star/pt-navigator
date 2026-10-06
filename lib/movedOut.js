// 떠난 회원의 계약 사본(moved_out_ledger · 2026-10-07 · 계획서 3단계) → 매출 · 정산 계산이 읽는 계약 모양으로.
//   회원 없음(user_id null) · 인계 표시(handed_over) → 남은 수업 · 회원 화면 계산엔 안 들어가고 매출 · 정산에만 쓰인다.
export function ledgerAsContracts(rows) {
  return (Array.isArray(rows) ? rows : []).map((m) => ({
    id: `ledger_${m.id}`, user_id: null, account_id: m.account_id, trainer_id: m.trainer_id, kind: m.kind,
    started_at: m.started_at, sessions_total: m.sessions_total, service_sessions: m.service_sessions,
    price_per_session: m.price_per_session, amount_total: m.amount_total, counts_as_revenue: m.counts_as_revenue,
    refund_amount: m.refund_amount, refunded_at: m.refunded_at, handed_over: true, ledger: true,
  }));
}
