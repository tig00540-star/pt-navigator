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
  trainer: "트레이너 소개",
  goal: "당신의 목표",
  confirmed: "함께 확인한 것",   // 2026-10-13 — 세일즈북은 2차 수업 전에 만들어져 근거가 지난 OT 기록이라 '오늘'을 뺐다(저장은 키 confirmed라 옛 세일즈북도 그대로)
  today: "오늘 해본 운동",
  photo: "사진 기록",
  roadmap: "여기까지 함께 갑니다",
  plans: "추천 플랜",
  benefits: "등록 혜택",
  closing: "약속드릴게요",
};
export const slideLabel = (key) => SLIDE_LABELS[key]
  || (key.startsWith("case-") ? `이런 변화를 만들어요 ${Number(key.slice(5)) + 1}` : key.startsWith("care-") ? `이렇게 관리해요 ${Number(key.slice(5)) + 1}` : key);

// 사례 묶음 키 — case-0, case-1 …
export function caseKeys(caseIds = []) {
  const n = Math.ceil(caseIds.length / CASES_PER_SLIDE);
  return Array.from({ length: n }, (_, i) => `case-${i}`);
}
// 관리 모습 묶음 키 — care-0, care-1 …(1차 OT 변화 모음집 · 2026-10-11) · caseChunk를 같이 쓴다(접두어 길이가 같다)
export function careKeys(ids = []) {
  const n = Math.ceil(ids.length / CASES_PER_SLIDE);
  return Array.from({ length: n }, (_, i) => `care-${i}`);
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

/* 저장된 세일즈북에 실제로 보이는 장(2026-10-13) — 트레이너 대본의 '세일즈북 장 순서대로 전부 보기'가 없는 장을 소개하지 않게.
   반환 = 장 키 Set(사례 장 case-N은 'case' 하나로) · 모르면 null(세일즈북이 아직 없거나 사진을 못 읽음 → 화면은 예전처럼 다 보여 준다).
   2차 OT = SalesbookView 기본 장 + deck(숨김 · 사례) 그대로 · 재등록 = RegSalesbookView처럼 사진 장은 처음 · 지금 사진이 짝을 이룰 때만. */
export function otBookSlides(salesbook) {
  if (!salesbook || typeof salesbook !== "object" || Array.isArray(salesbook)) return null;
  const { visible } = deckOrder(["cover", "goal", "confirmed", "photo", "roadmap", "plans", "closing"], salesbook.deck);
  return new Set(visible.map((k) => (k.startsWith("case-") ? "case" : k)));
}
export function regBookSlides(regSalesbook, photoLabels) {
  if (!regSalesbook || typeof regSalesbook !== "object" || Array.isArray(regSalesbook) || !Array.isArray(photoLabels)) return null;
  const has = (l) => photoLabels.includes(l);
  const photo = (has("before") || has("progress")) && (has("after") || has("progress"));
  return new Set(["cover", "journey", "change", ...(photo ? ["photo"] : []), "roadmap", "fork", "plans", "closing"]);
}

/* 2차 세일즈북 사진 장 제목 · 본문 = 지금 화면에 보이는 사진 상태에 맞춘다(2026-10-13).
   AI 글은 만들 때 사진 이름표만 보고 썼고, 사진은 그 뒤에 늘거나 줄 수 있다(예: 사진 0장인데 제목 '함께 비교해 봐요' · 본문 '다음에 남겨요').
   상태 = SalesbookView pickPhotos가 실제로 보여 주는 칸 수로만: none(0장) · start(1장 · 또는 시작점 모드) · compare(처음 + 그 뒤 2장).
   상태와 맞는 AI 글은 그대로 · 안 맞는 것만 고정 문장(서버 neutralPhotoSlide와 같은 문장). 사진 내용 · 외형 변화는 말하지 않는다. */
const PHOTO_LATER = /다음에\s*(?:함께\s*)?(?:남겨|찍어)|이제부터\s*(?:함께\s*)?남겨|아직\s*사진/;
const PHOTO_COMPARE = /비교|나란히|전후|비포|애프터/;
const PHOTO_FUTURE = /나중|다음|앞으로|이후|몇\s*(?:달|주|개월)\s*뒤/;
export function photoSlideState(mode, photos) {
  const n = (Array.isArray(photos) ? photos : []).filter((p) => p && p.row).length;
  if (!n) return "none";
  return mode === "within_session" && n >= 2 ? "compare" : "start";
}
export function photoSlideText(ps, state) {
  const title = typeof ps?.title === "string" ? ps.title.trim() : "";
  const body = typeof ps?.body === "string" ? ps.body.trim() : "";
  // 비어 있으면 예전 그대로(제목 '사진 기록' · 본문 없음) · 글이 있는데 상태와 안 맞을 때만 바꾼다.
  const pick = (t, ok, fix) => (!t ? "" : ok(t) ? t : fix);
  if (state === "compare") return {
    title: pick(title, (t) => !PHOTO_LATER.test(t), "사진으로 함께 비교해 봐요") || "사진 기록",
    body: pick(body, (t) => !PHOTO_LATER.test(t), "사진을 나란히 두고 어디가 어떻게 보이는지 같이 이야기해 봐요."),
  };
  // 시작 사진만 — 비교는 '나중에'로만(지금 비교하는 말 · 아직 사진이 없다는 말은 바꾼다)
  const startOk = (t) => !PHOTO_LATER.test(t) && (!PHOTO_COMPARE.test(t) || PHOTO_FUTURE.test(t));
  if (state === "start") return {
    title: pick(title, startOk, "지금을 시작점으로 남겨요") || "사진 기록",
    body: pick(body, startOk, "남겨 둔 사진을 시작점으로 두고, 다음에 같은 자세로 찍어 함께 비교해요."),
  };
  // 사진 없음 — 비교 · 시작점 기록을 전제로 하지 않는다(제목은 기본 '사진 기록')
  return {
    title: PHOTO_LATER.test(title) ? title : "사진 기록",
    body: pick(body, (t) => PHOTO_LATER.test(t), "사진은 다음에 함께 남겨요. 시작점을 기록해 두면 나중에 같이 비교할 수 있어요."),
  };
}

// 회원 목표 글 → 사례 목적(보관함 category와 같은 이름). 못 맞추면 null.
export { guessCategory } from "@/lib/salesCase";
