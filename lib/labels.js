// 라벨(한글) ↔ 저장값(영문 키) 공용 매핑. ObservationTab · SecondOTTab 공유.
// (관찰 입력 드롭다운 + AI approach_tag 화면 한글화에 재사용)

export const STIMULUS_OPTS = [
  { value: "well", label: "잘 느낌" },
  { value: "normal", label: "보통" },
  { value: "poor", label: "잘 못 느낌" },
];

export const ATTITUDE_TAGS = [
  { value: "timid", label: "겁많음" },
  { value: "active", label: "적극적" },
  { value: "passive", label: "시키는것만" },
  { value: "enjoys", label: "재미있어함" },
];

export const GOAL_TYPE_OPTS = [
  { value: "appearance", label: "외형변화" },
  { value: "pain", label: "통증개선" },
  { value: "health", label: "건강·체력" },
  { value: "machine_only", label: "기구사용법만" },
  { value: "other", label: "기타" },
];

export const CLOSING_RESULT_OPTS = [
  { value: "none", label: "미시도" },
  { value: "success", label: "성공" },
  { value: "fail", label: "실패" },
  { value: "hold", label: "보류" },
];

// AI closing/soft_closing approach_tag 값과 물림(value|pain|appearance|other). health는 방어적 포함.
export const CLOSING_APPROACH_OPTS = [
  { value: "pain", label: "통증개선" },
  { value: "appearance", label: "외형변화" },
  { value: "value", label: "가치체감" },
  { value: "health", label: "건강·체력" },
  { value: "other", label: "기타" },
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

// 값 → 라벨(없으면 값 그대로). 예: labelOf(CLOSING_APPROACH_OPTS, "pain") → "통증개선"
export function labelOf(opts, value) {
  const f = opts.find((o) => o.value === value);
  return f ? f.label : value;
}
