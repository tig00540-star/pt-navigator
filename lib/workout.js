// 수업 구조화 데이터 헬퍼(순수 함수 · UI 무의존). PtWorkoutTab·(Phase2)회원앱 공용.

// voice-log report.machines → sets_structured 배열. exercise·세트 없는 항목 제거.
export function machinesToStructured(machines) {
  if (!Array.isArray(machines)) return [];
  return machines
    .map((m) => ({
      exercise: (m?.canonical || m?.name || "").trim(),
      sets: (Array.isArray(m?.sets) ? m.sets : []).filter(
        (s) => s?.weight != null || s?.reps != null
      ),
    }))
    .filter((m) => m.exercise && m.sets.length);
}

// 저장 직전 정리 — 빈 exercise·빈 세트 제거, 숫자화. 그리드 편집 결과에도 적용.
export function cleanStructured(list) {
  if (!Array.isArray(list)) return [];
  const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return list
    .map((ex) => ({
      exercise: (ex?.exercise || "").trim(),
      sets: (Array.isArray(ex?.sets) ? ex.sets : [])
        .map((s) => ({ weight: num(s?.weight), reps: num(s?.reps) }))
        .filter((s) => s.weight != null || s.reps != null),
    }))
    .filter((ex) => ex.exercise && ex.sets.length);
}

// 한 세션·한 종목의 대표 무게 = 최고 중량 세트(진행 지표). 없으면 null.
export function topSetWeight(sets) {
  const w = (Array.isArray(sets) ? sets : []).map((s) => s?.weight).filter((v) => v != null);
  return w.length ? Math.max(...w) : null;
}

// logs(daily_workout_log 행들) → 종목별 날짜순 추이.
// [{ exercise, points:[{ date, topWeight, sets }] }] · 오래된→최신. voided·빈 것 제외.
export function buildExerciseSeries(logs) {
  const byEx = new Map();
  const sorted = [...(logs || [])]
    .filter((l) => !l.voided && Array.isArray(l.sets_structured) && l.sets_structured.length)
    .sort(
      (a, b) =>
        new Date(a.session_at ?? a.created_at ?? 0) - new Date(b.session_at ?? b.created_at ?? 0)
    );
  for (const l of sorted) {
    const date = l.session_at ?? l.created_at ?? null;
    for (const ex of l.sets_structured) {
      const name = (ex?.exercise || "").trim();
      if (!name) continue;
      if (!byEx.has(name)) byEx.set(name, []);
      byEx.get(name).push({ date, topWeight: topSetWeight(ex?.sets), sets: ex?.sets || [] });
    }
  }
  // 최근 활동순(마지막 date 내림차순)으로 종목 정렬.
  return [...byEx.entries()]
    .map(([exercise, points]) => ({ exercise, points }))
    .sort((a, b) => new Date(b.points.at(-1)?.date ?? 0) - new Date(a.points.at(-1)?.date ?? 0));
}
