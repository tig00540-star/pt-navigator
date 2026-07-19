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

- `app/page.jsx` — **trainer app**, a ~870-line `"use client"` file. Tabs come from the `TABS` array (~10 tabs): always-on 오늘 / 회원 / 내 실적 / 설정, plus grouped workflow tabs — OT(1차 OT 준비 · 1차 피드백 · 2차 OT 준비) and PT(회원자료 · 자료남기기 · 재등록 준비). Tabs are switched by local `tab` state, not routing. `MemberListTab` and the `MemberForm` modal are defined in the same file; the legacy `CRMTab` was **removed** (only a stale comment in `MemberViewShell.jsx` still names it). Member routing by status goes through `MemberViewShell` → `PTView`(dynamic import) / `InactiveView`. `FirstOTTab`, `VoiceLogTab`, `ObservationTab`, and `SecondOTTab` (now **member-aware** — takes the selected `member` prop and fetches its `ot_log`) are split into `components/tabs/`; `FirstOTTab` embeds `FirstOTAssist` (① AI block); the legacy hardcoded 1차 scaffold was **retired in v2-S5**. Shared bits are extracted to lib/components: `fmt` (`lib/format.js`), `Eyebrow` (`components/ui/Eyebrow.jsx`), `Toast` + `useToast` (`components/ui/Toast.jsx`, `hooks/useToast.js`), label↔value maps (`lib/labels.js`, `labelOf`), and `otObsHash` (`lib/otHash.js`, brief-staleness hash).
- `app/admin/page.jsx` — **admin dashboard** (매출 KPI, 트레이너 QC, 마케팅 카피봇). Linked to/from the trainer app via header buttons.
- **Server API routes** (Node runtime, keys server-only, never exposed to the client): `app/api/voice-log` (음성일지 STT `gpt-4o-mini-transcribe` + Claude 요약 **Sonnet** `claude-sonnet-5`) and `app/api/ot-brief` (OT AI — `phase:"first"` 1차 지원 **now Sonnet** (`claude-sonnet-5`; **1차는 Haiku에서 Sonnet으로 승급됨** — 코드에 남은 `haiku` 언급은 옛 JSON 방어 로직 주석일 뿐), `phase:"second"` 2차 브리핑 Sonnet). Both build the prompt server-side, parse the model's JSON defensively (strip code fences), and return an error status when keys are unset so the client can fall back to demo.

`docs/MASTERPLAN.md` is the authoritative product/design doc (roadmap, DB schema, real-vs-demo data map, v2 plan). **Read it before any substantial feature work** — it explains intent that the code alone doesn't.

### Supabase integration

`lib/supabaseClient.js` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`. **If keys are missing, `supabase` is exported as `null`** and the app runs in "demo mode" — every DB call site guards with `if (!supabase)` and falls back to hardcoded demo data (e.g. `DEMO_MEMBER`). Preserve this null-guard pattern when adding DB calls so the app still renders without keys.

Tables in use: `user_table` (members), `center_machine` (equipment options for the form), `daily_workout_log` (voice-log AI summaries), and `ot_log` — **1차 OT 관찰 기록** (`ObservationTab`, `ot_round=1`, one row per member; full data in jsonb `report`, with `goal_type` / `goal_identified` mirrored as top-level columns for filtering). ⚠️ **RLS is now fully locked and account-scoped (v2) — NOT the old anon-open prototype.** Every data table is gated by `auth_account_id()` (멀티테넌트 격리, 인증 세션 전제) with authenticated-only policies; AI/premium 기능은 구독 상태로 추가 게이트된다(`my_account_status().access`, `auth_account_plan()`; DDL 기록본 `docs/migrations/2026-07-16-b1*.sql`·`b2-*.sql`·`2026-07-08-step7*.sql`). **Do NOT add anon-open (`using(true)`) policies** — treat every table as access-controlled and write only under an authenticated, account-scoped session. Client writes follow the "교훈1 하드닝" 규율(아래 트러블슈팅).

### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고, 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 트레이너가 30초~1분에 훑어 외우고 폰을 주머니에 넣은 뒤 당당히 리드한다. 그러므로 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**여야 한다. 세일즈·운동 파트 모두 구체 대사를 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외** — 의료 안전 우선이라 기존 스파링·보수 톤 유지. 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: the **plumbing is real** (member register/list/select, clipboard copy, voice-log DB save) and most **content generation is still demo** (AI 성향 summaries, all sales scripts/routines/timelines, admin KPIs and trainer QC numbers). **Exception — v2 sprint 1:** the 음성일지 voice→AI pipeline is now **real** — actual mic capture (`MediaRecorder`) → OpenAI STT + Claude summary via the `app/api/voice-log` route (server-only `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; falls back to a hardcoded demo report if keys are unset or the call fails). **Exception — v2 sprint 3:** the 2차 OT tab (`SecondOTTab`) is now **real AI** — the selected member's 1차 관찰(`ot_log`) → `app/api/ot-brief` (Sonnet) yields 등록 당위성 브리핑 · 대화 arc · 클로징 4단계(enter/paint/land/hold) · 거절 대처, **cached** in the `ot_round=2` row's `report.brief` (regenerate button + `obsHash` staleness badge, no re-call on revisit). The 1차 OT `FirstOTAssist` block is real too (**Sonnet** — 1차도 Sonnet으로 승급, **not** cached — session-only). Both fall back to the existing hardcoded demo (explicitly labeled "데모") when keys are unset. In the round-2 row, the brief cache (`report`) and the 2차 클로징 결과 (`closing_*` columns) **coexist** — each writer updates only its own fields, never `report`-replacing away the other. When editing, keep real and fake clearly separated and labeled — do not wire demo numbers into paths that look like live data.

