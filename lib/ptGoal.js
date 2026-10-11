/* =========================================================================
   숫자 목표(2026-10-11 · 대표 결정) — '현재 방향 · 목표' 글에서 지표 · 숫자 · 기간을 읽어 진행률을 잰다.
   트레이너는 글만 적는다 → 앱이 읽은 결과를 한 줄 보여 주고 [맞아요]를 눌러야 숫자 목표가 된다(잘못 읽은 숫자가
   진행률 · 재등록 대본에 들어가지 않게). 숫자가 없는 글('일자목 교정하기')은 숫자 목표 없이 글만.
   저장 = user_table.pt_goal(jsonb · 한 회원 하나):
     { v:1, metric, exercise?, dir:"up"|"down", start_value, target_value, unit, months, period_label,
       start_at(ISO), text(읽은 글), confirmed_at, visible(회원 전용 페이지 · 트레이너가 켤 때만) }
   지표 = 인바디 4개(체중 · 골격근량 · 체지방량 · 체지방률) + 운동 무게(종목 최고 무게 · 운동일지).
   다음 목표 추천(재등록) = 규칙(지난 속도) · AI 아님 · 트레이너가 글로 고친다.
   화면 · 회원 페이지 · 서버 프롬프트가 같이 쓰는 순수 함수만(DB 호출 없음).
   ========================================================================= */

import { buildExerciseSeries } from "@/lib/workout";

export const GOAL_METRICS = {
  weight:          { label: "체중",     unit: "kg" },
  skeletal_muscle: { label: "골격근량", unit: "kg" },
  body_fat_mass:   { label: "체지방량", unit: "kg" },
  body_fat_pct:    { label: "체지방률", unit: "%" },
  lift:            { label: "운동 무게", unit: "kg" },
};
export const GOAL_MONTHS = [1, 2, 3, 4, 6, 12];

const r1 = (x) => Math.round(Number(x) * 10) / 10;
const fmt = (x) => (x == null || Number.isNaN(Number(x)) ? "—" : String(r1(x)));
const DAY = 86400000;
// 한국 날짜(YYYY-MM-DD) — 수업 시각(session_at)은 UTC로 오니 9시간 더해 날짜를 뗀다(새벽 수업이 전날로 잡히지 않게).
const kstDay = (v) => { const s = String(v || ""); if (s.length <= 10) return s; const t = Date.parse(s); return Number.isNaN(t) ? s.slice(0, 10) : new Date(t + 9 * 3600000).toISOString().slice(0, 10); };

export const goalLabel = (g) => (g?.metric === "lift" ? g.exercise || "운동 무게" : GOAL_METRICS[g?.metric]?.label || "");
const unitOf = (g) => GOAL_METRICS[g?.metric]?.unit || "";
const deltaUnit = (g) => (g?.metric === "body_fat_pct" ? "%p" : unitOf(g));

// 글 → { metric, exercise?, dir, amount, mode:"delta"|"to", months, period_label } | null
//   exercises = 이 회원 운동일지에 있는 종목 이름(운동 무게 목표를 읽을 때만).
export function parseGoal(text, exercises = []) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const t = raw.replace(/키로|킬로|KG|Kg/g, "kg").replace(/퍼센트|프로/g, "%");
  // 기간
  let months = null, period_label = null;
  const pm = t.match(/(\d+(?:\.\d+)?)\s*(개월|달|주|년)/);
  if (pm) {
    const n = Number(pm[1]);
    if (pm[2] === "주") { months = r1(n / 4.345); period_label = `${n}주`; }
    else if (pm[2] === "년") { months = n * 12; period_label = `${n}년`; }
    else { months = n; period_label = `${n}개월`; }
  }
  // 숫자 + 단위(기간 숫자는 빼고)
  const tNoPeriod = pm ? t.replace(pm[0], " ") : t;
  const nm = tNoPeriod.match(/([+-]?\d+(?:\.\d+)?)\s*(kg|%p|%)/);
  if (!nm) return null;
  const amount = Math.abs(Number(nm[1]));
  if (!amount) return null;
  const unit = nm[2] === "kg" ? "kg" : "%";
  // 지표
  const ex = [...exercises].filter(Boolean).sort((a, b) => b.length - a.length).find((e) => t.includes(e));
  let metric = null;
  if (/체지방\s*률/.test(t) || (/체지방/.test(t) && unit === "%")) metric = "body_fat_pct";
  else if (/체지방\s*량/.test(t) || (/체지방/.test(t) && unit === "kg")) metric = "body_fat_mass";
  else if (/골격근|근육|근량/.test(t)) metric = "skeletal_muscle";
  else if (ex && unit === "kg") metric = "lift";
  else if (/체중|몸무게|살|감량|다이어트|증량/.test(t) && unit === "kg") metric = "weight";
  if (!metric) return null;
  if (metric !== "body_fat_pct" && unit === "%") return null;
  // 방향 · 절대값(…까지 · 만들기 · 들기)인지 변화량인지
  const down = /빼|감량|줄이|줄여|낮추|감소|빠지|내리|(^|[^\d])-\s*\d/.test(t);   // '3-4개월'의 -는 줄이기가 아님
  const up = /늘리|늘려|증가|올리|올려|키우|\+\s*\d|찌우|증량|붙이/.test(t);
  const dir = down && !up ? "down" : up && !down ? "up"
    : metric === "skeletal_muscle" || metric === "lift" ? "up"
    : metric === "body_fat_mass" || metric === "body_fat_pct" ? "down"
    : /다이어트|살/.test(t) ? "down" : "up";
  const absolute = metric === "lift" ? !(up || /더/.test(t)) : /까지|만들|되기|도달|대로|이하|이상/.test(t) && !(up || down);
  return { metric, exercise: metric === "lift" ? ex : undefined, dir, amount, mode: absolute ? "to" : "delta", months: months || null, period_label };
}

