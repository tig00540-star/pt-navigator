// lib/routine.js — 회원 개인운동 루틴 계산(순수 · 2026-10-04 · 대표와 정한 규칙).
// 숫자(무게 · 횟수 · 세트)는 전부 여기 규칙으로. AI는 순서 · 한 줄 설명만(쓰는 쪽에서).
//
// [첫 루틴] PT 운동일지(sets_structured) 기준
//   · 종목: 트레이너와 PT에서 2번 이상 한 것 · 최근 60일 안 · 혼자 위험한 바벨 계열은 기본 제외(트레이너가 추가하면 가능)
//   · 기준 = 가장 최근 PT의 '탑 세트'(가장 무거운 세트 · 같으면 먼저 한 세트). 그 앞의 더 가벼운 첫 세트는 워밍업으로.
//   · 일반 종목: 무게 = 탑 세트의 70%를 기구 '한 칸' 아래로 내림 · 상한 = 85%(아래로) · 횟수 = 탑 세트 10회 이상이면 그 횟수 −2 ~ 그 횟수(8~15 안),
//                10회 미만이면 10~12 · 시작은 아래쪽(70%로 내렸더니 절반 이하로 가벼워졌으면 위쪽부터) · 2세트
//   · 가벼운 고반복 종목(70%로 내리면 절반 이하로 떨어지는 아주 가벼운 무게 · 예: 덤벨 2kg): 무게 = PT 그대로 · 상한 = PT 무게
//                · 횟수 = PT 횟수의 75% ~ PT 횟수 · 2세트 → 최대 3세트
//   · 한 칸: 장비 설정(step_kg) → PT 기록 무게 간격 → 기구 종류 기본값(머신 5 · 케이블 2.5 · 덤벨 2(10kg 이하 1) · 바벨 2.5)
// [진도] 회원 기록(member_routine_log)을 순서대로 다시 읽어 다음 숫자를 만든다(서버 저장 없음)
//   · 목표 횟수 끝까지 다 함 → 무게 한 칸 ↑(상한까지) · 횟수는 아래로. 상한이면 세트 +1(최대 3)
//   · 구간 안 → 횟수 +1 · 미달 → 그대로, 두 번 연속 미달 → 한 칸 ↓
//   · 무게 고정 종목 → 무게 그대로, 횟수 → 세트(최대 4)로만
//   · 가벼운 고반복 → 무게는 PT에서만 · 횟수 → 세트(최대 3)
//   · 트레이너 확정 뒤 PT에서 더 무거운 탑 세트를 기록해도 자동으로 올리지 않는다 → ptRaised 표시 → 트레이너가 다시 확정(법무 점검 2026-10-04:
//     트레이너가 확인 안 한 숫자가 회원에게 가지 않게).
//   · 회원이 '아파서 멈췄어요'(pain)를 남기면 그 종목은 진도를 멈춘다(무게 · 횟수 그대로) → 트레이너가 다시 확정하면 풀린다.
//   · 상한은 계산 안에서 강제 — 회원 기록에 상한보다 무거운 값이 있어도 다음 숫자는 상한을 못 넘는다.
import { buildExerciseSeries } from "@/lib/workout";

export const MAX_ITEMS_PER_DAY = 6;
export const SPLITS = {
  1: [{ key: "A", label: "전신", groups: ["lower", "push", "pull", "core"] }],
  2: [{ key: "A", label: "상체", groups: ["push", "pull"] }, { key: "B", label: "하체", groups: ["lower", "core"] }],
  3: [{ key: "A", label: "밀기 (가슴 · 어깨)", groups: ["push"] }, { key: "B", label: "당기기 (등)", groups: ["pull", "core"] }, { key: "C", label: "하체", groups: ["lower"] }],
};
export const GROUP_LABEL = { lower: "하체", push: "밀기", pull: "당기기", core: "코어" };

// 혼자 하기 위험한 바벨 계열 — 기본 제외(트레이너가 직접 추가하면 가능).
// 이름에 '스쿼트'만 있으면 대개 바벨 백스쿼트라 위험으로 본다(고블릿 · 머신 · 스미스 · 맨몸 · 덤벨 · 박스 · 핵 · 브이는 허용).
const RISKY = /(바벨|백\s*스쿼트|프론트\s*스쿼트|데드\s*리프트|클린|스내치|저크|오버헤드\s*프레스|밀리터리\s*프레스)/;
const SAFE_SQUAT = /(고블릿|머신|스미스|맨몸|에어|덤벨|박스|핵|브이|V\s*스쿼트)/i;
export const isRisky = (name) => {
  const n = String(name || "");
  if (RISKY.test(n)) return true;
  if (/스쿼트/.test(n) && !SAFE_SQUAT.test(n)) return true;
  if (/벤치\s*프레스/.test(n) && !/머신|덤벨/.test(n)) return true;
  return false;
};

