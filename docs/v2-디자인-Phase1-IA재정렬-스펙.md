# v2 디자인 Phase 1 — IA 재정렬 + "오늘" 통합 (클로드코드 실행 스펙)

> 역할·흐름: 웹Claude(이 스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음) · lint=`npm.cmd run lint` · 폰=Vercel 하드리프레시.
> 근거: `pt-navigator-IA.html`(시안 확정) · `v2-핸드오프-공지+디자인.md §C·§1.1` · `v2-디자인-감사-폴리시.md`.

---

## 0. 목표 · 범위 · 원칙

**목표:** 상단 탭을 "나 중심 3탭 고정 + 회원 여정 묶음"으로 재정렬하고, 스케줄·할일을 **"오늘" 한 탭**으로 합쳐 하루의 시작점을 하나로 만든다.

**확정 결정(트레이너):**
- "오늘" = **스택** — 스케줄 보드 위 → 오늘 할일(재접근·미처리예약·메모) 아래, 한 스크롤.
- OT 탭 라벨 = **여정형 개명** — `1차 OT`→`1차 지원`, `1차 피드백`→`관찰 기록`, `2차 OT`→`2차 브리핑`.

**범위(이번 커밋):** `app/page.jsx` **한 파일**. `TABS` 배열·라벨·nav 렌더(구분선+색)·메인 스위치("오늘" 스택)만. **컴포넌트 내부(ScheduleBoard·TodoTab·MemberViewShell·각 OT/PT 탭)는 무수정.** = 구조 변경 없음, 회귀 낮음.

**원칙:** 글로벌 3탭(오늘·회원·내실적)은 **위치 절대 불변**(근육기억). 회원 워크플로우 탭은 그 오른쪽에 구분선+색으로 묶어 붙는다.

---

## 1. 착수 전 필수 사전점검 (grep — 이거 먼저)

"오늘" 통합으로 **할일 단독 탭(id 13)이 사라진다.** 어딘가에서 `setTab(13)`(할일로 보내기)이나 `tab === 13` / `tab===13`을 참조하면 죽은 링크가 된다. 착수 전에 확인:

```powershell
# PowerShell (grep 없음 → Select-String)
Select-String -Path .\app\*.jsx,.\components\**\*.jsx -Pattern 'setTab\(\s*13\s*\)','tab\s*===\s*13','\bid:\s*13\b'
Select-String -Path .\app\*.jsx,.\components\**\*.jsx -Pattern 'setTab\(\s*9\s*\)','tab\s*===\s*9'
```

- **id 13 참조가 page.jsx 밖(위젯·ScheduleBoard·TodoTab 등)에 있으면** → 그 지점을 `setTab(9)`(=오늘)로 바꿔 리다이렉트. 발견 결과를 diff에 같이 보고할 것.
- id 9는 그대로 "오늘"로 **재사용**(아래 참조)이라 `setTab(9)`/`tab===9`는 유지돼도 무해.
- 발견 0건이면 그대로 진행.

---

## 2. `TABS` 배열 교체 (page.jsx 77~88)

`id`는 **기존 값 재사용**(회귀 최소): `9`=스케줄이었으나 이제 "오늘"로 재라벨(할일 흡수), `13`은 탭에서 **제거**. 순서만 여정형으로 재배열, `group` 메타 신설.

**BEFORE**
```jsx
const TABS = [
  { id: 9, label: "스케줄", always: true },
  { id: 13, label: "할일", always: true },
  { id: 0, label: "회원", always: true },
  { id: 10, label: "운동일지", pt: true },
  { id: 11, label: "재등록", pt: true },
  { id: 12, label: "인바디", pt: true },
  { id: 1, label: "1차 OT", ot: true },
  { id: 5, label: "1차 피드백", ot: true },
  { id: 2, label: "2차 OT", ot: true },
  { id: 8, label: "내 실적", always: true },
];
```

