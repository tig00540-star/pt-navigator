// 초 → mm:ss 표기. 여러 탭의 타이머(1차 OT 타임라인·음성일지 녹음)가 공유.
export const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// 원화 표기. 탭1(PT 패키지)과 재등록 CRM 탭이 공유.
export const won = (n) => "₩" + n.toLocaleString("ko-KR");
