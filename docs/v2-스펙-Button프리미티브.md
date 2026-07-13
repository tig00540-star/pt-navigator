# v2 스펙 — ⑦ Button 프리미티브 추출 (감사 P1-⑦)

> 역할·흐름: 웹Claude(이 스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 하드리프레시.
> 근거: `docs/v2-디자인-감사-폴리시.md` §2-7. 선행 완료: 즉효 묶음(muted 대비·C정리·헤더라벨·스케줄 일뷰).

---

## 0. 배경 · 스코프

감사 ⑦ "버튼 변주 정리": 지금 버튼이 파일마다 인라인이라 제각각. **앱 전수 조사(약 120개 `<button>`) 실측 파편화:**

- **트레이너 primary 그라데이션이 2종 혼용** — `from-lime-400 to-emerald-500`(14곳)와 `from-emerald-400 to-emerald-600`(13곳)가 같은 "CTA" 역할인데 섞여 쓰임.
- **danger 색 혼용** — `from-red-500 to-rose-600`와 `from-rose-500 to-rose-600`, `hover:text-red-600`와 `hover:border-rose-500/50` 혼재(감사 ⑥: 위험=rose로 고정).
- **패딩·radius·font 제각각** — `px-2.5~px-6`, `py-1.5~py-3`, `rounded-lg`/`rounded-xl`, `font-medium`/`semibold`/`bold` 애드혹.
- **원장(admin) CTA** — `from-fuchsia-500 to-purple-600`(게시 등)로 accent만 다르고 구조는 동일.

→ **`components/ui/Button.jsx` 단일 출처**로 `variant × accent × size`를 정적 맵으로 통일. 이후 4·5·회원앱이 버튼을 기본 상속.

### 스코프 IN (이 프리미티브로 교체)
- 실제 액션 버튼: CTA(등록·저장·완료·게시), 보조(취소·닫기 텍스트), 파괴적(삭제·환불·예약취소), 헤더 버튼.

### 스코프 OUT (이번엔 건드리지 않음 · 별도 관심사)
- **세그먼트/토글 pill**(`bg-primary-soft ... ring` 모드·세그먼트 스위치, 머신 칩 토글) → 후속 `Segmented`/`Toggle` 관심사.
- **아이콘 전용 어포던스**(닫기 `X`, chevron, 체크박스 사각형, 삭제 아이콘 `Trash2` 단독) → 정사각 패딩이라 Button 패딩과 안 맞음. 그대로 둠.
- **`<input>`/`<select>`/`<summary>`/`<details>`** — 버튼 아님.
- **프로그레스 바 채움**(`bg-gradient-to-r from-emerald-400...`) — 버튼 아님(절대 교체 금지).

> **원칙: 확신 없으면 남긴다.** 토글·아이콘단독은 이번 스코프 밖 — 애매하면 인라인 유지하고 다음 관심사로.

---

## 1. 컴포넌트 — `components/ui/Button.jsx` (신규)

**purge-safe 필수:** variant×accent×size가 **완성 클래스 문자열 정적 리터럴**이어야 Tailwind purge가 유지(동적 조립 금지 — `C`/`WIDGET_TONE` 컨벤션과 동일). 아래 코드는 그 규칙을 지킴.

```jsx
/* =========================================================================
   Button 프리미티브 — 앱 전역 버튼 단일 출처(감사 P1-⑦).
   purge-safe: variant×accent(×size) → 완성 클래스 정적 리터럴(동적 조립 금지 · C/WIDGET_TONE 컨벤션).
   현재 인라인 파편(lime↔emerald 혼용·red↔rose 혼용·패딩 제각각)을 이 맵으로 통일.
   base: inline-flex 중앙정렬 + 전환 + active:scale + disabled. 아이콘은 children으로(호출부가 lucide 넘김).
   as="a"로 링크 버튼(예: 헤더 '관리자'), fullWidth로 폼 CTA(w-full).
   ========================================================================= */

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-semibold transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none";

const SIZE = {
  sm: "rounded-lg px-3 py-1.5 text-xs",
  md: "rounded-xl px-4 py-2.5 text-sm",
};

// variant → 색. accent 있는 variant는 {trainer, owner}, 없는 것(danger)은 문자열.
const VARIANT = {
  primary: {
    trainer: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-zinc-950",
    owner:   "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white",
  },
  solid: {
    trainer: "bg-primary-soft text-primary-strong ring-1 ring-inset ring-primary/30",
    owner:   "bg-fuchsia-500/10 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-500/30",
  },
  ghost: {
    trainer: "border border-line bg-elevate text-sub hover:border-primary hover:text-primary-strong",
    owner:   "border border-line bg-elevate text-sub hover:border-fuchsia-500/60 hover:text-fuchsia-700",
  },
  danger: "bg-gradient-to-br from-rose-500 to-rose-600 text-white",
};

// 파괴적 '트리거'(삭제 유도 · 저강도) — 보더형. 확정 버튼은 variant="danger"(채움).
const DANGER_SUBTLE =
  "border border-line bg-card text-muted hover:border-rose-500/50 hover:text-rose-600";

export default function Button({
  variant = "ghost",
  accent = "trainer",   // "trainer"(초록) | "owner"(보라) — primary/solid/ghost에만 영향
  size = "md",          // "sm" | "md"
  subtle = false,       // variant="danger"일 때만: 채움(false) vs 보더 트리거(true)
  fullWidth = false,
  as = "button",        // "button" | "a"
  className = "",
  children,
  ...props
}) {
  const Tag = as;
  const v = VARIANT[variant] ?? VARIANT.ghost;
  const color =
    variant === "danger" && subtle
      ? DANGER_SUBTLE
      : (typeof v === "string" ? v : (v[accent] ?? v.trainer));
  const cls = `${BASE} ${SIZE[size] ?? SIZE.md} ${color}${fullWidth ? " w-full" : ""}${className ? " " + className : ""}`;
  return (
    <Tag className={cls} {...props}>
      {children}
    </Tag>
  );
}
```

### API 요약
| prop | 값 | 기본 | 용도 |
|---|---|---|---|
| `variant` | `primary`·`solid`·`ghost`·`danger` | `ghost` | 강조 단계 |
| `accent` | `trainer`·`owner` | `trainer` | 초록(트레이너)/보라(원장) — primary·solid·ghost |
| `size` | `sm`·`md` | `md` | sm=작은 버튼(text-xs), md=폼 CTA(text-sm) |
| `subtle` | boolean | `false` | danger 전용: true=보더 트리거, false=채움 확정 |
| `fullWidth` | boolean | `false` | 폼 CTA `w-full` |
| `as` | `button`·`a` | `button` | `a`면 링크(헤더 '관리자' 등) |
| `className` | string | `""` | 추가 클래스(gap 조정·특수 위치 등). 색/패딩 재정의는 지양 |

### 변주 매핑 (기존 인라인 → Button)
| 기존 인라인 패턴 | Button |
|---|---|
| `from-lime-400 to-emerald-500` · `from-emerald-400 to-emerald-600` (트레이너 CTA) | `variant="primary"` |
| `from-fuchsia-500 to-purple-600` (원장 CTA) | `variant="primary" accent="owner"` |
| `bg-primary-soft text-primary-strong ring...` (중강조 채움 · **토글 제외**) | `variant="solid"` |
| `border border-line bg-elevate ... hover:border-primary` (보조·취소) | `variant="ghost"` |
| `border border-line bg-card ... hover:border-rose-500/50 hover:text-rose-600` (삭제 유도) | `variant="danger" subtle` |
| `from-red-500 to-rose-600` · `from-rose-500 to-rose-600` (삭제·환불 확정) | `variant="danger"` |

> **의도된 정규화(회귀 아님):** 이 통일로 트레이너 CTA는 전부 `emerald→emerald` 한 종으로, danger는 전부 `rose`로, 패딩/radius/폰트는 size 토큰으로 수렴한다. lime→emerald였던 버튼은 emerald→emerald로 **미세하게 바뀌고**, font-bold였던 CTA는 semibold가 된다. **이건 감사가 요구한 통일 그 자체** — parity가 아니라 수렴이 목표. 레이아웃 깨짐만 없으면 OK.

---

## 2. 배치 롤아웃 (배치별 1커밋 · diff 검토 단위)

한 번에 120개를 바꾸면 diff가 커서 검토 불가 → **영역별 배치**로 쪼갠다. 각 배치 후 `npm.cmd run lint` → 폰 확인 → 커밋.

### 배치 0 — 프리미티브만 (교체 0)
- `components/ui/Button.jsx` 신규 생성만. 아직 아무 데도 안 씀 → 렌더 무변, lint green.
- 커밋: `feat(ui): Button 프리미티브 추가`

### 배치 1 — 트레이너 코어 (파편화 가장 심한 곳 · parity 검증대)
| 파일 | 버튼(대략) | 주 variant |
|---|---|---|
| `app/page.jsx` | 12 | primary(등록·저장·첫등록), ghost(신규등록·취소), `as="a"` owner ghost(관리자) |
| `components/views/TodoManual.jsx` | 5 | primary(추가), danger subtle/text(삭제) |
| `components/views/ScheduleBoard.jsx` | 13 | primary(완료·차감), ghost(차감안함), danger subtle(예약취소), **토글(주간/오늘)=제외** |

- 헤더 '관리자'(`<a href="/admin">`)는 `<Button as="a" variant="ghost" accent="owner" size="sm" href="/admin">`. 단 현재 fuchsia 보더/배경(`border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700`)이라 ghost owner(투명 배경+hover만 보라)와 결이 다름 → **이 한 건은 className으로 배경 유지하거나 인라인 유지**(스코프 OUT 판단 가능). 클로드코드가 애매하면 인라인 유지하고 보고.
- 커밋: `refactor(ui): 트레이너 코어 버튼 Button 이관`

### 배치 2 — 설정·트레이너 뷰
`TrainerLibrary`(7) · `TrainerGoalSetter`(1) · `TrainerProfileSettings`(3) · `PtPricingSettings`(6) · `PasswordChange`(1) · `SettingsView`. 주로 primary(저장·추가) + ghost(취소) + danger subtle(삭제). **프로필/머신 칩 토글은 제외.**
- 커밋: `refactor(ui): 설정·트레이너 뷰 버튼 이관`

### 배치 3 — PT/OT 탭
`PtWorkoutTab`(10) · `PtReRegTab`(3) · `PtInbodyTab`(4) · `PtConfirmBanner`(3) · `RefundMember`(3, danger 중심) · `ObservationTab`(4) · `SecondOTTab`(3) · `FirstOTTab`(1) · `FirstOTAssist`(1) · `VoiceLogTab`(3) · `RegBriefView` · `AcuteBriefView` · `MonthlyReport`(1) · `InactiveView`(1) · `PTView`(1). **재생성/저장=primary, 취소·재시도=ghost, 환불·삭제=danger.** 강도 판단 애매하면 ghost 기본.
- 커밋(원하면 PT/OT 둘로 더 쪼갬): `refactor(ui): PT/OT 탭 버튼 이관`

### 배치 4 — 원장(admin)
`app/admin/page.jsx`(2) · `AdminAnnouncements`(9) · `AdminPayrollSettings`(8) · `AddTrainerForm`(1) · `PayrollConfirm`(1) · `AuthGate`(2) · `AnnouncementGate`(2). **CTA는 `accent="owner"`**(게시·수정저장=primary owner), 보조=ghost owner, 삭제=danger. AuthGate 로그인 버튼은 primary(트레이너/원장 공용 화면이라 trainer accent 또는 중립 — 현행 색 보고 판단).
- 커밋: `refactor(ui): 원장 화면 버튼 이관`

> 배치 3은 파일이 많으니 **PT군 / OT·기타군 2커밋으로 더 쪼개도 좋음.** 검토 부담 기준으로 트레이너가 조절.

---

## 3. 마이그레이션 규칙 (클로드코드에게)

1. **아이콘은 children 그대로.** `<Button variant="primary" size="md" fullWidth><Check className="h-4 w-4"/> 완료</Button>` 식으로 lucide 아이콘+텍스트를 안에 넣는다. Button base가 `gap-1.5`라 기존 `gap-1`/`gap-2`는 대부분 흡수 — gap 차이가 눈에 띄면 `className="gap-2"`로만 조정.
2. **onClick·disabled·type·href·aria-* 등은 `...props`로 자동 전달.** 그대로 옮기면 됨.
3. **폭 처리:** 기존 `w-full`/`flex-1` 폼 버튼 → `fullWidth`(또는 `className="flex-1"` 유지). `flex w-full items-center justify-center`는 base가 이미 `inline-flex ... justify-center`라 중복 제거.
4. **크기 선택:** `text-xs`·`px-2.5/3 py-1.5`류 작은 버튼 → `size="sm"`. `text-sm`·`py-2.5` 폼 CTA → `size="md"`.
5. **danger 두 단계 구분:** 삭제를 *유도*하는 저강도 트리거(현재 `text-muted hover:text-rose-600` 또는 보더형) → `variant="danger" subtle`. 실제 *확정*(환불 실행·삭제 확정, 현재 rose 채움 text-white) → `variant="danger"`.
6. **토글/아이콘단독/인풋/summary는 절대 교체 금지**(스코프 OUT). 특히 ScheduleBoard 주간·오늘 토글, 세그먼트 pill, 닫기 `X`, 체크박스.
7. **판단 애매하면 인라인 유지 + git diff에 남겨 보고.** 억지 교체보다 안전.
8. **`import Button from "@/components/ui/Button";`** 각 파일 상단 추가.

---

## 4. 검증 (배치마다)

- [ ] `npm.cmd run lint` green(미사용 import·no-undef 없음).
- [ ] `git show --stat HEAD` — 해당 배치 파일만 변경.
- [ ] 폰(Vercel 하드리프레시): 그 배치 화면의 버튼이 **누를 수 있고**(onClick 살아있음), 색/강도 위계가 맞고, 레이아웃 안 깨짐.
- [ ] 특히 배치 1: 등록·저장·완료·취소·예약취소가 전부 동작, 스케줄 토글(제외분)이 멀쩡한지.
- [ ] purge 확인: 배치 후 빌드(`npm.cmd run build`)에서 버튼 색이 실제로 렌더되는지(정적 리터럴이라 정상이어야 함). dev에서 색 빠지면 클래스 조립이 동적이 된 것 → 맵 확인.

---

## 5. 다음(후속 스펙 예고)
- **⑧ 타이포 스케일 토큰**(display/title/label/body/num).
- **⑩ 섹션헤더 통일**(`page.jsx`·`MyStats` Eyebrow/인라인 → 공통 `SectionHeader`).
- **Segmented/Toggle 프리미티브**(이번 스코프에서 뺀 토글 pill 통일) — 필요 시.
