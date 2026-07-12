/**
 * ② member_status — 회원 라이프사이클 상태 규칙 (순수 모듈).
 *
 * React·supabase 의존 없음(규칙의 단일 소재지 = 나중에 붙일 테스트의 유일 지점).
 * 전이 함수는 '쓸 필드 패치' 객체만 반환하고, 실제 update + 가드(.select() → data.length>0)는
 * 호출부가 한다. status_changed_at 값 생성 외의 부수효과는 두지 않는다.
 */

/**
 * shell 스위치. pt_active → 'pt', inactive → 'inactive', 그 외(ot_active·미지 status)는 'ot'.
 * enum 하드코딩 대신 "pt/inactive 아니면 ot" — 나중에 ot_held 등이 생겨도 안 깨지게.
 */
export function viewFor(member) {
  const s = member?.status;
  if (s === "pt_active") return "pt";
  if (s === "inactive") return "inactive";
  return "ot";
}

/** ④ 클로징 통계 대상 게이트 — OT 퍼널로 들어온 회원만. */
export function isClosingStatSubject(m) {
  return m?.origin === "ot_funnel";
}

/** 등록 시작 상태 — ot_funnel이면 OT, 나머지(handover·external)는 PT 직행(§1.5). */
export function initialStatus(origin) {
  return origin === "ot_funnel" ? "ot_active" : "pt_active";
}

/**
 * "오늘 재접근" 파생 — 보류('hold') + 예정일 도래분만.
 * ⚠️ closing_result 값은 CLOSING_RESULT_OPTS의 영문값('hold'). 저장 경로(ObservationTab·SecondOTTab)와 동일.
 * @param {Array} r2rows  ot_log round=2 행 배열
 * @param {string} today  기준일 (ISO 'YYYY-MM-DD'). 모듈 내 new Date() 금지 → 호출부가 주입.
 * closing_reapproach_at 이 null/미정인 보류는 제외(날짜 잡힌 것만). ISO date는 사전식 비교로 안전.
 */
export function reapproachToday(r2rows, today) {
  const rows = Array.isArray(r2rows) ? r2rows : [];
  return rows.filter(
    (r) =>
      r &&
      r.closing_result === "hold" &&
      r.closing_reapproach_at && // null·미정(빈값) 제외
      r.closing_reapproach_at <= today
  );
}

/**
 * 재접근 예정일 프리셋 — 오늘(todayISO 'YYYY-MM-DD') 기준 2주/1개월/3개월 뒤 'YYYY-MM-DD'.
 * 순수: '지금(now)'을 읽지 않고 주입된 today만 사용(reapproachToday와 같은 원칙).
 * @param {'2w'|'1m'|'3m'} preset
 * @param {string} todayISO  'YYYY-MM-DD'
 */
export function reapproachPreset(preset, todayISO) {
  const d = new Date(`${todayISO}T00:00:00`); // 주입된 날짜 파싱(현재시각 아님)
  const p = (n) => String(n).padStart(2, "0");
  const toISO = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  if (preset === "2w") {
    d.setDate(d.getDate() + 14);
    return toISO(d);
  }
  const add = preset === "1m" ? 1 : preset === "3m" ? 3 : null;
  if (add === null) return todayISO;
  // 월말 보정: 1/31 +1m 이 3/2~3 으로 새는 것 방지. day를 1로 내려 월만 이동한 뒤,
  // 목표월 말일(new Date(y, m+1, 0) = 다음달 0일 = 이달 말일)로 클램프. 인자 있는 Date라 순수(now 안 읽음).
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + add);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISO(d);
}

/**
 * "지금 할 일" 힌트. view별 + OT면 라운드/클로징 상태 기반.
 * @param member  회원
 * @param {{round1?:object|null, round2?:object|null}} rounds  ot_log 행(없어도 안전)
 * ※ 규칙 첫 컷 — 실사용 보며 조정. label 외 필드는 UI 힌트(view/tab/action/tone).
 */
