// 구독 플랜 정의 — 클라·서버 공용(순수 데이터). 얼리버드가 · 단일 기능등급(둘 다 회원앱 포함=plan 'premium').
// ⚠️ 금액 변경 시 여기만 고치면 결제·화면 동시 반영. 정가(regular)는 안내용, 실청구는 amount.
export const PLANS = {
  solo: {
    key: "solo",
    name: "솔로",
    amount: 59000, // 얼리버드
    regular: 79000,
    desc: "개인 트레이너 1인",
    trainerSeats: 0, // 본인 1인 — 추가 트레이너 없음
    features: ["1·2차 OT·재등록 서포트", "음성일지·AI 리포트", "회원 전용 페이지(성과 그래프·비포애프터)", "실적·급여 자동계산"],
  },
  center: {
    key: "center",
    name: "센터",
    amount: 149000, // 얼리버드
    regular: 199000,
    desc: "트레이너 3인 + 대표 1인",
    trainerSeats: 3, // 관리자(owner)는 좌석에 안 셈
    features: ["솔로 전체 포함", "대표 대시보드(매출·정산·등록·이탈)", "트레이너 3인 좌석 + 대표 1인", "트레이너 코칭·팀 관리"],
  },
};

export const TRIAL_DAYS = 7;

/**
 * 추가할 수 있는 트레이너 좌석 수(관리자 본인 제외).
 * 좌석 등급은 account.billing_plan — 결제 전(체험·파일럿)이면 account.type으로 대신 판단.
 * ⚠️ 서버(create-trainer)가 진짜 관문이다. 화면 표시는 안내일 뿐.
 */
export function trainerSeatLimit(planKey) {
  return PLANS[planKey]?.trainerSeats ?? 0;
}

export function planAmount(key) {
  return PLANS[key]?.amount ?? null;
}
