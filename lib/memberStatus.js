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
  if (contract?.handed_over) return { paid: 0, service: 0, total: 0 }; // 인계로 닫힌 계약 = 잔여 0(activeContract도 자동 제외)
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
 * 할일 4 — "미확정 클로징": OT 회원 중 2차(round=2) 관찰은 했으나 클로징 결과 미기록.
 * ot_log round=2 행이 있고 closing_result가 비었으면 대상. view==='ot'인 회원만(성공→PT 전이면 제외).
 * @param {Array} r2rows  ot_log round=2 행 [{ user_id, ot_round, closing_result }]
 * @param {Set|Array} otMemberIds  현재 view==='ot'인 회원 id 집합(호출부가 viewFor로 산출)
 * @returns {Array<{user_id}>}  결과 미기록 회원.
 */
export function unclosedClosings(r2rows, otMemberIds) {
  const ids = otMemberIds instanceof Set ? otMemberIds : new Set(otMemberIds || []);
  const rows = Array.isArray(r2rows) ? r2rows : [];
  const out = [];
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 2) continue;
    const empty = r.closing_result == null || r.closing_result === "";
    if (empty && ids.has(r.user_id)) out.push({ user_id: r.user_id });
  }
  return out;
}

/**
 * 할일 5 — "미처리 예약": 지난 예약(start_at < now)을 완료/취소 안 한 것.
 * appointment status='booked' + start_at 과거. 완료(done)·취소(canceled)는 제외.
 * @param {Array} appts  appointment 행 [{ id, user_id, start_at, status }]
 * @param {string} nowISO  기준 시각 ISO(호출부 주입 · 모듈 내 now 금지).
 * @returns {Array}  과거 미처리 예약(start_at 오름차순 = 오래된 것 먼저).
 */
export function pastDueAppointments(appts, nowISO) {
  const rows = Array.isArray(appts) ? appts : [];
  return rows
    .filter((a) => a && a.status === "booked" && typeof a.start_at === "string" && a.start_at < nowISO)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
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

/* =========================================================================
   페이롤 B — 확장 가능 급여 스킴(pay_scheme). docs/v2-페이롤-스펙-확장가능급여.md §2.
   payForMonth(레거시)는 콜사이트 0 후 제거됨(E 이후). pay_policy 테이블은 DB에 레거시로 잔존(코드 미참조).
   ========================================================================= */

// 트레이너별 개별 스킴 우선 → 없으면 계정 기본(trainer_id=null) → 없으면 null
export function resolveScheme(schemes, trainerId) {
  const arr = Array.isArray(schemes) ? schemes : [];
  return arr.find((s) => s.trainer_id === trainerId)
      ?? arr.find((s) => s.trainer_id == null)
      ?? null;
}

// 밴드 기준 'session_count'용 — 이달 완료 수업 '개수'를 트레이너별로. sessionPriceSumByTrainer와 동일 필터(voided·보강·월 제외).
export function sessionCountByTrainer(logs, contracts, ym) {
  const trainerById = new Map();
  for (const c of (Array.isArray(contracts) ? contracts : [])) {
    if (c?.id) trainerById.set(c.id, c.trainer_id ?? "unknown");
  }
  const map = new Map();
  for (const l of (Array.isArray(logs) ? logs : [])) {
    if (!l || l.voided) continue;
    if (l.contract_id == null) continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const tid = trainerById.get(l.contract_id) ?? "unknown";
    map.set(tid, (map.get(tid) || 0) + 1);
  }
  return map;
}

// 급여 자동제안 — scheme.type별 분기. manual이면 computed=null(원장 입력 대기).
export function payForScheme(scheme, { monthRevenue = 0, sessionCount = 0, sessionPriceSum = 0 } = {}) {
  if (!scheme || scheme.type === "manual") {
    return { type: "manual", band: null, base: 0, incentive: 0, computed: null };
  }
  const bands = (Array.isArray(scheme.bands) ? scheme.bands : []).slice()
    .sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  const basisVal = scheme.band_basis === "session_count" ? sessionCount : monthRevenue;
  let band = null;
  for (const b of bands) { if (basisVal >= (b.min ?? 0)) band = b; }
  if (!band) return { type: "banded", band: null, base: 0, incentive: 0, computed: 0 };

  const pv = Number(band.payout_value ?? 0);
  let base = 0;
  if (band.payout_type === "pct_of_price") base = Math.round((sessionPriceSum * pv) / 100);
  else if (band.payout_type === "flat_per_session") base = sessionCount * pv;
  else if (band.payout_type === "fixed") base = pv;

  let incentive = 0;
  if (band.incentive_type === "pct") incentive = Math.round((monthRevenue * Number(band.incentive_value ?? 0)) / 100);
  else if (band.incentive_type === "flat") incentive = Number(band.incentive_value) || 0;

  return { type: "banded", band, base, incentive, computed: base + incentive };
}

/* =========================================================================
   #1 트레이너 KPI 스코어카드 — 트레이너별 파생 (기존 파생의 per-trainer/per-round 확장).
   전부 순수: 기준시각 nowISO 주입 · ym 주입 · kstYm(모듈 로컬) 재사용. 기존 함수 무변.
   ========================================================================= */

/**
 * 트레이너별·라운드별 클로징률. round(1|2)마다 결과기록(none/빈값 제외) 중 success 비율.
 * ★closingStats와 동일 철학으로 회원×라운드로 dedup(재기록·중복행에 강건 · best=success>hold>fail).
 *   행 카운트가 아니라 '결과 기록된 회원-라운드' 카운트 → 상단 통합 KPI와 정합.
 * @param {Array} otRows  ot_log 행
 * @param {Map} memberTrainer  Map(user_id → trainer_id)
 * @returns {Map} trainer_id → { r1:{attempted,success,rate}, r2:{attempted,success,rate} }
 */
export function closingStatsByRoundByTrainer(otRows, memberTrainer) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  // 회원×라운드 → 결과 Set(중복행 흡수). key=`user_id|round`.
  const byMemberRound = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    const res = r.closing_result;
    if (res !== "success" && res !== "hold" && res !== "fail") continue; // 결과 기록된 것만 시도
    const key = `${r.user_id}|${r.ot_round}`;
    let cur = byMemberRound.get(key);
    if (!cur) { cur = { user_id: r.user_id, round: r.ot_round, set: new Set() }; byMemberRound.set(key, cur); }
    cur.set.add(res);
  }
  const mk = () => ({ attempted: 0, success: 0, rate: null });
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { r1: mk(), r2: mk() }; map.set(tid, c); }
    return c;
  };
  for (const { user_id, round, set } of byMemberRound.values()) {
    const tid = mt.get(user_id) ?? "unknown";
    const slot = get(tid)[round === 1 ? "r1" : "r2"];
    slot.attempted += 1;
    if (set.has("success")) slot.success += 1; // success 우선(하나라도 성공이면 성공)
  }
  for (const c of map.values()) {
    c.r1.rate = c.r1.attempted ? c.r1.success / c.r1.attempted : null;
    c.r2.rate = c.r2.attempted ? c.r2.success / c.r2.attempted : null;
  }
  return map;
}