**AFTER**
```jsx
/* ---- 탭 메타 ----
   글로벌 3탭(오늘·회원·내실적)은 왼쪽 고정·위치 불변(근육기억).
   회원 워크플로우 탭은 view(ot/pt)에 따라 그 오른쪽에 묶여 붙는다(group=색·구분선).
   id는 기존 값 재사용: 9=오늘(옛 스케줄, 할일 흡수)·13(옛 할일 단독)은 폐지. */
const TABS = [
  { id: 9,  label: "오늘",     always: true },              // 스케줄 보드 + 오늘 할일 스택
  { id: 0,  label: "회원",     always: true },
  { id: 8,  label: "내 실적",  always: true },
  { id: 1,  label: "1차 지원", ot: true, group: "ot" },      // FirstOTTab
  { id: 5,  label: "관찰 기록", ot: true, group: "ot" },      // ObservationTab (옛 '1차 피드백')
  { id: 2,  label: "2차 브리핑", ot: true, group: "ot" },     // SecondOTTab
  { id: 10, label: "운동일지", pt: true, group: "pt" },
  { id: 12, label: "인바디",   pt: true, group: "pt" },
  { id: 11, label: "재등록",   pt: true, group: "pt" },
];
```

- 렌더 결과(OT 회원): `오늘 · 회원 · 내 실적 ‖ 1차 지원 · 관찰 기록 · 2차 브리핑`
- 렌더 결과(PT 회원): `오늘 · 회원 · 내 실적 ‖ 운동일지 · 인바디 · 재등록`
- (`‖` = 구분선. PT 순서는 운동일지→인바디→재등록으로 바뀜: 기존 재등록·인바디 위치 스왑.)

---

## 3. 그룹 색 토큰 추가 (C 토큰 근처, 77~88 위 또는 C 객체 뒤)

라이트 테마 기준. OT=amber, PT=sky(IA 시안 색과 동일: amber-600 `#d97706` · sky-600 `#0284c7`). **purge-safe = 정적 문자열 리터럴만**(동적 조합 금지).

```jsx
/* 회원 워크플로우 탭 그룹 색(purge-safe · 정적) — OT=amber, PT=sky */
const GROUP_TAB = {
  ot: { active: "text-amber-600", idle: "text-amber-700/60 hover:text-amber-700", bar: "bg-amber-500" },
  pt: { active: "text-sky-600",   idle: "text-sky-700/60 hover:text-sky-700",     bar: "bg-sky-500" },
};
```

---

## 4. nav 렌더 교체 — 구분선 + 그룹 색 (page.jsx 733~747)

글로벌 탭은 기존 primary(초록) 강조 유지. 회원 그룹 탭은 그룹 색으로 강조하고, **글로벌↔회원그룹 경계에 세로 구분선** 1개.

**BEFORE**
```jsx
{/* 탭 네비게이션 — 상시(스케줄·회원) + OT 뷰에서만 OT 탭 노출(§7) */}
<nav className="-mb-px flex gap-1 overflow-x-auto whitespace-nowrap">
  {TABS.filter((t) => t.always || (t.ot && view === "ot") || (t.pt && view === "pt")).map((t) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${
        tab === t.id ? "text-primary-strong" : "text-muted hover:text-ink"
      }`}
    >
      {t.label}
      {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
    </button>
  ))}
</nav>
```

**AFTER**
```jsx
{/* 탭 네비 — 글로벌 3탭(초록·위치고정) ‖ 회원 워크플로우 그룹(OT amber / PT sky).
   글로벌↔회원그룹 경계에 세로 구분선 1개. */}
<nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
  {TABS
    .filter((t) => t.always || (t.ot && view === "ot") || (t.pt && view === "pt"))
    .map((t, i, arr) => {
      const active = tab === t.id;
      const g = t.group ? GROUP_TAB[t.group] : null;
      // 앞 탭은 글로벌인데 이 탭이 첫 회원그룹 탭이면 그 앞에 구분선.
      const showSep = !!t.group && (i === 0 || !arr[i - 1].group);
      return (
        <div key={t.id} className="flex items-stretch">
          {showSep && <span aria-hidden className="mx-1.5 my-2 w-px shrink-0 self-stretch bg-line" />}
          <button
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${
              active
                ? (g ? g.active : "text-primary-strong")
                : (g ? g.idle : "text-muted hover:text-ink")
            }`}
          >
            {t.label}
            {active && (
              <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${g ? g.bar : "bg-primary"}`} />
            )}
          </button>
        </div>
      );
    })}
