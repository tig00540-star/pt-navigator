/* =========================================================================
   세일즈북 장 구성(2단계 · 2026-10-02) — 순수 함수.
   세일즈북 JSON(report.salesbook)에 deck = { order: [key], hidden: [key], cases: [sales_case.id] }를 얹는다.
   - 기본 장(표지·목표·확인한 것·사진·로드맵·플랜·혜택·마무리)은 AI가 만든 그대로, 켜고 끄고 순서만 바꾼다.
   - 사례 장('이런 변화를 만들어요')은 보관함에서 고른 사례를 2개씩 묶어 장을 만든다. 숫자·사진은 기록 그대로.
   - deck이 없으면(옛 세일즈북) 지금까지와 똑같은 순서로 보인다.
   ========================================================================= */

export const CASES_PER_SLIDE = 2;

export const SLIDE_LABELS = {
  cover: "표지",
  goal: "당신의 목표",
  confirmed: "오늘 함께 확인한 것",
  today: "오늘 해본 운동",
  photo: "사진 기록",
  roadmap: "로드맵",
  plans: "추천 플랜",
  benefits: "등록 혜택",
  closing: "약속드릴게요",
};
export const slideLabel = (key) => SLIDE_LABELS[key] || (key.startsWith("case-") ? `이런 변화를 만들어요 ${Number(key.slice(5)) + 1}` : key);

// 사례 묶음 키 — case-0, case-1 …
export function caseKeys(caseIds = []) {
  const n = Math.ceil(caseIds.length / CASES_PER_SLIDE);
  return Array.from({ length: n }, (_, i) => `case-${i}`);
}
export function caseChunk(caseIds = [], key) {
  const i = Number(key.slice(5));
  return caseIds.slice(i * CASES_PER_SLIDE, (i + 1) * CASES_PER_SLIDE);
}

/* 보이는 장 순서.
   baseKeys = 이 세일즈북에 있는 기본 장(혜택 장은 켜져 있을 때만) · anchor = 사례 장을 기본으로 끼울 자리(그 장 앞). */
export function deckOrder(baseKeys, deck, anchor = "roadmap") {
  const d = deck && typeof deck === "object" ? deck : {};
  const cases = caseKeys(Array.isArray(d.cases) ? d.cases : []);
  const at = baseKeys.indexOf(anchor);
  const defaults = at >= 0 ? [...baseKeys.slice(0, at), ...cases, ...baseKeys.slice(at)] : [...baseKeys, ...cases];
  const all = new Set(defaults);
  const saved = (Array.isArray(d.order) ? d.order : []).filter((k) => all.has(k));
  // 저장된 순서 + 새로 생긴 장(저장 이후 추가된 사례 장·혜택 장)은 기본 자리 근처에 끼운다.
  const ordered = [...saved];
  for (const k of defaults) {
    if (ordered.includes(k)) continue;
    const prev = defaults[defaults.indexOf(k) - 1];
    const pi = prev ? ordered.indexOf(prev) : -1;
    ordered.splice(pi + 1, 0, k);
  }
  const hidden = new Set(Array.isArray(d.hidden) ? d.hidden : []);
  return { all: ordered, visible: ordered.filter((k) => !hidden.has(k)), hidden };
}

// 회원 목표 글 → 사례 목적(보관함 category와 같은 이름). 못 맞추면 null.
export { guessCategory } from "@/lib/salesCase";
