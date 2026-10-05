// 회원이 고른 원하는 요일 · 시간(user_table.preferred_slots · ot_application.slots · 2026-10-06 OT 신청서).
//   { days:[1..7](월=1), hours:[5..23](그 시각부터 1시간), note?, text? } — text는 서버가 만든 한 줄(availability에도 들어감).
export const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
export const SLOT_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);   // 5시 ~ 23시

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
  return out;
}

/** "월·수·금 · 19~22시 · 화요일은 8시 이후" (없으면 "") */
export function formatSlots(s) {
  if (!s) return "";
  if (s.text) return s.text;
  const days = (s.days || []).filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b).map((d) => DAY_LABELS[d - 1]).join("·");
  const hours = hourRanges((s.hours || []).filter((h) => h >= 0 && h <= 23)).join(", ");
  return [days, hours, s.note].filter(Boolean).join(" · ");
}
