// lib/workoutHash.js — 수업일지 내용 동결 해시(회원 확인 시점 vs 현재 대조).
//   ★ 서버 라우트(member-confirm)와 트레이너 뱃지가 반드시 같은 결과를 내야 한다 — 다르면 오탐(항상 "변경됨").
//   그래서 '무엇을 해시할지'(canonical 문자열)는 여기 한 곳에서만 만들고,
//   '어떻게 해시할지'는 환경별로 나눈다: 서버=crypto(sync) · 브라우저=crypto.subtle(async).
//   둘 다 동일한 canonical 문자열을 SHA-256 → hex로 만들므로 값이 일치한다.

// 해시 입력 = 확인 시점에 동결할 일지 필드. ⚠️ 이 순서·구분자를 바꾸면 기존 저장 해시와 전부 어긋난다(마이그레이션 없이 바꾸지 말 것).
// sets_structured(jsonb)는 JSON.stringify로 직렬화 — ★키 순서 이슈: Postgres jsonb는 저장 시 키를 재정렬할 수 있어,
//   회원 확인(라우트가 읽은 값)과 트레이너 대조(다시 읽은 값)의 stringify 결과가 다르면 오탐이 난다.
//   같은 컬럼을 두 번 SELECT하면 순서는 안정적이지만(같은 물리 표현), 실측 검증 필요(스펙 §5 주석).
// 회원 확인 알림 대상 시각 — 수업 시작 1시간 뒤부터(2026-10-06 대표 · 옛: 다음 날부터).
//   회원 페이지 알림 · 트레이너 '미확인' 숫자가 모두 이 한 곳을 쓴다(화면마다 다르면 숫자가 어긋남).
export const CONFIRM_GRACE_MS = 60 * 60 * 1000;
export function confirmDue(log, nowMs) {
  const t = Date.parse(log?.session_at ?? log?.created_at ?? "");
  return Number.isFinite(t) && t + CONFIRM_GRACE_MS <= nowMs;
}

// 자동 확인(2026-10-06) — 수업 시각(또는 트레이너가 마지막으로 고친 시각)에서 이 시간이 지나면 DB(cron)가 확인 처리.
//   ★DB 함수 auto_confirm_workout_logs(48)와 같은 값이어야 한다(docs/migrations/2026-10-06-auto-confirm.sql).
//   폰 푸시 알림을 붙이면 둘 다 24로 줄인다(대표 결정).
//   2026-10-06(오후): 폰 알림을 붙여 24시간으로 — 24시간 문구(동의서 AUTO_CONFIRM_24_VERSION) 이상에 동의한 회원부터.
//   48시간 문구에만 동의한 회원은 알린 대로 48시간(DB auto_confirm_workout_logs도 같은 규칙).
export const AUTO_CONFIRM_HOURS = 24;
export const AUTO_CONFIRM_24_VERSION = "2026-10-06.2";
export const autoConfirmHours = (version) => ((version || "") >= AUTO_CONFIRM_24_VERSION ? 24 : 48);
// 이 동의서 버전 이상에 동의한 회원의, 동의한 뒤 수업에만 적용(lib/consent CONSENT_VERSION과 같은 날).
export const AUTO_CONFIRM_FROM_VERSION = "2026-10-06";

/** 자동 확인 예정 시각(ms) · 적용 안 되면 null. consentAt = 자동 확인 문구에 동의한 시각(ISO). */
export function autoConfirmAt(log, consentAt, version = AUTO_CONFIRM_24_VERSION) {
  if (!consentAt) return null;
  const s = Date.parse(log?.session_at ?? log?.created_at ?? "");
  if (!Number.isFinite(s) || s < Date.parse(consentAt)) return null;
  const e = Date.parse(log?.edited_at ?? log?.created_at ?? "") || s;
  return Math.max(s, e) + autoConfirmHours(version) * 3600000;
}

/** 회원이 '내용이 달라요'를 눌렀고, 트레이너가 아직 안 고친 상태인가 — 고치면(edited_at) 닫힌다.
 *  confirms = 이 일지의 확인 행들({result, confirmed_at, dispute_note}) · 확인(confirm)이 있으면 닫힘. */
export function openDispute(log, confirms) {
  const rows = (confirms || []).filter((c) => c.log_id == null || c.log_id === log?.id);
  if (rows.some((c) => c.result === "confirm")) return null;
  const base = Date.parse(log?.edited_at ?? log?.created_at ?? "") || 0;
  const last = rows.filter((c) => c.result === "dispute").sort((a, b) => (a.confirmed_at < b.confirmed_at ? 1 : -1))[0];
  return last && Date.parse(last.confirmed_at) > base ? last : null;
}

export function workoutCanonical(log) {
  const sets = log?.sets_structured != null ? JSON.stringify(log.sets_structured) : "";
  return `${log?.ai_summary ?? ""}|${log?.session_at ?? ""}|${sets}`;
}

// 서버(Node) 전용 — 동기. member-confirm 라우트가 쓴다.
// crypto는 호출부가 import해 넘긴다(이 파일이 node:crypto를 직접 import하면 클라 번들에 섞이므로 분리).
export function contentHashNode(log, crypto) {
  return crypto.createHash("sha256").update(workoutCanonical(log)).digest("hex");
}

// 브라우저 전용 — 비동기(crypto.subtle). 트레이너 뱃지가 쓴다.
export async function contentHashBrowser(log) {
  const buf = new TextEncoder().encode(workoutCanonical(log));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
