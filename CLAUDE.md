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

- `app/page.jsx` — **trainer app**, a ~1,080-line `"use client"` file holding the 6 tabs (회원 / 1차 OT / 2차 OT / 재등록 CRM / 음성일지 / 관찰 기록). Tabs are switched by local `tab` state, not routing. `MemberListTab` and `CRMTab` are defined in the same file, plus the `MemberForm` modal (the inline 1차 OT view was extracted to `FirstOTTab` in v2-S5). `FirstOTTab`, `VoiceLogTab`, `ObservationTab`, and `SecondOTTab` (now **member-aware** — takes the selected `member` prop and fetches its `ot_log`) are split into `components/tabs/`; `FirstOTTab` embeds `FirstOTAssist` (① AI block); the legacy hardcoded 1차 scaffold was **retired in v2-S5**. Shared bits are extracted to lib/components: `fmt` (`lib/format.js`), `Eyebrow` (`components/ui/Eyebrow.jsx`), `Toast` + `useToast` (`components/ui/Toast.jsx`, `hooks/useToast.js`), label↔value maps (`lib/labels.js`, `labelOf`), and `otObsHash` (`lib/otHash.js`, brief-staleness hash).
- `app/admin/page.jsx` — **admin dashboard** (매출 KPI, 트레이너 QC, 마케팅 카피봇). Linked to/from the trainer app via header buttons.
- **Server API routes** (Node runtime, keys server-only, never exposed to the client): `app/api/voice-log` (음성일지 STT + Claude 요약) and `app/api/ot-brief` (OT AI — `phase:"first"` 1차 지원 with Haiku, `phase:"second"` 2차 브리핑 with Sonnet). Both build the prompt server-side, parse the model's JSON defensively (strip code fences), and return an error status when keys are unset so the client can fall back to demo.

`docs/MASTERPLAN.md` is the authoritative product/design doc (roadmap, DB schema, real-vs-demo data map, v2 plan). **Read it before any substantial feature work** — it explains intent that the code alone doesn't.

### Supabase integration

`lib/supabaseClient.js` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`. **If keys are missing, `supabase` is exported as `null`** and the app runs in "demo mode" — every DB call site guards with `if (!supabase)` and falls back to hardcoded demo data (e.g. `DEMO_MEMBER`). Preserve this null-guard pattern when adding DB calls so the app still renders without keys.

Tables in use: `user_table` (members), `center_machine` (equipment options for the form), `daily_workout_log` (voice-log AI summaries), and `ot_log` — **1차 OT 관찰 기록** (`ObservationTab`, `ot_round=1`, one row per member; full data in jsonb `report`, with `goal_type` / `goal_identified` mirrored as top-level columns for filtering). RLS is prototype-grade and **not** uniformly open — tables generally have anon INSERT/SELECT but UPDATE/DELETE policies are often missing unless explicitly added (see 현장 트러블슈팅). Do not treat any table as access-controlled.

### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고, 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 트레이너가 30초~1분에 훑어 외우고 폰을 주머니에 넣은 뒤 당당히 리드한다. 그러므로 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**여야 한다. 세일즈·운동 파트 모두 구체 대사를 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외** — 의료 안전 우선이라 기존 스파링·보수 톤 유지. 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: the **plumbing is real** (member register/list/select, clipboard copy, voice-log DB save) and most **content generation is still demo** (AI 성향 summaries, all sales scripts/routines/timelines, admin KPIs and trainer QC numbers). **Exception — v2 sprint 1:** the 음성일지 voice→AI pipeline is now **real** — actual mic capture (`MediaRecorder`) → OpenAI STT + Claude summary via the `app/api/voice-log` route (server-only `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; falls back to a hardcoded demo report if keys are unset or the call fails). **Exception — v2 sprint 3:** the 2차 OT tab (`SecondOTTab`) is now **real AI** — the selected member's 1차 관찰(`ot_log`) → `app/api/ot-brief` (Sonnet) yields 등록 당위성 브리핑 · 대화 arc · 클로징 4단계(enter/paint/land/hold) · 거절 대처, **cached** in the `ot_round=2` row's `report.brief` (regenerate button + `obsHash` staleness badge, no re-call on revisit). The 1차 OT `FirstOTAssist` block is real too (Haiku, **not** cached — session-only). Both fall back to the existing hardcoded demo (explicitly labeled "데모") when keys are unset. In the round-2 row, the brief cache (`report`) and the 2차 클로징 결과 (`closing_*` columns) **coexist** — each writer updates only its own fields, never `report`-replacing away the other. When editing, keep real and fake clearly separated and labeled — do not wire demo numbers into paths that look like live data.

