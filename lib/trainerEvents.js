// lib/trainerEvents.js — 트레이너 개인 일정(회의 · 청소 · 휴무 …)의 색 · 반복 펼치기(2026-10-06). 순수 함수.
//   저장은 표 trainer_event 한 행 = 일정 하나(반복이면 규칙 하나). 화면은 보는 기간만큼 펼쳐서(expandEvents) 그린다.
//   반복: none(한 번) · daily(매일) · weekly(매주 · repeat_days 요일들 0=일~6=토) · monthly(매월 같은 날).
//   '이번만 빼기' = skip_dates에 그날(YYYY-MM-DD)을 넣는다. 시간은 기기 시간(한국 기준 사용).

// 색 — 정적 클래스만(purge). 역할 색(OT 앰버 · PT 하늘)과 겹쳐도 개인 일정은 테두리 점선으로 구분된다.
export const EVENT_COLORS = {
  gray:   { label: "회색",   chip: "bg-zinc-100 text-zinc-700 border-zinc-300",       dot: "bg-zinc-400" },
  sky:    { label: "하늘",   chip: "bg-sky-50 text-sky-800 border-sky-300",           dot: "bg-sky-400" },
  amber:  { label: "노랑",   chip: "bg-amber-50 text-amber-800 border-amber-300",     dot: "bg-amber-400" },
  violet: { label: "보라",   chip: "bg-violet-50 text-violet-800 border-violet-300",  dot: "bg-violet-400" },
  pink:   { label: "분홍",   chip: "bg-pink-50 text-pink-800 border-pink-300",        dot: "bg-pink-400" },
  teal:   { label: "청록",   chip: "bg-teal-50 text-teal-800 border-teal-300",        dot: "bg-teal-400" },
};
export const EVENT_COLOR_KEYS = Object.keys(EVENT_COLORS);
export const colorOf = (k) => EVENT_COLORS[k] || EVENT_COLORS.gray;

export const EVENT_PRESETS = ["회의", "청소", "휴무", "교육", "점심", "개인 운동"];
export const REPEAT_OPTS = [
  { value: "none", label: "반복 안 함" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
];
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n) => String(n).padStart(2, "0");
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 일정들을 [from, to) 기간의 '한 번 한 번'으로 펼친다. → [{ ev, start: Date, end: Date, ymd }] 시작 순. */
export function expandEvents(events, from, to) {
  const out = [];
  const fromMs = from.getTime(), toMs = to.getTime();
  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev?.start_at) continue;
    const s0 = new Date(ev.start_at);
    const e0 = ev.end_at ? new Date(ev.end_at) : new Date(s0.getTime() + 3600000);
    const dur = Math.max(15 * 60000, e0.getTime() - s0.getTime());
    const skip = new Set(Array.isArray(ev.skip_dates) ? ev.skip_dates : []);
    const until = ev.repeat_until ? new Date(`${ev.repeat_until}T23:59:59`) : null;
    const push = (start) => {
      const ymd = ymdOf(start);
      if (skip.has(ymd)) return;
      const end = new Date(start.getTime() + dur);
      if (end.getTime() <= fromMs || start.getTime() >= toMs) return;
      out.push({ ev, start, end, ymd });
    };
    const rep = ev.repeat || "none";
    if (rep === "none") { push(s0); continue; }
    // 반복 — 보는 기간의 날짜를 하루씩 훑으며 규칙에 맞는 날만(기간이 길지 않아 충분히 가볍다).
    const day = new Date(Math.max(fromMs - dur, s0.getTime()));
    day.setHours(0, 0, 0, 0);
    for (; day.getTime() < toMs; day.setDate(day.getDate() + 1)) {
      if (until && day > until) break;
      if (day < new Date(s0.getFullYear(), s0.getMonth(), s0.getDate())) continue;
      const ok = rep === "daily"
        || (rep === "weekly" && (Array.isArray(ev.repeat_days) && ev.repeat_days.length ? ev.repeat_days.includes(day.getDay()) : day.getDay() === s0.getDay()))
        || (rep === "monthly" && day.getDate() === s0.getDate());
      if (!ok) continue;
      push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), s0.getHours(), s0.getMinutes()));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 반복 규칙 한 줄 설명. */
export function repeatLabel(ev) {
  const rep = ev?.repeat || "none";
  if (rep === "none") return "";
  const until = ev.repeat_until ? ` · ${Number(ev.repeat_until.slice(5, 7))}월 ${Number(ev.repeat_until.slice(8, 10))}일까지` : "";
  if (rep === "daily") return `매일${until}`;
  if (rep === "monthly") return `매월 ${new Date(ev.start_at).getDate()}일${until}`;
  const days = Array.isArray(ev.repeat_days) && ev.repeat_days.length ? ev.repeat_days : [new Date(ev.start_at).getDay()];
  return `매주 ${[...days].sort().map((d) => WEEKDAYS[d]).join("·")}${until}`;
}