export function nextAction(member, rounds) {
  // status→view 매핑은 viewFor 한 곳에만. 여기선 그 결과로 1차(status 우선) 분기.
  const view = viewFor(member);
  if (view === "inactive") return { label: "종결된 회원 — 재활성은 수동", tone: "muted", view };
  if (view === "pt") return { label: "PT 관리 — 운동일지·현재 방향 (재등록은 결과)", view };

  // 여기 도달 = view==='ot'(ot_active·미지 status). pt_active면 위에서 끝났으므로,
  // '성공→PT 등록 확정'은 ot_active + round2 성공일 때만 뜬다(성공≠PT 게이트 · §1).
  const r1 = rounds?.round1 ?? null;
  const r2 = rounds?.round2 ?? null;
  // 성공/보류는 both round로 판정 — 1차 즉등록(round-1 성공)·1차 보류가 존재하므로(§6).
  // ⚠️ 값은 CLOSING_RESULT_OPTS 영문('success'/'hold') — 저장 경로와 동일(한글 아님).
  const success = r1?.closing_result === "success" || r2?.closing_result === "success";
  const held = r1?.closing_result === "hold" || r2?.closing_result === "hold";
  if (success) return { label: "PT 등록 확정하기 (성공 → 확정 대기)", action: "confirm_pt", view };
  if (held) return { label: "재접근 후속 — 예정일 잡기", action: "reapproach", view };
  if (r1 && !r2) return { label: "2차 OT — 등록 당위성 브리핑", view, tab: 2 };
  if (!r1) return { label: "1차 OT — 관찰 기록 시작", view, tab: 1 };
  return { label: "1차 OT 진행 중", view };
}

/**
 * 수동 'PT 등록 확정' 전이 패치. (가드·update는 호출부.)
 * member는 계약상 인자(호출부가 가드에 씀) — 패치는 상태 전이만.
 */
export function toPtActive(member) {
  return { status: "pt_active", status_changed_at: new Date().toISOString() };
}

/**
 * 트레이너 명시 종결 전이 패치. reason은 user_table.status_note에 착지(이탈 사유).
 */
export function toInactive(member, reason) {
  return { status: "inactive", status_changed_at: new Date().toISOString(), status_note: reason };
}

/**
 * ③ PT 잔여 세션 파생 — '저장값'이 아니라 '수업로그 count'에서 계산(단일 소재지).
 * 유료 먼저 소진(paid-first): 유료가 0이 된 뒤에야 서비스가 줄어든다.
 * @param {{id?:*, sessions_total?:number, service_sessions?:number}} contract  계약 1건
 * @param {Array} logs  daily_workout_log(또는 session_log) 행 배열
 * used = 이 계약(contract_id 일치) + voided 아닌 로그 개수. 구행/미반영은 ?? 0으로 안전.
 * @returns {{paid:number, service:number, total:number}}
 */
export function remainingSessions(contract, logs) {
  const rows = Array.isArray(logs) ? logs : [];
  const used = rows.filter((l) => l && l.contract_id === contract?.id && !l.voided).length;
  const paidTotal = contract?.sessions_total ?? 0;
  const serviceTotal = contract?.service_sessions ?? 0;
  const paid = Math.max(0, paidTotal - used); // 유료 먼저
  const service = Math.max(0, paidTotal + serviceTotal - used) - paid; // 유료 소진 후 서비스 감소
  return { paid, service, total: paid + service };
}

/**
 * ③ 활성 계약(FIFO) — 잔여>0 계약 중 started_at 가장 오래된 것부터 소진.
 * @param {Array} contracts  계약 배열
 * @param {Array} logs       수업 로그 배열(remainingSessions에 위임)
 * @returns {object|null}  잔여 있는 최고참 계약, 없으면 null(= 재등록 필요 신호).
 * started_at 비교는 ISO 문자열 사전식(reapproachToday 날짜비교와 동일 방식).
 */
export function activeContract(contracts, logs) {
  const list = Array.isArray(contracts) ? contracts : [];
  const candidates = list.filter((c) => remainingSessions(c, logs).total > 0);
  if (!candidates.length) return null;
  return candidates.reduce((oldest, c) =>
    (c?.started_at ?? "") < (oldest?.started_at ?? "") ? c : oldest
  );
}

/**
 * ③ 최신 계약 행 — started_at 가장 최근(잔여 무관). 재등록 결과(reg_*) 기록 대상.
 * activeContract(FIFO 잔여>0)와 다름 — 전소진 회원도 재등록 대화 대상이라 잔여로 게이트 안 함.
 * @returns {object|null}  계약 없으면 null.
 */
export function latestContract(contracts) {
  const list = Array.isArray(contracts) ? contracts : [];
  if (!list.length) return null;
  return list.reduce((newest, c) =>
    (c?.started_at ?? "") > (newest?.started_at ?? "") ? c : newest
  );
}

