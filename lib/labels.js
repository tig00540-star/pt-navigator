// 라벨(한글) ↔ 저장값(영문 키) 공용 매핑. ObservationTab · SecondOTTab 공유.
// (관찰 입력 드롭다운 + AI approach_tag 화면 한글화에 재사용)

export const STIMULUS_OPTS = [
  { value: "well", label: "잘 느낌" },
  { value: "normal", label: "보통" },
  { value: "poor", label: "잘 못 느낌" },
];

// 회원 성향(OT 피드백 · 2026-10-02 확장). 앞 4개는 옛 값 그대로(저장값 호환), 뒤는 추가.
export const ATTITUDE_TAGS = [
  { value: "active", label: "적극적" },
  { value: "timid", label: "조심스러움" },
  { value: "passive", label: "시키는 것만" },
  { value: "enjoys", label: "재밌어함" },
  { value: "questions", label: "질문 많음" },
  { value: "price_sensitive", label: "가격 민감" },
  { value: "time_conscious", label: "시간 신경 씀" },
];

// OT 피드백 — 운동별 반응(다음 OT 증명 재연 재료).
export const MOVE_TAGS = [
  { value: "felt", label: "자극 바로 옴" },
  { value: "aware", label: "본인도 차이 느낌" },
  { value: "weak", label: "잘 못 느낌" },
  { value: "discomfort", label: "불편해함" },
];

// OT 피드백 — 회원이 진짜 원하는 것(등록할 이유). 값은 goal_type과 같은 키(+habit 추가).
export const WANT_OPTS = [
  { value: "appearance", label: "외형 변화" },
  { value: "pain", label: "통증·불편 줄이기" },
  { value: "health", label: "건강·체력" },
  { value: "habit", label: "운동 습관 만들기" },
  { value: "machine_only", label: "기구 사용법만" },
];

// OT 피드백 — 다음 OT에서 등록 제안 수위(= sales_intensity 값 · 트레이너가 다음 OT를 위해 정함).
export const NEXT_PUSH_OPTS = [
  { value: "soft", label: "가볍게 떠보기", hint: "체감 위주, 제안은 부드럽게" },
  { value: "standard", label: "분명하게 제안", hint: "정석대로 등록 요청까지" },
  { value: "strong", label: "오늘 꼭 마무리", hint: "클로징을 일찍 열고 망설인 이유부터 풀기" },
];

export const GOAL_TYPE_OPTS = [
  { value: "appearance", label: "외형변화" },
  { value: "pain", label: "통증개선" },
  { value: "health", label: "건강·체력" },
  { value: "machine_only", label: "기구사용법만" },
  { value: "other", label: "기타" },
];

export const CLOSING_RESULT_OPTS = [
  { value: "none",    label: "미시도" },
  { value: "success", label: "성공 (등록 완료)" },
  { value: "hold",    label: "보류 (추가 OT 진행 예정)" },
  { value: "fail",    label: "실패 (차후 진행 예정 없음)" },
];

// AI closing/soft_closing approach_tag 값과 물림(value|pain|appearance|other). health는 방어적 포함.
export const CLOSING_APPROACH_OPTS = [
  { value: "pain", label: "통증개선" },
  { value: "appearance", label: "외형변화" },
  { value: "value", label: "가치체감" },
  { value: "health", label: "건강·체력" },
  { value: "other", label: "기타" },
];

// 클로징 실패/보류 사유 카테고리 — closing_reason 집계용(약점 진단 · admin 분포).
export const CLOSING_REASON_OPTS = [
  { value: "money",    label: "금전 부담" },
  { value: "time",     label: "시간 부족" },
  { value: "schedule", label: "스케줄 안 맞음" },
  { value: "consider", label: "더 생각해볼게요" },
  { value: "compare",  label: "타 센터·방법 비교" },
  { value: "partner",  label: "가족·배우자 상의" },
  { value: "personal", label: "개인 사정" },
  { value: "etc",      label: "기타" },
];

// 세일즈 강도 — 트레이너가 회원별로 지시(AI가 정하지 않음 · ⭐⭐ 스파링 파트너). B2-b에서 2차 프롬프트가 참조.
export const SALES_INTENSITY_OPTS = [
  { value: "soft", label: "부드럽게" },
  { value: "standard", label: "표준" },
  { value: "strong", label: "강하게" },
];

// 수업로그 source 배지 — PTView 타임라인. 값은 daily_workout_log.source.
export const SOURCE_OPTS = [
  { value: "manual", label: "손입력" },
  { value: "voice",  label: "음성" },
  { value: "noshow", label: "노쇼" },
];

// 재등록 결과·이유 — session_log.reg_result / reg_reason. 값=영문 안정키(교훈4).
// reg_reason seed는 확정 아님 — 실데이터 보며 다듬음(자유서술 금지 = ④ 집계).
export const REG_RESULT_OPTS = [
  { value: "none",    label: "미시도" },
  { value: "success", label: "재등록 성공" },
  { value: "hold",    label: "보류" },
  { value: "fail",    label: "재등록 안 함" },
];
export const REG_REASON_OPTS = [
  { value: "money",         label: "금전 부담" },
  { value: "time",          label: "시간 부족" },
  { value: "schedule",      label: "스케줄 안 맞음" },
  { value: "sessions_left", label: "수업 남아 나중에" },
  { value: "low_effect",    label: "효과 체감 부족" },
  { value: "personal",      label: "개인 사정" },
  { value: "etc",           label: "기타" },
];

// 회원 라이프사이클 상태 배지 — user_table.status(② member_status). 색맵은 소비처(FirstOTTab STATUS_TONE).
export const STATUS_OPTS = [
  { value: "ot_active", label: "OT" },
  { value: "pt_active", label: "PT" },
  { value: "inactive",  label: "종료" },
];

// 인바디 필드 — inbody_log 컬럼 ↔ 라벨·단위·좋은 방향(추이 색). PtInbodyTab이 폼·표시·delta에 재사용.
export const INBODY_FIELDS = [
  { key: "weight",             label: "체중",       unit: "kg",   goodDir: null },   // 목표의존 → 중립
  { key: "skeletal_muscle",    label: "골격근량",   unit: "kg",   goodDir: "up" },
  { key: "body_fat_mass",      label: "체지방량",   unit: "kg",   goodDir: "down" },
  { key: "body_fat_pct",       label: "체지방률",   unit: "%",    goodDir: "down" },
  { key: "bmr",                label: "기초대사량", unit: "kcal", goodDir: "up" },
  { key: "visceral_fat_level", label: "내장지방",   unit: "lv",   goodDir: "down" },
];

// 값 → 라벨(없으면 값 그대로). 예: labelOf(CLOSING_APPROACH_OPTS, "pain") → "통증개선"
export function labelOf(opts, value) {
  const f = opts.find((o) => o.value === value);
  return f ? f.label : value;
}
