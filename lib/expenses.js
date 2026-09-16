// 지출 집계 — 순수 함수(클라/서버 공용). expense.spent_on 은 date(YYYY-MM-DD)라
// 타임존 보정 없이 slice(0,7)=월. (등록일 기준 매출과 짝을 이뤄 순이익 산출.)

export const EXPENSE_CATEGORIES = ["임대료", "인건비", "공과금", "장비·소모품", "마케팅", "세금·수수료", "기타"];

/** 이번달 지출 합계(원). */
export function expenseInMonth(expenses, ym) {
  return (Array.isArray(expenses) ? expenses : []).reduce(
    (s, e) => (e && typeof e.spent_on === "string" && e.spent_on.slice(0, 7) === ym ? s + (e.amount || 0) : s),
    0
  );
}

/** 이번달 분류별 지출 [{category, amount}] (금액 내림차순). */
export function expensesByCategory(expenses, ym) {
  const m = new Map();
  for (const e of Array.isArray(expenses) ? expenses : []) {
    if (!e || typeof e.spent_on !== "string" || e.spent_on.slice(0, 7) !== ym) continue;
    const c = e.category || "기타";
    m.set(c, (m.get(c) || 0) + (e.amount || 0));
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
