/* =========================================================================
   otRounds — OT 차수(1차·2차·3차…) 계산 한 곳. 순수 함수(DB·React 없음).

   ── 규칙(2026-10-02 대표 결정) ──
   · 차수 하나 = ot_log 행 하나(ot_round=n). 같은 차수에 행이 여러 개면 최신(created_at) 것.
   · 1차는 항상 보인다(행이 없어도 '준비하기'부터 시작).
   · 마지막 차수 결과가 '보류(hold)'면 다음 차수가 자동으로 보인다(행은 아직 없음 — 뭔가 저장할 때 생김).
   · 등록(success)·실패(fail)면 거기서 끝. 그 외(미기록·보류인데 이미 다음 차수 있음)는
     대시보드 'N차 OT 시작' 버튼으로 다음 차수를 연다(canStartNext).
   ========================================================================= */

export const OT_STEP_KEYS = ["prep", "inbody", "feedback"];

// 주소 step 문자열 → { key, round }. "prep" "feedback-2" "inbody-3", 구 주소 "second"(=2차 준비).
export function parseOtStep(step) {
  if (!step) return { key: null, round: null };
  if (step === "second") return { key: "prep", round: 2 };
  const m = /^(prep|inbody|feedback)(?:-(\d{1,2}))?$/.exec(step);
  if (!m) return { key: null, round: null };
  return { key: m[1], round: m[2] ? Number(m[2]) : null };
}

export const otStepPath = (memberId, key, round) =>
  `/ot/${memberId}/${key}${round ? `-${round}` : ""}`;

// 차수별 최신 행.
export function latestByRound(rows) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const n = Number(r?.ot_round);
    if (!Number.isInteger(n) || n < 1) continue;
    const prev = by.get(n);
    if (!prev || String(r.created_at || "") > String(prev.created_at || "")) by.set(n, r);
  }
  return by;
}

// 이 차수에서 한 일 — 대시보드 진행 표시용.
//   prep: 1차는 report.first_assist, 2차+는 report.brief(AI 리포트 생성됨)
//   feedback: 관찰을 적었거나 결과를 기록함
export function roundProgress(row, n) {
  const r = row?.report || {};
  const prep = n === 1 ? Boolean(r.first_assist) : Boolean(r.brief);
  const observed = Array.isArray(r.movements) && r.movements.some((m) => (m?.observation || "").trim());
  const result = row?.closing_result || "none";
  const feedback = observed || result !== "none";
  return { prep, feedback, result };
}

/**
 * ot_log 행들 → 차수 정보.
 * @returns {{ rounds: {n:number,row:object|null,progress:object}[], current:number, last:number,
 *             lastResult:string, done:boolean, canStartNext:boolean }}
 */
export function otRoundsInfo(rows) {
  const by = latestByRound(rows);
  const last = by.size ? Math.max(...by.keys()) : 0;
  const lastRow = last ? by.get(last) : null;
  const lastResult = lastRow?.closing_result || "none";
  const done = lastResult === "success" || lastResult === "fail";
  // 보류면 다음 차수 자동.
  const visible = Math.max(1, last, lastResult === "hold" ? last + 1 : last);
  const rounds = [];
  for (let n = 1; n <= visible; n++) {
    const row = by.get(n) || null;
    rounds.push({ n, row, progress: roundProgress(row, n) });
  }
  // 마지막 차수 피드백까지 남겼고(=OT를 했고) 등록·실패가 아니며, 자동으로 다음 차수가 열린 상태가 아니면
  // 버튼으로 다음 차수를 열 수 있다(준비만 하고 OT 전인 차수에서 다음 차수를 여는 실수 방지).
  const canStartNext = last >= 1 && !done && visible === last && roundProgress(lastRow, last).feedback;
  return { rounds, current: visible, last, lastResult, done, canStartNext };
}

// 주소로 요청한 차수가 열 수 있는 차수인가(보이는 차수 + 버튼으로 여는 바로 다음 차수).
export function roundAllowed(info, round) {
  if (!round || round < 1) return false;
  if (round <= info.current) return true;
  return info.canStartNext && round === info.current + 1;
}

// 화면 이름 — 1차는 'OT 준비하기', 2차부터 'N차 OT 준비하기'(대표 지정 표기).
export function otStepLabel(key, round) {
  const pre = round && round > 1 ? `${round}차 ` : "";
  if (key === "prep") return `${pre}OT 준비하기`;
  if (key === "feedback") return `${pre}OT 피드백`;
  if (key === "inbody") return "인바디 분석";
  return "대시보드";
}
