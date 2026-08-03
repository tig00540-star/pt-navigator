# v2 스펙 — memberStatus 리팩터 (저위험 ③ · daysSince·버킷·마지막수업 중복 제거)

> **목적:** `lib/memberStatus.js`의 이탈/만료 3함수(`churnRiskByTrainer`·`churnRiskMembers`·`expiringMembers`)가 복붙하는 ①`daysSince` ②회원별 계약·로그 버킷 ③마지막 실수업 계산을 **모듈 레벨 헬퍼 3개로 추출**. **순수 리팩터 — 동작 100% 보존**(리텐션·이탈 숫자 원천이라 결과 불변 필수).
> **협업:** 웹Claude 스펙+검증, CC 구현, 대수 커밋. ⚠️ **mount-cache 파일 → diff는 대수가 `git diff` 붙여넣기**로 리뷰(웹Claude 재스테이징 금지).
> **파일:** `lib/memberStatus.js` 1개. **1커밋.** additive 헬퍼 + 3함수 내부 치환. **로직/시그니처/반환형/정렬 전부 불변.**
> **검증:** 추출 헬퍼 3종이 원본 인라인과 **등가**임을 웹Claude Node로 확인(엣지 케이스 PASS · 아래).

---

## 현행 중복 (3함수 × 3패턴)

| 패턴 | churnRiskByTrainer | churnRiskMembers | expiringMembers |
|---|---|---|---|
| `daysSince` 지역선언 | ✓(멀티라인) | ✓(1줄) | ✓(1줄·nowT null가드) |
| 회원별 계약/로그 버킷(cBy/lBy) | ✓ | ✓ | ✓ |
| 마지막 실수업(`done`→`last`) | ✓ | ✓ | ✓ |

---

## 1) 신규 모듈 레벨 헬퍼 3개 (additive)

`churnRiskByTrainer` **바로 앞**(또는 파일 내 파생 섹션 상단)에 배치. **export 불필요**(모듈 내부 전용). `kstYm` 등 기존 내부 헬퍼와 같은 계층.

```js
// 기준시각(nowISO) 주입 → daysSince(iso)=경과일(floor · KST 무관 순수 ms 차). iso 없거나 파싱실패면 null.
function makeDaysSince(nowISO) {
  const nowT = Date.parse(nowISO);
  return (iso) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.floor((nowT - t) / 86400000);
  };
}

// 회원별 계약·로그 버킷(O(n) 1회 · user_id null 제외). 중첩 스캔 회피용.
function bucketByMember(contracts, logs) {
  const cBy = new Map(), lBy = new Map();
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (c?.user_id == null) continue;
    if (!cBy.has(c.user_id)) cBy.set(c.user_id, []);
    cBy.get(c.user_id).push(c);
  }
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l?.user_id == null) continue;
    if (!lBy.has(l.user_id)) lBy.set(l.user_id, []);
    lBy.get(l.user_id).push(l);
  }
  return { cBy, lBy };
}

// 회원 로그 배열 → 마지막 실수업 시각(voided·noshow 제외 · session_at??created_at 최댓값). 없으면 null.
function lastRealSession(ml) {
  const done = (Array.isArray(ml) ? ml : []).filter((l) => !l.voided && l.source !== "noshow");
  return done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
}
```

> ⚠️ **문자열 그대로 유지 필수:** `Math.floor((nowT - t) / 86400000)` · `!l.voided && l.source !== "noshow"` · `session_at ?? created_at` · `.filter(Boolean).sort().slice(-1)[0] ?? null` — 원본과 문자 단위 동일(등가성 근거).

---

## 2) 함수 3개 내부 치환 (동작 불변)

### churnRiskByTrainer
- `const nowT = …; const daysSince = (iso) => {…};`(멀티라인 5줄) → `const daysSince = makeDaysSince(nowISO);`
- `const cByMember = new Map(); const lByMember = …;` + 두 for 루프(버킷) → `const { cBy: cByMember, lBy: lByMember } = bucketByMember(contracts, logs);` (⚠️ 기존 변수명이 `cByMember`/`lByMember`라 별칭으로 받아 하위 코드 무변)
- 루프 안 `const done = ml.filter(…); const last = done.map(…)…;` → `const last = lastRealSession(ml);`
- 이후 `const ref = last ?? active.started_at ?? active.created_at ?? null; const gap = ref ? daysSince(ref) : null;` **그대로**.

