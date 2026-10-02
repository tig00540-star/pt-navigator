/* =========================================================================
   사례 보관함(세일즈북 1단계) 순수 헬퍼 — UI 무의존.
   기록(인바디·운동일지·사진)에서 '담을 만한 변화' 후보를 뽑고, 담는 순간의 숫자를 스냅샷으로 만든다.
   숫자는 여기서만 만든다 — 화면에서 손으로 고칠 수 없다(진짜 숫자만 보여주기).
   ========================================================================= */

import { buildExerciseSeries } from "@/lib/workout";

export const CASE_KINDS = [
  { value: "photo", label: "비포·애프터" },
  { value: "inbody", label: "인바디 변화" },
  { value: "lift", label: "운동 변화" },
  { value: "review", label: "회원 후기" },
];
export const caseKindLabel = (k) => CASE_KINDS.find((x) => x.value === k)?.label || k;

// 사례 목적(2026-10-02 대표 요청) — 세일즈북이 회원 목표와 같은 목적의 사례를 먼저 골라 준다. data.category에 저장.
export const CASE_CATEGORIES = ["다이어트", "바디프로필", "벌크업", "체형교정", "건강·체력"];
// 회원 목표 글 → 목적. 못 맞추면 null(트레이너가 고른다).
export function guessCategory(goal) {
  const g = String(goal || "");
  if (/바디\s*프로필|바프|촬영/.test(g)) return "바디프로필";
  if (/벌크|근육|근력|증량|체중\s*증가|몸\s*키우/.test(g)) return "벌크업";
  if (/체형|교정|자세|거북|라운드|골반|척추|통증|재활|불편|어깨|허리|무릎/.test(g)) return "체형교정";
  if (/다이어트|감량|체중\s*감소|살|체지방|뱃살/.test(g)) return "다이어트";
  if (/건강|체력|활력|컨디션|당뇨|혈압/.test(g)) return "건강·체력";
  return null;
}

const DAY = 86400000;
const toDate = (v) => (v ? new Date(String(v).length <= 10 ? `${v}T00:00:00` : v) : null);

// 두 날짜 사이 주 수(최소 1).
export function weeksBetween(from, to) {
  const a = toDate(from), b = toDate(to);
  if (!a || !b || isNaN(+a) || isNaN(+b)) return null;
  return Math.max(1, Math.round(Math.abs(b - a) / (7 * DAY)));
}

// 익명 라벨 — 실명 대신 "30대 여성 · 12주". 나이·성별이 없으면 있는 것만.
export function anonLabel(member, weeks) {
  const age = Number(member?.age);
  const decade = Number.isFinite(age) && age > 0 ? `${Math.floor(age / 10) * 10}대` : "";
  const g = member?.gender === "female" ? "여성" : member?.gender === "male" ? "남성" : "";
  const who = [decade, g].filter(Boolean).join(" ") || "회원";
  return weeks ? `${who} · ${weeks}주` : who;
}

export const INBODY_METRICS = [
  { key: "weight", label: "체중", unit: "kg", better: "down" },
  { key: "skeletal_muscle", label: "골격근량", unit: "kg", better: "up" },
  { key: "body_fat_pct", label: "체지방률", unit: "%", better: "down" },
  { key: "body_fat_mass", label: "체지방량", unit: "kg", better: "down" },
];

const round1 = (n) => Math.round(n * 10) / 10;

// 인바디 후보 — 회원별 처음·최근 측정(2회 이상). 좋아진 폭이 큰 순.
//   score = 체지방률 감소 + 골격근 증가 + 체중 감소/2 (방향이 나빠진 값은 0으로 — 자랑할 변화만)
export function inbodyCandidates(members, rows) {
  const byMember = new Map();
  for (const r of rows || []) {
    if (!byMember.has(r.user_id)) byMember.set(r.user_id, []);
    byMember.get(r.user_id).push(r);
  }
  const out = [];
  for (const m of members || []) {
    const list = (byMember.get(m.id) || []).slice().sort((a, b) => toDate(a.measured_at) - toDate(b.measured_at));
    if (list.length < 2) continue;
    const first = list[0], latest = list[list.length - 1];
    const metrics = INBODY_METRICS
      .filter((k) => first[k.key] != null && latest[k.key] != null)
      .map((k) => ({ key: k.key, label: k.label, unit: k.unit, better: k.better, first: Number(first[k.key]), latest: Number(latest[k.key]) }));
    if (!metrics.length) continue;
    const gain = (k) => {
      const x = metrics.find((v) => v.key === k);
      if (!x) return 0;
      const d = x.latest - x.first;
      return x.better === "down" ? Math.max(0, -d) : Math.max(0, d);
    };
    const score = gain("body_fat_pct") + gain("skeletal_muscle") + gain("weight") / 2;
    if (score <= 0) continue;
    const weeks = weeksBetween(first.measured_at, latest.measured_at);
    out.push({
      member: m, score,
      data: { from: first.measured_at, to: latest.measured_at, weeks, count: list.length, metrics },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// 운동 무게 후보 — 회원·종목별 처음·최근 최고중량(2회 이상 · 늘어난 것만). 늘어난 비율 순.
export function liftCandidates(members, logs) {
  const byMember = new Map();
  for (const l of logs || []) {
    if (l.voided || l.source === "noshow") continue;
    if (!byMember.has(l.user_id)) byMember.set(l.user_id, []);
    byMember.get(l.user_id).push(l);
  }
  const out = [];
  for (const m of members || []) {
    for (const s of buildExerciseSeries(byMember.get(m.id) || [])) {
      const pts = s.points.filter((p) => p.topWeight != null);
      if (pts.length < 2) continue;
      const first = pts[0], latest = pts[pts.length - 1];
      if (!(latest.topWeight > first.topWeight) || !(first.topWeight > 0)) continue;
      const weeks = weeksBetween(first.date, latest.date);
      out.push({
        member: m,
        score: (latest.topWeight - first.topWeight) / first.topWeight,
        data: {
          exercise: s.exercise,
          first: first.topWeight, latest: latest.topWeight,
          from: first.date, to: latest.date, weeks, sessions: pts.length,
          // 스파크라인용(최대 16점)
          points: pts.slice(-16).map((p) => p.topWeight),
        },
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// 사진 사례 스냅샷 — 날짜가 빠른 쪽이 '처음'.
export function photoCaseData(a, b) {
  const [before, after] = [a, b].sort((x, y) => toDate(x.taken_on) - toDate(y.taken_on));
  return {
    before: { path: before.storage_path, taken_on: before.taken_on },
    after: { path: after.storage_path, taken_on: after.taken_on },
    weeks: weeksBetween(before.taken_on, after.taken_on),
  };
}

// 변화량 표기 — "−5.7%p" / "+2.1kg"
export function deltaText(first, latest, unit) {
  const d = round1(latest - first);
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d)}${unit === "%" ? "%p" : unit}`;
}

// 좋아진 방향인가(색 표시용)
export const improved = (m) => (m.better === "down" ? m.latest < m.first : m.latest > m.first);

export const shortDay = (v) => {
  const d = toDate(v);
  return d && !isNaN(+d) ? `${d.getFullYear() % 100}.${d.getMonth() + 1}.${d.getDate()}` : "";
};