### UI conventions

- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme inline`). Dark theme, `zinc` base with `lime`/`emerald` accents (admin uses `fuchsia`).
- Color classes are indexed through the **`C` token object** (and similar `toneCls`/`gradeColor` maps) rather than interpolated, so Tailwind's purge keeps them. When adding a color variant, add it to the map — don't build class strings dynamically from arbitrary values.
- Icons: `lucide-react` only.
- Large per-tab data lives as module-level `const` arrays/objects at the top of each file (e.g. `PHASES`, `ROUTINE`, `PACKAGES`, `CRM_SCRIPT`). Builder functions (`buildClosing`, `buildSecondSales`, `buildVoiceReport`, `timingStatus`) assemble script/report text from current UI state.

## 현장 트러블슈팅

- **음성일지 STT가 빈 텍스트(`raw_text: ""`)를 반환** — 코드·API 키 문제처럼 보이지만, 실제 원인은 대개 **마이크 입력 자체**(엉뚱한 입력 장치 선택 또는 시스템 음소거)다. 판별법: `/api/voice-log`가 받은 **오디오 bytes** 크기로 구분한다 — 수만 bytes면 입력 정상(→ STT/모델 쪽을 의심), 수천 bytes면 사실상 무음이라 입력 문제(마이크 장치·음소거 확인). 앱의 파형 애니메이션은 `phase === "recording"`에만 반응하는 **장식**이라 실제 캡처 여부 판별에 못 쓴다. 디버깅 시 서버에서 `audio.size`/`audio.type`을 임시 로깅해 확인하되, 커밋 전 제거할 것.
- **기존 행 수정(update)이 조용히 실패** — 이 프로젝트의 테이블들은 anon **INSERT/SELECT 정책만** 있고 **UPDATE/DELETE 정책이 없다.** RLS가 켜진 채 UPDATE 정책이 없으면 PATCH가 **`error: null`인데 `data`가 0행**으로 돌아온다(HTTP 200, 예외 없음 = 조용한 실패). 즉 insert·조회는 되는데 수정만 반영이 안 된다. **기존 행을 수정하는 기능을 새로 만들 땐, 해당 테이블에 anon/public UPDATE 정책부터 추가**할 것(`create policy ... for all/update to anon, authenticated using (true) with check (true)`). 감지 팁: update 시 `.select()`로 갱신 행을 돌려받아 `data.length === 0`이면 실패로 처리(예: `ObservationTab`의 저장 하드닝).
- **`.next` stale = 유령 버그(재현되다 안 되다)** — 현장 사용성 패스에서 "재현 실패" 2건이 다 실코드 결함이 아니라 **`.next` 빌드캐시·HMR stale**이었다. 반복 `npm run build`가 dev 서버의 `.next`를 오염시켜 `GET /`가 **404**가 나거나, HMR이 **한 컴포넌트만 옛 모듈로 서빙**(예: SecondOTTab 변경은 반영, ObservationTab는 stale)했다. **증상이 "됐다 안 됐다" 하거나 `npm run build`는 green인데 dev만 이상하면, 코드를 파기 전에 `.next` 삭제 + dev 클린 재시작부터 의심**(`rm -rf .next && npm run dev`). 또 **폰 확인은 Vercel 배포본 기준**이라 로컬 수정은 **push 후에야 반영**되고(uncommitted은 배포 안 됨), 확인 시 폰 브라우저 **하드 리프레시**(옛 번들 캐시 제거) 필요.
- **Vercel 배포 상태는 대시보드 수동 확인 — 배포/프로젝트 토큰을 에이전트에 상시 부여하지 말 것** — ⑦(로그인·RLS) 전까지 anon 전면 개방이라 배포 토큰이 민감하다. `git push origin main`이 **자동 배포를 트리거**하지만, 빌드 **Ready 여부·URL은 Vercel 대시보드에서 직접** 본다(에이전트가 토큰을 요청하지 않는다).
