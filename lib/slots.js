// 회원이 고른 원하는 요일 · 시간(user_table.preferred_slots · ot_application.slots · OT 신청서).
//   2026-10-06 v2: 요일마다 시간을 따로 — { by_day: {"1":[19,20], "3":[7,8]}, note?, text? } (월=1 · 그 시각부터 1시간)
//     옛 v1 { days:[..], hours:[..] } 은 '고른 요일 전부 같은 시간'으로 읽는다(예전 신청 그대로 보이게).
//   text = 서버가 만든 한 줄(availability에도 들어가 AI가 읽음).
export const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
export const SLOT_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);   // 6시 ~ 23시

/** 요일(1~7) → 시간 배열(오름차순). 시간이 빈 요일 = 시간 협의. */
export function slotDays(s) {
  const out = new Map();
  if (!s) return out;
  if (s.by_day && typeof s.by_day === "object") {
    for (const [k, v] of Object.entries(s.by_day)) {
      const d = Number(k);
      if (d >= 1 && d <= 7) out.set(d, [...new Set((Array.isArray(v) ? v : []).map(Number).filter((h) => h >= 0 && h <= 23))].sort((a, b) => a - b));
    }
  } else {
    const hours = [...new Set((s.hours || []).map(Number))].sort((a, b) => a - b);
    for (const d of s.days || []) if (d >= 1 && d <= 7) out.set(Number(d), hours);
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

// 이어진 시각은 묶는다: [19,20,21] → "19~22시" · [7] → "7~8시"
function hourRanges(hours) {
  const hs = [...new Set(hours)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < hs.length; ) {
    let j = i;
    while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j++;
    out.push(`${hs[i]}~${hs[j] + 1}시`);
    i = j + 1;
  }
  return out.join(", ");
}

/** "월·수 19~22시 / 토 10~12시 · 화요일은 8시 이후" — 같은 시간인 요일은 묶는다. (없으면 "") */
export function formatSlots(s) {
  if (!s) return "";
  if (s.text) return s.text;
  const groups = new Map();   // 시간 글 → 요일들
  for (const [d, hs] of slotDays(s)) {
    const k = hs.length ? hourRanges(hs) : "시간 협의";
    groups.set(k, [...(groups.get(k) || []), DAY_LABELS[d - 1]]);
  }
  // 요일만 고르고(시간 없음) 옛 형식으로 시간만 고른 경우
  if (!groups.size && (s.hours || []).length) groups.set(hourRanges(s.hours), []);
  const body = [...groups.entries()].map(([t, ds]) => `${ds.join("·")}${ds.length ? " " : ""}${t}`).join(" / ");
  return [body, s.note].filter(Boolean).join(" · ");
}

/** 그 요일(1~7) · 시각에 회원이 된다고 했나(시간 협의 요일은 '된다'로 본다). */
export function slotHas(s, day, hour) {
  const m = slotDays(s);
  if (!m.has(day)) return false;
  const hs = m.get(day);
  return !hs.length || hs.includes(hour);
}
