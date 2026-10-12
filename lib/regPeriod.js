/* =========================================================================
   재등록 '이번 계약 기간' 계산(2026-10-13) — 재등록 화면(PtReRegTab)과 서버(app/api/ot-brief)가 같이 쓴다.
   화면에 있던 함수를 그대로 옮겼다(계산 기준 무변). 순수 함수 · DB 없음.
   - 진행 수업 = 취소(voided) · 노쇼 제외(realDone · CLAUDE.md 숫자 기준)
   - 계약 순서 = 시작일 순(reregRound와 같음) · 차수 = 순서 + 1 · 첫 계약(1차)은 '이번 기간'이 없다
   - 기간 시작 = 그 계약의 첫 진행 수업 날짜(없으면 계약 시작일)
   - 인바디 = 기간 시작 전 마지막 측정 → 기간 안 마지막 측정 · 무게 = 그 계약 일지의 종목별 최고 무게 처음 → 마지막
   ========================================================================= */
import { buildExerciseSeries } from "./workout.js";
import { INBODY_FIELDS } from "./labels.js";

export const dayOf = (l) => String(l.session_at ?? l.created_at ?? "").slice(0, 10);
export const realDone = (l) => l && !l.voided && l.source !== "noshow"; // '진행 수업' = voided·노쇼 제외(CLAUDE.md 숫자 기준)

export function inbodyChange(rows, since = null) {
  return INBODY_FIELDS.map((f) => {
    const withVal = rows.filter((r) => r[f.key] != null);
    let base, last;
    if (since) {
      const before = withVal.filter((r) => String(r.measured_at ?? "").slice(0, 10) < since);
      const inside = withVal.filter((r) => String(r.measured_at ?? "").slice(0, 10) >= since);
      base = before.at(-1) || inside[0];
      last = inside.at(-1);
    } else {
      base = withVal[0];
      last = withVal.at(-1);
    }
    const first = base?.[f.key] ?? null;
    const latest = last?.[f.key] ?? null;
    return (base && last && base !== last && first != null && latest != null && first !== latest)
      ? { key: f.key, label: f.label, unit: f.unit, goodDir: f.goodDir, first, latest } : null;
  }).filter(Boolean);
}

export const weightChange = (logs) => buildExerciseSeries(logs)
  .map((s) => ({ exercise: s.exercise, first: s.points[0]?.topWeight ?? null, latest: s.points.at(-1)?.topWeight ?? null }))
  .filter((e) => e.first != null && e.latest != null && e.first !== e.latest)
  .slice(0, 5);

/**
 * 계약 하나의 '이번 계약 기간' — 화면 thisPeriod와 같은 계산.
 * @param contracts 이 회원의 계약 전부(session_log) · logs 일지(그 계약 것만 줘도 같다) · inbodyRows 인바디(측정일 오래된 순)
 * @returns { round, period } | null — 계약을 못 찾으면 null · 첫 계약이면 period=null
 */
export function contractPeriod({ contracts, logs, inbodyRows, contractId }) {
  const list = Array.isArray(contracts) ? contracts.filter(Boolean) : [];
  const ordered = [...list].sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
  const idx = ordered.findIndex((c) => c.id === contractId);
  if (idx < 0) return null;
  const cur = ordered[idx];
  if (idx < 1) return { round: 1, period: null };
  const done = (Array.isArray(logs) ? logs : []).filter(realDone).sort((a, b) => new Date(a.session_at ?? a.created_at) - new Date(b.session_at ?? b.created_at)); // 오래된 순
  const periodLogs = done.filter((l) => l.contract_id === cur.id);
  const periodStart = periodLogs[0] ? dayOf(periodLogs[0]) : String(cur.started_at ?? "").slice(0, 10);
  const rows = Array.isArray(inbodyRows) ? inbodyRows : [];
  return {
    round: idx + 1,
    period: {
      started: periodStart || null,
      sessions_done: periodLogs.length,
      inbody_change: periodStart ? inbodyChange(rows, periodStart).map((c) => ({ label: c.label, first: c.first, latest: c.latest, unit: c.unit })) : [],
      weight_change: weightChange(periodLogs),
    },
  };
}
