// 초 → mm:ss 표기. 여러 탭의 타이머(1차 OT 타임라인·음성일지 녹음)가 공유.
export const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// 원화 표기. 탭1(PT 패키지)과 재등록 CRM 탭이 공유. "200,000원" 형식으로 통일.
export const won = (n) => (n ?? 0).toLocaleString("ko-KR") + "원";

// 사람 이름 표시 가드 — name이 이메일(시드 초기값)이면 @ 앞부분만. 표시단 전용(저장값 무변).
export function personName(name) {
  if (!name) return "";
  const s = String(name).trim();
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}
