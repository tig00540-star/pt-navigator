# v2 스펙 — 큐1 correctness 묶음 (kstToday 통합 + SetsEditor 드롭다운)

> 성격: **수정 스펙**(클로드코드에 넘김). 근거: `docs/v2-종합점검-리포트-2026-07-19.md` §7·§8, `docs/v2-핸드오프-2026-07-19.md` 다음작업큐 1번.
> 원칙: **로직·payload 불변**(둘 다 순수 리팩터/뷰상태). 라인번호 아님 **코드 내용으로 매칭**. **새 파일은 `git add` 먼저.**
> 환경: 윈도우 PowerShell 구버전 — `&&` 금지. 빌드 `npm.cmd run build`, 린트 `npm.cmd run lint`.
> 검증: 두 건 모두 **동작 불변**이 목표. 빌드/린트 초록 + 아래 스모크 체크만 확인하면 됨.

---

## A. `kstToday` 단일화 → `lib/date.js`

### 배경 (먼저 읽을 것)
리포트 §8은 `kstToday`를 "2 (로직 다름 ⚠️)"로 적었지만, 현재 코드 확인 결과 **두 구현의 결과는 동일**하다. 차이는 선언 방식뿐:
- `PtInbodyTab.jsx` — `function kstToday()`
- `RefundMember.jsx` — `const kstToday = () => ...`

둘 다 계산식은 `new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)`로 **글자까지 같다.** 따라서 이 작업은 *버그 수정이 아니라* **드리프트 예방용 순수 리팩터**다. 출력이 바뀌면 안 된다(회귀 판정 기준).

### A-0. 착수 전 확인 (중요)
스펙은 이 두 곳만 전제로 한다. 코드베이스가 그 사이 변했을 수 있으니 **먼저 grep으로 정의처를 재확인**할 것:
```
rg -n "kstToday" app components lib
```
- 정의(함수/화살표 선언)가 **위 2곳 외에 더 있으면** 손대기 전에 멈추고 알려줄 것.
- **사용처(호출)**는 여러 곳일 수 있음 — 사용처는 import만 바꾸면 되므로 그대로 진행.
- 참고: `kstYm`(월 판정)·`ymd`·`daysSince` 등 **다른 날짜 헬퍼는 이번 스펙 범위 밖**(리포트 §8/조치 11번, 나중). 이번엔 `kstToday`만 옮긴다. `lib/date.js`가 그 헬퍼들의 미래 이사지가 되도록 파일만 열어둔다.

### A-1. 새 파일 `lib/date.js` 생성
> **`git add lib/date.js` 먼저 안내.**

```js
// KST(UTC+9) 날짜 헬퍼 단일 출처.
// 주의: 브라우저에서 호출되는 클라 컴포넌트 전용 헬퍼다(new Date = 클라 로컬시각 기준 UTC).
//       서버 라우트에서 "오늘"이 필요하면 요청시각 기준이 되므로 이 파일에 서버용을 따로 두기 전엔 쓰지 말 것.
// (향후: kstYm·daysSince 등 흩어진 날짜 헬퍼를 여기로 모은다 — 리포트 §8. 이번엔 kstToday만.)

// KST 오늘 'YYYY-MM-DD'. UTC 시각에 +9h 한 뒤 ISO의 날짜부만 취함.
export function kstToday() {
  return new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
```
- **계산식은 기존과 한 글자도 다르지 않게 유지**(회귀 방지). 리팩터일 뿐 알고리즘 변경 금지.

### A-2. `components/views/PtInbodyTab.jsx` — 로컬 정의 제거 + import

**제거** (아래 주석+함수 블록 통째):
```js
// KST(UTC+9) 오늘 YYYY-MM-DD. new Date는 클라 컴포넌트라 허용(순수 모듈 아님).
function kstToday() {
  return new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
```

