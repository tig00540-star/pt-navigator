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