### churnRiskMembers
- `const nowT = …; const daysSince = (iso) => {…};`(1줄) → `const daysSince = makeDaysSince(nowISO);`
- `const cBy = new Map(), lBy = new Map();` + 두 for 루프 → `const { cBy, lBy } = bucketByMember(contracts, logs);` (변수명 동일 → 하위 무변)
- 루프 안 `const done = …; const last = …;` → `const last = lastRealSession(ml);`
- 나머지(`ref`·`gap`·push·sort) **그대로**.

### expiringMembers
- `const nowT = nowISO ? … : null; const daysSince = (iso) => {…};` → `const daysSince = makeDaysSince(nowISO);`
- 버킷 → `const { cBy, lBy } = bucketByMember(contracts, logs);`
- 루프 안 `const done = …; const last = …;` → `const last = lastRealSession(ml);`
- `out.push({ …, gap: last ? daysSince(last) : null });` · sort **그대로**.

> **변수명 보존이 핵심:** churnRiskByTrainer는 `cByMember`/`lByMember`, 나머지 둘은 `cBy`/`lBy`. 구조분해 별칭(`{ cBy: cByMember, lBy: lByMember }`)으로 받아 **하위 참조 코드는 한 글자도 안 건드림** → 리뷰·회귀 최소.

---

## 검증 (웹Claude Node · 완료)

추출 헬퍼 3종을 원본 인라인과 동일 입력으로 대조 → **전부 등가 PASS**:
- `makeDaysSince` vs churn/expiring 원본: `null`·`undefined`·`""`·`"bad"`·정상 ISO·같은날·미래날 — 모두 동일(nowISO 주입 시).
- `bucketByMember` vs 원본 루프: user_id null/누락 제외·그룹핑 순서 동일.
- `lastRealSession` vs 원본: 빈배열·voided·noshow·session_at/created_at 혼합·최댓값 선택 동일.

⚠️ **유일한 미차이(발생 안 함):** `nowISO` **누락 시**만 expiring의 `gap`이 옛 `null`→새 `NaN`이 될 수 있으나, **모든 호출부(RetentionConsole·TrainerScorecard·ChurnRiskToday 등)가 nowISO를 항상 주입**하므로 실입력에서 차이 0. (churn 두 함수는 nowISO 주입 시 원본과 문자 단위 동일.)

## 리스크·불변

- **반환형·필드·정렬·필터 조건 전부 불변.** 추출은 인라인의 문자 단위 복제라 결과 동일(Node 등가 확인).
- **성능 동일**(버킷 O(n) 1회·루프 구조 그대로).
- **범위 밖(의도적):** 다른 함수의 인라인 gap(예: 이름포함 이탈목록의 `Math.floor((now - Date.parse(last)) / 86400000)`)은 이번 스코프 아님 — 원하면 후속으로 `makeDaysSince` 통일 가능하나, 3함수 리팩터 회귀 확인 후 별도 커밋 권장.

## 검증 (대수)

1. `npm.cmd run lint`·`npm.cmd run build` green.
2. **회귀 대조(중요):** admin **PT회원 현황(리텐션)** 탭 — 만료임박·이탈위험 **명수·리스트·정렬이 리팩터 전과 동일**한지 · 트레이너 탭 리더보드 **이탈위험 %**가 이전과 동일한지 · 트레이너 앱 **오늘 할일 이탈위험(ChurnRiskToday)** 동일한지. (숫자 하나라도 바뀌면 롤백.)
3. mount-cache라 CC 구현 후 **`git diff lib/memberStatus.js` 붙여주시면** 웹Claude가 치환 정확성 최종 리뷰.

## 커밋 (대수 · 스코프 add만)

```powershell
git add lib/memberStatus.js
git commit -m "refactor(lib): 이탈/만료 파생 공통 헬퍼 추출(makeDaysSince·bucketByMember·lastRealSession) — 동작 불변"
```
⚠️ `git add -A` 금지.

## CLAUDE.md 동기화 포인트
- `lib/memberStatus.js` 내부 헬퍼 `makeDaysSince`·`bucketByMember`·`lastRealSession` 추가 — 이탈/만료 3함수가 공유(중복 제거·동작 불변).
