// 폰 푸시 알림 종류(2026-10-06) — 트레이너 설정 '알림' 화면과 서버(lib/pushServer)가 같은 키를 쓴다.
//   who: trainer(모든 트레이너) · owner(대표만 보이는 줄) · member(회원 전용 페이지 · 켜기/끄기 하나).
//   트레이너 설정에 없는 키(notify_pref.prefs에 없음) = 켜짐.
export const NOTIFY_TYPES = [
  { key: "ot_new", who: "trainer", label: "새 OT 회원", hint: "내 QR로 신청했거나 대표가 배정했을 때" },
  { key: "dispute", who: "trainer", label: "회원이 '내용이 달라요'", hint: "운동일지 내용이 다르다고 했을 때" },
  { key: "owner_feedback", who: "trainer", label: "대표 피드백", hint: "대표가 내 회원 건에 피드백을 남겼을 때" },
  { key: "routine_request", who: "trainer", label: "루틴 요청", hint: "회원이 개인운동 루틴을 요청했을 때" },
  { key: "appt_request", who: "trainer", label: "수업 예약 · 변경 · 취소 요청", hint: "회원이 회원 전용 페이지에서 요청했을 때" },
  { key: "payroll", who: "trainer", label: "급여 확정", hint: "대표가 내 급여를 확정했을 때" },
  { key: "ot_pending", who: "owner", label: "OT 신청 배정 대기", hint: "센터 QR로 신청이 들어왔을 때" },
  { key: "owner_report", who: "owner", label: "아침 보고서", hint: "매일 아침 보고서가 준비됐을 때" },
];
export const MEMBER_NOTIFY = { key: "log_written", label: "운동일지 확인", hint: "트레이너가 운동일지를 쓰면 확인해 달라고 알려 드려요" };