</nav>
```

노트: `flex items-stretch` + 구분선 `self-stretch`로 세로선이 탭 높이만큼 참. 회원 그룹 탭은 비활성에도 옅은 그룹색(`idle`)이라 "묶음"이 색으로 읽힘.

---

## 5. "오늘" 스택 — 메인 스위치 교체 (page.jsx 760~772)

id 9를 "오늘"로 재사용: 스케줄 보드 + 할일을 **한 스크롤에 스택.** id 13 분기 **삭제**.

**BEFORE**
```jsx
{tab === 9 ? (
  <div className="tab-anim"><ScheduleBoard members={members} /></div>
) : tab === 13 ? (
  <div className="tab-anim">
    <TodoTab
      members={members}
      uid={myUid}
      onSelect={(id, toTab) => { setSelectedId(id); setTab(toTab ?? 1); }}
    />
  </div>
) : tab === 8 ? (
  <div className="tab-anim"><MyStats members={members} /></div>
) : (
```

**AFTER**
```jsx
{tab === 9 ? (
  <div className="tab-anim space-y-8">
    <ScheduleBoard members={members} />
    <div className="border-t border-line" />
    <TodoTab
      members={members}
      uid={myUid}
      onSelect={(id, toTab) => { setSelectedId(id); setTab(toTab ?? 1); }}
    />
  </div>
) : tab === 8 ? (
  <div className="tab-anim"><MyStats members={members} /></div>
) : (
```

**섹션 헤더 판단(클로드코드가 컴포넌트 확인 후):**
- `ScheduleBoard`·`TodoTab`이 **각자 최상단에 제목/헤더를 이미 갖고 있으면** 위 스택(구분선만)으로 충분.
- 둘 중 **자체 제목이 없는 쪽**이 있으면, 그 컴포넌트를 `Eyebrow`(이미 import됨)로 감싸 얹을 것 — 예: 스케줄 위 `<Eyebrow>오늘 스케줄</Eyebrow>`, 할일 위 `<Eyebrow>할 일</Eyebrow>`. 두 섹션 경계가 스크롤에서 명확해야 함(현장=폰).
- 어느 쪽이든 컴포넌트 **내부 로직은 건드리지 말 것**(래핑만).

**기타 확인:**
- `useState(9)`(540행) = 기본 탭 "오늘". **변경 없음**(9 재사용이라 그대로 오늘로 열림).
- 교차전환 effect(600~604): tab 1/2/5/10/11/12만 참조 → **영향 없음**(그대로 둠).
- `MemberViewShell`이 PT 탭(10/12/11)을 `tab` prop으로 내부 렌더 → id 불변이라 **무수정**.

---

## 6. 완료 기준 (검증)

**lint:** `npm.cmd run lint` 통과.

**폰 왕복(Vercel 하드리프레시):**
1. 앱 열면 **"오늘"** 탭 기본 — 스케줄 보드 위, 그 아래 구분선, 오늘 할일(재접근·미처리예약·메모)이 한 스크롤에.
2. 상단 탭 왼쪽이 항상 **오늘 · 회원 · 내 실적** 3개 고정(회원 선택·전환해도 이 3개 위치 불변).
3. **OT 회원** 선택 → 구분선 뒤 **1차 지원 · 관찰 기록 · 2차 브리핑**(amber). 각 탭 클릭 시 해당 화면(옛 1차OT·관찰·2차OT)이 그대로 뜸.
4. **PT 회원** 선택 → 구분선 뒤 **운동일지 · 인바디 · 재등록**(sky).
5. 활성 탭 밑줄 색: 글로벌=초록, OT=amber, PT=sky. 구분선은 글로벌↔회원그룹 사이에 1개.
6. 옛 "할일" 단독 탭이 사라졌는데 **어디서도 빈 화면/죽은 버튼 없음**(§1 grep 리다이렉트 확인).
7. TodoTab에서 회원 클릭 → 해당 회원 선택 + OT면 1차 지원, PT면 운동일지로 정상 이동(교차전환 effect 보정).

**회귀 감시:** 각 탭 내용물은 이전과 동일해야 함(래핑·라벨·순서만 바뀜, 내부 무수정).

---

## 7. 커밋 제안

한 덩어리(응집): `feat(ia): Phase 1 탭 재정렬 + '오늘' 통합(스케줄+할일)`.
- `git add app/page.jsx` (+ §1 grep에서 리다이렉트 고친 파일 있으면 그 파일도).
- lint 통과 후 커밋 → `git show --stat HEAD`.
- 폰 확인 후, 검토는 웹Claude로.

**다음(별도):** 폴리시 P0 5개(트레이너 이름 표기 → 이름폴백 → 빈값 → 금액자간 → 스케줄 모바일) · 감사 2라운드(폰 스크린샷) · 이후 디자인시스템 B(ui 추출).
