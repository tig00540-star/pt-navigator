// 회원 사전 문진 선택지 — 트레이너 '신규 회원 등록'(MemberForm)과 회원 OT 신청서(/join)가 같이 쓴다(2026-10-06).
//   값이 같아야 AI · 통계가 같은 말로 읽는다. 바꾸면 두 화면이 같이 바뀐다.
export const MEMBER_OPTS = {
  goal: ["체중감량", "바디프로필", "체형교정", "근력·벌크업", "건강·체력", "재활·통증개선"],
  training_pace: ["가볍게", "제대로", "집중해서"],
  exercise_level: ["처음", "가끔씩", "꾸준히"],
  activity_level: ["주로 앉아서", "보통", "활동적"],
  quit_reason: ["시간 부족", "동기 저하", "효과 의문", "부상", "혼자 막막"],
  past_exercise: ["없음", "PT", "필라테스", "요가", "크로스핏"],
  injury_history: ["없음"],
};
export const GENDER_OPTS = [["female", "여성"], ["male", "남성"]];
