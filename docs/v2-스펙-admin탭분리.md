# v2 스펙 — admin 탭 분리 (Phase 1)

> 흐름: 웹Claude(스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 대상: **`app/admin/page.jsx` 단일 파일**. SQL 없음(순수 UI 리팩터). lint=`npm.cmd run lint`.

## 0. 원칙 — 최소 변경·최저 회귀
지금 한 페이지에 세로로 쌓인 8개 `<section className="mb-8">`을 **4탭으로 게이팅**. 핵심:
- **섹션 내용·위치·데이터 계산 전부 그대로.** 컴포넌트 본문의 파생값(aggregate·trainerPerf·closing 등)은 한 번 계산돼 공유되니 **손대지 않음.**
- 각 섹션을 `{atab === "<탭>" && (<section …>…</section>)}` 로 **감싸기만** 한다(물리적 이동 X). 숨은 섹션은 렌더 안 됨 → 활성 탭 섹션만 파일 순서대로 노출.
- 탭 네비는 **fuchsia accent**(admin 테마). 트레이너 앱 네비 미러.

## 1. 탭 구성 (4)
```jsx
const ATABS = [
  { id: "perf",    label: "실적" },
  { id: "qc",      label: "QC" },
  { id: "payroll", label: "급여" },
  { id: "ops",     label: "운영" },
];
```

### 섹션 → 탭 매핑 (주석 마커 기준)
| 섹션(주석 마커) | 탭 |
|---|---|
| `실데이터 요약 (④)` | `perf` |
| `트레이너별 실적 (④)` | `perf` |
| `KPI · 방향/사유 분포 (④)` (클로징·재등록 분석) | `perf` |
| `Trainer Activity & QC` (QC 모니터링) | `qc` |
| `급여 정책 설정 (페이롤 C1)` | `payroll` |
| `트레이너 초대 온보딩 (A)` | `ops` |
| `공지 (기능1)` | `ops` |
| `AI Marketing 카피봇` | `ops` |

> 파일 순서상 `ops`(초대·공지)가 맨 위, `perf`(요약·실적·분석)가 중간, `payroll`이 그 사이, `qc`·`마케팅`이 아래에 흩어져 있지만 — **게이팅만 하면 활성 탭의 섹션들이 파일 순서대로 자연히 모여 보임**(숨은 것은 collapse). 예: `ops` 활성 → 초대·공지·(중간 다 숨김)·마케팅 순으로 뜸. 이동 불필요.

## 2. 구현

### 2-1. state (컴포넌트 상단, 기존 useState 옆)
```jsx
const [atab, setAtab] = useState("perf");   // admin 섹션 탭
```

### 2-2. 탭 네비 — 스티키 헤더에 두 번째 줄로 추가(항상 보이게)
기존 `<header>`(sticky)의 **타이틀 flex 행 `</div>` 뒤, `</header>` 앞**에 네비 행 추가:
```jsx
{/* 섹션 탭 네비 (admin fuchsia) */}
<div className="mx-auto max-w-6xl px-4 sm:px-6">
  <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
    {ATABS.map((t) => {
      const active = atab === t.id;
      return (
        <button key={t.id} onClick={() => setAtab(t.id)}
          className={`relative px-4 py-2.5 text-xs font-semibold transition ${active ? "text-fuchsia-700" : "text-muted hover:text-ink"}`}>
          {t.label}
          {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-fuchsia-500" />}
        </button>
      );
    })}
  </nav>
</div>
```
> 헤더가 sticky라 탭도 상단 고정. `border-b`는 기존 header가 이미 가짐.

### 2-3. 각 섹션 게이팅
`<main>` 안 8개 `<section className="mb-8">`(및 카피봇의 `<section>`)을 각각 아래처럼 감싼다 — **여는 태그 앞에 `{atab === "<탭>" && (`, 닫는 `</section>` 뒤에 `)}`**:
```jsx
{/* ===== 실데이터 요약 (④) ===== */}
{atab === "perf" && (
  <section className="mb-8">
    … 기존 그대로 …
  </section>
)}
```
매핑대로 8곳 전부:
- `perf`: 실데이터 요약 · 트레이너별 실적 · 클로징/재등록 분석
- `qc`: QC 모니터링
- `payroll`: 급여 정책 설정
- `ops`: 트레이너 초대 · 공지 · AI 마케팅 카피봇

> ⚠️ 카피봇 섹션은 `<section>`(className 다를 수 있음 — 마지막 섹션) — 마커 `AI Marketing 카피봇` 기준으로 동일하게 `{atab === "ops" && ( … )}` 로 감쌈.

## 3. 엣지·검증
1. `npm.cmd run lint` — 게이팅만이라 미사용/신규 import 0(ATABS·atab·setAtab만 추가). JSX 균형(여는 `{... && (` ↔ 닫는 `)}`) 주의.
2. 폰: 헤더에 **실적·QC·급여·운영** 탭 뜨는지 · 탭마다 해당 섹션만 보이는지 · 데이터(매출·실적·QC 숫자) 그대로 나오는지(계산 공유라 값 불변).
3. 기본 탭 = `perf`(실적) — 원장이 제일 자주 보는 것. 필요 시 순서/기본 조정.
4. 회귀 주의: 섹션 내부는 **한 글자도 안 바뀜** — 오직 감싸기만. diff에서 섹션 본문 변경이 없어야 정상(들여쓰기 외).

## 4. 후속(선택)
- admin QC·카피봇 실데이터화는 별건(총정리 §5.3 백로그). 이번은 탭 분리만.
- 탭별 URL 해시(`#perf`) 딥링크는 나중에 원하면.
