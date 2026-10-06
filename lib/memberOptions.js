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

// OT 신청서 2단계 새 질문(2026-10-06) — 신청서 · 서버 라우트 · 트레이너 화면이 같은 값.
export const WEEKLY_OPTS = [["1", "주 1번"], ["2", "주 2번"], ["3", "주 3번"], ["4+", "주 4번 이상"]];
export const LEAD_SOURCES = ["인스타그램", "네이버 검색 · 지도", "지인 소개", "지나가다 봤어요", "기타"];
// 운동 전 건강 체크(안전 · 건강정보 동의했을 때만) — 진단이 아니라 '조심할 게 있는지'만.
export const HEALTH_SCREEN_ITEMS = ["심장 질환", "고혈압", "당뇨", "임신 중", "최근 6개월 안 수술", "의사에게 운동 제한을 들었어요"];
export const TRAINER_GENDER_OPTS = [["any", "상관없어요"], ["female", "여성 트레이너"], ["male", "남성 트레이너"]];

/** health_screen(jsonb) → 한 줄. {none:true} = "해당 없음" · 없으면 "" */
export function healthScreenText(h) {
  if (!h) return "";
  if (h.none) return "해당 없음";
  return [...(h.items || []), h.note].filter(Boolean).join(" · ");
}