export function groupOf(name) {
  const n = String(name || "").replace(/\s/g, "");
  if (/크런치|플랭크|데드버그|버드독|레그레이즈|싯업|복근|코어|행잉/.test(n)) return "core";
  if (/스쿼트|런지|레그|힙|데드|카프|브릿지|어브덕션|애덕션|글루트|킥백|스텝업|굿모닝|스플릿|이너타이|아웃타이/.test(n)) return "lower";
  if (/로우|풀다운|풀업|친업|컬|페이스풀|리어|리버스|슈러그|풀오버|백익스텐션|랫/.test(n)) return "pull";
  return "push";
}

export function equipKind(name) {
  const n = String(name || "");
  if (/덤벨|DB/i.test(n)) return "dumbbell";
  if (/바벨|스미스|EZ/i.test(n)) return "barbell";
  if (/케이블|크로스오버|페이스풀|푸시다운|풀다운/.test(n)) return "cable";
  return "machine";
}

const r2 = (x) => Math.round(x * 100) / 100;
export const floorTo = (w, step) => (step > 0 ? r2(Math.floor((w + 1e-9) / step) * step) : r2(w));

/** 한 칸(kg) — 장비 설정 → PT 기록 간격 → 기본값. */
export function inferStep(name, weights = [], machineStep = null) {
  if (Number(machineStep) > 0) return Number(machineStep);
  const ws = [...new Set(weights.filter((w) => Number(w) > 0).map(Number))].sort((a, b) => a - b);
  let gap = null;
  for (let i = 1; i < ws.length; i++) { const d = r2(ws[i] - ws[i - 1]); if (d > 0 && (gap == null || d < gap)) gap = d; }
  if (gap != null && gap >= 0.5 && gap <= 10) return gap;
  const k = equipKind(name);
  if (k === "dumbbell") return (ws.at(-1) ?? 0) <= 10 ? 1 : 2;
  if (k === "barbell" || k === "cable") return 2.5;
  return 5;
}

/** 한 번의 PT 기록에서 기준(탑 세트)과 워밍업(더 가벼운 첫 세트). */
export function refSets(sets) {
  const ok = (Array.isArray(sets) ? sets : []).map((s) => ({ weight: Number(s?.weight) || 0, reps: Number(s?.reps) || 0 })).filter((s) => s.reps > 0);
  if (!ok.length) return null;
  let top = ok[0];
  for (const s of ok) if (s.weight > top.weight) top = s;          // 같으면 먼저 한 세트
  const first = ok[0];
  return { top, warmup: first.weight < top.weight ? first : null };
}

/** 기준(탑 세트 W × R)과 한 칸으로 시작 숫자. */
export function startFromTop(W, R, step) {
  const reduced = floorTo(W * 0.7, step);
  // 가벼운 고반복 = 무게 자체가 아주 가벼워 70%로 내리면 절반 이하가 되는 경우만(2026-10-04 데모 확인: '15회 이상' 조건만으로는
  //   랫풀다운 50kg × 15 같은 무게까지 PT 그대로 혼자 하게 돼서 뺐다).
  const light = W <= 0 || (reduced <= W * 0.5 && W <= 3 * step);
  if (light) {
    const repMax = Math.min(Math.max(R, 8), 25);
    const repMin = Math.max(6, Math.min(repMax, Math.round(R * 0.75)));
    return { light: true, weight: W, reps: repMin, sets: 2, repMin, repMax, cap: W };
  }
  const weight = Math.max(reduced, step);
  const repMax = R >= 10 ? Math.min(15, R) : 12;
  const repMin = R >= 10 ? Math.max(8, repMax - 2) : 10;
  const cap = Math.max(floorTo(W * 0.85, step), weight);
  return { light: false, weight, reps: weight <= W * 0.5 ? repMax : repMin, sets: 2, repMin, repMax, cap };
}

/** 장비 이름 맞추기(장비 설정의 한 칸 · 트레이너가 같은 이름으로 쓰는 경우가 많다). */
export function machineFor(name, machines = []) {
  const n = String(name || "").replace(/\s/g, "");
  return machines.find((m) => { const mn = String(m?.name || "").replace(/\s/g, ""); return mn && (n.includes(mn) || mn.includes(n)); }) || null;
}