/**
 * 트레이너별 재등록률 — reregisterStats의 per-trainer판(session_log.trainer_id로 그룹).
 * @param {Array} contractRows  session_log 행
 * @returns {Map} trainer_id → { attempted, success, hold, fail, rate }
 */
export function reregisterStatsByTrainer(contractRows) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { attempted: 0, success: 0, hold: 0, fail: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  for (const r of rows) {
    if (!r) continue;
    const res = r.reg_result;
    if (res !== "success" && res !== "hold" && res !== "fail") continue;
    const c = get(r.trainer_id ?? "unknown");
    c[res] += 1;
    c.attempted += 1;
  }
  for (const c of map.values()) c.rate = c.attempted ? c.success / c.attempted : null;
  return map;
}

/**
 * 트레이너별 이달 진행 수업 수(회원기준). voided·noshow 제외 · session_at 해당월 · user_id→trainer.
 * sessionCountByTrainer(계약기준·급여용)와 달리 회원 귀속이라 보강(contract 없음)도 포함 → "회원당 빈도" 분자.
 * @param {Array} logs  daily_workout_log 행
 * @param {Map} memberTrainer  Map(user_id → trainer_id)
 * @param {string} ym  'YYYY-MM'
 * @returns {Map} trainer_id → count
 */
export function sessionsThisMonthByTrainer(logs, memberTrainer, ym) {
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided || l.source === "noshow") continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const tid = mt.get(l.user_id) ?? "unknown";
    map.set(tid, (map.get(tid) || 0) + 1);
  }
  return map;
}

/**
 * 트레이너별 수업일지 작성률 — 이달 비보이드·비노쇼 수업 중 '내용 있는' 비율.
 * 내용 = ai_summary(trim 비어있지 않음) OR sets_structured(비어있지 않은 배열).
 * @returns {Map} trainer_id → { written, total, rate }
 */
export function logWriteRateByTrainer(logs, memberTrainer, ym) {
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { written: 0, total: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  const hasContent = (l) => {
    const s = typeof l.ai_summary === "string" && l.ai_summary.trim() !== "";
    const sets = Array.isArray(l.sets_structured) && l.sets_structured.length > 0;
    return s || sets;
  };
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided || l.source === "noshow") continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const c = get(mt.get(l.user_id) ?? "unknown");
    c.total += 1;
    if (hasContent(l)) c.written += 1;
  }
  for (const c of map.values()) c.rate = c.total ? c.written / c.total : null;
  return map;
}

/**
 * 트레이너별 이탈위험 — ChurnRiskToday와 동일 판정을 배열에서 트레이너별 집계.
 * 대상: view==='pt' & activeContract 존재 & remainingSessions.total>0 & 마지막 실수업 gap ≥ staleDays.
 * gap 기준시각 = nowISO(주입 · 모듈 내 now 금지). 마지막 실수업 없으면 계약 started_at/created_at(ChurnRisk와 동일).
 * @param {Array} members  user_table 행
 * @param {Array} contracts  session_log 행
 * @param {Array} logs  daily_workout_log 행
 * @param {{nowISO:string, staleDays?:number}} opts  nowISO 필수
 * @returns {Map} trainer_id → { atRisk, activePt, rate }
 */
export function churnRiskByTrainer(members, contracts, logs, { nowISO, staleDays = 14 } = {}) {
  const nowT = Date.parse(nowISO);
  const daysSince = (iso) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.floor((nowT - t) / 86400000);
  };
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { atRisk: 0, activePt: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  // 회원별 계약·로그 버킷(O(n) 1회 구축 · 중첩 스캔 회피).
  const cByMember = new Map();
  const lByMember = new Map();
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (c?.user_id == null) continue;
    if (!cByMember.has(c.user_id)) cByMember.set(c.user_id, []);
    cByMember.get(c.user_id).push(c);
  }
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l?.user_id == null) continue;
    if (!lByMember.has(l.user_id)) lByMember.set(l.user_id, []);
    lByMember.get(l.user_id).push(l);
  }
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || viewFor(m) !== "pt") continue;
    const tid = m.trainer_id ?? "unknown";
    const mc = cByMember.get(m.id) || [];
    const ml = lByMember.get(m.id) || [];
    const active = activeContract(mc, ml);
    if (!active) continue;                         // 활성계약 없음 = 재등록 대상, 이탈 아님
    const rem = remainingSessions(active, ml);
    if (rem.total <= 0) continue;                  // 전소진 = 재등록 대상
    const stat = get(tid);
    stat.activePt += 1;                            // 분모 = 활성계약 있는 PT 회원
    const done = ml.filter((l) => !l.voided && l.source !== "noshow");
    const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const ref = last ?? active.started_at ?? active.created_at ?? null;
    const gap = ref ? daysSince(ref) : null;
    if (gap != null && gap >= staleDays) stat.atRisk += 1;
  }
  for (const c of map.values()) c.rate = c.activePt ? c.atRisk / c.activePt : null;
  return map;
}

