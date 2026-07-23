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

A Korean-language fitness-trainer sales/CRM web app. Three route groups, all client components:

- `app/page.jsx` — **trainer app**, a large `"use client"` file. Tabs come from the `TABS` array (~10 tabs, ids not contiguous): always-on 오늘 / 회원 / 내 실적 / 설정, plus grouped workflow tabs — OT(1차 OT 준비 · 1차 피드백 · 2차 OT 준비) and PT(**회원자료=tab id 10** · 자료남기기 · 재등록 준비). Tabs are switched by local `tab` state, not routing. `MemberListTab` and the `MemberForm` modal are defined in the same file; the legacy `CRMTab` was **removed**. Member routing by status goes through `MemberViewShell` → `PTView`(dynamic import) / `InactiveView`; `PTView` renders `PtWorkoutTab`(회원자료 타임라인·수업일지) 외. `FirstOTTab`(embeds `FirstOTAssist`, ① AI block via shared `AIBriefBlock`), `VoiceLogTab`, `ObservationTab`, `SecondOTTab`(member-aware) are in `components/tabs/`. '오늘/할일' 파생 위젯은 `components/views/*Today.jsx`·`TodoTab.jsx`(ReapproachToday·RegisterDueToday·ChurnRiskToday·PastDueAppointments·`UnconfirmedConfirmToday` 등 — 전부 파생·새 저장 0). Shared bits: `fmt`(`lib/format.js`)·`Eyebrow`·`Toast`+`useToast`·label↔value maps(`lib/labels.js`)·`otObsHash`(`lib/otHash.js`). v2 **design-system primitives**(`Card`/`ToneCard`/`Field`/`Modal`/`AIBriefBlock`/`BrandMark`/`Wordmark` …)는 `components/ui/` — 아래 "디자인 시스템 프리미티브".
- `app/m/[token]/page.jsx` — **회원 앱**(별도 Supabase 클라 `lib/memberSupabase.js` · storageKey 분리). 토큰 링크 + 휴대폰 뒤 4자리 → `app/api/member-auth` 세션. 열람은 안전 뷰(`member_me`·`member_workout_log`·`member_inbody`) 경유, 자가입력은 `cardio_log`·`member_photo`·`schedule_check`, 그리고 **수업일지 확인**(아래).
- `app/admin/page.jsx` — **admin dashboard**(매출 KPI · 트레이너 QC · 마케팅 카피봇).
- **Server API routes**(Node runtime · keys server-only): `app/api/voice-log`(STT `gpt-4o-mini-transcribe` + Claude 요약 **Sonnet** `claude-sonnet-5`) · `app/api/ot-brief`(OT AI · `phase:"first"`/`"second"` 둘 다 **Sonnet** · 코드의 `haiku` 언급은 옛 주석) · `app/api/member-auth`(회원 세션 발급) · **`app/api/member-confirm`**(회원 수업일지 확인 write · service_role · 아래). AI 라우트 `maxDuration=180`. 프롬프트 서버조립·JSON 방어파싱·키 미설정 시 에러 상태(클라 데모 폴백).

`docs/MASTERPLAN.md` is the authoritative product/design doc. **Read it before any substantial feature work.**

### Supabase integration

