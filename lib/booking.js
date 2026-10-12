// 회원 수업 예약 · 변경 · 취소 요청(2026-10-06) — 회원 화면 · 트레이너 카드 공용 계산.
//   ⚠️ 규칙의 진짜 관문은 DB(request_appt · decide_appt_request). 여기는 화면에서 미리 막고 보여 주는 용도.
//   시각은 한국 시간 기준(2026-10-12 · 폰 시간대와 무관 — 해외 시간대 폰에서도 칸 · 글자가 한국 시각으로 맞게).
//   '날짜' Date(windowDays가 주는 것)는 한국 날짜의 연 · 월 · 일 숫자를 담은 값이다(dayText · ymdOf가 그대로 읽음).
import { expandEvents } from "@/lib/trainerEvents";

export const BOOK_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);   // 6시 ~ 23시(1시간 칸)
const DOW = "일월화수목금토";
const KST = 9 * 3600000;
const HOUR = 3600000;
const pad = (n) => String(n).padStart(2, "0");
const kst = (ms) => new Date(ms + KST);   // getUTC*로 한국 시각을 읽는다

/** "10월 8일(수) 오후 7시"(한국 시각) */
export function slotText(iso) {
  if (!iso) return "";
  const d = kst(Date.parse(iso));
  const h = d.getUTCHours();
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${DOW[d.getUTCDay()]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시`;
}
export const dayText = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;

/** 그 시각이 든 칸 "YYYY-MM-DD|시"(한국 시각) — BookingCard가 `${ymdOf(날짜)}|${시}`로 찾는 열쇠와 같은 모양 */
export function slotKey(at) {
  const d = kst(new Date(at).getTime());
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}|${d.getUTCHours()}`;
}

/** 그 날(한국 날짜) 그 시각(한국) 칸이 시작하는 Date */
export const slotDate = (day, hour) => new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0) - KST);

/** 오늘(한국)부터 창 끝(이번 주 + 다음 주)까지 날짜들 */
export function windowDays(windowEnd, now = new Date()) {
  const end = windowEnd ? new Date(windowEnd) : null;
  const out = [];
  const k = kst(now.getTime());
  const d = new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  for (let i = 0; i < 15; i++, d.setDate(d.getDate() + 1)) {
    if (end && slotDate(d, 0) >= end) break;
    out.push(new Date(d));
  }
  return out;
}

/** 트레이너가 바쁜 칸 "YYYY-MM-DD|시"(한국) 모음(다른 수업 · 개인 일정) — member_trainer_busy 행을 펼쳐서 */
export function busySlots(rows, from, to) {
  const occ = expandEvents(rows || [], from, to);
  const set = new Set();
  for (const o of occ) {
    const s = new Date(o.start).getTime(), e = new Date(o.end).getTime();
    // 한국 시간은 정시 단위 시차라 UTC 정시 = 한국 정시. 30분에 시작한 일정은 그 앞 칸도 걸친다.
    for (let t = Math.floor(s / HOUR) * HOUR; t < e; t += HOUR) set.add(slotKey(t));
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