/* =========================================================================
   #4 재등록·이탈 관제 — 계정 전체 리스트 파생(원장 콘솔용). 전부 순수·기준시각 주입.
   hidden 필터는 호출부 책임(admin이 user_table 전체 로드 · 컴포넌트가 visible만 전달).
   ========================================================================= */

/**
 * 이탈위험 회원 목록 — ChurnRiskToday와 동일 판정을 계정 배열에서.
 * PT · activeContract 존재 · remainingSessions.total>0 · 마지막 실수업 gap ≥ staleDays.
 * @returns {Array<{user_id, trainer_id, gap, rem, everCame}>} gap 내림차순.
 */
export function churnRiskMembers(members, contracts, logs, { nowISO, staleDays = 14 } = {}) {
  const nowT = Date.parse(nowISO);
  const daysSince = (iso) => { if (!iso) return null; const t = Date.parse(iso); return Number.isNaN(t) ? null : Math.floor((nowT - t) / 86400000); };
  const cBy = new Map(), lBy = new Map();
  for (const c of Array.isArray(contracts) ? contracts : []) { if (c?.user_id == null) continue; if (!cBy.has(c.user_id)) cBy.set(c.user_id, []); cBy.get(c.user_id).push(c); }
  for (const l of Array.isArray(logs) ? logs : []) { if (l?.user_id == null) continue; if (!lBy.has(l.user_id)) lBy.set(l.user_id, []); lBy.get(l.user_id).push(l); }
  const out = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || viewFor(m) !== "pt") continue;
    const mc = cBy.get(m.id) || [], ml = lBy.get(m.id) || [];
    const active = activeContract(mc, ml);
    if (!active) continue;
    const rem = remainingSessions(active, ml);
    if (rem.total <= 0) continue;
    const done = ml.filter((l) => !l.voided && l.source !== "noshow");
    const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const ref = last ?? active.started_at ?? active.created_at ?? null;
    const gap = ref ? daysSince(ref) : null;
    if (gap == null || gap < staleDays) continue;
    out.push({ user_id: m.id, trainer_id: m.trainer_id ?? "unknown", gap, rem, everCame: Boolean(last) });
  }
  return out.sort((a, b) => b.gap - a.gap);
}

/**
 * 만료 임박 회원 목록 — activeContract가 재등록 임계 도달(reregisterDue) PT 회원.
 * @returns {Array<{user_id, trainer_id, rem, active, gap}>} 유료 잔여 오름차순(급한 것 먼저).
 */
export function expiringMembers(members, contracts, logs, { basis = "paid", threshold = 10, nowISO } = {}) {
  const nowT = nowISO ? Date.parse(nowISO) : null;
  const daysSince = (iso) => { if (!iso || nowT == null) return null; const t = Date.parse(iso); return Number.isNaN(t) ? null : Math.floor((nowT - t) / 86400000); };
  const cBy = new Map(), lBy = new Map();
  for (const c of Array.isArray(contracts) ? contracts : []) { if (c?.user_id == null) continue; if (!cBy.has(c.user_id)) cBy.set(c.user_id, []); cBy.get(c.user_id).push(c); }
  for (const l of Array.isArray(logs) ? logs : []) { if (l?.user_id == null) continue; if (!lBy.has(l.user_id)) lBy.set(l.user_id, []); lBy.get(l.user_id).push(l); }
  const out = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || viewFor(m) !== "pt") continue;
    const mc = cBy.get(m.id) || [], ml = lBy.get(m.id) || [];
    const active = activeContract(mc, ml);
    if (!active) continue;
    if (!reregisterDue(active, ml, { basis, threshold })) continue;
    const rem = remainingSessions(active, ml);
    const done = ml.filter((l) => !l.voided && l.source !== "noshow");
    const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    out.push({ user_id: m.id, trainer_id: m.trainer_id ?? "unknown", rem, active, gap: last ? daysSince(last) : null });
  }
  return out.sort((a, b) => (a.rem[basis] ?? 0) - (b.rem[basis] ?? 0));
}

/**
 * 과거 재등록 평균 계약금액 — counts_as_revenue & kind='reregister' & amount_total!=null 평균.
 * 예상 재등록 매출 추정용. 표본 0이면 null(화면에서 금액 숨김).
 * @returns {number|null}
 */
export function avgReregisterAmount(contractRows) {
  const rows = (Array.isArray(contractRows) ? contractRows : []).filter(
    (c) => c && c.counts_as_revenue && c.kind === "reregister" && typeof c.amount_total === "number"
  );
  if (!rows.length) return null;
  return Math.round(rows.reduce((s, c) => s + c.amount_total, 0) / rows.length);
}

/* =========================================================================
   #2 전환 퍼널 — OT→PT. 대상=origin 'ot_funnel'. 순수·기준일 주입.
   hidden 필터는 호출부 책임(컴포넌트가 visible만 전달).
   ========================================================================= */

// 회원별 ot_log 라운드 결과 맵 빌더(내부 공용). user_id → {r1, r2} (결과 문자열|null).
function _otResultByMember(otRows) {
  const m = new Map();
  for (const r of Array.isArray(otRows) ? otRows : []) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    const cur = m.get(r.user_id) || { r1: null, r2: null };
    const res = (r.closing_result === "success" || r.closing_result === "hold" || r.closing_result === "fail") ? r.closing_result : null;
    if (r.ot_round === 1) cur.r1 = cur.r1 ?? res; else cur.r2 = cur.r2 ?? res;
    m.set(r.user_id, cur);
  }
  return m;
}

/**
 * OT 전환 퍼널 집계. 대상 회원(origin 'ot_funnel') 배열 + ot_log.
 * @returns {{intake, first, second, confirmed, firstSuccess, firstAttempt, secondSuccess, secondAttempt}}
 */
export function otFunnel(members, otRows) {
  const subjects = (Array.isArray(members) ? members : []).filter(isClosingStatSubject);
  const res = _otResultByMember(otRows);
  let intake = 0, first = 0, second = 0, confirmed = 0;
  let firstSuccess = 0, firstAttempt = 0, secondSuccess = 0, secondAttempt = 0;
  for (const m of subjects) {
    intake += 1;
    if (m.status === "pt_active") confirmed += 1;
    const r = res.get(m.id);
    if (r?.r1) { first += 1; firstAttempt += 1; if (r.r1 === "success") firstSuccess += 1; }
    if (r?.r2) { second += 1; secondAttempt += 1; if (r.r2 === "success") secondSuccess += 1; }
  }
  return { intake, first, second, confirmed, firstSuccess, firstAttempt, secondSuccess, secondAttempt };
}

