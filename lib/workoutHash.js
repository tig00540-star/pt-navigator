// lib/workoutHash.js — 수업일지 내용 동결 해시(회원 확인 시점 vs 현재 대조).
//   ★ 서버 라우트(member-confirm)와 트레이너 뱃지가 반드시 같은 결과를 내야 한다 — 다르면 오탐(항상 "변경됨").
//   그래서 '무엇을 해시할지'(canonical 문자열)는 여기 한 곳에서만 만들고,
//   '어떻게 해시할지'는 환경별로 나눈다: 서버=crypto(sync) · 브라우저=crypto.subtle(async).
//   둘 다 동일한 canonical 문자열을 SHA-256 → hex로 만들므로 값이 일치한다.

// 해시 입력 = 확인 시점에 동결할 일지 필드. ⚠️ 이 순서·구분자를 바꾸면 기존 저장 해시와 전부 어긋난다(마이그레이션 없이 바꾸지 말 것).
// sets_structured(jsonb)는 JSON.stringify로 직렬화 — ★키 순서 이슈: Postgres jsonb는 저장 시 키를 재정렬할 수 있어,
//   회원 확인(라우트가 읽은 값)과 트레이너 대조(다시 읽은 값)의 stringify 결과가 다르면 오탐이 난다.
//   같은 컬럼을 두 번 SELECT하면 순서는 안정적이지만(같은 물리 표현), 실측 검증 필요(스펙 §5 주석).
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
