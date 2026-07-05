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