/**
 * 트레이너별 퍼널 — 어디서 새는지 비교용(라운드별 성공수 포함 = 2차 성공률 약점 판정).
 * @returns {Array<{trainer_id, intake, first, second, confirmed, firstSuccess, secondSuccess, convRate}>} 유입 내림차순.
 */
export function otFunnelByTrainer(members, otRows) {
  const subjects = (Array.isArray(members) ? members : []).filter(isClosingStatSubject);
  const res = _otResultByMember(otRows);
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { intake: 0, first: 0, second: 0, confirmed: 0, firstSuccess: 0, secondSuccess: 0 }; map.set(tid, c); } return c; };
  for (const m of subjects) {
    const c = get(m.trainer_id ?? "unknown");
    c.intake += 1;
    if (m.status === "pt_active") c.confirmed += 1;
    const r = res.get(m.id);
    if (r?.r1) { c.first += 1; if (r.r1 === "success") c.firstSuccess += 1; }
    if (r?.r2) { c.second += 1; if (r.r2 === "success") c.secondSuccess += 1; }
  }
  return [...map.entries()]
    .map(([trainer_id, v]) => ({ trainer_id, ...v, convRate: v.intake ? v.confirmed / v.intake : null }))
    .sort((a, b) => b.intake - a.intake);
}

/**
 * 이번 주 클로징 임박 — (a) hold 재접근 도래[오늘~horizon] (b) 2차 미마감.
 * @param {Array} otRows  ot_log 행(round 1·2)
 * @param {{todayISO:string, horizonISO:string, otMemberIds?:Set, validMemberIds?:Set}} opts
 *        todayISO/horizonISO = 'YYYY-MM-DD'. otMemberIds = 현재 OT 회원(미마감 교집합). validMemberIds = 전체 visible 회원(둘 다 게이트).
 * @returns {Array<{user_id, ot_round, kind:'reapproach'|'unclosed', date:string|null}>}
 */
export function closingDueSoon(otRows, { todayISO, horizonISO, otMemberIds, validMemberIds } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const otIds = otMemberIds instanceof Set ? otMemberIds : null;
  const okIds = validMemberIds instanceof Set ? validMemberIds : null;
  const out = [];
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    if (okIds && !okIds.has(r.user_id)) continue; // hidden·비대상 제외(전체 게이트)
    // (a) 보류 재접근 도래
    if (r.closing_result === "hold" && r.closing_reapproach_at &&
        r.closing_reapproach_at >= todayISO && r.closing_reapproach_at <= horizonISO) {
      out.push({ user_id: r.user_id, ot_round: r.ot_round, kind: "reapproach", date: r.closing_reapproach_at });
      continue;
    }
    // (b) 2차 미마감(빈 결과)
    if (r.ot_round === 2) {
      const empty = r.closing_result == null || r.closing_result === "";
      if (empty && (!otIds || otIds.has(r.user_id))) out.push({ user_id: r.user_id, ot_round: 2, kind: "unclosed", date: null });
    }
  }
  return out;
}

/* =========================================================================
   #3 매출 파이프라인·예측 — 순수 파생 (admin fetch 배열 주입).
   전부 additive · DB/스키마 무변. 회원기반(forecast)은 hidden 제외된 visible을 받는다(호출부 책임).
   ========================================================================= */

/**
 * 신규 계약 평균금액 — avgReregisterAmount의 신규판(예상 신규매출 추정용).
 * counts_as_revenue & kind!=='reregister'(신규+이월null 포함) & amount_total 숫자 평균. 표본0=null.
 * ※ revenueByTrainer가 kind null을 newRev로 접는 것과 동일 규칙.
 * @returns {number|null}
 */
export function avgNewAmount(contractRows) {
  const rows = (Array.isArray(contractRows) ? contractRows : []).filter(
    (c) => c && c.counts_as_revenue && c.kind !== "reregister" && typeof c.amount_total === "number"
  );
  if (!rows.length) return null;
  return Math.round(rows.reduce((s, c) => s + c.amount_total, 0) / rows.length);
}

/**
 * 이달 매출 구성 — 신규/재등록 분해 + 환불 + 순매출(net). Σ revenueByTrainer와 동치.
 * 매출=started_at 해당월+counts_as_revenue · 환불=refunded_at 해당월. ym 주입.
 * @returns {{newRev,reRev,refund,gross,net,cntNew,cntRe,newShare,reShare}}
 */
export function revenueCompositionInMonth(contractRows, ym) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  let newRev = 0, reRev = 0, refund = 0, cntNew = 0, cntRe = 0;
  for (const r of rows) {
    if (!r) continue;
    if (r.counts_as_revenue && typeof r.started_at === "string" && kstYm(r.started_at) === ym) {
      const amt = r.amount_total ?? 0;
      if (r.kind === "reregister") { reRev += amt; cntRe += 1; }
      else { newRev += amt; cntNew += 1; }
    }
    if (r.refund_amount && typeof r.refunded_at === "string" && kstYm(r.refunded_at) === ym) refund += r.refund_amount;
  }
  const gross = newRev + reRev;
  return { newRev, reRev, refund, gross, net: gross - refund, cntNew, cntRe,
    newShare: gross ? newRev / gross : null, reShare: gross ? reRev / gross : null };
}

/**
 * 월별 매출/환불 추이 — ym(끝월) 기준 과거 months개월(과거→현재 순).
 * rev=계약월 매출 · refund=처리월 환불 · net=rev-refund. 순수: ym 문자열 정수연산(Date 안 씀).
 * @param {string} ym 'YYYY-MM' · @param {number} months 기본 6
 * @returns {Array<{ym,rev,refund,net}>}
 */
