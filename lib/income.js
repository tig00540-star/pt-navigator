// 기타 매출(FC·기타) 집계 + 정산 기간 계산 — 순수 함수(클라/서버 공용).
//
// ⚠️ 여기 금액은 트레이너 지표에 넣지 않는다. 대표 순이익·정산에만 쓴다.
//    FC매출은 센터 FC부서가 파는 회원권이라 담당 트레이너가 없고,
//    합치면 트레이너 실적·급여가 틀어진다(지출 expense와 같은 위치의 데이터).

export const INCOME_KINDS = [
  { key: "fc", label: "FC매출" },
  { key: "etc", label: "기타매출" },
];

export const incomeKindLabel = (k) => INCOME_KINDS.find((x) => x.key === k)?.label || "기타매출";

/** 날짜(Date) → 'YYYY-MM-DD' (KST 입력값과 같은 자리 문자열). */
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 정산 기간 — 센터마다 주기가 다르다(1일~말일 / 15일~익월 14일 …).
 * startDay=1이면 달력월 그대로. 15면 15일~익월 14일.
 * @param {string} ym 'YYYY-MM' 기준월 · @param {number} startDay 1~28
 * @returns {{from:string, to:string, label:string}} 경계 포함(inclusive)
 */
export function settlementRange(ym, startDay = 1) {
  const safe = Math.min(Math.max(Number(startDay) || 1, 1), 28); // 29~31은 없는 달이 있어 28로 고정
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const from = new Date(y, m - 1, safe);
  const to = safe === 1
    ? new Date(y, m, 0)               // 그 달 말일
    : new Date(y, m, safe - 1);       // 익월 (시작일-1)
  return { from: ymd(from), to: ymd(to), label: `${ymd(from)} ~ ${ymd(to)}` };
}

/** 기간 안 합계(원). rows는 income 또는 expense, dateKey만 다르다. */
export function sumInRange(rows, dateKey, from, to, filter) {
  let s = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r[dateKey] !== "string") continue;
    const d = r[dateKey].slice(0, 10);
    if (d < from || d > to) continue;
    if (filter && !filter(r)) continue;
    s += r.amount || 0;
  }
  return s;
}

/** 기간 안 기타매출 종류별 합계 [{kind, label, amount}] — 0원 종류도 자리를 지킨다. */
export function incomeByKind(rows, from, to) {
  return INCOME_KINDS.map(({ key, label }) => ({
    kind: key,
    label,
    amount: sumInRange(rows, "earned_on", from, to, (r) => (r.kind || "fc") === key),
  }));
}

/**
 * 기간 정산 — PT(계약)·FC·기타 매출과 지출을 한 번에.
 * ⚠️ ptRevenue는 호출부가 session_log에서 계산해 넘긴다(여기서 계약을 읽지 않는다).
 */
export function settlementTotals({ ptRevenue = 0, incomes = [], expenses = [], from, to }) {
  const byKind = incomeByKind(incomes, from, to);
  const fc = byKind.find((x) => x.kind === "fc")?.amount ?? 0;
  const etc = byKind.find((x) => x.kind === "etc")?.amount ?? 0;
  const expense = sumInRange(expenses, "spent_on", from, to);
  const revenue = ptRevenue + fc + etc;
  return { ptRevenue, fc, etc, revenue, expense, net: revenue - expense, byKind };
}
