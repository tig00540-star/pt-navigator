// 초 → mm:ss 표기. 여러 탭의 타이머(1차 OT 타임라인·음성일지 녹음)가 공유.
export const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// 원화 표기. 탭1(PT 패키지)과 재등록 CRM 탭이 공유. "200,000원" 형식으로 통일.
// 금액 표시는 전부 여기서 — 예전엔 화면마다 WON/manwon을 따로 만들어 반올림 규칙이 달랐다.
export const won = (n) => Math.round(n ?? 0).toLocaleString("ko-KR") + "원";

// 추정 금액 표시 — 1,000원 단위로 끊는다(반올림).
// 평균에서 나온 값이라 백원·십원 자리는 정밀해 보이기만 하고 뜻이 없다(1,283,333원 → 1,283,000원).
// ⚠️ 실제 계약·지출·급여 금액에는 쓰지 않는다 — 장부 숫자가 화면마다 달라 보이면 안 된다.
export const wonApprox = (n) => won(Math.round((n ?? 0) / 1000) * 1000);

// 좁은 칸용 만원 축약 — 1만원 미만은 원 단위 그대로(대표 홈·운영 보고서 타일).
export const manwon = (n) => ((n ?? 0) >= 10000 ? `${Math.round((n ?? 0) / 10000).toLocaleString("ko-KR")}만원` : won(n));

// 사람 이름 표시 가드 — name이 이메일(시드 초기값)이면 @ 앞부분만. 표시단 전용(저장값 무변).
export function personName(name) {
  if (!name) return "";
  const s = String(name).trim();
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

// 표시할 값이 있나 — null·빈문자·플레이스홀더("-") 제외. 카드 빈값 "-" 남발 숨김용(표시단 전용).
export const hasVal = (v) => v != null && v !== "" && v !== "-";

/** 회원 전용 페이지의 '운영' 이름(2026-10-06) — member_me 행 기준.
 *  센터 계정: 센터 이름 · 개인 계정: "상호 · 홍길동 트레이너"(상호 없으면 "홍길동 트레이너"). */
export function operatorName(me) {
  if (!me) return "";
  if (me.is_solo) {
    const t = personName(me.trainer_name);
    return [me.center_name, t ? `${t} 트레이너` : ""].filter(Boolean).join(" · ") || "담당 트레이너";
  }
  return me.center_name || "";
}