export function revenueTrendByMonth(contractRows, ym, months = 6) {
  if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) return [];
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); // m: 1..12
  const list = [];
  for (let i = months - 1; i >= 0; i--) {
    let mm = m - 1 - i, yy = y;                 // 0-index 월에서 i개월 뒤로
    while (mm < 0) { mm += 12; yy -= 1; }
    list.push(`${yy}-${String(mm + 1).padStart(2, "0")}`);
  }
  const idx = new Map(list.map((k, i) => [k, i]));
  const rev = new Array(list.length).fill(0);
  const refund = new Array(list.length).fill(0);
  for (const r of Array.isArray(contractRows) ? contractRows : []) {
    if (!r) continue;
    if (r.counts_as_revenue && typeof r.started_at === "string") { const k = kstYm(r.started_at); if (idx.has(k)) rev[idx.get(k)] += (r.amount_total ?? 0); }
    if (r.refund_amount && typeof r.refunded_at === "string") { const k = kstYm(r.refunded_at); if (idx.has(k)) refund[idx.get(k)] += r.refund_amount; }
  }
  return list.map((mo, i) => ({ ym: mo, rev: rev[i], refund: refund[i], net: rev[i] - refund[i] }));
}

/**
 * 다음달 매출 예측(추정) — 두 파이프라인 합. 회원은 hidden 제외된 visible을 받는다(호출부 책임).
 *  신규   = 현재 OT 진행(viewFor 'ot') × 과거 전환율(otFunnel) × 신규 평균계약(avgNewAmount)
 *  재등록 = 만료임박(expiringMembers) × 재등록률(reregisterStats) × 재등록 평균계약(avgReregisterAmount)
 * 재료 하나라도 null(표본0)이면 해당 파이프라인 예측 null. 둘 다 null이면 total null(추정 불가).
 * @returns {{otPipeline,convRate,avgNew,expectedNew,expiringCount,reregRate,avgRe,expectedRe,total}}
 */
export function revenueForecastNextMonth(members, otRows, contracts, logs, { nowISO } = {}) {
  const mem = Array.isArray(members) ? members : [];
  const otPipeline = mem.filter((m) => m && viewFor(m) === "ot").length;
  const f = otFunnel(mem, otRows);
  const convRate = f.intake ? f.confirmed / f.intake : null;
  const avgNew = avgNewAmount(contracts);
  const expectedNew = (convRate != null && avgNew != null) ? Math.round(otPipeline * convRate * avgNew) : null;

  const exp = expiringMembers(mem, contracts, logs, { nowISO });
  const rr = reregisterStats(contracts);
  const reregRate = rr.rate;
  const avgRe = avgReregisterAmount(contracts);
  const expectedRe = (reregRate != null && avgRe != null) ? Math.round(exp.length * reregRate * avgRe) : null;

  const total = (expectedNew == null && expectedRe == null) ? null : (expectedNew ?? 0) + (expectedRe ?? 0);
  return { otPipeline, convRate, avgNew, expectedNew, expiringCount: exp.length, reregRate, avgRe, expectedRe, total };
}

/* =========================================================================
   #5 가동률·스케줄 — 순수 파생 (admin fetch 배열 주입).
   가동률 진짜 %는 정원 데이터가 없어 불가 → '예약 밀도'로. 노쇼는 daily_workout_log 원천.
   ========================================================================= */

/**
 * 요일×시간 예약 밀도 그리드 — 최근 예약(canceled 제외)을 KST 요일(Mon=0..Sun=6)×시간 카운트.
 * 정원 분모가 없어 '가동률 %'가 아니라 '밀도'(몰림/빔). start_at(UTC ISO)→KST 벽시계로 요일·시 판정(순수).
 * @param {Array} appts  appointment 행
 * @param {{startHour?:number,endHour?:number}} [opts]  표시 시간범위(기본 6~24 · 밖은 제외)
 * @returns {{hours:number[], grid:number[][], max:number, total:number, byWeekday:number[], byHour:number[]}}
 */
export function apptWeekdayHourGrid(appts, { startHour = 6, endHour = 24 } = {}) {
  const hours = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const hIndex = new Map(hours.map((h, i) => [h, i]));
  const grid = Array.from({ length: 7 }, () => new Array(hours.length).fill(0)); // [Mon..Sun][hourIdx]
  let total = 0, max = 0;
  for (const a of Array.isArray(appts) ? appts : []) {
    if (!a || a.status === "canceled") continue;
    if (typeof a.start_at !== "string") continue;
    const t = Date.parse(a.start_at);
    if (Number.isNaN(t)) continue;
    const kst = new Date(t + 9 * 3600 * 1000);        // KST 벽시계(순수: iso로만 · now 안 읽음)
    const wd = (kst.getUTCDay() + 6) % 7;             // Mon=0..Sun=6
    const ci = hIndex.get(kst.getUTCHours());
    if (ci == null) continue;                          // 표시 범위 밖 시간 제외
    grid[wd][ci] += 1; total += 1;
    if (grid[wd][ci] > max) max = grid[wd][ci];
  }
  const byWeekday = grid.map((row) => row.reduce((s, n) => s + n, 0));
  const byHour = hours.map((_, i) => grid.reduce((s, row) => s + row[i], 0));
  return { hours, grid, max, total, byWeekday, byHour };
}

/**
 * 트레이너별 예약 결과 — 예약 총수·완료·취소·미처리(과거 booked). nowISO 주입(순수).
 * doneRate = done/(done+canceled) (해소된 예약 중 완료율 · 미처리는 아직 미해소라 분모 밖).
 * @returns {Array<{trainer_id,total,done,canceled,booked,pastDue,doneRate}>} 예약수 내림차순.
 */