// 지금 값 — 인바디는 가장 최근 측정, 운동 무게는 since 이후 최고(없으면 마지막 수업의 최고).
export function currentValue(metric, exercise, inbody = [], logs = [], since = null) {
  if (metric === "lift") {
    const s = buildExerciseSeries(logs).find((x) => x.exercise === exercise);
    const pts = (s?.points || []).filter((p) => p.topWeight != null);
    if (!pts.length) return null;
    const after = since ? pts.filter((p) => Date.parse(p.date || "") >= Date.parse(since)) : [];
    return after.length ? Math.max(...after.map((p) => p.topWeight)) : pts[pts.length - 1].topWeight;
  }
  const rows = [...(inbody || [])].filter((r) => r && r[metric] != null)
    .sort((a, b) => String(a.measured_at || "").localeCompare(String(b.measured_at || "")));
  return rows.length ? Number(rows[rows.length - 1][metric]) : null;
}

// 시작 값 — since(이번 계약 시작일) 그날까지의 마지막 기록, 그 전 기록이 없으면 그 뒤 첫 기록(2026-10-11 대표 결정).
//   since가 없으면 가장 최근 기록(다음 목표처럼 '지금부터'인 목표).
export function startValue(metric, exercise, inbody = [], logs = [], since = null) {
  if (!since) return currentValue(metric, exercise, inbody, logs);
  const day = kstDay(since);
  const pts = metric === "lift"
    ? (buildExerciseSeries(logs).find((x) => x.exercise === exercise)?.points || []).filter((p) => p.topWeight != null).map((p) => ({ d: kstDay(p.date), v: p.topWeight }))
    : [...(inbody || [])].filter((r) => r && r[metric] != null).map((r) => ({ d: kstDay(r.measured_at), v: Number(r[metric]) }));
  pts.sort((a, b) => a.d.localeCompare(b.d));
  if (!pts.length) return null;
  const before = pts.filter((p) => p.d <= day);
  return before.length ? before[before.length - 1].v : pts[0].v;
}

// 읽은 결과 + 기록 → 저장할 목표(시작 값이 없으면 null · 화면이 '인바디를 먼저' 안내).
//   since = 이번 계약 시작일(있으면 시작 값 · 시작 시점이 그날 · 없으면 지금 기록 · 지금부터).
export function buildGoal(parsed, { inbody = [], logs = [], text = "", now = new Date(), visible = false, since = null } = {}) {
  if (!parsed) return null;
  const start = startValue(parsed.metric, parsed.exercise, inbody, logs, since);
  if (start == null) return null;
  const target = parsed.mode === "to" ? parsed.amount : parsed.dir === "up" ? start + parsed.amount : start - parsed.amount;
  if (r1(target) === r1(start) || target <= 0) return null;   // 시작보다 큰 감소(음수 목표)는 목표로 안 만든다
  return {
    v: 1, metric: parsed.metric, ...(parsed.exercise ? { exercise: parsed.exercise } : {}),
    dir: target > start ? "up" : "down", start_value: r1(start), target_value: r1(target),
    unit: GOAL_METRICS[parsed.metric].unit, months: parsed.months || null, period_label: parsed.period_label || null,
    start_at: since ? new Date(`${kstDay(since)}T00:00:00+09:00`).toISOString() : new Date(now).toISOString(),
    text: String(text || "").trim(), visible: Boolean(visible),
  };
}

