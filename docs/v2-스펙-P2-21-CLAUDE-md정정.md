# v2 수정 스펙 — P2-21 CLAUDE.md ↔ 코드 동기화 · 2026-07-19
> 근거: `v2-종합점검-리포트-2차-2026-07-19.md` §4 P2-21(리포트가 "P2 중 가장 위험"으로 분류 — 다음 세션 회귀의 진입점)
> 성격: **문서 정정.** 코드 변경 0. 대상 `CLAUDE.md` 1파일 · 1커밋. 매칭은 코드 내용(=문서 원문)으로.
> ⚠️ 아래 정정은 전부 **이번 세션에 실제 코드로 대조 확인**함(리포트 표를 그대로 옮기지 않음).

## 0. 왜 위험한가
다음 세션 에이전트가 CLAUDE.md를 먼저 읽고 **없는 것(`C` 토큰·`CRMTab`·anon-open RLS)을 사실로 믿고 새로 만들거나 뚫는다.** 특히 §34·54의 "anon `using(true)` UPDATE 정책 추가" 조언은 **이번 세션 보안 하드닝(묶음 A·RLS 의존)을 정면으로 붕괴**시킨다. Tailwind purge가 지금 위반 0건인 만큼, 이 문서 오류가 **회귀의 가장 그럴듯한 진입점**이다.

## 1. 대조 확인(코드 근거)
| 항목 | CLAUDE.md(현재) | 실제(확인) |
|---|---|---|
| page.jsx 규모 | "~1,080-line, 6 tabs" | **869줄**(`wc -l`), **TABS 10개**(105-116) |
| 탭 목록 | 회원/1차/2차/재등록 CRM/음성일지/관찰 | 오늘·회원·내실적·설정 + OT(1차OT준비·1차피드백·2차OT준비)·PT(회원자료·자료남기기·재등록준비) |
| CRMTab | "page.jsx에 정의" | **정의 없음**(grep 0 · MemberViewShell 주석에만 잔존). MemberListTab만 존재(:365) |
| 테마 | "Dark, zinc + lime/emerald" | **밝은테마+레드** `--color-primary #dc2626`·bg `#eef1f5`(globals.css:16-27) |
| 색 인덱싱 | "`C` 토큰·`toneCls`·`gradeColor`" | **셋 다 없음**. `WIDGET_TONE`/`widgetTone`(tone.js)·`VIEW_META`(MemberBadge)·`GROUP_TAB`(page.jsx) |
| 빌더 | PHASES·CRM_SCRIPT·buildClosing·buildSecondSales·timingStatus | **전부 제거**(grep 0). `buildVoiceReport`만 생존(VoiceLogTab:30) |
| RLS(§34·54) | "anon INSERT/SELECT만·UPDATE 정책 없음→anon `using(true)` 추가" | **풀 RLS·account 스코프**(step7·`auth_account_id()`)+**구독게이트**(`my_account_status`·`auth_account_plan`) |

---

## 2. 정정 (리포트 P2-21 · 4건)

### 2-1. Architecture — page.jsx 규모·탭·CRMTab (현재)
```
- `app/page.jsx` — **trainer app**, a ~1,080-line `"use client"` file holding the 6 tabs (회원 / 1차 OT / 2차 OT / 재등록 CRM / 음성일지 / 관찰 기록). Tabs are switched by local `tab` state, not routing. `MemberListTab` and `CRMTab` are defined in the same file, plus the `MemberForm` modal (the inline 1차 OT view was extracted to `FirstOTTab` in v2-S5).
```
### 변경 후
```
- `app/page.jsx` — **trainer app**, a ~870-line `"use client"` file. Tabs come from the `TABS` array (~10 tabs): always-on 오늘 / 회원 / 내 실적 / 설정, plus grouped workflow tabs — OT(1차 OT 준비 · 1차 피드백 · 2차 OT 준비) and PT(회원자료 · 자료남기기 · 재등록 준비). Tabs are switched by local `tab` state, not routing. `MemberListTab` and the `MemberForm` modal are defined in the same file; the legacy `CRMTab` was **removed** (only a stale comment in `MemberViewShell.jsx` still names it). Member routing by status goes through `MemberViewShell` → `PTView`(dynamic import) / `InactiveView`.
```
> 뒤 문장("`FirstOTTab`, `VoiceLogTab`, `ObservationTab`, `SecondOTTab`...split into `components/tabs/`" 이하)은 정확하므로 **유지**.

