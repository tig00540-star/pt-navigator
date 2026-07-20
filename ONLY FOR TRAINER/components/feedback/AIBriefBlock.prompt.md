# AIBriefBlock — 빌드 명세 (2단계 재작성 기준)

> 구현은 앱의 Tailwind로. 이 문서는 **크기·상태·규칙의 기준**이고, 값은 앱의 기존 토큰 이름에 매핑해서 씁니다.
> 계약(props)은 `AIBriefBlock.d.ts`가 정본. 인라인-스타일 레퍼런스 구현은 `AIBriefBlock.jsx`(목업용, 이식 금지).

AI 사전무장/브리핑 블록. 제품의 심장이자 **PRD 리스크 1순위(AI 45초 빈 화면)를 구조로 해결하는 컴포넌트**. T-03(1차 사전무장)·T-05(2차 당위성)·T-08(재등록)에서 재사용.

## 상태 (status) — 5종

| status | 언제 | 화면 |
|---|---|---|
| `idle` | 아직 생성 전 | 설명 문구 + `브리핑 생성` 버튼 |
| `loading` | 생성 중 (실측 45초~1분) | **스피너 + 무한 진행바 + 대기 안내** (필수) |
| `ready` | 캐시된 결과 있음 | 헤더에 `재생성`, 본문에 브리핑 |
| `stale` | 1차 관찰이 바뀜 | 헤더에 `기록 변경됨 · 재생성 권장` 뱃지(amber) + 본문 유지 |
| `demo` | 키 미설정/실패 폴백 | `데모` 뱃지(neutral) + 본문. 음성일지는 이 폴백 금지 |

**loading은 절대 빈 화면이면 안 됩니다.** 진행 표시 + `waitingHint`("약 45초 걸립니다. 들어가기 전에 …를 훑어보세요")를 반드시 노출. 이게 이 컴포넌트의 존재 이유.

## 구조 · 치수

```
┌─ container ────────────────────────────────┐  border 1px line, border-left 3px red
│  [✦ sparkles 18px] 제목 15px/700   [뱃지] [재생성]│  radius 14px, shadow-card, padding 18/20/20
│  ─────────────────────────────────────────  │  header→body 간격 14px (idle/loading은 0)
│  본문 (상태별)                                │  body 요소 간격 14px
└────────────────────────────────────────────┘
```

- **컨테이너**: `bg-card` · `border line` · **`border-left: 3px red`**(고정, 상태 무관) · `radius-card`(14px) · `shadow-card` · padding `18px 20px 20px`.
  - `stale`일 때만 바깥 테두리 색을 `ot`(amber)로. 좌측 3px는 항상 red.
- **헤더**: sparkles 아이콘(18px, red) + 제목(15px / 700 / −.03em / ink) + (뱃지) + 우측 `재생성`(ghost sm, `refresh-cw`). `ready`/`stale`/`demo`에서만 재생성 노출.
- **idle 본문**: 설명 14px/sub/1.6 + `브리핑 생성`(primary, `sparkles`). 상단 간격 14px.
- **loading 본문**: `loader-circle` 18px red 회전 + "브리핑 생성 중…" 14px/600. 아래 무한 진행바(높이 6px, `bg-sunken` 트랙, red 인디케이터 40% 폭 좌→우 반복). 아래 `waitingHint` 13px/muted/1.6.
- **ready/stale/demo 본문**: `children`을 세로 14px 간격으로. 각 항목은 라벨(ink/700) + 내용(sub).

## 색 — 역할 (앱 토큰 이름 유지)

| 쓰임 | 역할값 | 앱 토큰 매핑 |
|---|---|---|
| 좌측 강조선 · sparkles · 스피너 · 진행바 | Brand Red `#dc2626` | `--color-primary` |
| 제목 · 본문 라벨 | Ink `#13151b` | `--color-ink` |
| 본문 내용 | Sub `#475569` | `--color-sub` |
| 대기 안내 | Muted `#5b6675` | `--color-muted` |
| stale 뱃지 · 테두리 | amber | 2단계에서 역할색 토큰화 (현재 `text-amber-700`/`bg-amber-50` 계열) |
| 트랙 배경 | Sunken `#e8eaf0` | `--color-elevate` |

## Tailwind 재작성 노트 (인라인 스타일의 한계를 여기서 회복)

- **애니메이션은 Tailwind/CSS로** — 인라인 `@keyframes` 대신 `animate-spin`(스피너), 무한 진행바는 `globals.css`에 keyframe 하나(`ot-indeterminate`) 추가 후 클래스로.
- **버튼/뱃지는 앱의 기존 컴포넌트 재사용** — DS Button을 import하지 말 것. 앱 Button/Badge에 `hover:`/`focus:`/`disabled:` 상태가 이미 있으니 그대로.
- **반응형** — 이 블록은 앱 뷰포트폭(모바일 우선)에서 단일 컬럼. 데스크톱 관리자 리포트에 넣을 때만 `sm:` 여백 확장. 인라인 구현엔 없던 부분이니 여기서 추가.
- **`prefers-reduced-motion`** — 스피너·진행바 정지, 대기 안내 텍스트는 유지(진행 사실은 텍스트로도 전달).

## Tailwind 스켈레톤 (참고)