// "골격근량 30.9 → 32.9kg · 6개월"
export function describeGoal(g) {
  if (!g) return "";
  return `${goalLabel(g)} ${fmt(g.start_value)} → ${fmt(g.target_value)}${unitOf(g)}${g.period_label ? ` · ${g.period_label}` : ""}`;
}

// 진행 — { current, moved, total, pct, elapsedMonths, leftMonths, done, line }
export function goalProgress(g, inbody = [], logs = [], now = new Date()) {
  if (!g) return null;
  const current = currentValue(g.metric, g.exercise, inbody, logs, g.start_at);
  const sign = g.target_value >= g.start_value ? 1 : -1;
  const total = Math.abs(g.target_value - g.start_value);
  const moved = current == null ? null : r1((current - g.start_value) * sign);
  const pct = moved == null || !total ? null : Math.max(-99, Math.min(999, Math.round((moved / total) * 100)));
  const elapsedMonths = g.start_at ? r1((new Date(now) - new Date(g.start_at)) / (30.44 * DAY)) : null;
  const leftMonths = g.months && elapsedMonths != null ? r1(Math.max(0, g.months - elapsedMonths)) : null;
  const du = deltaUnit(g);
  const actual = current == null ? null : r1(current - g.start_value);   // 실제 변화(부호 그대로 · 체중 −2.4kg)
  const movedTxt = actual == null ? null : `${actual >= 0 ? "+" : "−"}${fmt(Math.abs(actual))}${du}`;
  // 화면 한 줄 — 진행률(%) · 막대는 안 보인다(2026-10-11 대표). pct는 다음 목표 추천 계산에만 쓴다.
  const line = current == null ? "아직 새 기록이 없어요"
    : `지금 ${fmt(current)}${unitOf(g)} · 시작보다 ${movedTxt}${elapsedMonths != null && g.months ? ` · ${Math.max(1, Math.ceil(elapsedMonths))}개월째` : ""}`;
  return { current, moved, total: r1(total), pct, elapsedMonths, leftMonths, done: pct != null && pct >= 100, line, movedTxt };
}

// 재등록 때 다음 목표 추천(규칙 · 글 한 줄) — 트레이너가 글로 고친다. 숫자 목표가 없으면 null(트레이너가 직접).
export function suggestNextGoal(g, inbody = [], logs = [], now = new Date()) {
  if (!g) return null;
  const p = goalProgress(g, inbody, logs, now);
  if (!p || p.current == null) return null;
  const step = g.metric === "lift" ? 2.5 : 0.5;
  const snap = (x) => Math.max(step, Math.round(x / step) * step);
  const label = goalLabel(g);
  const verb = g.dir === "up" ? "늘리기" : "줄이기";
  const du = deltaUnit(g);
  let amount, months = g.months || 3;
  if (p.done) {
    amount = snap(p.total * 0.75);
  } else {
    amount = snap(p.total - Math.max(0, p.moved || 0));
    const rate = p.moved > 0 && p.elapsedMonths > 0 ? p.moved / p.elapsedMonths : 0;
    months = rate > 0 ? Math.min(12, Math.max(2, Math.ceil(Math.round((amount / rate) * 100) / 100))) : months;
  }
  if (g.metric === "lift") {
    const to = g.dir === "up" ? p.current + amount : p.current - amount;
    return `${months}개월 안에 ${label} ${fmt(to)}kg 들기`;
  }
  return `${months}개월 안에 ${label} ${fmt(amount)}${du === "%p" ? "%" : du} 더 ${verb}`;
}

// 재등록 대본 · 결산용 요약(서버 프롬프트로 넘김).
export function goalContext(g, inbody = [], logs = [], now = new Date()) {
  if (!g) return null;
  const p = goalProgress(g, inbody, logs, now);
  return {
    text: g.text || null, goal: describeGoal(g), start: g.start_value, target: g.target_value, unit: unitOf(g),
    current: p?.current ?? null, moved: p?.movedTxt ?? null, pct: p?.pct ?? null,
    months: g.months || null, elapsed_months: p?.elapsedMonths ?? null, done: Boolean(p?.done),
  };
}
