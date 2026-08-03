# v2 스펙 — dynamic import 지연로드(저위험) · SecondOTTab · ObservationTab · VoiceLogTab

> **목적:** 트레이너 앱 초기 번들 경량화. 화면에 안 보이는 무거운 탭 컴포넌트를 `next/dynamic`으로 지연로드 → 해당 탭 진입 시에만 청크 fetch. **로직·RLS·payload·화면 전부 불변**, 순수 로더 메커니즘만 변경(additive).
> **집 패턴:** `components/views/MemberViewShell.jsx`가 이미 `PTView`를 `next/dynamic({ ssr:false, loading })`로 검증. 그걸 그대로 미러.
> **배치:** 1커밋. 순수함수 0 → Node 검증 없음. 검증 = lint/build green + 수동 스모크.
> ⚠️ **mount-cache:** `app/page.jsx`는 재스테이징이 옛 바이트라 웹Claude 리뷰는 **대수 `git diff` 붙여넣기**로. `PtWorkoutTab.jsx`는 mount-cache 목록 아님(정상 스테이징).

---

## 배경 — 왜 이 3개인가

| 컴포넌트 | 크기 | 현재 위치 | 지연로드 이득 |
|---|---|---|---|
| `SecondOTTab` | ~54KB | `app/page.jsx` static import, `tab===2`("2차 OT 준비")만 렌더 | **초기 "/" 번들에서 제거 — 최대** |
| `ObservationTab` | ~27KB | `app/page.jsx` static import, `tab===5`("1차 피드백")만 렌더 | **초기 "/" 번들에서 제거 — 큼** |
| `VoiceLogTab` | ~21KB | `PtWorkoutTab.jsx` static import, `<details>`(자료남기기 record) 안 렌더 | PtWorkoutTab 청크(이미 lazy)에서 하위 청크로 분리 — 한계이득 |

- `SecondOTTab`·`ObservationTab`은 **초기 번들에 통째로** 들어있지만 OT 워크플로우 탭에서만 쓰임. OT 회원 선택 시 기본 진입 탭은 `tab===1`(`FirstOTTab`, **static 유지**)이라, 두 컴포넌트는 첫 진입에 필요 없음 → 지연로드해도 첫 진입 플래시 없음(탭 2/5로 전환할 때만 "불러오는 중…" 반짝).
- `VoiceLogTab`은 `PtWorkoutTab`이 이미 `PTView` dynamic 청크 안이라 초기 번들엔 없음. 쪼개면 자료남기기(record) 청크만 가벼워짐. 인계서 명시 대상이라 함께 처리.
- **범위 밖(의도적):** `FirstOTTab`(tab 1, OT 기본 진입 탭이라 플래시 유발) — static 유지.

---

## 변경 1 — `app/page.jsx` (SecondOTTab · ObservationTab)

### 1-1. `next/dynamic` import 추가

파일 상단 import 블록(예: `import { useEffect, useRef, useState } from "react";` 근처)에 추가:

```js
import dynamic from "next/dynamic";
```

### 1-2. static import 2줄 제거 → dynamic 선언으로 교체

**제거할 기존 import 2줄:**

```js
import ObservationTab from "@/components/tabs/ObservationTab";
import SecondOTTab from "@/components/tabs/SecondOTTab";
```

> ⚠️ `import FirstOTTab from "@/components/tabs/FirstOTTab";`는 **그대로 둔다**(범위 밖).

**모듈 스코프에 추가**(import 블록 아래, `DEMO_MEMBER` 등 기존 상수 선언 부근 — `export default function` 위 어디든 모듈 최상위):

```js
// 무게 위생 — OT 워크플로우 탭은 초기 "/" 번들에서 빼고 해당 탭 진입 시 청크 로드.
// MemberViewShell의 PTView 패턴과 동일(ssr:false + loading). page.jsx는 이미 "use client".
function TabLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-sub">
      불러오는 중…
    </div>
  );
}
const SecondOTTab = dynamic(() => import("@/components/tabs/SecondOTTab"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const ObservationTab = dynamic(() => import("@/components/tabs/ObservationTab"), {
  ssr: false,
  loading: () => <TabLoading />,
});
```

### 1-3. 호출부 — **변경 없음**

`tab === 2`의 `<SecondOTTab member={member} onClosingSaved={...} />`, `tab === 5`의 `<ObservationTab member={member} onClosingSaved={...} />` **그대로**. `dynamic()`이 반환하는 컴포넌트는 동일 props를 투명하게 전달 → 호출부 손대지 않음. `onClosingSaved` 콜백(→ `closingVersion` 증가 → `PtConfirmBanner` 재조회) 경로 불변.

---

## 변경 2 — `components/views/PtWorkoutTab.jsx` (VoiceLogTab)

### 2-1. `next/dynamic` import 추가

상단 import 블록(예: `import { useState, useEffect, useMemo } from "react";` 근처)에 추가:

```js
import dynamic from "next/dynamic";
```

### 2-2. static import 제거 → dynamic 선언으로 교체

**제거할 기존 import 1줄:**