export function apptOutcomeByTrainer(appts, nowISO) {
  const now = typeof nowISO === "string" ? nowISO : "";
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { total: 0, done: 0, canceled: 0, booked: 0, pastDue: 0 }; map.set(tid, c); } return c; };
  for (const a of Array.isArray(appts) ? appts : []) {
    if (!a) continue;
    const c = get(a.trainer_id ?? "unknown");
    c.total += 1;
    if (a.status === "done") c.done += 1;
    else if (a.status === "canceled") c.canceled += 1;
    else if (a.status === "booked") { c.booked += 1; if (typeof a.start_at === "string" && now && a.start_at < now) c.pastDue += 1; }
  }
  return [...map.entries()]
    .map(([trainer_id, v]) => ({ trainer_id, ...v, doneRate: (v.done + v.canceled) ? v.done / (v.done + v.canceled) : null }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 트레이너별 노쇼율 — daily_workout_log 기준(★appointment 아님 · appointment엔 noshow 상태 없음).
 * done = voided 아니고 source!=='noshow' · noshow = source==='noshow'. ym 주면 이달만.
 * @param {Array} logs
 * @param {Map} memberTrainer  Map(user_id → trainer_id) — 전체 회원으로 구성(hidden 포함, 트레이너 이력)
 * @returns {Array<{trainer_id,done,noshow,total,noshowRate}>} 노쇼율 내림차순.
 */
export function noshowByTrainer(logs, memberTrainer, { ym } = {}) {
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { done: 0, noshow: 0 }; map.set(tid, c); } return c; };
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided) continue;
    if (ym && !(typeof l.session_at === "string" && kstYm(l.session_at) === ym)) continue;
    const tid = mt.get(l.user_id) ?? "unknown";
    const c = get(tid);
    if (l.source === "noshow") c.noshow += 1; else c.done += 1;
  }
  return [...map.entries()]
    .map(([trainer_id, v]) => ({ trainer_id, ...v, total: v.done + v.noshow, noshowRate: (v.done + v.noshow) ? v.noshow / (v.done + v.noshow) : null }))
    .sort((a, b) => (b.noshowRate ?? -1) - (a.noshowRate ?? -1));
}

/* =========================================================================
   #6 원장 브리핑 — "오늘 챙길 것" 조립(룰 기반·결정적). 기존 파생 오케스트레이션만.
   각 후보 {kind,tab,title,detail,count,amount,impact}(+trainer는 trainer_id). impact(₩) 내림차순.
   ========================================================================= */