**추가** — 파일 상단 import 묶음의 마지막 프로젝트 import(`import { INBODY_FIELDS } from "@/lib/labels";`) **바로 아래**에 한 줄:
```js
import { kstToday } from "@/lib/date";
```
- 호출부(`kstToday()` 사용하는 곳)는 **그대로 둔다**. 이름·시그니처 동일하므로 무변.

### A-3. `components/views/RefundMember.jsx` — 로컬 정의 제거 + import

**제거**:
```js
// KST 오늘 'YYYY-MM-DD'(처리월 판정은 P3a kstYm과 일관).
const kstToday = () => new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
```

**추가** — 기존 마지막 프로젝트 import(`import { won } from "@/lib/format";`) **바로 아래**:
```js
import { kstToday } from "@/lib/date";
```
- 원래 주석의 정보("처리월 판정은 P3a kstYm과 일관")는 유실돼도 무방(kstYm은 여전히 별개). 호출부 무변.

### A 검증
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- **동작 회귀 없음** 확인: 인바디 저장(측정일 자동 = 오늘), 환불 처리(`refunded_at`/처리월)가 **이전과 같은 날짜 문자열**을 쓰는지. 두 헬퍼가 원래 동일 출력이었으므로 정상이면 아무 변화가 보이지 않아야 한다(그게 성공 기준).

---

## B. `SetsEditor` 드롭다운 open-상태가 **위치기반** → 행 삭제 시 엉뚱한 행 열림

### 원인 (확정)
`components/views/SetsEditor.jsx`
- 종목 리스트를 **index key**로 렌더: `list.map((ex, exIdx) => <div key={exIdx}>...`
- 각 행의 드롭다운 열림 상태(`open`)를 자식 `ExerciseNameInput`의 **내부 useState**로 보관.
- index key라 행 삭제 시 React가 **인스턴스를 위치 기준으로 재사용**한다. 예: 3행 [A,B,C]에서 A(0번) 삭제 → 데이터는 [B,C]로 밀리는데, 0·1번 인스턴스는 살아남아 **이전 open 상태를 그대로 들고** 새 데이터를 표시. 결과적으로 **열려있던 드롭다운이 다른 종목 행에 붙어 보인다.**

> 이 버그는 이번 세션에 대수 본인이 만든 것으로 표시돼 있었음. 스펙은 내가 쓰되, 커밋은 평소대로 대수가 직접.

### 수정 방침: `open` 상태를 부모(`SetsEditor`)로 승격 (단일 openIdx)
- 드롭다운은 **한 번에 하나만** 열리는 게 자연스럽다 → 부모에 `openIdx`(열린 종목 index) 하나만 둔다.
- `ExerciseNameInput`은 `open`/`onOpenChange`를 **props로 받는 제어형**으로 전환(내부 open 상태 삭제).
- 종목 삭제 시 `openIdx`를 **null로 리셋** → 위치가 밀려도 잘못 열리지 않음.
- payload 무변(순수 뷰상태). 파일 헤더 주석의 "순수 UI(데모·키 무관)" 성격 유지.

### B-1. `ExerciseNameInput` — 내부 open 상태 제거, 제어형 전환

**시그니처 변경** — `open`, `onOpenChange` 추가:
```js
function ExerciseNameInput({ value, options, onChange, disabled }) {
```
→
```js
function ExerciseNameInput({ value, options, onChange, disabled, open, onOpenChange }) {
```

**내부 상태 삭제** — 이 줄 제거:
```js
  const [open, setOpen] = useState(false);
```
(→ `open`은 이제 prop. `wrapRef`는 그대로 둔다.)

**바깥클릭 useEffect** — `setOpen(false)` → `onOpenChange(false)`:
```js
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
```
→
```js
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false); };
```
- effect 의존성 배열 `[open]`은 **그대로** 유지.

**input onFocus** — `setOpen(true)` → `onOpenChange(true)`:
```js
        onFocus={() => setOpen(true)}
```
→
```js
        onFocus={() => onOpenChange(true)}
```