```jsx
function AIBriefBlock({ status="ready", title="AI 사전무장", waitingHint, onGenerate, onRegenerate, children }) {
  const showRegen = ["ready","stale","demo"].includes(status);
  return (
    <section className={`rounded-[14px] border-l-[3px] border-l-primary bg-card p-5 pt-[18px] shadow-card
                         ${status==="stale" ? "border border-amber-500" : "border border-line"}`}>
      <header className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-[18px] text-primary" />
          <span className="text-[15px] font-bold tracking-[-.03em] text-ink">{title}</span>
          {status==="stale" && <Badge tone="amber">기록 변경됨 · 재생성 권장</Badge>}
          {status==="demo" && <Badge tone="neutral">데모</Badge>}
        </div>
        {showRegen && <Button variant="ghost" size="sm" icon="refresh-cw" onClick={onRegenerate}>재생성</Button>}
      </header>

      {status==="idle" && (
        <div className="flex flex-col items-start gap-3 pt-3.5">
          <p className="text-sm leading-relaxed text-sub">문진과 활성 패키지를 근거로 오프닝·클로징 대사와 거절 5종 방어를 만듭니다.</p>
          <Button icon="sparkles" onClick={onGenerate}>브리핑 생성</Button>
        </div>
      )}

      {status==="loading" && (
        <div className="pt-4">
          <div className="mb-3 flex items-center gap-2.5">
            <LoaderIcon className="size-[18px] animate-spin text-primary motion-reduce:animate-none" />
            <span className="text-sm font-semibold text-ink">브리핑 생성 중…</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-elevate">
            <div className="h-full w-2/5 rounded-full bg-primary animate-[ot-indeterminate_1.4s_ease-out_infinite] motion-reduce:animate-none motion-reduce:w-full" />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">{waitingHint}</p>
        </div>
      )}

      {showRegen && <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>}
    </section>
  );
}
```

```css
/* globals.css */
@keyframes ot-indeterminate { 0%{margin-left:-40%} 100%{margin-left:100%} }
```

---

# ⚠️ 앱 코드와 대조한 결과 (2026-07-21, Claude Code 추가)

> 위 명세는 규격으로서 유효하나, **스켈레톤을 그대로 붙이면 조용히 깨지는 곳이 3군데** 있다.
> 아래는 실제 `app/globals.css`·`components/ui/*`와 대조해 확인한 사항.

## ① `shadow-card` · `rounded-card` 유틸이 앱에 없다 → 그림자 없이 렌더됨

앱 `@theme`에는 **색 토큰만** 있고 radius·shadow·ease·duration 토큰이 없다.
`shadow-card`는 매칭되는 유틸이 없어 **아무 그림자도 안 나온다**(에러도 없음 = 조용한 실패).

**해결: 새 이름을 만들지 말고 Tailwind 기본값을 덮어쓴다.** 색에 적용한 정책("이름 유지, 값 교체")을 radius·shadow로 확장하면, 새 클래스 없이 기존 사용처가 전부 자동 반영된다.

| @theme에서 재정의 | DS 목표값 | 자동 반영되는 기존 사용처 |
|---|---|---|
| `--shadow-sm` | DS `--shadow-card` (2단) | **105곳** |
| `--radius-2xl` | 14px (DS 카드) | **108곳** |
| `--radius-xl` | 10px (DS 컨트롤) | **84곳** |
| `--radius-lg` | (검토) | 152곳 |

→ 스켈레톤의 `shadow-card`는 **`shadow-sm`으로**, `rounded-[14px]`는 **`rounded-2xl`로** 쓴다.

**이걸 안 하면**: AIBriefBlock만 DS의 깊은 2단 그림자를 쓰고 주변 카드 105곳은 얕은 1단이라, 새 컴포넌트만 혼자 붕 떠 보인다.

## ② 좌측 강조선 — 캐스케이드 충돌 위험

```
border-l-[3px] border-l-primary   +   border border-line
```
`border`(4면 width)와 `border-l-[3px]`(좌측 width)는 **둘 다 특이도 (0,1,0)** 이라 어느 쪽이 이기는지가 Tailwind의 출력 순서에 달렸다. 취약하다.

**대안 (택1)**
- `shadow-[inset_3px_0_0_0_var(--color-primary)]` — border와 아예 다른 속성이라 충돌 없음
- `before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary` (+ 컨테이너 `relative overflow-hidden`)

## ③ 무한 진행바 — `margin-left` 애니메이션은 매 프레임 레이아웃 재계산

`transform: translateX()`로 바꾼다. `overflow-hidden` 안이라 시각 결과는 동일하고 GPU 합성된다.
헬스장에서 저사양 폰으로 쓰는 앱이라 무시할 차이가 아니다.

```css
@keyframes ot-indeterminate { from{transform:translateX(-100%)} to{transform:translateX(350%)} }
```

## ④ `Badge tone="neutral"` — 앱 톤 목록 확인 필요

앱의 톤 셋(`components/ui/tone.js`)은 amber/zinc/rose/emerald 계열이다. `neutral`은 없으므로
**`zinc`로 매핑**하거나 톤 맵에 정적 리터럴 항목을 추가해야 한다.
(⚠️ 앱 규율: 색 클래스는 반드시 정적 문자열 리터럴 — 동적 조합 금지)

## 준수 확인된 것
- 스켈레톤의 삼항 연산자 안 클래스는 **정적 리터럴**이라 Tailwind purge 규율에 부합한다. ✅
