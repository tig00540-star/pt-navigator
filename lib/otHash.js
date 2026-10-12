// round-1 관찰 스냅샷 해시 — ③ 브리핑 스테일 감지용 순수 함수.
// ot_log에 updated_at이 없어 타임스탬프만으론 관찰 수정을 감지 못하므로,
// 관찰 핵심(movements+reaction+goal+memberQuote)을 키 순서 고정 후 간이 해시.
// 브리핑 생성 시 briefMeta.obsHash에 저장 → 진입 시 재계산해 비교(다르면 재생성 권장).

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // h*33 + c
  }
  return h.toString(36);
}

// ① first_assist 캐시 스테일 감지 — firstPrompt 입력(회원 기본정보) 스냅샷 해시.
// 회원 데이터가 바뀌면 해시가 달라져 캐시가 낡았음을 표시(재생성 권장).
const firstBase = (m) => ({
  name: m.name || "",
  age: m.age ?? "",
  job: m.job || "",
  residence: m.residence || "",
  mbti: m.mbti || "",
  pain: m.pain || "",
  goal: m.goal || "",
  machines: Array.isArray(m.machines) ? [...m.machines].sort() : [],
});

// 1차 프롬프트(app/api/ot-brief firstPrompt)가 더 읽는 칸 — OT 신청서 · 사전 문진(2026-10-12 추가).
//   값이 있는 칸만 해시에 넣는다 → 이 칸들이 빈 회원은 예전 해시와 똑같다.
const FIRST_EXTRA_KEYS = [
  "gender", "goal_deadline", "training_pace", "injury_history", "exercise_level", "quit_reason",
  "past_exercise", "availability", "activity_level", "member_note", "weekly_freq", "health_screen", "lead_source",
];
const emptyVal = (v) =>
  v == null || (typeof v === "string" && ["", "-", "미설정"].includes(v.trim())) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

// 옛 해시(기본 8칸만) — meta.inputHashV가 없는 예전 대본은 이걸로 비교한다(새 칸 때문에 전부 '낡음'으로 뜨지 않게).
export function firstInputHashV1(member) {
  return djb2(JSON.stringify(firstBase(member || {})));
}

// 지금 해시(v2) — 새로 만드는 대본은 meta.inputHashV = FIRST_INPUT_HASH_V 와 함께 저장한다.
export const FIRST_INPUT_HASH_V = 2;
export function firstInputHash(member) {
  const m = member || {};
  const o = firstBase(m);
  for (const k of FIRST_EXTRA_KEYS) if (!emptyVal(m[k])) o[k] = m[k];
  return djb2(JSON.stringify(o));
}

// 저장된 meta와 지금 회원 정보 비교 — 저장 때 쓴 해시 판으로 다시 계산해 본다.
export function firstInputStale(meta, member) {
  if (!meta?.inputHash) return false;
  const now = meta.inputHashV === FIRST_INPUT_HASH_V ? firstInputHash(member) : firstInputHashV1(member);
  return meta.inputHash !== now;
}

export function otObsHash(report) {
  const r = report || {};
  const movements = Array.isArray(r.movements)
    ? r.movements.map((m) => ({
        observation: m?.observation || "",
        memberAware: !!m?.memberAware,
        plan2nd: m?.plan2nd || "",
      }))
    : [];
  const reaction = {
    stimulus: r.reaction?.stimulus || "",
    attitudeTags: Array.isArray(r.reaction?.attitudeTags)
      ? [...r.reaction.attitudeTags].sort()
      : [],
    memo: r.reaction?.memo || "",
  };
  const goal = {
    identified: !!r.goal?.identified,
    type: r.goal?.type || "",
    detail: r.goal?.detail || "",
  };
  // 키 순서 고정된 정규 문자열 → 해시
  const canonical = JSON.stringify({
    movements,
    reaction,
    goal,
    memberQuote: r.memberQuote || "",
  });
  return djb2(canonical);
}