/** 종목 하나의 첫 루틴 숫자 — PT 기록(점들)에서. */
export function itemFromSeries(series, machines = [], painHint = null) {
  const pts = series.points.filter((p) => refSets(p.sets));
  const latest = pts.at(-1);
  if (!latest) return null;
  const ref = refSets(latest.sets);
  const allW = pts.flatMap((p) => (p.sets || []).map((s) => Number(s?.weight) || 0));
  const m = machineFor(series.exercise, machines);
  const step = inferStep(series.exercise, allW, m?.step_kg);
  const st = startFromTop(ref.top.weight, ref.top.reps, step);
  return {
    name: series.exercise, group: groupOf(series.exercise), ...st, step, locked: false,
    warmup: ref.warmup ? { weight: ref.warmup.weight, reps: Math.min(ref.warmup.reps, 15), sets: 1 } : null,
    note: Array.isArray(m?.cues) && m.cues[0] ? String(m.cues[0]) : "",
    source: "pt", ptRef: { weight: ref.top.weight, reps: ref.top.reps, date: latest.date },
    painHint: painHint && painHint.test(series.exercise) ? true : undefined,
  };
}

/** 첫 루틴 초안 — PT 운동일지 · 장비 · 분할 · 불편 부위로. */
export function draftRoutine({ logs = [], machines = [], split = 2, pain = "" } = {}) {
  const series = buildExerciseSeries(logs);
  const lastDate = Math.max(0, ...series.map((s) => Date.parse(s.points.at(-1)?.date) || 0));
  const painHint = /무릎/.test(pain) ? /(익스텐션|스쿼트|런지|레그프레스|스텝업)/ : /허리/.test(pain) ? /(데드|굿모닝|백익스텐션|로우|스쿼트)/ : /어깨/.test(pain) ? /(프레스|레이즈|딥스|플라이|풀업)/ : null;
  const items = series
    .filter((s) => s.points.length >= 2 && !isRisky(s.exercise))
    .filter((s) => lastDate - (Date.parse(s.points.at(-1)?.date) || 0) <= 60 * 86400000)
    .map((s) => itemFromSeries(s, machines, painHint))
    .filter(Boolean);
  const plan = SPLITS[split] || SPLITS[2];
  const days = plan.map((d) => ({
    key: d.key, label: d.label,
    items: items.filter((i) => d.groups.includes(i.group))
      .sort((a, b) => (b.ptRef?.weight ?? 0) - (a.ptRef?.weight ?? 0))
      .slice(0, MAX_ITEMS_PER_DAY),
  }));
  return { split, days };
}

/** 이 종목의 가장 최근 PT 탑 세트. */
export function latestPtTop(logs, name) {
  const s = buildExerciseSeries(logs).find((x) => x.exercise === name);
  const latest = s?.points.filter((p) => refSets(p.sets)).at(-1);
  if (!latest) return null;
  const ref = refSets(latest.sets);
  return { weight: ref.top.weight, reps: ref.top.reps, date: latest.date };
}

/**
 * 다음에 할 숫자 — 루틴의 출발점(확정 값)에서 회원 기록을 순서대로 적용.
 * @param item  루틴 종목(확정 값)
 * @param rlogs member_routine_log(확정 뒤 · 오래된 순) — items[]에서 이 종목 이름을 찾는다
 * @param ptTop 가장 최근 PT 탑 세트(확정 뒤 더 무거우면 상한 · 출발점 다시 맞춤)
 * @param confirmedAt 루틴 확정 시각(ISO)
 * @returns {weight, reps, sets, cap, capReached, painStop, ptRaised, history:[{date, plan, did}]}
 */