`lib/supabaseClient.js`는 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`를 읽는다. **키 없으면 `supabase`가 `null`**로 export → "demo mode"(모든 DB 호출부가 `if (!supabase)`로 하드코딩 데모 폴백). 이 null-guard 패턴을 유지할 것.

Tables in use: `user_table`(members)·`center_machine`(장비)·`daily_workout_log`(**수업확인서 겸 운동일지** · 수업 1건=1행 · 음성일지 AI 요약 · `contract_id`·`session_at`·`source`(noshow 포함)·`voided`·`sets_structured`)·`ot_log`(1차 OT 관찰 · `ot_round=1`). 이후 증분: `session_log`(**계약/등록 기록** — 이름과 달리 PT 패키지 계약 · 재등록마다 새 행 · 금액/세션수 · `reg_result` 등)·`appointment`(예약 · `trainer_id`·`start_at`·`status`(booked/done/canceled))·회원앱 자가입력 `cardio_log`·`member_photo`·`schedule_check`·`trainer_reward`(오운완 포상)·**`workout_log_confirmation`**(수업일지 회원 확인 · append-only · 아래). ⚠️ **`member_workout_log`는 테이블이 아니라 `daily_workout_log` 위 회원 열람용 안전 뷰**(security_invoker=false · `voided`/`noshow` 제외 · 확인상태 append). **오운완 출석 집계의 원천은 `daily_workout_log` 세션**(자가입력 아님) — RPC 4개가 서버 집계(`voided=false`·`source<>'noshow'` 제외 · `docs/migrations/2026-07-20-ounwan-reward.sql`). 회원 read가 회원 RLS에 막히는 경로는 `SECURITY DEFINER` 헬퍼 경유(`auth_member_id()` 등). ⚠️ **RLS is fully locked and account-scoped (v2)** — 모든 데이터 테이블이 `auth_account_id()` 게이트 + authenticated-only. AI/premium은 구독 상태로 추가 게이트(`my_account_status().access`·`auth_account_plan()` · DDL `docs/migrations/2026-07-16-b1*.sql`·`b2-*.sql`·`2026-07-08-step7*.sql`). **anon-open(`using(true)`) 정책 추가 금지.** 클라 write는 "교훈1 하드닝" 규율(아래).

### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고, 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 30초~1분에 훑어 외우고 폰 넣은 뒤 당당히 리드. 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**. 세일즈·운동 파트 구체 대사 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외**(의료 안전 우선). 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: **plumbing is real**(member 등록/목록/선택·클립보드·voice-log DB 저장), 대부분 **content generation은 여전히 demo**(AI 성향 요약·모든 세일즈 스크립트/루틴/타임라인·admin KPI·QC 숫자). **Exceptions(real):** ① 음성일지 voice→AI(`MediaRecorder`→OpenAI STT+Claude 요약 · `app/api/voice-log`) ② 2차 OT `SecondOTTab`(1차 관찰 `ot_log`→`ot-brief` Sonnet · `ot_round=2` 행 `report.brief` 캐시) + 1차 `FirstOTAssist`(Sonnet · 미캐시) ③ **오운완**(회원앱 카드·트레이너 랭킹·포상 — `daily_workout_log` 출석 **서버 RPC** 집계 · ⚠️ 클라 계산 금지) ④ **수업일지 회원 확인·서명(2026-07-21)** — 아래. 키 없으면 각자 "데모" 폴백. 편집 시 real/fake 명확 분리.

### UI conventions

- **Tailwind CSS v4**(config-less · 토큰 `app/globals.css` `@theme`). **Light theme** brand **red** `--color-primary #dc2626` · base `--color-bg #f1f2f6`. **토큰 값은 「오직 트레이너 Design System」기준(2026-07-21)** — 이름은 앱 것 유지·값만 DS(유틸 1,962곳 자동 반영). 코어 `bg / card / elevate / line / line-strong / ink / sub / muted / primary / primary-strong / primary-soft`. **역할 색(업무흐름 · 브랜드색 아님 · 로고/CTA 금지)** `--color-ot(-text/-soft)` / `pt` / `admin` / `danger(-text)` — 밝은 배경 글자는 반드시 `-text`. 라운드·그림자도 이름유지·값만 DS: `--radius-lg 10px`(컨트롤)·`--radius-2xl 14px`(카드)·`--shadow-sm`(카드)·`--shadow-pop`(모달). 한글 라벨 자간 `--tracking-label-ko 0.02em`. keyframes `tabIn`·`ot-indeterminate`·`ot-sheet`. Workflow tab groups `GROUP_TAB`(OT=amber·PT=sky), admin=fuchsia.
- 색 클래스는 **정적 문자열 리터럴만**(purge · 동적 조립 금지 · 현재 위반 0). 톤 정적맵: `WIDGET_TONE`/`widgetTone`(`components/ui/tone.js` — **역할 이름 체계**: `reapproach`(OT·amber)/`renewal`(PT·sky)/`brand`·`unclosed`(우선순위 red)/`neutral`(zinc)/`danger`(rose). 색 이름은 하위호환 별칭 · 새 코드는 역할 이름 · `emerald`→`renewal`. 소비처 `ToneCard`)·`VIEW_META`(`MemberBadge.jsx`)·`GROUP_TAB`(`app/page.jsx`). 변형은 정적 리터럴 추가. (`C`/`toneCls`/`gradeColor`는 없음.)
- Icons: `lucide-react`만.
- Sales/OT script·briefing은 **서버 AI**(`ot-brief`·`voice-log`) — 옛 클라 빌더(`PHASES`·`CRM_SCRIPT`·`buildClosing`…)는 v2에서 제거. 생존 클라 빌더는 `buildVoiceReport`(`VoiceLogTab.jsx`, 데모 폴백)뿐.

### 디자인 시스템 프리미티브 (v2 · 2026-07-21 · `components/ui/`)

**인라인 카드/폼/모달 손수 제작 금지 — 아래 사용.** 규격 출처 「오직 트레이너 DS」(`ONLY FOR TRAINER/` 미러). 상세: 요약 정본 `docs/v2-스펙-디자인시스템-구현정본.md`, 코드대조 상세판 `docs/v2-스펙-디자인시스템-구현-코드대조판.md`. 모든 색 클래스 purge-safe 정적 리터럴.

