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

- `app/page.jsx` — **trainer app**, a single ~2,300-line `"use client"` file holding the 5 tabs (회원 / 1차 OT / 2차 OT / 재등록 CRM / 음성일지). Tabs are switched by local `tab` state, not routing. `MemberListTab`, `SecondOTTab`, `CRMTab` are defined in the same file, plus the inline 1차 OT view and the `MemberForm` modal. `VoiceLogTab` is split out into `components/tabs/VoiceLogTab.jsx` (the first v2 refactor), sharing `fmt` from `lib/format.js` and `Eyebrow` from `components/ui/Eyebrow.jsx`.
- `app/admin/page.jsx` — **admin dashboard** (매출 KPI, 트레이너 QC, 마케팅 카피봇). Linked to/from the trainer app via header buttons.

`docs/MASTERPLAN.md` is the authoritative product/design doc (roadmap, DB schema, real-vs-demo data map, v2 plan). **Read it before any substantial feature work** — it explains intent that the code alone doesn't.

### Supabase integration

`lib/supabaseClient.js` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`. **If keys are missing, `supabase` is exported as `null`** and the app runs in "demo mode" — every DB call site guards with `if (!supabase)` and falls back to hardcoded demo data (e.g. `DEMO_MEMBER`). Preserve this null-guard pattern when adding DB calls so the app still renders without keys.

Tables in use: `user_table` (members), `center_machine` (equipment options for the form), `daily_workout_log` (voice-log AI summaries). `ot_log` exists in the schema but is unused. RLS is currently **fully open on the anon key** (prototype) — do not treat any table as access-controlled.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: the **plumbing is real** (member register/list/select, clipboard copy, voice-log DB save) and most **content generation is still demo** (AI 성향 summaries, all sales scripts/routines/timelines, admin KPIs and trainer QC numbers). **Exception — v2 sprint 1:** the 음성일지 voice→AI pipeline is now **real** — actual mic capture (`MediaRecorder`) → OpenAI STT + Claude summary via the `app/api/voice-log` route (server-only `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; falls back to a hardcoded demo report if keys are unset or the call fails). When editing, keep real and fake clearly separated and labeled — do not wire demo numbers into paths that look like live data.

### UI conventions

- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme inline`). Dark theme, `zinc` base with `lime`/`emerald` accents (admin uses `fuchsia`).
- Color classes are indexed through the **`C` token object** (and similar `toneCls`/`gradeColor` maps) rather than interpolated, so Tailwind's purge keeps them. When adding a color variant, add it to the map — don't build class strings dynamically from arbitrary values.
- Icons: `lucide-react` only.
- Large per-tab data lives as module-level `const` arrays/objects at the top of each file (e.g. `PHASES`, `ROUTINE`, `PACKAGES`, `CRM_SCRIPT`). Builder functions (`buildClosing`, `buildSecondSales`, `buildVoiceReport`, `timingStatus`) assemble script/report text from current UI state.

## 현장 트러블슈팅

- **음성일지 STT가 빈 텍스트(`raw_text: ""`)를 반환** — 코드·API 키 문제처럼 보이지만, 실제 원인은 대개 **마이크 입력 자체**(엉뚱한 입력 장치 선택 또는 시스템 음소거)다. 판별법: `/api/voice-log`가 받은 **오디오 bytes** 크기로 구분한다 — 수만 bytes면 입력 정상(→ STT/모델 쪽을 의심), 수천 bytes면 사실상 무음이라 입력 문제(마이크 장치·음소거 확인). 앱의 파형 애니메이션은 `phase === "recording"`에만 반응하는 **장식**이라 실제 캡처 여부 판별에 못 쓴다. 디버깅 시 서버에서 `audio.size`/`audio.type`을 임시 로깅해 확인하되, 커밋 전 제거할 것.
