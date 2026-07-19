# v2 스펙 — 큐2: AI JSON 렌더 방어 (.map() filter(Boolean) + data_gaps 타입가드)

> 성격: **수정 스펙**(클로드코드에 넘김). 근거: `docs/v2-종합점검-리포트-2026-07-19.md` §3-4, 핸드오프 다음작업큐 2번. 선례 `AcuteBriefView.jsx`.
> 원칙: **표시단 방어만**(로직·payload·프롬프트·스키마 불변). 전부 additive·무회귀. 라인번호 아님 **코드 내용 매칭**.
> 환경: PowerShell 구버전 — `&&` 금지. 빌드 `npm.cmd run build`, 린트 `npm.cmd run lint`.
> 새 파일 없음(전부 기존 파일 인라인 수정) → `git add` 불필요, `git commit -am`으로 충분.

---

## 목적 · 무엇을 막나
AI 브리핑 라우트(`ot-brief`)는 **키 존재만 검증하고 타입은 안 본다**(리포트 §3-4). 그래서 모델이 배열 자리에 `null` 원소를 넣거나 문자열 자리에 객체를 넣으면 렌더에서 던진다:
- **`.map()` 원소가 `null`** → `s.exercise`/`o.reason` 접근 시 TypeError → **SPA 흰 화면**.
- **`data_gaps` 원소가 문자열이 아닌 객체** → `{gp}` 직접 렌더 → *"Objects are not valid as a React child"* → 흰 화면.

이미 `app/error.jsx`/`global-error.jsx`가 흰 화면을 복구 UI로 잡아주지만(배치1), **애초에 안 던지게** 하는 게 이 작업. 세일즈 클로징 화면이라 렌더가 죽으면 현장에서 치명적.

### 두 가지 가드 (구분)
- **객체 배열**(`objection_defense`·`moves`·`session_plan`): `.filter(Boolean)` — `null` 원소 제거. 렌더는 `o.field &&`로 이미 필드 가드하므로 원소만 살아있으면 안전. (= `AcuteBriefView`의 `avoid`/`alts` 패턴 그대로.)
- **문자열 리스트**(`data_gaps`): **타입가드** `.filter((g) => typeof g === "string" && g.trim())` — `null`·객체·빈문자 전부 제거. `{gp}`가 항상 문자열이 되도록. (filter(Boolean)만으로는 객체를 못 걸러 부족 → 리포트가 "타입가드"를 따로 요구한 이유.)

착수 전 확인: 아래 6개 파생 라인이 그대로인지 `rg`로 대조하면 좋다 —
```
rg -n "data_gaps|objection_defense \?|Array\.isArray\(.*moves\)|session_plan\.map" components/tabs components/views
```

---

## 1. `components/tabs/FirstOTAssist.jsx` (4곳)

**① objection_defense — filter(Boolean)**
```js
  const obj = Array.isArray(data?.objection_defense) ? data.objection_defense : [];
```
→
```js
  const obj = Array.isArray(data?.objection_defense) ? data.objection_defense.filter(Boolean) : [];
```

**② data_gaps — 타입가드**
```js
  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];
```
→
```js
  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];
```

**③ moves — filter(Boolean)** (ternary의 AI 배열 가지에만; 조작 단일객체 가지는 항상 유효)
```js
            const moves = Array.isArray(te.moves)
              ? te.moves
              : (te.exercise ? [{ exercise: te.exercise, target_reaction: te.target_reaction, point_it_out: te.point_it_out }] : []);
```
→ 첫 가지만 변경:
```js
            const moves = Array.isArray(te.moves)
              ? te.moves.filter(Boolean)
              : (te.exercise ? [{ exercise: te.exercise, target_reaction: te.target_reaction, point_it_out: te.point_it_out }] : []);
```

**④ session_plan — 렌더 인라인에 filter(Boolean)**
```js
                {data.session_plan.map((s, i) => (
```
→
```js
                {data.session_plan.filter(Boolean).map((s, i) => (
```

---

## 2. `components/tabs/SecondOTTab.jsx` (4곳)