### 2-2. UI conventions — 테마 (현재)
```
- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme inline`). Dark theme, `zinc` base with `lime`/`emerald` accents (admin uses `fuchsia`).
```
### 변경 후
```
- **Tailwind CSS v4** via `@tailwindcss/postcss` (config-less; theme tokens live in `app/globals.css` under `@theme`). **Light theme** — brand **red** `--color-primary #dc2626` on a light-gray base `--color-bg #eef1f5`; token set `bg / card / elevate / line / ink / sub / muted / primary / primary-strong / primary-soft` (+ `.tab-anim` / `@keyframes tabIn`). Workflow tab groups are colored via `GROUP_TAB` (OT=`amber`, PT=`sky`); the admin dashboard uses `fuchsia`.
```

### 2-3. UI conventions — 색 인덱싱 (현재)
```
- Color classes are indexed through the **`C` token object** (and similar `toneCls`/`gradeColor` maps) rather than interpolated, so Tailwind's purge keeps them. When adding a color variant, add it to the map — don't build class strings dynamically from arbitrary values.
```
### 변경 후
```
- Color classes must be **static string literals** so Tailwind's purge keeps them — never assemble class strings dynamically from arbitrary values (현재 위반 0건 · 유지할 것). Reusable tone sets live in **static maps**: `WIDGET_TONE` / `widgetTone` (`components/ui/tone.js` — 위젯 톤 amber/zinc/rose/emerald), `VIEW_META` (`components/ui/MemberBadge.jsx` — 회원 상태 뱃지), `GROUP_TAB` (`app/page.jsx` — 탭 그룹색). Add a literal entry to the relevant map when introducing a variant. (There is **no** `C` / `toneCls` / `gradeColor` object — those were removed.)
```

### 2-4. UI conventions — 빌더/상수 (현재)
```
- Large per-tab data lives as module-level `const` arrays/objects at the top of each file (e.g. `PHASES`, `ROUTINE`, `PACKAGES`, `CRM_SCRIPT`). Builder functions (`buildClosing`, `buildSecondSales`, `buildVoiceReport`, `timingStatus`) assemble script/report text from current UI state.
```
### 변경 후
```
- Sales/OT script & briefing generation is now **server-side AI** (`app/api/ot-brief`, `app/api/voice-log`) — the old client-side script consts/builders (`PHASES`, `CRM_SCRIPT`, `buildClosing`, `buildSecondSales`, `timingStatus`, …) were **removed** in v2. The one surviving client builder is `buildVoiceReport` (`components/tabs/VoiceLogTab.jsx`) — the demo fallback report shown when AI keys are unset or STT fails. Per-tab static data still lives as module-level `const` at the top of each file (purge-safe literals).
```

---

## 3. 정정 (⚠️ 추가 발견 · 리포트 목록 밖 · 강력 권장 — RLS)
> 이번 세션 보안 작업(묶음 A 구독게이트·전 write 교훈1 하드닝·account 스코프 RLS)의 근거를 문서가 **정반대로** 적고 있음. 다음 에이전트가 §54 조언대로 `anon using(true)` 정책을 추가하면 멀티테넌트 격리·결제벽이 뚫린다. **가장 중요한 정정.**

### 3-1. Supabase integration — RLS 성격 (현재)
```
RLS is prototype-grade and **not** uniformly open — tables generally have anon INSERT/SELECT but UPDATE/DELETE policies are often missing unless explicitly added (see 현장 트러블슈팅). Do not treat any table as access-controlled.
```
### 변경 후
```
⚠️ **RLS is now fully locked and account-scoped (v2) — NOT the old anon-open prototype.** Every data table is gated by `auth_account_id()` (멀티테넌트 격리, 인증 세션 전제) with authenticated-only policies; AI/premium 기능은 구독 상태로 추가 게이트된다(`my_account_status().access`, `auth_account_plan()`; DDL 기록본 `docs/migrations/2026-07-16-b1*.sql`·`b2-*.sql`·`2026-07-08-step7*.sql`). **Do NOT add anon-open (`using(true)`) policies** — treat every table as access-controlled and write only under an authenticated, account-scoped session. Client writes follow the "교훈1 하드닝" 규율(아래 트러블슈팅).
```

### 3-2. 현장 트러블슈팅 — "조용한 실패" 항목 (현재)
```
- **기존 행 수정(update)이 조용히 실패** — 이 프로젝트의 테이블들은 anon **INSERT/SELECT 정책만** 있고 **UPDATE/DELETE 정책이 없다.** RLS가 켜진 채 UPDATE 정책이 없으면 PATCH가 **`error: null`인데 `data`가 0행**으로 돌아온다(HTTP 200, 예외 없음 = 조용한 실패). 즉 insert·조회는 되는데 수정만 반영이 안 된다. **기존 행을 수정하는 기능을 새로 만들 땐, 해당 테이블에 anon/public UPDATE 정책부터 추가**할 것(`create policy ... for all/update to anon, authenticated using (true) with check (true)`). 감지 팁: update 시 `.select()`로 갱신 행을 돌려받아 `data.length === 0`이면 실패로 처리(예: `ObservationTab`의 저장 하드닝).
```
### 변경 후
```
- **write(update/insert/delete)가 조용히 실패 = RLS 차단(교훈1 하드닝으로 감지)** — RLS가 write를 막으면 요청이 **`error: null`인데 `data`가 0행**으로 돌아온다(HTTP 200, 예외 없음 = 조용한 실패). ⚠️ **원인은 이제 "정책 부재"가 아니라 RLS 스코프 미스**다 — 비활성 트레이너, account 스코프 불일치, 구독 만료(층1)·premium 아님(층2), `with check` 위반 등. **anon `using(true)` 정책을 추가해 뚫지 말 것(v2 보안 모델 붕괴)** — 필요한 건 인증·account 스코프에 맞는 정책이다. **방어 규율(교훈1 하드닝 · 모든 클라 write 필수):** insert/update/delete에 `.select()`를 붙여 갱신 행을 돌려받고 `error || !data || data.length === 0`이면 실패로 처리(예: `ObservationTab` 저장). 조회·저장 경로의 hang은 P1-8 스윕으로 `try/catch/finally`까지 보강됨.
```

---

## 4. 커밋
- **범위:** `CLAUDE.md` 1파일.
- **메시지 제안:**
  `docs(CLAUDE.md): 코드와 동기화 — 밝은레드테마·TABS10·CRMTab제거·서버AI빌더·RLS풀락(anon-open 금지) 정정(회귀 방지)`
- `git commit -m "<위>" -- CLAUDE.md`

## 5. 검증
- md 파일이라 build/lint 무관(코드 변경 0). 커밋 전 **읽어보며 코드와 모순 없는지** 한 번 더 대조: 테마 hex·TABS 라벨·`WIDGET_TONE`·`buildVoiceReport`만 생존·RLS 풀락.
- (선택) `MemberViewShell.jsx:6` 주석에 남은 "MemberListTab·CRMTab" 문구도 코드 주석 잔재 — 원하면 같은 커밋에 `CRMTab` 언급만 제거(문서 정합). 스펙 범위 밖이라 선택.

## 6. 참고 — 손대지 않은 것(정확해서 유지)
- Commands·"no test framework"·Next 16/React 19/JSX·`@/*` 별칭 — 정확.
- 모델 설명(voice-log STT `gpt-4o-mini-transcribe`+Sonnet, ot-brief 1·2차 Sonnet) — 정확.
- §42 Real vs demo — voice-log·2차·1차 real 예외가 이미 기술됨(정확). 단 "all sales scripts demo"는 이제 OT 브리핑이 real이라 약간 낡음 → **선택적 미세정정**(원하면 추가). 이번 스펙은 안 건드림.
- 트러블슈팅의 `.next` stale · Vercel 대시보드 수동확인 — 정확.

## 7. 다음
성능 묶음 **P1-9(`RegisterDueToday` deps 루프)+P1-10(`MyStats` useMemo)** → 그 뒤 **묶음 D(maxDuration 180s)** → §8 정리(lib/date.js 통합).