### UI conventions

- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme`). **Light theme** — brand **red** `--color-primary #dc2626` on a light-gray base `--color-bg #eef1f5`; token set `bg / card / elevate / line / ink / sub / muted / primary / primary-strong / primary-soft` (+ `.tab-anim` / `@keyframes tabIn`). Workflow tab groups are colored via `GROUP_TAB` (OT=`amber`, PT=`sky`); the admin dashboard uses `fuchsia`.
- Color classes must be **static string literals** so Tailwind's purge keeps them — never assemble class strings dynamically from arbitrary values (현재 위반 0건 · 유지할 것). Reusable tone sets live in **static maps**: `WIDGET_TONE` / `widgetTone` (`components/ui/tone.js` — 위젯 톤 amber/zinc/rose/emerald), `VIEW_META` (`components/ui/MemberBadge.jsx` — 회원 상태 뱃지), `GROUP_TAB` (`app/page.jsx` — 탭 그룹색). Add a literal entry to the relevant map when introducing a variant. (There is **no** `C` / `toneCls` / `gradeColor` object — those were removed.)
- Icons: `lucide-react` only.
- Sales/OT script & briefing generation is now **server-side AI** (`app/api/ot-brief`, `app/api/voice-log`) — the old client-side script consts/builders (`PHASES`, `CRM_SCRIPT`, `buildClosing`, `buildSecondSales`, `timingStatus`, …) were **removed** in v2. The one surviving client builder is `buildVoiceReport` (`components/tabs/VoiceLogTab.jsx`) — the demo fallback report shown when AI keys are unset or STT fails. Per-tab static data still lives as module-level `const` at the top of each file (purge-safe literals).

## 현장 트러블슈팅

- **음성일지 STT가 빈 텍스트(`raw_text: ""`)를 반환** — 코드·API 키 문제처럼 보이지만, 실제 원인은 대개 **마이크 입력 자체**(엉뚱한 입력 장치 선택 또는 시스템 음소거)다. 판별법: `/api/voice-log`가 받은 **오디오 bytes** 크기로 구분한다 — 수만 bytes면 입력 정상(→ STT/모델 쪽을 의심), 수천 bytes면 사실상 무음이라 입력 문제(마이크 장치·음소거 확인). 앱의 파형 애니메이션은 `phase === "recording"`에만 반응하는 **장식**이라 실제 캡처 여부 판별에 못 쓴다. 디버깅 시 서버에서 `audio.size`/`audio.type`을 임시 로깅해 확인하되, 커밋 전 제거할 것.
- **write(update/insert/delete)가 조용히 실패 = RLS 차단(교훈1 하드닝으로 감지)** — RLS가 write를 막으면 요청이 **`error: null`인데 `data`가 0행**으로 돌아온다(HTTP 200, 예외 없음 = 조용한 실패). ⚠️ **원인은 이제 "정책 부재"가 아니라 RLS 스코프 미스**다 — 비활성 트레이너, account 스코프 불일치, 구독 만료(층1)·premium 아님(층2), `with check` 위반 등. **anon `using(true)` 정책을 추가해 뚫지 말 것(v2 보안 모델 붕괴)** — 필요한 건 인증·account 스코프에 맞는 정책이다. **방어 규율(교훈1 하드닝 · 모든 클라 write 필수):** insert/update/delete에 `.select()`를 붙여 갱신 행을 돌려받고 `error || !data || data.length === 0`이면 실패로 처리(예: `ObservationTab` 저장). 조회·저장 경로의 hang은 P1-8 스윕으로 `try/catch/finally`까지 보강됨.
- **`.next` stale = 유령 버그(재현되다 안 되다)** — 현장 사용성 패스에서 "재현 실패" 2건이 다 실코드 결함이 아니라 **`.next` 빌드캐시·HMR stale**이었다. 반복 `npm run build`가 dev 서버의 `.next`를 오염시켜 `GET /`가 **404**가 나거나, HMR이 **한 컴포넌트만 옛 모듈로 서빙**(예: SecondOTTab 변경은 반영, ObservationTab는 stale)했다. **증상이 "됐다 안 됐다" 하거나 `npm run build`는 green인데 dev만 이상하면, 코드를 파기 전에 `.next` 삭제 + dev 클린 재시작부터 의심**(`rm -rf .next && npm run dev`). 또 **폰 확인은 Vercel 배포본 기준**이라 로컬 수정은 **push 후에야 반영**되고(uncommitted은 배포 안 됨), 확인 시 폰 브라우저 **하드 리프레시**(옛 번들 캐시 제거) 필요.
- **Vercel 배포 상태는 대시보드 수동 확인 — 배포/프로젝트 토큰을 에이전트에 상시 부여하지 말 것** — 라이브 데이터가 RLS·구독게이트로 잠겨 있어 배포/프로젝트 토큰이 민감하다. `git push origin main`이 **자동 배포를 트리거**하지만, 빌드 **Ready 여부·URL은 Vercel 대시보드에서 직접** 본다(에이전트가 토큰을 요청하지 않는다).