/**
 * ④ 재등록 "오늘 재접근" 파생 — 회원별 '최신 계약'이 reg_result='hold' + 예정일 도래분.
 * reapproachToday(OT ot_log)의 session_log 재등록판. 원본은 안 건드리고 형제(회귀 최소).
 * ⚠️ 최신 계약만 본다 — 옛 계약의 지난 보류(이미 재등록=새 계약이 최신)가 잘못 뜨는 것 방지.
 * @param {Array} rows   session_log 행(한 회원 여러 계약 포함). user_id·started_at·reg_result·reg_reapproach_at.
 * @param {string} today 기준일 ISO 'YYYY-MM-DD'(호출부 주입 · 모듈 내 now 금지).
 * @returns {Array} 조건 만족하는 '최신 계약' 행들.
 */
export function reregisterReapproachToday(rows, today) {
  const list = Array.isArray(rows) ? rows : [];
  const byMember = new Map();
  for (const r of list) {
    if (!r || r.user_id == null) continue;
    byMember.set(r.user_id, [...(byMember.get(r.user_id) || []), r]);
  }
  const out = [];
  for (const group of byMember.values()) {
    const lt = latestContract(group);
    if (lt && lt.reg_result === "hold" && lt.reg_reapproach_at && lt.reg_reapproach_at <= today) {
      out.push(lt);
    }
  }
  return out;
}

/**
 * ③ 재등록 타이밍 판정 — 잔여가 임계 미만이면 재등록 트라이 대상.
 * @param {object|null} contract  판정할 계약(보통 activeContract 결과)
 * @param {Array} logs            수업 로그 배열
 * @param {{basis?:'paid'|'total', threshold?:number}} [opts]  기본 유료(paid) 기준 10회 미만.
 * @returns {boolean}  contract 없으면 false.
 */
export function reregisterDue(contract, logs, opts) {
  if (!contract) return false;
  const { basis = "paid", threshold = 10 } = opts || {};
  const r = remainingSessions(contract, logs);
  return r[basis] < threshold;
}

/**
 * ③ session_log 계약 1행 빌더(전이 패치와 동일 규약 — '쓸 필드' 객체만, update/insert·가드는 호출부).
 * @param {{userId:*, sessions_total?:number, price_per_session?:number, amount_total?:number|null,
 *          service_sessions?:number, origin?:string}} p
 * 인계(handover)·외부(external)는 내 매출 아님 → counts_as_revenue 자동 false(트레이너 손 안 감).
 * price_per_session은 급여 원천이라 인계도 살림. started_at = 월별 매출·리셋 파생축(④).
 */
export function buildContract({ userId, sessions_total, price_per_session, amount_total, service_sessions, origin, kind }) {
  const counts_as_revenue = origin !== "handover" && origin !== "external";
  return {
    user_id: userId,
    sessions_total: sessions_total ?? 0,
    price_per_session: price_per_session ?? 0,
    amount_total: amount_total ?? null, // 매출. 할인/이월 시 null 허용
    service_sessions: service_sessions ?? 0, // 재등록 미끼(서비스 세션)
    counts_as_revenue,
    kind: kind ?? null, // 'new'(신규) / 'reregister'(재등록) / null(이월 등)
    started_at: new Date().toISOString(),
    // created_at=DB default now(). reg_*·scheduled_at·report = 생략(null).
  };
}

/* =========================================================================
   ④ 클로징/매출 통계 — 순수 파생 (admin fetch 배열 주입 · trainer_id 필터는 호출부 seam).
   ========================================================================= */

// UTC ISO 문자열(started_at·session_at = toISOString의 Z) → KST(UTC+9) 기준 'YYYY-MM'.
// 순수: now 안 읽음(인자만). started_at 저장포맷은 UTC 유지(정렬·비교 안전) — '월 판정'만 KST.
function kstYm(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

/**
 * ④ 클로징률 — 회원 기준. ot_log round 1·2를 user_id로 묶어 회원당 1결과.
 * 우선순위 success > hold > fail (1차 즉등록·2차 성공 모두 '성공', §6). attempted = 결과 기록된 회원.
 * ※ ot_log 있는 회원 ≈ ot_funnel(인계·외부는 ot_log 없음) → origin 게이트 자동.
 */
export function closingStats(otRows) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const byMember = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    const cur = byMember.get(r.user_id) || new Set();
    if (r.closing_result) cur.add(r.closing_result);
    byMember.set(r.user_id, cur);
  }
  let success = 0, hold = 0, fail = 0, attempted = 0;
  for (const set of byMember.values()) {
    if (set.has("success")) { success++; attempted++; }
    else if (set.has("hold")) { hold++; attempted++; }
    else if (set.has("fail")) { fail++; attempted++; }
  }
  return { attempted, success, hold, fail, rate: attempted ? success / attempted : null };
}

