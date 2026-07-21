# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint (flat config, next/core-web-vitals)
```

There is **no test framework** configured — no test runner, no test files.

Node/React notes: Next.js **16** (App Router), React **19**, plain **JavaScript/JSX** (no TypeScript). Import alias `@/*` maps to the repo root (see `jsconfig.json`), e.g. `import { supabase } from "@/lib/supabaseClient"`.

## Architecture

A Korean-language fitness-trainer sales/CRM web app. Two routes, both client components:

- `app/page.jsx` — **trainer app**, a large `"use client"` file. Tabs come from the `TABS` array (~10 tabs): always-on 오늘 / 회원 / 내 실적 / 설정, plus grouped workflow tabs — OT(1차 OT 준비 · 1차 피드백 · 2차 OT 준비) and PT(회원자료 · 자료남기기 · 재등록 준비). Tabs are switched by local `tab` state, not routing. `MemberListTab` and the `MemberForm` modal are defined in the same file; the legacy `CRMTab` was **removed** (only a stale comment in `MemberViewShell.jsx` still names it). Member routing by status goes through `MemberViewShell` → `PTView`(dynamic import) / `InactiveView`. `FirstOTTab`, `VoiceLogTab`, `ObservationTab`, and `SecondOTTab` (now **member-aware** — takes the selected `member` prop and fetches its `ot_log`) are split into `components/tabs/`; `FirstOTTab` embeds `FirstOTAssist` (① AI block, now rendered through the shared `AIBriefBlock`); the legacy hardcoded 1차 scaffold was **retired in v2-S5**. Shared bits are extracted to lib/components: `fmt` (`lib/format.js`), `Eyebrow` (`components/ui/Eyebrow.jsx`), `Toast` + `useToast` (`components/ui/Toast.jsx`, `hooks/useToast.js`), label↔value maps (`lib/labels.js`, `labelOf`), and `otObsHash` (`lib/otHash.js`, brief-staleness hash). The v2 **design-system primitives** (`Card`/`ToneCard`/`Field`/`Modal`/`AIBriefBlock`/`BrandMark`/`Wordmark` …) live in `components/ui/` — see the "디자인 시스템 프리미티브" section below.
- `app/admin/page.jsx` — **admin dashboard** (매출 KPI, 트레이너 QC, 마케팅 카피봇). Linked to/from the trainer app via header buttons.
- **Server API routes** (Node runtime, keys server-only, never exposed to the client): `app/api/voice-log` (음성일지 STT `gpt-4o-mini-transcribe` + Claude 요약 **Sonnet** `claude-sonnet-5`) and `app/api/ot-brief` (OT AI — `phase:"first"` 1차 지원 **now Sonnet** (`claude-sonnet-5`; **1차는 Haiku에서 Sonnet으로 승급됨** — 코드에 남은 `haiku` 언급은 옛 JSON 방어 로직 주석일 뿐), `phase:"second"` 2차 브리핑 Sonnet). Both build the prompt server-side, parse the model's JSON defensively (strip code fences), and return an error status when keys are unset so the client can fall back to demo. AI 라우트 `maxDuration=180`(fluid compute 300s 내).

`docs/MASTERPLAN.md` is the authoritative product/design doc (roadmap, DB schema, real-vs-demo data map, v2 plan). **Read it before any substantial feature work** — it explains intent that the code alone doesn't.

### Supabase integration

`lib/supabaseClient.js` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`. **If keys are missing, `supabase` is exported as `null`** and the app runs in "demo mode" — every DB call site guards with `if (!supabase)` and falls back to hardcoded demo data (e.g. `DEMO_MEMBER`). Preserve this null-guard pattern when adding DB calls so the app still renders without keys.

Tables in use: `user_table` (members), `center_machine` (equipment options for the form), `daily_workout_log` (voice-log AI summaries), and `ot_log` — **1차 OT 관찰 기록** (`ObservationTab`, `ot_round=1`, one row per member; full data in jsonb `report`, with `goal_type` / `goal_identified` mirrored as top-level columns for filtering). 이후 증분으로 `session_log`(수업 기록)·`appointment`(예약)·`member_workout_log`(회원앱 자가입력 운동 로그 · **오운완 출석 집계의 원천** · `source<>'noshow'`로 노쇼 제외)·`trainer_reward`(오운완 포상 정의) 및 **오운완 집계 RPC 4개**(서버 집계 · 이름·정의는 `docs/migrations/2026-07-20-ounwan-reward.sql`)가 추가됨. 회원 read가 회원 RLS에 막히는 경로는 `SECURITY DEFINER` 헬퍼 경유(`ce3e81b`). ⚠️ **RLS is now fully locked and account-scoped (v2) — NOT the old anon-open prototype.** Every data table is gated by `auth_account_id()` (멀티테넌트 격리, 인증 세션 전제) with authenticated-only policies; AI/premium 기능은 구독 상태로 추가 게이트된다(`my_account_status().access`, `auth_account_plan()`; DDL 기록본 `docs/migrations/2026-07-16-b1*.sql`·`b2-*.sql`·`2026-07-08-step7*.sql`). **Do NOT add anon-open (`using(true)`) policies** — treat every table as access-controlled and write only under an authenticated, account-scoped session. Client writes follow the "교훈1 하드닝" 규율(아래 트러블슈팅).

### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고, 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 트레이너가 30초~1분에 훑어 외우고 폰을 주머니에 넣은 뒤 당당히 리드한다. 그러므로 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**여야 한다. 세일즈·운동 파트 모두 구체 대사를 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외** — 의료 안전 우선이라 기존 스파링·보수 톤 유지. 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: the **plumbing is real** (member register/list/select, clipboard copy, voice-log DB save) and most **content generation is still demo** (AI 성향 summaries, all sales scripts/routines/timelines, admin KPIs and trainer QC numbers). **Exception — v2 sprint 1:** the 음성일지 voice→AI pipeline is now **real** — actual mic capture (`MediaRecorder`) → OpenAI STT + Claude summary via the `app/api/voice-log` route (server-only `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; falls back to a hardcoded demo report if keys are unset or the call fails). **Exception — v2 sprint 3:** the 2차 OT tab (`SecondOTTab`) is now **real AI** — the selected member's 1차 관찰(`ot_log`) → `app/api/ot-brief` (Sonnet) yields 등록 당위성 브리핑 · 대화 arc · 클로징 4단계(enter/paint/land/hold) · 거절 대처, **cached** in the `ot_round=2` row's `report.brief` (regenerate button + `obsHash` staleness badge, no re-call on revisit). The 1차 OT `FirstOTAssist` block is real too (**Sonnet** — 1차도 Sonnet으로 승급, **not** cached — session-only). Both fall back to the existing hardcoded demo (explicitly labeled "데모") when keys are unset. In the round-2 row, the brief cache (`report`) and the 2차 클로징 결과 (`closing_*` columns) **coexist** — each writer updates only its own fields, never `report`-replacing away the other. **Exception — 오운완(2026-07-20):** 회원앱 오운완(오늘 운동 완료) 카드·트레이너 랭킹·포상 진행률은 **real** — `member_workout_log` 출석을 **서버 RPC로 집계**(누적·연속·랭킹). ⚠️ **클라에서 계산하지 말 것**(드리프트·max-rows). 포상 정의(`trainer_reward`)는 설정→포상 서브탭에서 트레이너가 CRUD. When editing, keep real and fake clearly separated and labeled — do not wire demo numbers into paths that look like live data.

### UI conventions

- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme`). **Light theme** — brand **red** `--color-primary #dc2626` on a light-gray base `--color-bg #f1f2f6`. **토큰 값은 「오직 트레이너 Design System」 기준(2026-07-21 적용) — 이름은 앱 것을 유지하고 값만 DS로 교체**(유틸 1,962곳이 안 바뀌고 자동 반영). 코어 토큰 `bg / card / elevate / line / line-strong / ink / sub / muted / primary / primary-strong / primary-soft`. **역할 색(업무흐름 구분 · 브랜드색 아님 · 로고/CTA 금지)** `--color-ot(-text/-soft)` / `--color-pt(-text/-soft)` / `--color-admin(-text/-soft)` / `--color-danger(-text)` — 밝은 배경 위 글자는 반드시 `-text`(채움 색은 대비 미달). 라운드·그림자도 같은 정책(이름 유지·값만 DS): `--radius-lg 10px`(컨트롤)·`--radius-2xl 14px`(카드)·`--shadow-sm`(카드 2단)·`--shadow-pop`(모달 전용). 한글 라벨 자간 `--tracking-label-ko 0.02em`(라틴 라벨은 `+.16em uppercase`, 한글은 무효라 예외). keyframes: `tabIn`(탭 진입·enter-only)·`ot-indeterminate`(AI 무한 진행바)·`ot-sheet`(모달 바텀시트). Workflow tab groups are colored via `GROUP_TAB` (OT=`amber`, PT=`sky`); the admin dashboard uses `fuchsia`.
- Color classes must be **static string literals** so Tailwind's purge keeps them — never assemble class strings dynamically from arbitrary values (현재 위반 0건 · 유지할 것). Reusable tone sets live in **static maps**: `WIDGET_TONE` / `widgetTone` (`components/ui/tone.js` — **위젯 톤은 "역할 이름" 체계**: `reapproach`(OT흐름·amber) / `renewal`(PT흐름·sky) / `brand`·`unclosed`(우선순위 red) / `neutral`(zinc) / `danger`(환불·손실 rose). 색 이름(`amber/zinc/rose/emerald`)은 **하위호환 별칭으로만 유지** — 새 코드는 역할 이름을 쓸 것. `emerald`는 레거시라 `renewal`로 매핑됨. 소비처는 `ToneCard`), `VIEW_META` (`components/ui/MemberBadge.jsx` — 회원 상태 뱃지), `GROUP_TAB` (`app/page.jsx` — 탭 그룹색). Add a literal entry to the relevant map when introducing a variant. (There is **no** `C` / `toneCls` / `gradeColor` object — those were removed.)
- Icons: `lucide-react` only.
- Sales/OT script & briefing generation is now **server-side AI** (`app/api/ot-brief`, `app/api/voice-log`) — the old client-side script consts/builders (`PHASES`, `CRM_SCRIPT`, `buildClosing`, `buildSecondSales`, `timingStatus`, …) were **removed** in v2. The one surviving client builder is `buildVoiceReport` (`components/tabs/VoiceLogTab.jsx`) — the demo fallback report shown when AI keys are unset or STT fails. Per-tab static data still lives as module-level `const` at the top of each file (purge-safe literals).

### 디자인 시스템 프리미티브 (v2 · 2026-07-21 · `components/ui/`)

07-21 2단계 전면개편으로 공용 프리미티브가 확립됐다. **인라인 카드/폼/모달을 새로 손수 만들지 말 것 — 아래를 쓴다.** 규격 출처는 「오직 트레이너 Design System」(`ONLY FOR TRAINER/` 미러). 모든 색 클래스는 purge-safe 정적 리터럴. **📄 상세 정본(토큰 값·전 프리미티브 props·변형·현장 함정·유지보수 규칙)은 `docs/v2-스펙-디자인시스템-구현정본.md` — 프리미티브를 수정·확장하기 전에 거기부터 본다. 아래는 인덱스.**

- **폰트:** `app/layout.js`가 **Pretendard Variable**(`localFont`, weight `45 920`, `--font-pretendard`)를 전역 적용. Geist는 한글 글리프가 없어 걷어냄(한글이 기기 기본폰트로 폴백되던 문제 해결). `font-mono`(Geist Mono)만 숫자·코드용으로 유지(47곳).
- **`Card` / `CardRow`** (`Card.jsx`) — 기본 흰 카드 셸(`rounded-2xl`·`shadow-sm`·`border-line`). `padding`(md/sm/lg/none)·`interactive`·`selected`·`elevated` 축. `padding="none"`은 분할 리스트(overflow-hidden). ⚠️ **기존 톤 카드(구 `Card`)는 `ToneCard`로 개명됨**(`ToneCard.jsx` — `tone`별 틴트·`widgetTone` 소비).
- **폼 4종** (`Field.jsx`) — `Input` / `Textarea` / `Select` / `Checkbox`(라벨·hint·error·`accent="owner"`(admin fuchsia) 축). 아직 컴포넌트로 안 옮긴 raw 필드는 공유 클래스 `inputCls` / `inputClsOwner` / `inputClsSm` 사용(21개 파일의 복사본을 여기로 수렴). ⚠️ 테두리는 **`border`**(ring 아님 — iOS Safari가 네이티브 `<select>`에 box-shadow 미표시라 필드가 사라졌던 현장 제보로 되돌림), 배경 `bg-elevate`.
- **`Modal`** (`Modal.jsx`) — **포털(`createPortal`→body)** 다이얼로그. `variant`(center/sheet)·`size`(sm/md/lg)·`title`/`footer`·`blocking`(필수공지)·포커스 트랩·ESC·배경 스크롤 잠금·`--shadow-pop`. `title` 없이 쓰면 기존 레이아웃 하위호환. **손수 만든 모달 대신 이걸 쓴다.**
- **`AIBriefBlock`** (`AIBriefBlock.jsx`) — AI 사전무장/브리핑 블록 단일 출처(1차 FirstOTAssist·2차 SecondOTTab·재등록 PtReRegTab 공유). `status`(idle/loading/ready/stale/demo). ⚠️ **`loading`은 반드시 `waitingHint`와 함께** — "45초~1분 빈 화면 금지"가 존재 이유(PRD 리스크 1순위). `stale`은 amber 뱃지(재생성 권장), `demo`는 "데모" 뱃지.
- **브랜드:** `Wordmark`("오직"=ink·"트레이너"=primary 2색·`whitespace-nowrap` 필수)·`Slogan`("ONLY FOR TRAINER")·`BrandMark`(인라인 SVG 심볼 · `accent` trainer=red/admin=fuchsia로 침 색만 바뀜 · 헤더 PNG 대체용 벡터).
- 기타 확립: `Badge` · `FilterChip` · `StatTile` · `SectionHeader` · `Sparkline`(공용 · `PtInbodyTab` 자기복사본은 §8 정리 대상) · `NumberInput`(콤마 입력, `Field`에 위임).

### 대량 조회는 `fetchAllRows` 경유 (P0-6)

필터·limit 없는 `select`는 PostgREST **Max rows(1000)에서 에러·경고 없이 잘린다** → 급여·매출·잔여·이탈 숫자가 "틀린 채 멀쩡히" 뜬다. `lib/fetchAllRows.js`가 `.range()`로 끝까지 페이지네이션하며 **id(PK) 정렬 강제**(경계 중복·누락 방지). 반환은 `{ data, error }` 드롭인. 무필터 전체표를 부르는 곳(현재 `app/admin/page.jsx`·`MyStats.jsx`의 `session_log`·`daily_workout_log`)은 이걸 쓴다. `.eq(...)` 단일회원 소량 조회는 대상 아님.

```js
const { data, error } = await fetchAllRows(() => supabase.from("daily_workout_log").select("*"));
```

## 현장 트러블슈팅

- **음성일지 STT가 빈 텍스트(`raw_text: ""`)를 반환** — 코드·API 키 문제처럼 보이지만, 실제 원인은 대개 **마이크 입력 자체**(엉뚱한 입력 장치 선택 또는 시스템 음소거)다. 판별법: `/api/voice-log`가 받은 **오디오 bytes** 크기로 구분한다 — 수만 bytes면 입력 정상(→ STT/모델 쪽을 의심), 수천 bytes면 사실상 무음이라 입력 문제(마이크 장치·음소거 확인). 앱의 파형 애니메이션은 `phase === "recording"`에만 반응하는 **장식**이라 실제 캡처 여부 판별에 못 쓴다. 디버깅 시 서버에서 `audio.size`/`audio.type`을 임시 로깅해 확인하되, 커밋 전 제거할 것.
- **write(update/insert/delete)가 조용히 실패 = RLS 차단(교훈1 하드닝으로 감지)** — RLS가 write를 막으면 요청이 **`error: null`인데 `data`가 0행**으로 돌아온다(HTTP 200, 예외 없음 = 조용한 실패). ⚠️ **원인은 이제 "정책 부재"가 아니라 RLS 스코프 미스**다 — 비활성 트레이너, account 스코프 불일치, 구독 만료(층1)·premium 아님(층2), `with check` 위반 등. **anon `using(true)` 정책을 추가해 뚫지 말 것(v2 보안 모델 붕괴)** — 필요한 건 인증·account 스코프에 맞는 정책이다. **방어 규율(교훈1 하드닝 · 모든 클라 write 필수):** insert/update/delete에 `.select()`를 붙여 갱신 행을 돌려받고 `error || !data || data.length === 0`이면 실패로 처리(예: `ObservationTab` 저장). 조회·저장 경로의 hang은 P1-8 스윕으로 `try/catch/finally`까지 보강됨.
- **급여·매출·잔여 숫자가 조용히 틀림 = Max rows 1000 잘림** — 필터 없는 `select`가 1000행에서 에러·경고 없이 잘려 집계가 과소계산된다. `daily_workout_log`(수업 1건=1행)가 가장 빨리 참. 무필터 전체조회는 `lib/fetchAllRows.js` 경유(위 UI 규약). ⚠️ 날짜창으로 자르지 말 것 — 잔여는 계약 전체이력이 필요해 과대계산된다.
- **`position:fixed` 모달이 화면 밖으로 밀림 = 조상 transform** — `fixed`는 조상에 `transform`이 있으면 뷰포트가 아니라 그 조상 기준으로 앵커된다. 실제로 `.tab-anim`의 `fill-mode:both`가 남긴 transform이 모달을 가둬 위쪽이 잘리고 도달 불가가 된 적이 있다(`90vh`도 그 div 기준이 됨). 두 겹으로 해결됨: ① `.tab-anim` fill-mode를 `backwards`로(끝 상태에 transform 잔류 안 함) ② **`Modal`을 포털로 body에 붙임**(조상이 없어져 재발 불가). 새 모달은 `Modal` 컴포넌트를 쓰면 자동 안전.
- **`.next` stale = 유령 버그(재현되다 안 되다)** — 현장 사용성 패스에서 "재현 실패" 2건이 다 실코드 결함이 아니라 **`.next` 빌드캐시·HMR stale**이었다. 반복 `npm run build`가 dev 서버의 `.next`를 오염시켜 `GET /`가 **404**가 나거나, HMR이 **한 컴포넌트만 옛 모듈로 서빙**(예: SecondOTTab 변경은 반영, ObservationTab는 stale)했다. **증상이 "됐다 안 됐다" 하거나 `npm run build`는 green인데 dev만 이상하면, 코드를 파기 전에 `.next` 삭제 + dev 클린 재시작부터 의심**(`rm -rf .next && npm run dev`). 또 **폰 확인은 Vercel 배포본 기준**이라 로컬 수정은 **push 후에야 반영**되고(uncommitted은 배포 안 됨), 확인 시 폰 브라우저 **하드 리프레시**(옛 번들 캐시 제거) 필요.
- **PWA iOS 스플래시는 철회됨(07-19)** — apple-touch-startup-image는 iOS에서 끝내 미적용이라 이미지 17장·생성기·startupImage 전부 제거. 단 `app/layout.js`의 `other: { "apple-mobile-web-app-capable": "yes" }`는 **의도적 수동 복원**(Next 16이 크롬 표준 `mobile-web-app-capable`만 내보내 iOS가 스플래시 조건을 못 읽던 것) — 지우지 말 것. 다크모드 검은화면 교정(`globals.css`에서 Next 스타터 잔재 `--background` 제거)도 유지.
- **Vercel 배포 상태는 대시보드 수동 확인 — 배포/프로젝트 토큰을 에이전트에 상시 부여하지 말 것** — 라이브 데이터가 RLS·구독게이트로 잠겨 있어 배포/프로젝트 토큰이 민감하다. `git push origin main`이 **자동 배포를 트리거**하지만, 빌드 **Ready 여부·URL은 Vercel 대시보드에서 직접** 본다(에이전트가 토큰을 요청하지 않는다).