export function ownerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], memberTrainer, ym, nowISO } = {}) {
  const now = typeof nowISO === "string" ? nowISO : "";
  const kstMs = (Date.parse(now) || 0) + 9 * 3600 * 1000;
  const kd = new Date(kstMs);
  const tISO = new Date(kstMs).toISOString().slice(0, 10);
  const hISO = new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10);

  const priced = (contracts || []).filter((c) => c && c.counts_as_revenue && typeof c.price_per_session === "number" && c.price_per_session > 0);
  const avgSessionPrice = priced.length ? Math.round(priced.reduce((s, c) => s + c.price_per_session, 0) / priced.length) : 0;
  const avgRe = avgReregisterAmount(contracts);
  const avgNew = avgNewAmount(contracts);
  const pkgProxy = avgSessionPrice ? avgSessionPrice * 10 : 500000; // avgRe/avgNew 표본0일 때 랭킹용 프록시

  const mt = memberTrainer instanceof Map ? memberTrainer : new Map((members || []).map((m) => [m.id, m.trainer_id]));
  const cands = [];

  // 1) 재등록 기회(만료임박)
  const expiring = expiringMembers(members, contracts, logs, { nowISO: now });
  if (expiring.length > 0) {
    const amount = avgRe != null ? expiring.length * avgRe : null;
    cands.push({ kind: "reregister", tab: "retention", count: expiring.length, amount,
      impact: amount ?? expiring.length * pkgProxy,
      title: `재등록 챙길 회원 ${expiring.length}명`,
      detail: amount != null ? "곧 만료 · 예상 재등록 매출" : "곧 만료 · 재등록 이력 쌓이면 예상매출 표시" });
  }

  // 2) 이번주 등록 임박(클로징) — user_id dedup
  const otIds = new Set((members || []).filter((m) => viewFor(m) === "ot").map((m) => m.id));
  const validIds = new Set((members || []).map((m) => m.id));
  const due = closingDueSoon(otRows, { todayISO: tISO, horizonISO: hISO, otMemberIds: otIds, validMemberIds: validIds });
  const dueCount = new Set(due.map((d) => d.user_id)).size;
  if (dueCount > 0) {
    const amount = avgNew != null ? dueCount * avgNew : null;
    cands.push({ kind: "closing", tab: "funnel", count: dueCount, amount,
      impact: amount ?? dueCount * pkgProxy,
      title: `이번 주 등록 임박 ${dueCount}명`,
      detail: amount != null ? "2차 미결정·재상담 · 예상 신규매출" : "2차 미결정·재상담 챙기기" });
  }

  // 3) 이탈 위험
  const churn = churnRiskMembers(members, contracts, logs, { nowISO: now });
  if (churn.length > 0) {
    const idle = churn.reduce((s, c) => s + (c.rem?.total ?? 0), 0);
    const amount = avgSessionPrice ? idle * avgSessionPrice : null;
    cands.push({ kind: "churn", tab: "retention", count: churn.length, amount,
      impact: amount ?? churn.length * pkgProxy * 0.5,
      title: `이탈 위험 회원 ${churn.length}명`,
      detail: `14일+ 무수업 · 방치 ${idle}회` });
  }

  // 4) 미처리 예약(#5) — 위생(매출 손실 아님 · 랭킹 하향 ×0.4)
  const pastDue = pastDueAppointments(appts, now);
  if (pastDue.length > 0) {
    cands.push({ kind: "pastdue", tab: "schedule", count: pastDue.length, amount: null,
      impact: (avgSessionPrice ? pastDue.length * avgSessionPrice : pastDue.length * 10000) * 0.4,
      title: `미처리 예약 ${pastDue.length}건`,
      detail: "완료·취소로 정리(통계 정확도)" });
  }

  // 5) 매출 목표 뒤처짐(#3) — 진도(경과일 비율) 대비 미달
  const target = (goals || []).filter((g) => g && g.ym === ym && g.target_revenue != null).reduce((s, g) => s + (g.target_revenue || 0), 0);
  if (target > 0 && ym) {
    const net = revenueInMonth(contracts, ym);
    const dim = new Date(Date.UTC(kd.getUTCFullYear(), kd.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = Math.min(1, kd.getUTCDate() / dim);
    const shortfall = Math.round(target * elapsed - net);
    if (shortfall > 0) {
      cands.push({ kind: "goal", tab: "revenue", count: null, amount: shortfall, impact: shortfall,
        title: "매출 목표 뒤처짐",
        detail: `이달 ${Math.round((net / target) * 100)}% 달성 · 진도 대비 부족` });
    }
  }

  // 6) 주의 트레이너 — 완료율<50%(예약≥5) or 노쇼율>15%(수업≥5) 중 최악 1명
  const outcome = apptOutcomeByTrainer(appts, now);
  const noshow = noshowByTrainer(logs, mt, {});
  let worst = null;
  for (const o of outcome) {
    if (o.total >= 5 && o.doneRate != null && o.doneRate < 0.5) {
      const sev = (o.canceled + o.pastDue) * (avgSessionPrice || 10000);
      if (!worst || sev > worst.impact) worst = { trainer_id: o.trainer_id, impact: sev, reason: `완료율 ${Math.round(o.doneRate * 100)}%` };
    }
  }
  for (const n of noshow) {
    if (n.total >= 5 && n.noshowRate != null && n.noshowRate > 0.15) {
      const sev = n.noshow * (avgSessionPrice || 10000);
      if (!worst || sev > worst.impact) worst = { trainer_id: n.trainer_id, impact: sev, reason: `노쇼율 ${Math.round(n.noshowRate * 100)}%` };
    }
  }
  if (worst) {
    cands.push({ kind: "trainer", tab: "perf", trainer_id: worst.trainer_id, count: null, amount: null,
      impact: worst.impact, title: "관리 필요 트레이너", detail: worst.reason });
  }

  return cands.sort((a, b) => b.impact - a.impact);
}

/* =========================================================================
   품질 리포트 "오늘의 리포트" — 원장 코칭용 파생(읽기 전용 · additive).
   ①관찰 충실도 ②브리핑 data_gaps ③일지 ④클로징/재등록. 전부 순수 · write 0.
   ========================================================================= */

/* round1 관찰 report 충실도 — 7항목 중 '실제 내용 있는' 비율. 기본값만 있는 미기입은 '안 채움'(존재≠기입). */
function obsFilled(report) {
  const r = report || {};
  const moves = Array.isArray(r.movements) ? r.movements : [];
  const nz = (s) => typeof s === "string" && s.trim() !== "";
  const checks = {
    movements:    moves.some((m) => m && nz(m.observation)),
    plan2nd:      moves.some((m) => m && nz(m.plan2nd)),
    reactionMemo: nz(r.reaction?.memo),
    attitude:     Array.isArray(r.reaction?.attitudeTags) && r.reaction.attitudeTags.length > 0,
    goal:         !!r.goal?.identified && nz(r.goal?.detail),
    memberQuote:  nz(r.memberQuote),
    trainerNote:  nz(r.trainer_note),
  };
  const keys = Object.keys(checks);
  return { score: keys.filter((k) => checks[k]).length / keys.length, missing: keys.filter((k) => !checks[k]) };
}

/* ISO(UTC) → KST 'YYYY-MM-DD'. lib/date.js kstToday()와 같은 +9h 규약(경계 통일). */
function kstDay(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * '오늘의 리포트' 건별 — 오늘(KST) 활동(관찰·2차OT·수업)이 있었던 회원의 코칭 카드.
 * 코칭 신호 = 관찰 얇음 · 브리핑 data_gaps · 클로징 실패/보류 · 일지 미작성.
 * 성공 클로징은 successCount만(리스트 제외) — 단 그 회원이 관찰 얇음/일지 미작성/gaps면 그 신호는 잡힘.
 * ⚠️ 재등록은 완료 시각 없어 제외(전체 뷰). 1차 사전무장 미캐시 → data_gaps는 2차만.
 * @param {Array} otRows  ot_log 행
 * @param {Array} logs    daily_workout_log 행
 * @param {Map}   memberTrainer  Map(user_id→trainer_id) — 호출부가 visible(!hidden)로 구성
 * @param {{today:string, thinBelow?:number}} opts  today='YYYY-MM-DD'(kstToday() 주입)
 * @returns {{successCount:number, sessionCount:number, obsCount:number,
 *            cases:[{user_id, trainer_id, signals:[{type,detail,missing?}]}]}}
 */
export function todayCases(otRows, logs, memberTrainer, { today, thinBelow = 0.5 } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const lg = Array.isArray(logs) ? logs : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const nz = (s) => typeof s === "string" && s.trim() !== "";
  const byMember = new Map();
  const getM = (uid) => { let c = byMember.get(uid); if (!c) { c = { signals: [] }; byMember.set(uid, c); } return c; };
  let successCount = 0, sessionCount = 0, obsCount = 0;

  // 오늘 round1 관찰(회원별 최신) → 충실도. mt.has 가드 = hidden(visible에서 빠져 mt에 없음) 제외(전체 뷰와 정합).
  const r1 = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 1 || !r.report || !mt.has(r.user_id)) continue;
    if (kstDay(r.created_at) !== today) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = r1.get(r.user_id);
    if (!cur || t >= cur.t) r1.set(r.user_id, { row: r, t });
  }
  for (const { row } of r1.values()) {
    obsCount++;
    const { score, missing } = obsFilled(row.report);
    if (score < thinBelow) getM(row.user_id).signals.push({ type: "obs_thin", detail: Math.round(score * 100) + "%", missing });
  }

  // 오늘 round2(회원별 최신) → data_gaps + 클로징 결과. mt.has 가드 = hidden 제외.
  const r2 = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 2 || !mt.has(r.user_id)) continue;
    if (kstDay(r.created_at) !== today) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = r2.get(r.user_id);
    if (!cur || t >= cur.t) r2.set(r.user_id, { row: r, t });
  }
  for (const { row } of r2.values()) {
    const brief = row.report?.brief;
    const gaps = brief && Array.isArray(brief.data_gaps) ? brief.data_gaps.filter(nz) : [];
    if (gaps.length) getM(row.user_id).signals.push({ type: "gaps", detail: gaps });
    const res = row.closing_result;
    if (res === "success") successCount++;
    else if (res === "fail" || res === "hold") getM(row.user_id).signals.push({ type: "closing", detail: { result: res, reason: row.closing_reason || null } });
  }

  // 오늘 수업 → 일지 미작성. mt.has 가드 = hidden 제외.
  for (const l of lg) {
    if (!l || l.voided || l.source === "noshow" || !mt.has(l.user_id)) continue;
    if (kstDay(l.session_at) !== today) continue;
    sessionCount++;
    const has = nz(l.ai_summary) || (Array.isArray(l.sets_structured) && l.sets_structured.length > 0);
    if (!has) getM(l.user_id).signals.push({ type: "log_missing", detail: null });
  }

  const cases = [...byMember.entries()]
    .filter(([, v]) => v.signals.length > 0)
    .map(([user_id, v]) => ({ user_id, trainer_id: mt.get(user_id) ?? "unknown", signals: v.signals }));
  return { successCount, sessionCount, obsCount, cases };
}

