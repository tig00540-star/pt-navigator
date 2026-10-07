// 구독 플랜 정의 — 클라·서버 공용(순수 데이터). 2026-10-07 요금제 개편(docs/v2-계획-요금제-개편.md).
// ⚠️ 금액 = 부가세 포함 실제 결제 금액(화면 표시와 결제가 같아야 한다 · 토스 심사). 여기만 고치면 결제·화면 동시 반영.
//    정가(regular)는 취소선 안내용(베이직은 없음). AI 한도 숫자의 진짜 관문은 DB(ai_quota_for) — 여기 ai는 화면 표시용.
// ⚠️ 키 'solo'는 화면 이름 '프로'(account.billing_plan 값 · 코드 곳곳에서 써서 키는 그대로 둔다).
//    회원 전용 페이지 관문(account.plan='premium')은 세 등급 모두 같다.
export const PLANS = {
  basic: {
    key: "basic",
    name: "베이직",
    amount: 19900,
    regular: null,
    desc: "AI 없이 트레이너 1인",
    trainerSeats: 0,
    ai: { each: 3 },
    features: ["회원 관리 · 스케줄 · 운동일지 직접 입력", "회원 전용 페이지(운동일지 확인 · 서명)", "실적 · 급여 계산 · 오운완 · 개인운동 루틴", "AI 기능마다 매달 3번 써 보기"],
  },
  solo: {
    key: "solo",
    name: "프로",
    amount: 59000, // 얼리버드
    regular: 79000,
    desc: "AI까지 트레이너 1인",
    trainerSeats: 0, // 본인 1인 — 추가 트레이너 없음
    ai: { voice: 120, prep: 25 },
    features: ["베이직 전부", "음성일지 AI 월 120건", "OT · 재등록 대본 월 25번(세일즈북 포함)", "인바디 분석 · 로드맵 초안"],
  },
  center: {
    key: "center",
    name: "센터",
    amount: 149000, // 얼리버드
    regular: 199000,
    desc: "트레이너 3인 + 대표 1인",
    trainerSeats: 3, // 관리자(owner)는 좌석에 안 셈
    ai: { voice: 300, prep: 60 },
    features: ["프로 전부(센터 공용 한도)", "음성일지 월 300건 · 대본 월 60번", "대표 화면 · 아침 보고서 · 월간 결산", "트레이너 추가 1인 39,900원"],
  },
};

export const TRIAL_DAYS = 7;

// 센터 트레이너 추가 1인(월) — 센터 공용 한도 +음성일지 100건 · +준비 20번(DB ai_quota_for와 같은 숫자)
export const SEAT_PRICE = 39900;
export const SEAT_AI = { voice: 100, prep: 20 };

// 추가 팩(그달 말까지 · 프로 · 센터만) — 결제창(일반결제) · 7일 안 미사용이면 전액 환불
export const PACKS = {
  prep10: { key: "prep10", kind: "prep", amount: 10, price: 14900, name: "OT · 재등록 대본 10번" },
  voice50: { key: "voice50", kind: "voice", amount: 50, price: 9900, name: "음성일지 50건" },
};

/**
 * 추가할 수 있는 트레이너 좌석 수(관리자 본인 제외) = 등급 기본 + 결제한 추가 좌석.
 * 좌석 등급은 account.billing_plan — 비어 있으면 account.type으로 대신 판단.
 * ⚠️ 서버(create-trainer)가 진짜 관문이다. 화면 표시는 안내일 뿐.
 */
export function trainerSeatLimit(planKey, extraSeats = 0) {
  const base = PLANS[planKey]?.trainerSeats ?? 0;
  return planKey === "center" ? base + Math.max(0, Number(extraSeats) || 0) : base;
}

export function planAmount(key, extraSeats = 0) {
  const p = PLANS[key]?.amount;
  if (p == null) return null;
  return key === "center" ? p + Math.max(0, Number(extraSeats) || 0) * SEAT_PRICE : p;
}

/** 남은 기간 일할 금액 — (월 금액 차이) × 남은 시간 ÷ 이번 결제 기간 · 10원 단위 내림(lib/refund와 같은 계산) */
export function proratedDiff(monthlyDiff, periodStartMs, periodEndMs, nowMs = Date.now()) {
  const total = periodEndMs - periodStartMs;
  const left = periodEndMs - nowMs;
  if (!(monthlyDiff > 0) || !(total > 0) || left < 86400000) return 0;
  return Math.floor((monthlyDiff * Math.min(left, total)) / total / 10) * 10;
}
