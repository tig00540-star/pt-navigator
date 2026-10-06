// 회원 수업 예약 · 변경 · 취소 요청(2026-10-06) — 회원 화면 · 트레이너 카드 공용 계산.
//   ⚠️ 규칙의 진짜 관문은 DB(request_appt · decide_appt_request). 여기는 화면에서 미리 막고 보여 주는 용도.
//   시각은 기기 시각(한국) 기준 — 스케줄 · 개인 일정(lib/trainerEvents)과 같다.
import { expandEvents, ymdOf } from "@/lib/trainerEvents";

export const BOOK_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);   // 6시 ~ 23시(1시간 칸)
const DOW = "일월화수목금토";

/** "10월 8일(수) 오후 7시" */
export function slotText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시`;
}
export const dayText = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;

/** 오늘부터 창 끝(이번 주 + 다음 주)까지 날짜들 */
export function windowDays(windowEnd, now = new Date()) {
  const end = windowEnd ? new Date(windowEnd) : null;
  const out = [];
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 15; i++, d.setDate(d.getDate() + 1)) {
    if (end && d >= end) break;
    out.push(new Date(d));
  }
  return out;
}

/** 그 날 그 시각 칸이 시작하는 Date */
export const slotDate = (day, hour) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);

/** 트레이너가 바쁜 칸 "YYYY-MM-DD|시" 모음(다른 수업 · 개인 일정) — member_trainer_busy 행을 펼쳐서 */
export function busySlots(rows, from, to) {
  const occ = expandEvents(rows || [], from, to);
  const set = new Set();
  for (const o of occ) {
    for (let t = new Date(o.start); t < o.end; t = new Date(t.getTime() + 3600000)) {
      const h = new Date(t); h.setMinutes(0, 0, 0);
      set.add(`${ymdOf(h)}|${h.getHours()}`);
    }
    // 30분에 시작한 일정은 그 앞 칸도 걸친다
    const s = new Date(o.start);
    if (s.getMinutes()) set.add(`${ymdOf(s)}|${s.getHours()}`);
  }
  return set;
}

/** 변경 · 취소 · 새 요청이 아직 되는가(수업 시각 − 지금 ≥ 기준 시간) */
export const beforeCutoff = (startIso, cutoffHours, nowMs) => Date.parse(startIso) - nowMs >= cutoffHours * 3600000;

export const KIND_LABEL = { new: "새 수업", change: "시간 변경", cancel: "취소" };

/** 요청 한 줄: "10월 8일(수) 오후 7시 → 10월 9일(목) 오후 8시" */
export function requestLine(r) {
  if (r.kind === "new") return slotText(r.want_start);
  if (r.kind === "change") return `${slotText(r.orig_start)} → ${slotText(r.want_start)}`;
  return slotText(r.orig_start);
}
