// 체형평가 항목·상태 정의(클라/서버 공용 순수 데이터). posture_assessment.findings 키와 물림.
export const POSTURE_ITEMS = [
  { key: "forward_head",    label: "거북목 (전방머리)" },
  { key: "round_shoulder",  label: "라운드숄더 (어깨 말림)" },
  { key: "pelvic_tilt",     label: "골반 전·후 경사" },
  { key: "pelvic_rotation", label: "골반 좌우 틀어짐" },
  { key: "spine_balance",   label: "척추 좌우 불균형" },
  { key: "knee_align",      label: "무릎 정렬 (X·O다리)" },
  { key: "ankle_arch",      label: "발목·발아치" },
];

// 상태 선택지 — 빈값=미평가. 저장은 value(영문), 표시는 label.
export const POSTURE_STATES = [
  { value: "", label: "미평가" },
  { value: "normal", label: "정상" },
  { value: "mild", label: "경도" },
  { value: "moderate", label: "중등도" },
  { value: "severe", label: "심함" },
];

export const POSTURE_STATE_LABEL = { normal: "정상", mild: "경도", moderate: "중등도", severe: "심함" };

// 소견 개수(정상 아님) — 배지·요약용.
export function issueCount(findings) {
  const f = findings || {};
  return POSTURE_ITEMS.reduce((n, it) => (f[it.key] && f[it.key] !== "normal" ? n + 1 : n), 0);
}