```js
import VoiceLogTab from "@/components/tabs/VoiceLogTab";
```

**모듈 스코프에 추가**(import 블록 아래, `fmtDT`/`SOURCE_TONE` 등 기존 로컬 헬퍼·상수 부근 — `export default function PtWorkoutTab` 위 모듈 최상위):

```js
// 음성일지는 '자료남기기'(record)의 접이식 서브 UI라 지연로드(무게 위생). ssr:false — MediaRecorder 브라우저 전용.
const VoiceLogTab = dynamic(() => import("@/components/tabs/VoiceLogTab"), {
  ssr: false,
  loading: () => <div className="py-4 text-center text-xs text-sub">불러오는 중…</div>,
});
```

### 2-3. 호출부 — **변경 없음**

`<details>` 안의 `<VoiceLogTab member={member} onResult={handleVoiceResult} />` **그대로**. props·`onResult`(→ `handleVoiceResult`로 STT 결과 채움) 경로 불변.

> **참고(범위 밖 · 후속 후보):** `<details>`는 기본 접힘이지만 `VoiceLogTab`은 DOM에 렌더되므로 record-mode PtWorkoutTab **마운트 시** 청크가 fetch됨. "펼칠 때만 로드"로 더 미루려면 `<details onToggle>` open 상태 게이팅이 필요한데, 이는 **동작 변경**이라 이번 저위험 스코프에서 제외. 지금 변경만으로도 청크 분리 이득은 확보됨.

---

## 리스크·불변 확인

- **로직/RLS/payload 불변.** import 방식만 static→dynamic. 렌더 트리·props·콜백·상태 전부 동일.
- **`ssr:false` 정당성:** 두 파일 다 `"use client"`. 세 컴포넌트 다 클라 전용(SecondOT/Observation은 클라 훅·AI fetch, VoiceLog은 `MediaRecorder`). `MemberViewShell`이 동일 근거로 `ssr:false` 이미 사용.
- **로딩 플래시:** "2차 OT 준비"·"1차 피드백" 탭 **전환 시**에만 "불러오는 중…" 짧게. OT 회원 첫 진입(tab 1)엔 없음. 기존 `<div className="tab-anim">` 래퍼 안에서 플레이스홀더→본체 순으로 렌더(애니 유지). `Modal`은 포털(body)이라 `fixed`/포커스 이슈 무관.
- **eager 재-import 없음 확인:** 구현 전 `git grep -n "SecondOTTab\|ObservationTab\|VoiceLogTab" -- "*.jsx"`로 import 사이트가 (a) `app/page.jsx`의 SecondOT/Observation, (b) `PtWorkoutTab.jsx`의 VoiceLog **뿐**인지 확인. 다른 파일에서 또 static import하면 그 라우트 청크엔 그대로 남음(이번 목표는 "/" 초기 번들·PtWorkoutTab 청크라 무관하지만 사실 확인).

---

## 검증 (대수)

1. `npm.cmd run lint` — green.
2. `npm.cmd run build` — green. 빌드 출력의 **`/` First Load JS** 수치가 이전보다 감소했는지(가능하면 전/후 메모). SecondOT/Observation이 별도 청크로 분리됐는지.
3. **수동 스모크(폰/Vercel 배포본 하드리프레시):**
   - OT 회원 선택 → "1차 OT 준비"(즉시 렌더, 플래시 없음) → "2차 OT 준비"(로딩 반짝 후 정상, 2차 브리핑·클로징 저장 동작) → "1차 피드백"(로딩 반짝 후 정상, 클로징 저장 → PT 등록 확정 배너 갱신 확인).
   - PT 회원 선택 → "자료남기기" → "🎙 음성으로 채우기" 펼침 → VoiceLogTab 정상(녹음·STT·`onResult`로 본문 채움).
   - `.next` stale 의심 시 `rm -rf .next && npm run dev` 후 재확인.

---

## 커밋 (대수 · ⚠️ 스코프 add만)

```powershell
git add app/page.jsx components/views/PtWorkoutTab.jsx
git commit -m "perf(bundle): OT 탭·음성일지 지연로드(next/dynamic) — 초기 번들 경량화"
```

⚠️ **`git add -A`/`git commit -am` 금지** — working tree에 `/lp` AuthGate WIP + untracked docs 다수. 위 2파일만 스코프 add.
(선택) 이 스펙 문서 커밋 시 `git add docs/v2-스펙-dynamic-import-지연로드-저위험.md` 별도.

---

## CLAUDE.md 동기화 포인트 (다음 문서 반영 시)

- `app/page.jsx`: `SecondOTTab`·`ObservationTab`은 이제 `next/dynamic`(ssr:false) 지연로드. 기존 dynamic 대상은 `PTView`(MemberViewShell)뿐이었으나 OT 탭 2종 추가.
- `PtWorkoutTab.jsx`: `VoiceLogTab` 지연로드(자료남기기 record 청크 분리).
- 저위험 3종 중 **①dynamic import 완료** → 남은 저위험: 자가입력 저장 토스트 · memberStatus 리팩터(mount-cache라 git diff 리뷰).