/**
 * ④ 방향별 강점 — 성공 클로징의 closing_approach 분포. 값 없는 approach 제외.
 * ※ 행 기준 — 한 회원 1·2차 모두 success인 드문 경우 중복 가산 가능(N 작을 때 무시).
 */
export function closingApproachStats(otRows) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const tally = new Map();
  for (const r of rows) {
    if (r && r.closing_result === "success" && r.closing_approach) {
      tally.set(r.closing_approach, (tally.get(r.closing_approach) || 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([approach, count]) => ({ approach, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * ④ 클로징 실패/보류 사유 분포 — closing_reason 집계(카테고리 · 자유서술 아님).
 * reregisterReasonStats의 ot_log판. fail/hold 행만(성공 후 잔존 stale 값 제외).
 */
export function closingReasonStats(otRows) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const tally = new Map();
  for (const r of rows) {
    if (r && (r.closing_result === "fail" || r.closing_result === "hold") && r.closing_reason) {
      tally.set(r.closing_reason, (tally.get(r.closing_reason) || 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/* =========================================================================
   D-3 — 2차 브리핑 "내 과거 클로징 케이스" 근거 주입 (읽기 전용).
   ot_log엔 trainer_id가 없어 user_table!inner 조인으로 트레이너 스코프를 건다(PostgREST).
   현재 회원 본인 행은 제외. 식별정보(name)는 싣지 않음 — 익명 프로파일+3박자만.
   ========================================================================= */

/** (a) 게이트용 성공 케이스 수 — 본인 트레이너, 현재 회원 제외. */
export async function closingSuccessCount(supabase, trainerId, excludeUserId) {
  if (!supabase || !trainerId) return 0;
  let q = supabase
    .from("ot_log")
    .select("id, user_table!inner(trainer_id)", { count: "exact", head: true })
    .eq("user_table.trainer_id", trainerId)
    .eq("closing_result", "success");
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { count } = await q;
  return count || 0;
}

/** (b) 재료용 케이스 목록 — 성공+실패+보류(closing_detail 있는 것 위주), 최근순, 익명 프로파일만. */
export async function closingCasesForTrainer(supabase, trainerId, { excludeUserId, limit = 12 } = {}) {
  if (!supabase || !trainerId) return [];
  let q = supabase
    .from("ot_log")
    .select("closing_result, closing_approach, closing_reason, closing_detail, closing_profile, user_id, user_table!inner(trainer_id)")
    .eq("user_table.trainer_id", trainerId)
    .in("closing_result", ["success", "fail", "hold"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { data } = await q;
  return (data || [])
    .filter((r) => r.closing_detail || r.closing_result === "success") // 3박자 있거나 성공이면 재료
    .map((r) => ({
      result: r.closing_result,
      approach: r.closing_approach || null,
      reason: r.closing_reason || null,
      profile: r.closing_profile || null,
      detail: r.closing_detail || null,
    }));
}

/** (c) 게이트 판정 — 티어까지. (설계노트: 5~9 잠정, 10+ 확신, 5 미만 OFF) */
export function closingCaseGate(successCount) {
  if (successCount >= 10) return { on: true, tier: "confident" }; // 뚜렷
  if (successCount >= 5) return { on: true, tier: "tentative" };  // 잠정 경향
  return { on: false, tier: "off" };
}

/**
 * ④ 재등록률 — session_log.reg_result 집계. success 행 = 재등록 성공 이벤트(성공 시 새 행 append·옛 행에 잔존 = 이벤트 카운트 정확).
 */
export function reregisterStats(contractRows) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  let success = 0, hold = 0, fail = 0;
  for (const r of rows) {
    if (!r) continue;
    if (r.reg_result === "success") success++;
    else if (r.reg_result === "hold") hold++;
    else if (r.reg_result === "fail") fail++;
  }
  const attempted = success + hold + fail;
  return { attempted, success, hold, fail, rate: attempted ? success / attempted : null };
}

/**
 * ④ 재등록 실패/보류 사유 분포 — reg_reason 집계(자유서술 없음 = 카테고리 집계 가능).
 */
export function reregisterReasonStats(contractRows) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  const tally = new Map();
  for (const r of rows) {
    if (r && r.reg_reason) tally.set(r.reg_reason, (tally.get(r.reg_reason) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * ④ 월 매출 — counts_as_revenue 게이트 + started_at 해당월. amount_total null(할인/이월)=0. ym 호출부 주입.
 */
export function revenueInMonth(contractRows, ym) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  return rows.reduce((sum, r) => {
    if (!r) return sum;
    let s = sum;
    // 매출: 계약월(started_at) + counts_as_revenue
    if (r.counts_as_revenue && typeof r.started_at === "string" && kstYm(r.started_at) === ym) s += (r.amount_total ?? 0);
    // 환불: 처리월(refunded_at) 기준 차감(계약월 무관)
    if (r.refund_amount && typeof r.refunded_at === "string" && kstYm(r.refunded_at) === ym) s -= r.refund_amount;
    return s;
  }, 0);
}

/**
 * ④ 수업 수 — voided 제외 count. ym 주면 session_at 해당월만(없으면 전체).
 */
export function sessionsCount(logRows, opts) {
  const rows = Array.isArray(logRows) ? logRows : [];
  const ym = opts?.ym;
  return rows.filter((l) => {
    if (!l || l.voided) return false;
    if (ym) return typeof l.session_at === "string" && kstYm(l.session_at) === ym;
    return true;
  }).length;
}

/** P2 — 이달 회원별 수업 수(voided 제외 · session_at 해당월 · memberIds 스코프).
 *  @returns {Array<{user_id, count}>} count 내림차순. */
export function sessionsByMemberInMonth(logs, memberIds, ym) {
  const ids = memberIds instanceof Set ? memberIds : new Set(memberIds || []);
  const m = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided) continue;
    if (!ids.has(l.user_id)) continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    m.set(l.user_id, (m.get(l.user_id) || 0) + 1);
  }
  return [...m.entries()].map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count);
}

/** P2 — 이달 내 매출 계약 내역(counts_as_revenue · trainer_id · started_at 해당월).
 *  @returns {Array} session_log 행(started_at 내림차순). */
export function revenueContractsInMonth(contracts, trainerId, ym) {
  return (Array.isArray(contracts) ? contracts : [])
    .filter((c) => c && c.counts_as_revenue && c.trainer_id === trainerId
      && typeof c.started_at === "string" && kstYm(c.started_at) === ym)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

/** P3 — 이달 처리된 환불 내역(refunded_at 해당월 · trainer_id). @returns 계약행[](refunded_at 내림차순). */
export function refundsInMonth(contracts, trainerId, ym) {
  return (Array.isArray(contracts) ? contracts : [])
    .filter((c) => c && c.refund_amount && c.trainer_id === trainerId
      && typeof c.refunded_at === "string" && kstYm(c.refunded_at) === ym)
    .sort((a, b) => (a.refunded_at < b.refunded_at ? 1 : -1));
}

/**
 * ④ 트레이너별 이달 매출 — kind(new/reregister) 분해. counts_as_revenue + started_at 해당월.
 * kind null/그 외는 신규(new)로 집계. ym 호출부 주입.
 * @returns [{trainer_id, newRev, reRev, total, cntNew, cntRe}] 매출 내림차순.
 */
export function revenueByTrainer(contractRows, ym) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  const map = new Map();
  const get = (tid) => {
    let cur = map.get(tid);
    if (!cur) { cur = { newRev: 0, reRev: 0, refund: 0, total: 0, cntNew: 0, cntRe: 0 }; map.set(tid, cur); }
    return cur;
  };
  for (const r of rows) {
    if (!r) continue;
    const tid = r.trainer_id ?? "unknown";
    // 매출(등록) — started_at 해당월 + counts_as_revenue
    if (r.counts_as_revenue && typeof r.started_at === "string" && kstYm(r.started_at) === ym) {
      const cur = get(tid);
      const amt = r.amount_total ?? 0;
      if (r.kind === "reregister") { cur.reRev += amt; cur.cntRe += 1; }
      else { cur.newRev += amt; cur.cntNew += 1; }
      cur.total += amt;
    }
    // 환불 — refunded_at 해당월(처리월)에 차감. trainer_id로 귀속.
    if (r.refund_amount && typeof r.refunded_at === "string" && kstYm(r.refunded_at) === ym) {
      const cur = get(tid);
      cur.refund += r.refund_amount;
      cur.total -= r.refund_amount;
    }
  }
  return [...map.entries()].map(([trainer_id, v]) => ({ trainer_id, ...v })).sort((a, b) => b.total - a.total);
}

/**
 * ④ 트레이너별 클로징률 — ot_log를 회원의 trainer_id로 그룹핑(회원당 1결과, closingStats 규칙).
 * @param {Array} otRows  ot_log 행
 * @param {Map} memberTrainer  Map(user_id → trainer_id)
 * @returns [{trainer_id, attempted, success, hold, fail, rate}]
 */
export function closingStatsByTrainer(otRows, memberTrainer) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const byTrainer = new Map(); // tid → Map(user_id → Set)
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    const tid = mt.get(r.user_id) ?? "unknown";
    if (!byTrainer.has(tid)) byTrainer.set(tid, new Map());
    const mm = byTrainer.get(tid);
    const set = mm.get(r.user_id) || new Set();
    if (r.closing_result) set.add(r.closing_result);
    mm.set(r.user_id, set);
  }
  const out = [];
  for (const [tid, mm] of byTrainer.entries()) {
    let success = 0, hold = 0, fail = 0, attempted = 0;
    for (const set of mm.values()) {
      if (set.has("success")) { success++; attempted++; }
      else if (set.has("hold")) { hold++; attempted++; }
      else if (set.has("fail")) { fail++; attempted++; }
    }
    out.push({ trainer_id: tid, attempted, success, hold, fail, rate: attempted ? success / attempted : null });
  }
  return out;
}

/**
 * ④ 급여 base 재료 — 이달 완료 수업의 "회당단가 합"을 트레이너별로.
 * 급여는 판매액이 아니라 실제 한 수업 기준(회당단가 × 수업수)이라, 수업마다 그 계약의 price_per_session을 더한다.
 * 노쇼(안 가르침)·voided·보강(contract_id 없음)은 제외. ym·contracts(가격/trainer 원천) 주입.
 * @returns {Map} trainer_id → Σ price_per_session(이달 완료 수업)
 */
export function sessionPriceSumByTrainer(logs, contracts, ym) {
  const priceById = new Map();
  const trainerById = new Map();
  for (const c of (Array.isArray(contracts) ? contracts : [])) {
    if (c?.id) { priceById.set(c.id, c.price_per_session ?? 0); trainerById.set(c.id, c.trainer_id ?? "unknown"); }
  }
  const map = new Map();
  for (const l of (Array.isArray(logs) ? logs : [])) {
    if (!l || l.voided) continue; // voided(취소)만 제외 — 노쇼도 차감된 수업이면 급여 포함
    if (l.contract_id == null) continue;                   // 보강(계약 없음) 제외
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const tid = trainerById.get(l.contract_id) ?? "unknown";
    map.set(tid, (map.get(tid) || 0) + (priceById.get(l.contract_id) || 0));
  }
  return map;
}

/**
 * ④ 급여 계산 — 구간%(이달 총매출 monthRevenue로 결정) × 이달 수업 회당단가 합(sessionPriceSum) + 인센.
 *   base   = sessionPriceSum × 구간%
 *   인센   = pct(총매출×%)  /  flat(상여금)  /  none(0)
 * @param {number} monthRevenue     트레이너 이달 등록 매출(구간 결정용)
 * @param {number} sessionPriceSum  트레이너 이달 완료 수업 회당단가 합(base 재료)
 * @param {Array} policy            pay_policy 행 배열
 * @returns {{pct, base, incentive, total, band}}
 */
export function payForMonth(monthRevenue, sessionPriceSum, policy) {
  const rows = (Array.isArray(policy) ? policy : []).slice().sort((a, b) => (a.min_amt ?? 0) - (b.min_amt ?? 0));
  const rev = monthRevenue ?? 0;
  let band = null;
  for (const p of rows) { if (rev >= (p.min_amt ?? 0)) band = p; }
  if (!band) return { pct: 0, base: 0, incentive: 0, total: 0, band: null };
  const pct = Number(band.base_pct ?? 0);
  const base = Math.round(((sessionPriceSum ?? 0) * pct) / 100);
  let incentive = 0;
  if (band.incentive_type === "pct") incentive = Math.round((rev * Number(band.incentive_value ?? 0)) / 100);
  else if (band.incentive_type === "flat") incentive = Number(band.incentive_value) || 0;
  return { pct, base, incentive, total: base + incentive, band };
}