**쉐브론 토글 버튼** — `setOpen((v) => !v)` → `onOpenChange(!open)`:
```js
          onClick={() => setOpen((v) => !v)}
```
→
```js
          onClick={() => onOpenChange(!open)}
```

**옵션 선택 onClick** — `setOpen(false)` → `onOpenChange(false)`:
```js
                onClick={() => { onChange(o); setOpen(false); }}
```
→
```js
                onClick={() => { onChange(o); onOpenChange(false); }}
```
- 나머지(필터·렌더·`{open && filtered.length > 0 && ...}` 조건)는 그대로. `open`이 prop이 됐을 뿐.
- `useState` import는 부모에서 계속 쓰므로 파일에서 제거하지 말 것(상단 `import { useEffect, useRef, useState } from "react";` 유지).

### B-2. `SetsEditor`(부모) — openIdx 상태 추가 + 삭제 시 리셋 + prop 전달

**컴포넌트 본문 최상단**(`const list = Array.isArray(value) ? value : [];` 바로 위 또는 아래)에 상태 추가:
```js
  const [openIdx, setOpenIdx] = useState(null); // 열린 종목 드롭다운(위치 아닌 부모 소유). 한 번에 하나.
```

**removeExercise** — 삭제 전 드롭다운 닫기:
```js
  const removeExercise = (exIdx) => onChange(list.filter((_, i) => i !== exIdx));
```
→
```js
  const removeExercise = (exIdx) => { setOpenIdx(null); onChange(list.filter((_, i) => i !== exIdx)); };
```

**`<ExerciseNameInput ... />` 호출** — `open`/`onOpenChange` 전달:
```js
            <ExerciseNameInput
              value={ex.exercise}
              options={machineOptions}
              onChange={(name) => setExName(exIdx, name)}
              disabled={disabled}
            />
```
→
```js
            <ExerciseNameInput
              value={ex.exercise}
              options={machineOptions}
              onChange={(name) => setExName(exIdx, name)}
              disabled={disabled}
              open={openIdx === exIdx}
              onOpenChange={(v) => setOpenIdx(v ? exIdx : null)}
            />
```
- `key={exIdx}`(index key)는 **그대로 둬도 됨** — open 상태가 더 이상 자식 내부에 없으므로 index 재사용 버그가 사라진다. (안정 uid 도입은 payload/부모 로직 건드려 과함 → 이번엔 안 함.)

### B 검증 (스모크)
1. 종목 3개 추가 → 2번째 행 드롭다운 열기 → **1번째 행 삭제**. 열린 드롭다운이 **다른 행으로 옮겨붙지 않아야** 함(삭제와 함께 닫힘).
2. 드롭다운 열고 바깥 클릭 → 닫힘. 쉐브론 토글 → 열림/닫힘. 옵션 선택 → 값 채워지고 닫힘.
3. 손입력/음성 자동채움/세트 추가·삭제 등 **기존 입력 동작 무변**. 저장 payload(`cleanStructured` 결과) 무변.
4. `npm.cmd run build` / `npm.cmd run lint` 초록.

---

## 범위 밖(이번 스펙 안 함, 기록만)
- `ObservationTab`의 movements도 삭제 가능한 index-key 리스트라 유사 위험(리포트 §7). 단, 거기엔 종목명 드롭다운(open 상태)이 없으면 체감 버그는 아닐 수 있음 → **별도 확인 후 필요 시 다음 큐**로.
- 다른 날짜 헬퍼(`kstYm`·`ymd`·`daysSince`·`fmtDay`·`todayStr`·`fmtDate`) `lib/date.js` 통합 — 리포트 조치 11번(나중).

## 커밋 제안(대수가 직접)
- A: `git add lib/date.js` → `refactor(date): kstToday 단일 출처 lib/date.js로 통합(동작 불변)`
- B: `fix(SetsEditor): 종목 드롭다운 open 상태 부모 승격 — 행 삭제 시 오열림 방지`
- (원하면 한 커밋으로 묶어도 무방. 둘 다 additive/무회귀.)
