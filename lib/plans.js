// 구독 플랜 정의 — 클라·서버 공용(순수 데이터). 얼리버드가 · 단일 기능등급(둘 다 회원앱 포함=plan 'premium').
// ⚠️ 금액 변경 시 여기만 고치면 결제·화면 동시 반영. 정가(regular)는 안내용, 실청구는 amount.
export const PLANS = {
  solo: {
    key: "solo",
    name: "솔로",
    amount: 59000, // 얼리버드
    regular: 79000,
    desc: "개인 트레이너 1인",
    features: ["1·2차 OT·재등록 서포트", "음성일지·AI 리포트", "회원앱(성과 그래프·비포애프터)", "실적·급여 자동계산"],
  },
  center: {
    key: "center",
    name: "센터",
    amount: 149000, // 얼리버드
    regular: 199000,
    desc: "트레이너 3인 + 관리자 1인",
    features: ["솔로 전체 포함", "관리자 대시보드(매출·전환·리텐션)", "트레이너 3인 좌석 + 관리자 1인", "QC·팀 관리"],
  },
};

export const TRIAL_DAYS = 7;

export function planAmount(key) {
  return PLANS[key]?.amount ?? null;
}