**① data_gaps — 타입가드**
```js
    const gaps = Array.isArray(b.data_gaps) ? b.data_gaps : [];
```
→
```js
    const gaps = Array.isArray(b.data_gaps) ? b.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];
```

**② moves — filter(Boolean)**
```js
    const moves = Array.isArray(pf.moves) ? pf.moves : [];
```
→
```js
    const moves = Array.isArray(pf.moves) ? pf.moves.filter(Boolean) : [];
```

**③ objection_defense — filter(Boolean)**
```js
    const obj = Array.isArray(b.objection_defense) ? b.objection_defense : [];
```
→
```js
    const obj = Array.isArray(b.objection_defense) ? b.objection_defense.filter(Boolean) : [];
```

**④ session_plan — 렌더 인라인에 filter(Boolean)**
```js
              {b.session_plan.map((s, i) => (
```
→
```js
              {b.session_plan.filter(Boolean).map((s, i) => (
```

---

## 3. `components/views/RegBriefView.jsx` (2곳)

**① objection_defense — filter(Boolean)** (`obj.map`이 `o.reason` 접근 → null 원소 시 크래시)
```js
  const obj = Array.isArray(b.objection_defense) ? b.objection_defense : [];
```
→
```js
  const obj = Array.isArray(b.objection_defense) ? b.objection_defense.filter(Boolean) : [];
```

**② data_gaps — 타입가드**
```js
  const gaps = Array.isArray(b.data_gaps) ? b.data_gaps : [];
```
→
```js
  const gaps = Array.isArray(b.data_gaps) ? b.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];
```

---

## 4. `components/views/AcuteBriefView.jsx` (1곳 — 선례 강화, 정합성)
현재 `data_gaps`는 `.filter(Boolean)`만이라 **객체 원소를 못 거른다**(다른 3곳과 톤 맞춰 타입가드로 승격). `avoid`/`alts`는 객체 배열이라 그대로 `.filter(Boolean)` 유지.
```js
  const gaps = Array.isArray(brief.data_gaps) ? brief.data_gaps.filter(Boolean) : [];
```
→
```js
  const gaps = Array.isArray(brief.data_gaps) ? brief.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];
```

---

## 검증 (스모크)
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- **정상 브리핑(잘 나온 케이스)에서 화면이 이전과 100% 동일**해야 함(방어는 비정상 입력에만 작동). 1차 지원·2차 브리핑·재등록 브리핑·급한불 4개 렌더가 그대로 보이는지.
- (선택) 임시 확인: 브라우저 콘솔에서 브리핑 state에 `data_gaps: [{x:1}]`, `objection_defense: [null]`, `session_plan: [null]` 같은 오염값을 넣어도 **흰 화면 대신 그냥 그 항목이 비어 렌더**되는지. 확인 후 원복.

## 알아둘 사소한 부작용 (무해, 의도됨)
- `obj = ...filter(Boolean)` 후 `obj.length`로 하는 **legacyCache/legacy 판정**(`FirstOTAssist`·`RegBriefView`)이 `objection_defense: [null]` 같은 극단 입력에서 "빈 배열"로 취급됨 → 더 정확한 방향이라 문제 없음.
- `session_plan.filter(Boolean).map`은 인라인이라 바깥 `... && data.session_plan.length > 0` 길이 체크는 **비필터 길이** 기준. `[null]`뿐이면 헤더 카드가 빈 채로 뜰 수 있으나 **크래시 아님**(흰 화면 방지가 목표). 필요하면 다음에 길이 체크도 필터 기준으로.

## 범위 밖 (이번 안 함, §3-4 잔여)
- **문자열 필드 직접 렌더**(`member_read`·`op.line` 등, §3-4 point 1)에 객체가 오는 경우 — 이번 큐(map+data_gaps) 밖. 필요하면 별도 큐로.
- **서버측 타입 검증**(`ot-brief/route.js`가 `k in o` 키존재만 봄, `acute`는 `reqKeys=[]`) — 근본 방어지만 라우트/스키마 변경이라 별도 스펙(리포트 §3-4 point 3).

## 커밋 제안(대수가 직접)
- `fix(ai-render): 브리핑 배열 .filter(Boolean) + data_gaps 타입가드 — 오염 JSON 흰화면 방지`