- **폰트:** `app/layout.js` **Pretendard Variable**(`localFont` weight `45 920` `--font-pretendard`) 전역. Geist는 한글 글리프 없어 제거. `font-mono`(Geist Mono)만 숫자용.
- **`Card`/`CardRow`**(`Card.jsx`) 흰 카드 셸(`padding` md/sm/lg/none·`interactive`·`selected`·`elevated`). ⚠️ 구 톤 카드는 **`ToneCard`로 개명**(`tone`별 틴트·`widgetTone`).
- **폼 4종**(`Field.jsx`) `Input`/`Textarea`/`Select`/`Checkbox`(label·hint·error·`accent="owner"`). raw 필드는 공유 클래스 `inputCls`/`inputClsOwner`/`inputClsSm`. ⚠️ 테두리 **`border`**(ring 아님 — iOS Safari가 `<select>` box-shadow 미표시로 필드 사라졌던 제보), 배경 `bg-elevate`.
- **`Modal`**(`Modal.jsx`) **포털(createPortal→body)** · `variant`(center/sheet)·`size`·`title`/`footer`·`blocking`·포커스트랩·ESC·스크롤잠금·`--shadow-pop`. 손수 모달 대신 사용. ⚠️ 포커스 effect는 **마운트 1회(`[]`)**·키 리스너만 `[canClose,onClose]`(아래 트러블슈팅).
- **`AIBriefBlock`**(`AIBriefBlock.jsx`) AI 브리핑 단일 출처(1차·2차·재등록 공유). `status`(idle/loading/ready/stale/demo). ⚠️ `loading`은 반드시 `waitingHint`(빈 화면 금지).
- **브랜드:** `Wordmark`("오직"=ink·"트레이너"=primary·`whitespace-nowrap`)·`Slogan`·`BrandMark`(SVG 심볼 · `accent`로 침 색).
- 기타: `Badge`·`FilterChip`·`StatTile`·`SectionHeader`·`Sparkline`·`NumberInput`(콤마·`Field` 위임).

### 대량 조회는 `fetchAllRows` 경유 (P0-6)

필터·limit 없는 `select`는 PostgREST **Max rows(1000)에서 조용히 잘림** → 급여·매출·잔여·이탈 숫자가 "틀린 채 멀쩡히". `lib/fetchAllRows.js`가 `.range()`로 끝까지 페이지네이션(**id 정렬 강제**). 반환 `{data,error}` 드롭인. 무필터 전체표(현재 `admin/page.jsx`·`MyStats.jsx`의 `session_log`·`daily_workout_log`)는 이걸로. `.eq(...)` 소량 조회는 대상 아님.

### 수업일지 회원 확인·서명 (v2 · 2026-07-21)

`daily_workout_log`(수업확인서 겸 운동일지)를 **회원이 회원앱에서 '확인'** → 종이 수업확인 서명 대체. 데이터·근거는 `docs/v2-스펙-수업일지-회원확인서명+진입게이트.md`(v2.1).

- **테이블 `workout_log_confirmation`**(append-only 감사): `log_id`·`member_id`·`result`(현재 confirm만)·`method`(tap·drawn은 후속)·`content_hash`(확인 시점 내용 동결)·`confirmed_at`. confirm 1건/일지(partial unique). **IP·UA 미수집**(개인정보/약한 증거가치). 회원 SELECT own · 트레이너 SELECT account 스코프 · **회원 직접 write 없음**(서버 라우트만).
- **뷰 확장:** `member_workout_log`에 `confirmed_at`·`confirm_result` append(집계 lateral · confirm 우선).
- **write 라우트 `app/api/member-confirm`:** 회원 JWT→`member_id` 매핑 → service_role로 일지 재조회(소유·voided/noshow 검증) → **서버가 `content_hash` 계산**(클라 위조 불가) → insert(교훈1 `.select()`). **`result`는 confirm 전용**(그 외 400 · dispute 구조적 차단). 키 없으면 503(fail-closed).
- **해시 공용 `lib/workoutHash.js`:** `workoutCanonical(log)` 단일 출처 → `contentHashNode`(라우트·Node crypto 주입) / `contentHashBrowser`(트레이너 뱃지·subtle). **★둘이 반드시 같은 canonical** — 다르면 오탐("항상 변경됨"). `sets_structured` jsonb 키 순서는 양쪽 PostgREST라 안정(스모크 확인 권장).
- **회원 게이트(`ConfirmFlow` in `app/m/[token]/page.jsx`):** **소프트** — 상단 배너+뱃지 상시, `pending≥3`일 때만 소프트 모달(닫기·"나중에" snooze). 확인 전용. ⚠️ **fail-open**(503/로드실패 시 게이트 끔 · 락아웃 금지). 유예: `session_at < 오늘(KST)`.
- **트레이너 대응(`PtWorkoutTab` 회원자료=tab 10):** 각 로그 뱃지(확인됨/미확인) + **해시 대조 "확인 후 변경됨 ⚠️"**. 로그 **수정**(ai_summary 인라인) + **삭제=void(소프트)**(`voided=true` · 오운완·차감 자동 제외 · 무르기). ⚠️ **하드 DELETE 금지**(confirmation `on delete cascade`로 서명 삭제). RLS는 `auth_all_daily_workout_log`(for all)로 트레이너 수정/삭제 이미 허용.
- **미확인 팔로업(`UnconfirmedConfirmToday` in `TodoTab`):** 오늘 booked 예약 회원 중 미확인 수업 있으면 '할일'에 표시 → 탭 시 회원자료(tab 10) 진입. 리마인더+진입일 뿐(확인은 회원 JWT로만).
- **이의(dispute) 제거됨** — 확인 전용. route는 confirm만 통과. **클라 죽은 분기 정리 완료**(트레이너 이의 뱃지·`dispute_note` 표시·`PTView` select·회원 pending 필터의 `!=='dispute'`·route의 `disputeNote` 전부 제거). 남은 것은 **DB 뷰의 `confirm_result` case와 테이블 `check(result in ('confirm','dispute'))`뿐**(마이그레이션 계층 · 무해 잔존 — 새 dispute 행은 안 생기고, 정정하려면 별도 마이그레이션 필요). dispute 행은 더는 안 생김.