/**
 * 트레이너별 1차 관찰 충실도(누적). round1(회원당 1행·다중이면 최신) · report 있는 것만. memberTrainer 귀속.
 * @returns {Map} trainer_id → { members, avgScore, thin, thinList:[{user_id, score, missing:[]}] }
 */
export function observationQualityByTrainer(otRows, memberTrainer, { thinBelow = 0.5 } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const latest = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 1 || !r.report) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = latest.get(r.user_id);
    if (!cur || t >= cur.t) latest.set(r.user_id, { row: r, t });
  }
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { members: 0, sumScore: 0, avgScore: null, thin: 0, thinList: [] }; map.set(tid, c); } return c; };
  for (const { row } of latest.values()) {
    const { score, missing } = obsFilled(row.report);
    const c = get(mt.get(row.user_id) ?? "unknown");
    c.members += 1; c.sumScore += score;
    if (score < thinBelow) { c.thin += 1; c.thinList.push({ user_id: row.user_id, score, missing }); }
  }
  for (const c of map.values()) { c.avgScore = c.members ? c.sumScore / c.members : null; delete c.sumScore; }
  return map;
}

/**
 * 트레이너별 AI 브리핑 data_gaps 노출(누적). OT 2차: ot_log round2 report.brief(user_id 귀속).
 * 재등록: session_log reg_brief(trainer_id 직접). ⚠️ 1차 미캐시 제외.
 * @returns {Map} trainer_id → { otBriefs, otGaps, regBriefs, regGaps, gapItems:[{scope:"ot"|"reg", user_id, gaps:[]}] }
 */
export function briefGapsByTrainer(otRows, contracts, memberTrainer) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const cons = Array.isArray(contracts) ? contracts : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { otBriefs: 0, otGaps: 0, regBriefs: 0, regGaps: 0, gapItems: [] }; map.set(tid, c); } return c; };
  const gapsOf = (o) => (o && Array.isArray(o.data_gaps) ? o.data_gaps.filter((g) => typeof g === "string" && g.trim() !== "") : []);
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 2) continue;
    const brief = r.report?.brief; if (!brief) continue;
    const c = get(mt.get(r.user_id) ?? "unknown");
    c.otBriefs += 1;
    const g = gapsOf(brief); if (g.length) { c.otGaps += 1; c.gapItems.push({ scope: "ot", user_id: r.user_id, gaps: g }); }
  }
  for (const r of cons) {
    if (!r || !r.reg_brief) continue;
    const c = get(r.trainer_id ?? "unknown");
    c.regBriefs += 1;
    const g = gapsOf(r.reg_brief); if (g.length) { c.regGaps += 1; c.gapItems.push({ scope: "reg", user_id: r.user_id ?? null, gaps: g }); }
  }
  return map;
}

/**
 * 미예약 넛지 대상 — 잔여 있는 활성 PT인데 '앞으로 잡힌 booked 예약'이 없는 회원.
 * 리텐션: 다음 수업 계획이 비면 발길 끊김 → 먼저 예약을 잡게 넛지.
 * 순수. 기준시각(nowISO) 주입(모듈 내 now 금지). appointment는 호출부가 트레이너 스코프로 넘김.
 * ⚠️ upcoming = booked & start_at>now만. 과거 booked·canceled·done은 upcoming 아님(넛지 유지). 잔여0·OT 제외.
 * @param {Array} members   user_table 행(호출부가 담당 스코프로 넘김)
 * @param {Array} contracts session_log 행(계정 전체 · 회원별 filter)
 * @param {Array} logs      daily_workout_log 행(계정 전체 · 회원별 filter)
 * @param {Array} appts     appointment 행(트레이너 스코프 · booked 위주)
 * @param {{nowISO:string}} opts  nowISO 필수(잘못되면 [] 반환)
 * @returns {Array<{user_id, name, rem, gap, everCame}>} gap 내림차순(null 마지막).
 */
export function unbookedActiveMembers(members, contracts, logs, appts, { nowISO } = {}) {
  const now = Date.parse(nowISO || "");
  if (Number.isNaN(now)) return [];
  const cons = Array.isArray(contracts) ? contracts : [];
  const lg = Array.isArray(logs) ? logs : [];
  const upcoming = new Set();
  for (const a of Array.isArray(appts) ? appts : []) {
    if (!a || a.status !== "booked" || a.user_id == null) continue;
    const t = Date.parse(a.start_at || "");
    if (!Number.isNaN(t) && t > now) upcoming.add(a.user_id);
  }
  const out = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || viewFor(m) !== "pt") continue;
    if (upcoming.has(m.id)) continue;
    const mc = cons.filter((c) => c.user_id === m.id);
    const ml = lg.filter((l) => l.user_id === m.id);
    const active = activeContract(mc, ml);
    if (!active) continue;
    const rem = remainingSessions(active, ml);
    if (rem.total <= 0) continue;
    const done = ml.filter((l) => !l.voided && l.source !== "noshow");
    const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const gap = last ? Math.floor((now - Date.parse(last)) / 86400000) : null;
    out.push({ user_id: m.id, name: m.name, rem: rem.total, gap, everCame: Boolean(last) });
  }
  return out.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1));
}
