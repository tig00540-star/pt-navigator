// KST(UTC+9) 날짜 헬퍼 단일 출처.
// 주의: 브라우저에서 호출되는 클라 컴포넌트 전용 헬퍼다(new Date = 클라 로컬시각 기준 UTC).
//       서버 라우트에서 "오늘"이 필요하면 요청시각 기준이 되므로 이 파일에 서버용을 따로 두기 전엔 쓰지 말 것.
// (향후: kstYm·daysSince 등 흩어진 날짜 헬퍼를 여기로 모은다 — 리포트 §8. 이번엔 kstToday만.)

// KST 오늘 'YYYY-MM-DD'. UTC 시각에 +9h 한 뒤 ISO의 날짜부만 취함.
export function kstToday() {
  return new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