## 현장 트러블슈팅

- **음성일지 STT가 빈 텍스트(`raw_text: ""`)** — 대개 마이크 입력 자체(엉뚱한 장치·음소거). 판별: `/api/voice-log`가 받은 **오디오 bytes** — 수만이면 입력 정상(STT/모델 의심), 수천이면 무음(마이크 확인). 파형 애니는 `phase==="recording"` 장식이라 판별 불가. 서버 `audio.size` 임시 로깅, 커밋 전 제거.
- **write가 조용히 실패 = RLS 차단(교훈1 하드닝으로 감지)** — RLS가 막으면 `error:null`인데 `data` 0행(HTTP 200 · 조용한 실패). 원인은 정책 부재가 아니라 **RLS 스코프 미스**(비활성 트레이너·account 불일치·구독 만료·premium 아님·with check 위반). **anon `using(true)` 추가 금지.** **방어 규율(모든 클라 write):** insert/update/delete에 `.select()` 붙여 `error||!data||data.length===0`이면 실패 처리. hang은 `try/catch/finally`.
- **급여·매출·잔여가 조용히 틀림 = Max rows 1000 잘림** — 무필터 `select`가 1000행에서 조용히 잘림. `daily_workout_log`가 가장 빨리 참. `lib/fetchAllRows.js` 경유. ⚠️ 날짜창으로 자르지 말 것(잔여 과대계산).
- **모달 안 입력 시 모바일 키보드가 한 글자마다 닫힘 = Modal 포커스 effect 재실행** — `Modal`의 포커스 이동(`ref.focus()`)이 `[canClose,onClose]` 의존이면, `onClose`가 인라인 함수인 부모가 입력(textarea) 리렌더될 때마다 신원이 바뀌어 effect 재실행 → 포커스를 입력에서 시트로 뺏음. **해결:** 포커스 이동은 **마운트 1회(deps `[]`)**, ESC/Tab 키 리스너만 별도 effect(`[canClose,onClose]` · 포커스 안 건드림). 새 모달은 `Modal` 쓰면 자동 안전.
- **`position:fixed` 모달이 화면 밖으로 = 조상 transform** — `fixed`는 조상 transform 기준 앵커. `.tab-anim` `fill-mode:both` 잔류 transform이 범인이었다. 해결 2겹: `.tab-anim` fill-mode `backwards` + **`Modal` 포털(body)**. 새 모달은 `Modal`로 자동 안전.
- **`.next` stale = 유령 버그** — "됐다 안 됐다" 하거나 `npm run build`는 green인데 dev만 이상하면 코드 파기 전에 `.next` 삭제+재시작부터(`rm -rf .next && npm run dev`). 폰 확인은 Vercel 배포본 기준(push 후·하드 리프레시).
- **PWA iOS 스플래시 철회(07-19)** — 미적용이라 이미지·생성기 제거. 단 `app/layout.js`의 `other: { "apple-mobile-web-app-capable": "yes" }`는 **의도적 수동 복원**(지우지 말 것). 다크모드 검은화면 교정(`--background` 제거)도 유지.
- **Vercel 배포 상태는 대시보드 수동 확인** — 배포/프로젝트 토큰을 에이전트에 상시 부여 말 것. `git push origin main`이 자동 배포 트리거, Ready 여부·URL은 대시보드에서 직접.
