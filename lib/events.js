// 회원 이벤트(2026-10-06) — 트레이너 관리 화면 · 회원 화면 공용(상태 · 기간 글).
//   날짜는 'YYYY-MM-DD'(KST 기준 · 기기 시각). 이벤트 기간 starts_on~ends_on · 신청 기간 join_from~join_until(비우면 이벤트 기간).
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const md = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "");

export const EVENT_STATUS_LABEL = { upcoming: "예정", live: "진행 중", ended: "끝남" };

/** 'upcoming' | 'live' | 'ended' */
export function eventStatus(ev, today = todayYmd()) {
  if (ev.ends_on && ev.ends_on < today) return "ended";
  if (ev.starts_on && ev.starts_on > today) return "upcoming";
  return "live";
}

/** 신청 상태: 'open' | 'not_yet' | 'closed' | 'full' */
export function joinState(ev, today = todayYmd()) {
  const from = ev.join_from || ev.starts_on, until = ev.join_until || ev.ends_on;
  if (until && until < today) return "closed";
  if (from && from > today) return "not_yet";
  if (ev.capacity && (ev.joined_count ?? 0) >= ev.capacity) return "full";
  return "open";
}

/** "10/1~10/31 · 신청 9/25~10/5" · 상시면 "상시" */
export function eventPeriodText(ev) {
  const p = ev.starts_on || ev.ends_on ? `${md(ev.starts_on) || "지금"}~${md(ev.ends_on) || ""}` : "상시";
  const j = ev.join_from || ev.join_until ? ` · 신청 ${md(ev.join_from) || ""}~${md(ev.join_until) || ""}` : "";
  return p + j;
}