export function nextValues(item, rlogs = [], ptTop = null, confirmedAt = null) {
  const s = { weight: item.weight, reps: item.reps, sets: item.sets, cap: item.cap, misses: 0, capReached: false, painStop: false };
  const step = item.step || 5;
  const ptRaised = Boolean(ptTop && (!confirmedAt || String(ptTop.date) > String(confirmedAt)) && ptTop.weight > (item.ptRef?.weight ?? 0) && item.source === "pt");
  const history = [];
  for (const log of rlogs) {
    const did = (Array.isArray(log.items) ? log.items : []).find((x) => x?.name === item.name && x.done !== false);
    if (!did) continue;
    const plan = { weight: s.weight, reps: s.reps, sets: s.sets };
    const w = Number(did.weight) || 0, r = Number(did.reps) || 0, sets = Math.max(1, Number(did.sets) || 1);
    history.push({ date: log.performed_on || log.created_at, plan, did: { weight: w, reps: r, sets, pain: Boolean(did.pain) } });
    if (did.pain) s.painStop = true;
    if (s.painStop) continue;                       // 아파서 멈춘 종목 — 트레이너가 다시 확정할 때까지 그대로
    s.weight = item.locked ? item.weight : Math.min(w, s.cap);
    s.sets = sets;
    s.capReached = false;
    if (item.locked) {
      if (r >= item.repMax) { if (sets < 4) { s.sets = sets + 1; s.reps = item.repMin; } else s.reps = item.repMax; }
      else s.reps = Math.min(item.repMax, Math.max(item.repMin, r + 1));
      continue;
    }
    if (item.light) {
      if (r >= item.repMax) { if (sets < 3) s.sets = sets + 1; else s.capReached = true; s.reps = item.repMax; }
      else if (r >= item.repMin) s.reps = Math.min(item.repMax, r + 1);
      else { s.reps = item.repMin; s.misses += 1; }
      continue;
    }
    if (r >= item.repMax) {
      s.misses = 0;
      if (r2(s.weight + step) <= s.cap) { s.weight = r2(s.weight + step); s.reps = item.repMin; }
      else { s.reps = item.repMax; s.capReached = true; if (sets < 3) s.sets = sets + 1; }
    } else if (r >= item.repMin) {
      s.misses = 0; s.reps = Math.min(item.repMax, r + 1);
    } else {
      s.misses += 1; s.reps = item.repMin;
      if (s.misses >= 2) { s.weight = Math.max(step, r2(s.weight - step)); s.misses = 0; }
    }
  }
  return { weight: s.weight, reps: s.reps, sets: s.sets, cap: s.cap, capReached: s.capReached, painStop: s.painStop, ptRaised, history };
}

const kstDay = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : new Date(t + 9 * 3600000).toISOString().slice(0, 10); };

/**
 * 오늘 할 루틴 — 지난번 다음 순서. 어제 · 오늘 PT(또는 어제 개인운동)와 같은 부위면 겹치지 않는 루틴 먼저.
 * @returns {{index, reason}} reason: "next" | "recovery"
 */
export function pickDayIndex(days, rlogs = [], ptLogs = [], todayYmd) {
  const live = days.map((d, i) => ({ d, i })).filter((x) => x.d.items?.length);
  if (!live.length) return { index: -1, reason: "none" };
  if (live.length === 1) return { index: live[0].i, reason: "next" };
  const last = [...rlogs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const lastPos = last ? live.findIndex((x) => x.d.key === last.day_key) : -1;
  const order = live.map((_, k) => live[(lastPos + 1 + k) % live.length]);
  const yest = todayYmd ? new Date(Date.parse(`${todayYmd}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : null;
  const recent = new Set();
  for (const l of ptLogs) {
    const d = kstDay(l.session_at ?? l.created_at);
    if (d !== todayYmd && d !== yest) continue;
    for (const ex of Array.isArray(l.sets_structured) ? l.sets_structured : []) recent.add(groupOf(ex?.exercise));
  }
  if (last && (last.performed_on === yest || last.performed_on === todayYmd)) {
    const ld = days.find((d) => d.key === last.day_key);
    for (const it of ld?.items || []) recent.add(it.group);
  }
  const main = (d) => new Set((d.items || []).map((it) => it.group).filter((g) => g !== "core"));
  const clash = (d) => [...main(d)].some((g) => recent.has(g));
  if (!clash(order[0].d)) return { index: order[0].i, reason: "next" };
  const free = order.find((x) => !clash(x.d));
  return free ? { index: free.i, reason: "recovery" } : { index: order[0].i, reason: "next" };
}

/**
 * 오래 쉬었다가 돌아왔나 — 확정 뒤 PT 사이(확정 시각 포함)에 28일 넘게 빈 적이 있으면 true.
 * member_routine_view(SQL)와 같은 규칙. true면 회원에게 안 보이고 트레이너가 다시 확정해야 한다.
 */
export function breakSinceConfirm(ptLogs = [], confirmedAt = null, days = 28) {
  if (!confirmedAt) return false;
  const c = Date.parse(confirmedAt);
  const ds = ptLogs.filter((l) => l && !l.voided && l.source !== "noshow").map((l) => Date.parse(l.session_at ?? l.created_at)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  let prev = null;
  for (const d of ds) {
    if (d > c && Math.max(prev ?? c, c) < d - days * 86400000) return true;
    prev = d;
  }
  return false;
}
