/* =========================================================================
   패키지 진행 계산(2026-10-13) — 회차 ÷ 주당 횟수 = 예상 진행 기간.
   OT · 재등록 대본 프롬프트(app/api/ot-brief)와 세일즈북 플랜 장(예상 기간 표시)이 같이 쓴다
   → AI가 추측한 숫자가 아니라 저장된 상품 회차 · 회원이 신청서에 적은 주당 횟수로만 계산한다.
   ★상품의 기간(duration_label · '3개월' 등)은 주 2회 정도 기준의 예상 진행 기간 안내이지 계약 만료일이 아니다(2026-10-13 대표 정정).
     트레이너가 자유롭게 적는 글이라('3개월·주2회' 등) 기간 표현이 딱 하나일 때만 읽는다.
   범위('3~4개월') · 여러 기간 · 숫자 없음이면 null → 안내를 만들지 않는다(틀린 안내보다 빈칸).
   ========================================================================= */

export const WEEKS_PER_MONTH = 4.345;

// '3개월' '12주' '1년' '6달' → 주 수. 못 읽으면 null.
export function durationWeeks(label) {
  const s = String(label ?? "");
  if (!s.trim() || /\d\s*[~\-–]\s*\d/.test(s)) return null;
  const hits = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(개월|달|주|년)/g)];
  if (hits.length !== 1) return null;
  const n = Number(hits[0][1]);
  if (!(n > 0)) return null;
  const u = hits[0][2];
  return u === "주" ? n : u === "년" ? n * 52.14 : n * WEEKS_PER_MONTH;
}

// 신청서 '일주일에 몇 번'('1'|'2'|'3'|'4+') → 숫자. '4+'는 4(가장 적게 오는 경우로 계산). 없으면 null.
export function weeklyNum(f) {
  if (f === "4+") return 4;
  const n = Number(f);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/** 패키지를 주 f회로 하면 — { weeks: 걸리는 주, availWeeks: 이용 기간(주 · 못 읽으면 null), overWeeks: 넘는 주(반올림 · 0이면 안 넘음), needPerWeek: 기간 안에 다 쓰려면 주 몇 회 } */
export function pkgPace(pkg, f) {
  const s = Number(pkg?.sessions);
  const w = Number(f);
  if (!(s > 0) || !(w > 0)) return null;
  const weeks = s / w;
  const availWeeks = durationWeeks(pkg?.duration_label);
  const over = availWeeks ? weeks - availWeeks : 0;
  return {
    weeks,
    availWeeks,
    overWeeks: over >= 0.5 ? Math.max(1, Math.round(over)) : 0,
    needPerWeek: availWeeks ? Math.round((s / availWeeks) * 10) / 10 : null,
  };
}
