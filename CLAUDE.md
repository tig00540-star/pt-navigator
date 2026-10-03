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

- `app/page.jsx` — **trainer app**, a large `"use client"` file. Tabs come from the `TABS` array (~10 tabs, ids not contiguous): always-on 오늘 / 회원 / 내 실적 / 설정, plus grouped workflow tabs — OT(1차 OT 준비 · 1차 피드백 · 2차 OT 준비) and PT(**대시보드=tab id 10**(옛 회원자료) · 자료남기기=12 · 재등록=11 — 아래 "PT 회원 화면"). Tabs are switched by local `tab` state, not routing. `MemberListTab` and the `MemberForm` modal are defined in the same file; the legacy `CRMTab` was **removed**. Member routing by status goes through `MemberViewShell` → `PTView`(dynamic import) / `InactiveView`; `PTView` renders `PtWorkoutTab`(대시보드 머리=`components/pt/PtDashboard` + 지난 수업 · 자료남기기 기록) 외. `FirstOTTab`(embeds `FirstOTAssist`, ① AI block via shared `AIBriefBlock`), `VoiceLogTab`, `ObservationTab`, `SecondOTTab`(member-aware) are in `components/tabs/`. '오늘/할일' 파생 위젯은 `components/views/*Today.jsx`·`TodoTab.jsx`(ReapproachToday·RegisterDueToday·ChurnRiskToday·PastDueAppointments·`UnconfirmedConfirmToday` 등 — 전부 파생·새 저장 0). Shared bits: `fmt`(`lib/format.js`)·`Eyebrow`·`Toast`+`useToast`·label↔value maps(`lib/labels.js`)·`otObsHash`(`lib/otHash.js`). v2 **design-system primitives**(`Card`/`ToneCard`/`Field`/`Modal`/`AIBriefBlock`/`BrandMark`/`Wordmark` …)는 `components/ui/` — 아래 "디자인 시스템 프리미티브".
- `app/m/[token]/page.jsx` — **회원 앱**(별도 Supabase 클라 `lib/memberSupabase.js` · storageKey 분리). 토큰 링크 + 휴대폰 뒤 4자리 → `app/api/member-auth` 세션. 열람은 안전 뷰(`member_me`·`member_workout_log`·`member_inbody`) 경유, 자가입력은 `cardio_log`·`member_photo`·`schedule_check`, 그리고 **수업일지 확인**(아래).
- `app/admin/page.jsx` — **admin dashboard**(원장 전용). 섹션 탭 `ATABS`(8 · 기본 랜딩=**브리핑**): **브리핑**(`OwnerBriefing` "오늘 챙길 것" top3 · 룰기반)·**트레이너**(id는 여전히 `perf` · 구 '실적' 개명 · `CenterMonthSummary` **센터 요약 2타일**[이달 수업 OT/PT+누적 · 트레이너/활성회원 — ⚠️ '이달 신규 등록' 타일은 홈·운영보고서와 중복이라 제거, 누적 총수업은 구 상세분석 안 카드를 흡수] + `TrainerScorecard` 리더보드['…순' 칩으로 줄 세우기] + 클로징/재등록 분석 접기 + `TrainerQualityReport` **'오늘 코칭할 것'**[구 '오늘의 리포트'])·**매출**(`RevenuePipeline` 게이지·예측·구성·추이 — **분석만**)·**정산**(`SettlementPanel` 하나 · 내부 세그먼트 **[정산 보기]**[기간 네비 ‹ ›·합계표 PT+FC+기타−지출=순이익·지출 분류칩·`account.settlement_start_day` 설정] **[장부 적기]**[**폼 1개**로 FC매출/기타매출/지출 다 받음 → `income`/`expense` 분기 · 기간 내역 통합 목록] — ⚠️ 구 `ExpenseManager`는 **흡수·삭제**됨(폼이 둘이면 적는 사람이 두 화면을 오간다). 정산은 '보는' 화면이 아니라 '하는' 화면이라 **상단 독립 묶음**)·**등록·이탈**(`MemberFlow` — ⚠️ 구 **전환**(`ConversionFunnel`)+**리텐션**(`RetentionConsole`) 두 탭을 **한 화면으로 합침**[2026-09-30 · 두 컴포넌트 삭제]. 구조: 깔때기(누적 스냅샷) → **월별 코호트**(`otFunnelByMonth` 유입월 기준 · '나아지고 있나') → PT 재등록/이탈 3스탯 → **명단 4줄 펼침**(1차 OT 대기·이번주 챙길 등록·만료임박·이탈위험). 트레이너별 표 2개는 **제거**(리더보드가 같은 열 소유) → 링크 한 줄. 탭 id `flow` · 구 id(`funnel`/`retention`)는 `normalizeTab`이 흡수(lib의 `ownerBriefing` tab 값 무변))·**스케줄**(`ScheduleAnalytics` 밀도 히트맵·완료/노쇼)·**급여**(`AdminPayrollSettings` 스킴 설정만 · ⚠️ 트레이너별 급여 **확정**(`PayrollConfirm`)은 트레이너 탭 스코어카드 펼침에 있음 — 두 탭 브릿지 링크로 연결)·**운영**(회원 등록·배정·재배정·트레이너 초대·공지). ⚠️ 헤더 센터명은 `account.name` — **가입 때 입력받아 트리거가 넣는다**(`2026-07-13-signup-trigger.sql`). 앱 안에 변경 UI를 두지 않는다(계정당 한 번 정하는 값 · 파일럿 시드 계정만 name이 '파일럿 센터'). account는 **SELECT 정책만** — UPDATE 열지 말 것(트레이너가 subscription_status·billing_key까지 고쳐 결제 게이트 우회). ⚠️ 구 "트레이너별 실적" 인라인 카드는 **`TrainerScorecard`로 대체**(제거). ⚠️ 구 "AI 상권 카피봇"(고정 템플릿 5종 회전을 AI로 과장 · **운영 탭 내 섹션이라 탭 수 무변**)·구 "QC 모니터링" **탭**(하드코딩 데모 트레이너 · 조회율/리딩률 실측 불가 · 실측 리더보드와 중복 · **제거로 9→8탭**)은 **제거됨**(git 히스토리 참고·복원 가능). 분석 컴포넌트는 `components/admin/`(아래 "admin 분석 대시보드"). **시인성 규율:** 각 탭은 결론→숫자→대상→**근거 접기**(`detailOpen` 토글 · `useMemo`는 그대로 돌고 렌더만 지연).
- **Server API routes**(Node runtime · keys server-only): `app/api/voice-log`(STT `gpt-4o-mini-transcribe` + Claude 요약 `claude-sonnet-5-5`) · `app/api/ot-brief`(OT AI · **리포트(first·second·reregister)=`claude-opus-5-5`(thinking adaptive · 끄기 불가)**, 나머지 phase=`claude-sonnet-5-5`(thinking `between_tools`=끔 · `disabled`는 이 모델들에서 400). **리포트는 서버가 저장**(`save` 파라미터 · 트레이너 토큰 RLS · `after()`로 브라우저가 끊겨도 끝까지) → 화면은 `lib/aiPending`으로 "만드는 중"을 기억했다가 돌아오면 이어 받음) · `app/api/member-auth`(회원 세션 발급) · **`app/api/member-confirm`**(회원 수업일지 확인 write · service_role · 아래). AI 라우트 `maxDuration=180`. 프롬프트 서버조립·JSON 방어파싱·키 미설정 시 에러 상태(클라 데모 폴백).

`docs/MASTERPLAN.md` is the authoritative product/design doc. **Read it before any substantial feature work.**

### Supabase integration

`lib/supabaseClient.js`는 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`를 읽는다. **키 없으면 `supabase`가 `null`**로 export → "demo mode"(모든 DB 호출부가 `if (!supabase)`로 하드코딩 데모 폴백). 이 null-guard 패턴을 유지할 것.

Tables in use: `user_table`(members)·`center_machine`(장비)·`daily_workout_log`(**수업확인서 겸 운동일지** · 수업 1건=1행 · 음성일지 AI 요약 · `contract_id`·`session_at`·`source`(noshow 포함)·`voided`·`sets_structured`)·`ot_log`(1차 OT 관찰 · `ot_round=1`). 이후 증분: `session_log`(**계약/등록 기록** — 이름과 달리 PT 패키지 계약 · 재등록마다 새 행 · 금액/세션수 · `reg_result` 등)·`appointment`(예약 · `trainer_id`·`start_at`·`status`(booked/done/canceled))·회원앱 자가입력 `cardio_log`·`member_photo`·`schedule_check`·`trainer_reward`(오운완 포상)·**`workout_log_confirmation`**(수업일지 회원 확인 · append-only · 아래). ⚠️ **`member_workout_log`는 테이블이 아니라 `daily_workout_log` 위 회원 열람용 안전 뷰**(security_invoker=false · `voided`/`noshow` 제외 · 확인상태 append). **오운완 출석 집계의 원천은 `daily_workout_log` 세션**(자가입력 아님) — RPC 4개가 서버 집계(`voided=false`·`source<>'noshow'` 제외 · `docs/migrations/2026-07-20-ounwan-reward.sql`). 회원 read가 회원 RLS에 막히는 경로는 `SECURITY DEFINER` 헬퍼 경유(`auth_member_id()` 등). ⚠️ **RLS is fully locked and account-scoped (v2)** — 모든 데이터 테이블이 `auth_account_id()` 게이트 + authenticated-only. AI/premium은 구독 상태로 추가 게이트(`my_account_status().access`·`auth_account_plan()` · DDL `docs/migrations/2026-07-16-b1*.sql`·`b2-*.sql`·`2026-07-08-step7*.sql`). **anon-open(`using(true)`) 정책 추가 금지.** 클라 write는 "교훈1 하드닝" 규율(아래).

### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고(**1차 OT도 목표는 오늘 PT 등록** — '맛보기·관계 쌓기'로 끝내지 않는다 · 2026-10-02 대표 못박음), 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 30초~1분에 훑어 외우고 폰 넣은 뒤 당당히 리드. 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**. 세일즈·운동 파트 구체 대사 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외**(의료 안전 우선). 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.

### Real vs. demo data — the central rule

Per MASTERPLAN §5: **plumbing is real**(member 등록/목록/선택·클립보드·voice-log DB 저장), 대부분 **content generation은 여전히 demo**(AI 성향 요약·모든 세일즈 스크립트/루틴/타임라인). ⚠️ admin 분석 대시보드는 **실측**(아래 별도 섹션 · 옛 "admin KPI·QC 데모"는 제거/실데이터화됨). **Exceptions(real):** ① 음성일지 voice→AI(`MediaRecorder`→OpenAI STT+Claude 요약 · `app/api/voice-log`) ② 2차 OT `SecondOTTab`(1차 관찰 `ot_log`→`ot-brief` Sonnet · `ot_round=2` 행 `report.brief` 캐시) + 1차 `FirstOTAssist`(Sonnet · `ot_round=1` 행 `report.first_assist` 캐시) + 인바디 분석(`PtInbodyTab` · 1차 행 `report.inbody_analysis` 캐시 · 헬퍼 `lib/otCache.js` · 캐시는 `meta.sourceId`가 현재 최신 측정 행 id와 같을 때만 사용). ⚠️ **체형평가(`PostureAssessment`·`phase:"posture"`)는 2026-09-28 화면에서 제외** — 사진에 기준선만 긋는 방식이라 "얼마나 틀어졌는지"를 말할 수 없고, AI에게 등급을 맡기면 같은 사진도 매번 다른 등급이 나온다(회원 대면 자료라 치명적). 컴포넌트·`posture_assessment` 테이블·저장된 사진·API phase는 **보존**. 되살리는 조건: ① 좌표 기반 측정 ② 앱 기준 등급표 화면 명시 ③ 촬영 가이드 ③ **오운완**(회원앱 카드·트레이너 랭킹·포상 — `daily_workout_log` 출석 **서버 RPC** 집계 · ⚠️ 클라 계산 금지) ④ **수업일지 회원 확인·서명(2026-07-21)** — 아래. 키 없으면 각자 "데모" 폴백. 편집 시 real/fake 명확 분리.

### UI conventions

- **Tailwind CSS v4**(config-less · 토큰 `app/globals.css` `@theme`). **Light theme** brand **red** `--color-primary #dc2626` · base `--color-bg #f1f2f6`. **토큰 값은 「오직 트레이너 Design System」기준(2026-07-21)** — 이름은 앱 것 유지·값만 DS(유틸 1,962곳 자동 반영). 코어 `bg / card / elevate / line / line-strong / ink / sub / muted / primary / primary-strong / primary-soft`. **역할 색(업무흐름 · 브랜드색 아님 · 로고/CTA 금지)** `--color-ot(-text/-soft)` / `pt` / `admin` / `danger(-text)` — 밝은 배경 글자는 반드시 `-text`. 라운드·그림자도 이름유지·값만 DS: `--radius-lg 10px`(컨트롤)·`--radius-2xl 14px`(카드)·`--shadow-sm`(카드)·`--shadow-pop`(모달). 한글 라벨 자간 `--tracking-label-ko 0.02em`. keyframes `tabIn`·`ot-indeterminate`·`ot-sheet`. Workflow tab groups `GROUP_TAB`(OT=amber·PT=sky), admin=fuchsia.
- 색 클래스는 **정적 문자열 리터럴만**(purge · 동적 조립 금지 · 현재 위반 0). 톤 정적맵: `WIDGET_TONE`/`widgetTone`(`components/ui/tone.js` — **역할 이름 체계**: `reapproach`(OT·amber)/`renewal`(PT·sky)/`brand`·`unclosed`(우선순위 red)/`neutral`(zinc)/`danger`(rose). 색 이름은 하위호환 별칭 · 새 코드는 역할 이름 · `emerald`→`renewal`. 소비처 `ToneCard` — **2026-10-03부터 흰 카드 + 왼쪽 3px 역할 색 띠**(틴트 바탕 제거 · `SectionHeader` 15px 굵게 · 힌트는 아래 줄 · `ListRow`는 회색 줄))·`VIEW_META`(`MemberBadge.jsx`)·`GROUP_TAB`(`app/page.jsx`). 변형은 정적 리터럴 추가. (`C`/`toneCls`/`gradeColor`는 없음.)
- Icons: `lucide-react`만.
- Sales/OT script·briefing은 **서버 AI**(`ot-brief`·`voice-log`) — 옛 클라 빌더(`PHASES`·`CRM_SCRIPT`·`buildClosing`…)는 v2에서 제거. 생존 클라 빌더는 `buildVoiceReport`(`VoiceLogTab.jsx`, 데모 폴백)뿐.

### 문구·숫자 기준 (2026-10-01 전체 점검 · 새 화면도 이걸 따른다)

기능을 하나씩 붙이면서 같은 것을 화면마다 다르게 부르고 다르게 셌다. 아래가 정본이다.

- **긴 줄표(—·–) 금지(2026-10-02 대표).** 한글 문장이 끊겨 보이고 기계가 쓴 티가 난다 → 마침표로 나누거나 쉼표·쌍점. AI 출력도 같음(프롬프트 `SAY_STYLE` + 서버 `lib/tidyText`의 `tidyDeep`이 ot-brief·voice-log·owner-report·machine-cues 출력을 한 번 더 거름 · 빈 칸 표시용 "—" 단독은 예외). 강조는 색으로: 핵심 한 구절만 `text-primary-strong`(AI 대사는 `**구절**` → `components/ui/Emph`) · 한 대사·한 카드에 한 곳.
- **안내·오류 문구 = 해요체.** 성공 "~했어요"(❌"저장됨") · 실패 "~하지 못했어요." + 다음 행동: 일반 "다시 시도해 주세요." / 권한(RLS 0행) "권한이 없거나 구독이 만료됐을 수 있어요." / 네트워크 "인터넷 연결을 확인하고 다시 시도해 주세요." / 대표 전용 "대표만 저장할 수 있어요." · 입력 검증 "~을 입력해 주세요"(드롭다운 자리표시 "선택하세요"만 예외).
- **사용자 문구에 개발자 용어 금지** — 정책·마이그레이션·0행·테이블명·`error.message` 원문(영어 DB 에러)·"unknown". 원인은 콘솔로. ("급여 정책"처럼 도메인 뜻이면 OK, "(데모)"는 키 없는 개발 모드 전용이라 OK.)
- **용어(정본 · 2026-10-01 대표 결정):**
  - 센터 주인 = **대표**(❌원장·관리자). 가입 "센터 대표" · 플랜 "트레이너 3인 + 대표 1인" · 화면 "대표 화면/대표 대시보드" · AI 보고서 호칭 "대표님". (역할 코드값 `owner`·`admin` 색 토큰은 그대로 — 코드 이름이지 화면 글자가 아님)
  - 회원이 보는 화면 = **회원 전용 페이지**(❌회원앱 · 2026-10-01). 설치하는 앱이 아니라 링크로 여는 페이지라서. 조사 주의: '앱은/을' → '페이지는/를'. (코드 경로 `app/m/[token]`·컴포넌트명 `MemberAppLink`은 그대로)
  - 수업 기록 = **운동일지**(❌수업일지). 회원앱 확인도 "운동일지 확인". (트레이너 탭 헤더 "수업 확인서 · 운동일지"는 서명 대체 성격을 설명하는 것이라 유지)
  - OT 후 등록 비율 = **등록률**(❌클로징률·전환율). **행동은 '클로징'**(클로징 멘트·클로징 시퀀스·클로징 결과) — "클로징으로 등록률을 올린다". 재등록 비율은 **재등록률**(❌'전환').
  - 띄어쓰기: 이탈 위험 · 만료 임박 · OT 회원 · PT 회원.
- **금액은 `lib/format.js`만** — `won`(반올림 포함)·`wonApprox`(추정치 1,000원 단위)·`manwon`(좁은 칸 만원 축약). 화면에 로컬 WON/manwon 만들지 말 것. **추정치는 반드시 `wonApprox`**, 실제 계약·지출·급여는 `won`.
- **'진행 수업' = voided·노쇼 제외**(`sessionsCount`·`sessionsThisMonthByTrainer` 동일). 수업 수를 보여줄 땐 OT(`ot_log` 1·2차)+PT를 같이 — 한쪽만 세면 옆 화면과 숫자가 달라진다. ⚠️ 급여용 `sessionCountByTrainer`만 별개 기준(노쇼 포함).
- **좌석:** `lib/plans.js` `trainerSeats`(solo 0 · center 3 · 관리자 제외) — 관문은 `app/api/create-trainer`(409 `seat_limit`).

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

### admin 분석 대시보드 — 브리핑·리더보드·매출·전환·리텐션·스케줄 (v2 · 2026-07-26)

원장용 6화면(#6 브리핑·#1 트레이너·#3 매출·#2 전환·#4 리텐션·#5 스케줄). **전부 실데이터**(하드코딩 데모 아님) · **admin이 이미 로드한 배열(`rows`=user_table·`otRows`·`contracts`=session_log·`logs`=daily_workout_log·`trainers`·`schemes`·`runs`)을 props로 받아 파생만** — 대부분 DB 쿼리 0 추가 · 마이그레이션 0 · RLS 무변. **예외 fetch 2개(둘 다 비차단 · `firstErr` 미포함 · 실패해도 해당 탭만 빈상태):** 매출 게이지 목표 `goals`=`trainer_goal`(기존 테이블 · owner SELECT 기존 허용), 스케줄 `appts`=`appointment` **최근 90일**(canceled 포함 · `fetchAllRows`). 스펙: `docs/v2-스펙-트레이너KPI스코어카드-리더보드-구현.md`·`v2-스펙-재등록이탈관제-구현.md`·`v2-스펙-전환퍼널-OT-PT-구현.md`(+매출/스케줄/브리핑 인계서). 핸드오프: `docs/v2-핸드오프-2026-07-25-admin분석대시보드.md`.

- **컴포넌트(`components/admin/`):** `OwnerBriefing`(브리핑 탭 · `ownerBriefing` top3 카드 · 탭 클릭→해당 탭)·`TrainerScorecard`(트레이너 탭 리더보드 · 한 줄 KPI + 펼침 `PayrollConfirm` + 급여 탭 역링크)·`RevenuePipeline`(매출 탭 · 게이지·예측·구성비·6개월 추이[막대 라벨 만원 축약])·`ConversionFunnel`(전환 탭 · OT→PT 깔때기·트레이너 약점·이번주 클로징 임박)·`RetentionConsole`(리텐션 탭 · 만료임박·이탈위험·재등록률)·`ScheduleAnalytics`(스케줄 탭 · 요일×시 밀도 히트맵·완료/노쇼·미처리 예약).
- **파생 함수(`lib/memberStatus.js` · 전부 순수·기준시각 주입):**
  - per-trainer: `closingStatsByRoundByTrainer`(라운드별 클로징률 · 회원×라운드 dedup)·`reregisterStatsByTrainer`·`sessionsThisMonthByTrainer`·`logWriteRateByTrainer`·`churnRiskByTrainer`.
  - 계정 리스트: `churnRiskMembers`·`expiringMembers`·`avgReregisterAmount`.
  - 퍼널: `otFunnel`(**지금 시점 스냅샷** · 추세 못 봄)·**`otFunnelByMonth`**(유입월 코호트 · 달별 등록률 · ⚠️ 최근 달은 진행 중이라 낮게 보임)·`otFunnelByTrainer`(라운드별 `firstSuccess`/`secondSuccess` 포함)·`closingDueSoon`(+내부 `_otResultByMember`).
  - 매출/예측: `avgNewAmount`·`revenueCompositionInMonth`(Σ`revenueByTrainer`와 동치)·`revenueTrendByMonth`(6개월 · ym 문자열 정수연산)·`revenueForecastNextMonth`(다음달 추정 · 회원=visible).
  - 스케줄: `apptWeekdayHourGrid`(KST 요일×시 밀도 · 정원 없어 '가동률%' 아님)·`apptOutcomeByTrainer`(완료/취소/미처리)·`noshowByTrainer`(★노쇼는 `daily_workout_log.source='noshow'` 원천 · appointment 아님).
  - 브리핑: `ownerBriefing`(위 파생들을 impact ₩순 top3로 조립 · 룰기반 결정적 · AI 서술은 후속).
- **⚠️ hidden 필터 = 컴포넌트 책임:** admin은 `user_table.select("*")`로 **hidden(환불·소프트삭제) 포함** 로드 → 파생 함수는 받은 members 그대로 처리하므로, **컴포넌트가 `const visible = members.filter(m=>!m.hidden)`로 걸러 넘긴다**(회원 기반 지표 전부: churn·expiring·funnel·memberTrainer·담당수). 안 그러면 이탈·전환에 환불 회원이 새서 트레이너 화면(`ChurnRiskToday`/`RegisterDueToday`는 hidden 제외 로드)과 숫자 불일치.
- **지표 정의(정본):** OT 클로징률=`closingStats`(회원기준·라운드통합) / 라운드별=`closingStatsByRoundByTrainer` · 재등록률=`reregisterStats`(reg_result) · 이탈률="14일+ 무수업·잔여>0 활성PT" 비율(`ChurnRiskToday` 원천 공유) · 세션소진="이달 진행수업÷담당 활성PT수"(회/월·회원) · 일지작성률="이달 비노쇼 수업 중 ai_summary/sets 있는 비율" · 전환율=`otFunnel.confirmed/intake`(status pt_active 기준·시점 스냅샷).
- **성과/색 컨벤션:** 우수=`text-cyan-700`·주의=`text-danger-text`(rose) — DS 초록제거 정책 준수(성과 good을 emerald로 쓰지 않음). 퍼널 단계막대만 OT흐름(amber→primary) 예외. 임계값은 컴포넌트 상단 상수(`TH`/`convGrade` · 원장 조정 가능). **표본 부족(분모<최소)은 "—" neutral — no-data≠주의.**

### PT 회원 화면 — 대시보드 · 자료남기기 · 재등록 (2026-10-02 개편 · OT 화면과 같은 모양)

- **탭:** 화면 안 알약 `components/pt/PtTabs` — `대시보드 | 자료남기기 | 재등록`(`lib/nav` PT_STEPS · 주소 `logs`/`write`/`renewal` · 탭 번호 10/12/11 그대로). 헤더의 작은 하늘색 서브탭은 없앴다. 섹션 제목은 `components/ui/SectionTitle`(아이콘+15px 굵게 · 옛 `Eyebrow` 12px 회색을 PT 화면부터 교체 중 · 다른 탭은 이어서).
- **대시보드 = `PtDashboard`**(PtWorkoutTab view의 `header`): 회원 카드(정보 수정)·숫자 칸(남은 수업·다음/최근 수업·**이번 달 출석**(진행 수업 기준) + 오운완 N일·인바디 2지표만 → 누르면 `#pt-more` 펼침)·이번 계약 진행 막대·**지금 할 일 1개**(오늘 일지 미작성 → 재등록 타이밍 → 미확인)·처음보다 달라진 것. 무게 그래프·인바디 상세·회원 기록은 '더 보기'(`<details id="pt-more">`)로 접힘 · 지난 수업은 5개 + 모두 보기.
- **자료남기기 순서**(flex order): 운동일지 → 인바디·사진 → 현재 방향 → 급한불(접힘) → 더 보기(회원 전용 페이지 링크 · 환불 · PTView).
- **재등록 = `PtReRegTab`:** ① **회차 = 계약** — 재등록 대화는 '끝나 가는 계약'(`reregRound` = 활성 계약 ?? 최신 계약)에 붙는다. ⚠️ `latestContract`로 붙이면 미리 재등록한 새 계약으로 리포트·결과가 옮겨 간다(옛 버그). 두 번째 계약부터 '첫 재등록 · 2번째 재등록' 알약 → 지난 회차 리포트·결과 열람(결과는 고칠 수 있음 · 생성은 지금 회차만). ② 회원 만족도는 리포트와 따로 **누를 때·입력칸 벗어날 때 바로 저장**(`report.reg_satisfaction`). ③ 리포트 = **`PrepReport kind="reregister"`**(OT와 같은 한 장 문서 · 30초 요약 `cheat` · 변화→앞으로 · 오늘 수업 흐름 · 클로징+혜택 · 거절 대응(기록된 reg_reason 칸 먼저) · 참고) — 옛 `RegBriefView`는 **삭제**. ④ **2번째 이상 재등록**은 ptContext에 `round`·`this_period`(이번 계약 기간 진행 수업·인바디·무게 변화 · 기간 시작 전 마지막 측정이 기준값)·`prev_rereg`(지난 결과·만족도·약속한 next_roadmap/future_change) → 프롬프트가 '지난 재등록 이후'를 먼저, 지난 약속 이행을 정직하게, 다음 단계로. ⑤ report 쓰기(만족도·세일즈북)는 **저장 직전 다시 읽어 병합**(서버가 막 저장한 리포트를 덮지 않게) · 세일즈북 저장 시 `regSalesbookMeta.generatedAt`(세일즈북 목록 정렬용).
- **재등록 관련 숫자 수정(2026-10-02):** 계약 `kind` = 앞 계약이 하나라도 있으면 `reregister`(옛: 잔여 0이면 `new`로 저장돼 재등록률이 틀림) · `reregisterDue(…, { contracts })` = 다음 계약이 대기 중이면 타이밍 아님(미리 재등록 후에도 알림이 남던 것 · 대시보드·'오늘'·만료 임박 목록 공통) · 대표 `briefGapsByTrainer`는 `report.reg_brief`를 읽는다(옛 `r.reg_brief` 컬럼은 늘 비어 0건).
- **홈 '오운완 랭킹'**(`components/home/OunwanRanking` · 2026-10-03 내 실적의 오운완 랭킹과 합침 · '이번 달 | 연속일' 전환 · 상위 5 + 더 보기 10 · 내 실적에서는 뺌 · 폰 TrainerHub 타일 아래 · 넓은 홈 '회원 쪽 소식' 칸): `rpc ounwan_ranking` month_count(오운완 일수) 상위 5 · 내 담당만(직접 맡은 회원 없는 대표는 센터 전체) · 0일·hidden 제외 · 전체/연속일은 '내 실적' 오운완 랭킹.
- **폰 홈 = `TrainerHub`(2026-10-03 위젯 편집):** 인사 → **오늘 카드(고정 · 오늘 수업 · 신규 OT · 다음 수업 바로가기)** → 바로가기 칸 → 정보 카드 → 신규 회원 등록 · 지난 회원 · **홈 편집**. 칸·카드는 트레이너가 넣고 빼고 순서를 바꾼다(`components/home/homeLayout` · **이 기기 localStorage** `ot.homeLayout.v1` · 계정 저장 아님 · 모르는 id는 버림). 처음 = 칸 4개(OT 회원 · PT 회원 · 세일즈북 · 내 실적) + 오운완 랭킹. 칸 후보: 스케줄 · 사례 보관함 · PT 가격표(누를 때만 패키지 조회) · 신규 회원 등록. 카드 후보: 오운완 랭킹 · 이번 달 내 숫자(`MonthNumbers` · `revenueByTrainer`라 내 실적과 같은 숫자) · 재등록 타이밍 · 이탈 위험 · 운동일지 미확인 · OT 다시 연락할 회원('오늘' 탭과 같은 컴포넌트 · 대상 없으면 스스로 숨음). 칸은 폭 640px부터 한 줄 4개(폴드 펼침 · 태블릿 세로). **넓은 홈(`WideHome` · 1024px~)은 고정 · 편집 없음.**

### OT 회원 화면 — 대시보드 + N차 OT (2026-10-02 개편)

- **탭(2026-10-02 대표 지정):** 화면 안 두 줄 — `대시보드 | 1차 OT | 2차 OT …` 아래에 고른 차수의 `OT 준비하기 | 인바디 분석 | OT 피드백`(`OtTabs`). 헤더 서브탭은 OT에선 없음(PT만). OT 회원의 "정보 수정"은 대시보드 회원 카드 안.
- **주소:** `/ot/{회원}` = 대시보드(`components/ot/OtDashboard` · 회원 정보·최근 OT·다음 예약·인바디·차수 진행·'지금 할 일') · `/ot/{회원}/{prep|inbody|feedback}-{n}` = n차의 3칸(OT 준비하기·인바디 분석·OT 피드백). 차수 생략·못 여는 차수면 `OtWorkspace`가 지금 차수로 `replace`. 구 주소 `second`=2차 준비. 탭 번호 계약은 유지(1·2→지금 차수 준비 · 5→지금 차수 피드백 · `lib/nav.js`).
- **차수 규칙은 `lib/otRounds.js` 한 곳:** 차수=ot_log 행(ot_round=n, 최신 행). 1차는 항상 · 마지막 결과 **보류면 다음 차수 자동** · 등록/실패면 끝 · 그 외엔 피드백까지 남긴 뒤 'N차 OT 시작' 버튼.
- **준비하기:** 1차=`FirstOTAssist`(phase first) · 2차+=`SecondOTTab round=n`(phase second + `round`·`history`[1~n-1차 결과·사유·클로징 메모·2차+ 관찰]). 2차 스테일 해시는 종전(1차 관찰만), 3차+는 이전 차수 포함. **결과 기록 폼은 준비하기에서 빠짐 → 모든 차수 `ObservationTab round=n`(같은 양식).**
- **추천 패키지는 순번(ref)이 아니라 저장한 패키지로 찾는다(2026-10-02 버그 수정 · `lib/pkgRef`):** AI는 '가격표 몇 번째'로만 골라서, 다른 트레이너가 보거나 가격표 순서가 바뀌면 대사와 다른 가격이 붙었다. 서버가 결과에 `recommended_program.pick_pkg/alt_pkg`·`plans[].pkg`를 붙여 저장(`attachPkgSnapshots`) → 화면은 `resolvePkg`(id로 지금 가격 · 없으면 저장값). 옛 결과는 순번으로 찾되 설명의 회차와 다르면 가격을 안 붙인다. 클로징 ③ 대사엔 가격 숫자를 쓰지 않는다(바로 아래 가격 줄). 30초 요약은 '이 회원 / 오늘 꼭 / 요청' 문장(단어 나열 금지 · 강조 10자 안팎). **비유 재료 순서**(`METAPHOR_RULE`: 직업 → 목표의 장면 → 문진 → 입력된 생활 → 누구나 겪어본 일상 · 입력 안 된 직업·생활 짐작 금지 · 뻔한 비유 금지 · 없으면 질문만) · **목표·직업 둘 다 없으면**(빈칸은 "-"로 저장되기도 함 → `hasVal`) 만들기 전 '목표 한 줄만' 안내 + 리포트는 첫마디에 목표 질문 · 대사의 목표 자리는 ○○ 빈칸(`fill_in` · 화면 안내) · **비유는 요청에 녹인다**: ask = 비유 한 문장(지시어 없이 온전히) + 요청 질문 · `metaphor_in_ask: true`면 화면이 비유를 따로 안 보여줌.
- **리포트는 '말할 것만'(2026-10-02 두 번째 개편 · 대표: "폰에서 글이 너무 많다"):** 기본 화면 = 대사 말풍선만, 왜·하는 법·바로 느낌·바꿔 쓸 운동·비유·숙제는 '자세히'(`More`). 빨강 강조는 30초 요약·요청·증명 대사만(나머지 `Emph tone="quiet"` 굵게). 클로징은 `ClosingSequence compact`(상자 없이 줄 목록 + 가격 한 줄 `priceLine`). 옛 '추천 프로그램' 문단은 맨 아래 '참고 · 추천 근거'(모두 펼치기에서 제외). 리포트는 **한 장의 문서**(`AIBriefBlock bare` = 흰 종이 한 장 · 머리[제목 17px·만든 시각] + 구분선 + 본문 · 안쪽 섹션은 카드가 아니라 구분선 줄). 한글 줄바꿈 `break-keep text-pretty`. AI 분량은 `SAY_STYLE`(대사 한 문장 60자 안팎 · 운동 `name` 짧게 + `how` 따로(2차 `session_plan`·`proof.moves`도 `exercise` 짧게 + `how` · 옛 캐시는 '이름: 세팅'을 나눠 보여줌) · 숙제 2개). 폰 기준 다 펼쳐도 약 3화면.
- **리포트 화면 = `components/ot/PrepReport`**(1차·2차+ 공용) — 맨 위 **30초 요약**(AI `cheat` 3줄 · 옛 캐시는 기존 항목에서 뽑음) → 수업 순서대로 접힌 섹션 → 펼치면 대사=말풍선(크게)·이유=작게. 제목 '오늘의 OT 사전 준비 리포트'. **1차 운동은 4칸**(몸 상태 체크 → 메인 동작 → 목표 부위 자극 → 처음과 비교 · `workout_structure` 한 줄 + 칸마다 추천 1개 + `alts` 참고 2개 접힘) · 고르는 기준 `EXERCISE_BAR`(안 배워도 아는 쉬운 동작 금지 · 2차 session_plan도 공유). **입장 첫마디 = 센터에서 맞이하는 장면**(인사·일상 질문·오늘 흐름 안내 · "편하게 오세요" 금지). **요청·다음 OT는 요일·시간을 트레이너가 정해 내밀지 않는다**(무엇을=PT 주 N회·기간은 분명히, 언제="다음 주부터" 시기까지만, 다음 OT=가까운 날을 권하고 일정은 회원에게 묻기).
- **OT 피드백 = `ObservationTab`(2026-10-02 개편 · 탭 위주 3블록):** ① 오늘 어떻게 끝났나(등록했어요/다음 OT 이어가요/그만하기로 했어요 + 등록 제안 했나 + 망설인 이유 + 회원의 말 + 다음 OT 날짜) ② 오늘 본 것(준비 리포트 운동이 미리 채워짐 → 반응 칩·★다음에 다시·성향) ③ 다음 OT 방향(진짜 원하는 것+이유 · 다음 OT 제안 수위=`sales_intensity` · AI에게 한마디). 저장은 옛 키 그대로(호환): 등록=success · 이어감+제안=hold · 이어감+제안 못함=none+`report.next` · 그만=fail · `report.feedback_v=2`. **'이어가요'면 다음 차수 자동.** 앞 차수가 '제안했는데 보류'면 다음 준비 리포트는 **클로징 우선 모드**(`secondPrompt` closingFirst), '제안 못 함'이면 '이번엔 반드시 제안'.
- **통계:** 3차 이상은 '2차 이상'에 묶음(`_otResultByMember.r2`·`closingStatsByRoundByTrainer`) · OT 수업 수는 전 차수. `ot_log` 제약은 PK·account FK·user FK(cascade)뿐 — `ot_round` CHECK 없음(2026-10-02 pg_constraint 확인) → 3차 이상 저장 가능.

### 세일즈북 1단계: 사례 보관함 (2026-10-02)

`/salesbook`(`components/salesbook/CaseLibrary` · 왼쪽 메뉴 '세일즈북' · 폰은 홈 타일 · 하단바 5칸은 그대로). 다른 회원의 **비포·애프터(member_photo 경로 참조)·인바디 변화·운동 무게 변화·회원 후기 캡처**를 모아 2단계 세일즈북(회원별 발표 자료)에 넣는다. 표 `sales_case`(kind photo/inbody/lift/review · `data` jsonb 스냅샷 · 계정 스코프 RLS) + 비공개 버킷 `sales-cases/{account_id}/…`(`docs/migrations/2026-10-02-sales-case.sql`). 후보·스냅샷·익명 라벨은 `lib/salesCase.js` 한 곳 — **숫자는 기록에서만(손 수정 불가)** · 저장 라벨은 익명("30대 여성 · 12주") · **회원 동의·개인정보는 트레이너 책임(대표 결정)**, 앱은 안내 한 줄만. 표시는 `CaseCard`(2단계 장에서도 재사용). 사례 **목적**(`data.category` · 다이어트/바디프로필/벌크업/체형교정/건강·체력 · `guessCategory(회원 목표)`로 기본값).

**2단계 발표 자료(2026-10-02):** `/salesbook` = `DeckList`(세일즈북이 저장된 회원 최근 순 · **누르면 바로 발표** `startPresent`) · `/salesbook/cases` = 보관함(헤더 위 칸 탭). OT 세일즈북은 `DeckLauncher`(패키지·프로필 로드 + 최신 report 재읽고 salesbook만 저장)로 어디서든 연다 — 세일즈북 탭(폰은 홈 타일). 재등록 세일즈북은 숫자 계산이 재등록 화면에 있어 `/pt/{id}/renewal?sb=1`로 보내 자동으로 연다. **장 구성** = 세일즈북 JSON의 `deck={order,hidden,cases}`(`components/salesbook/deck.js` `deckOrder` · 장은 CSS `order`로 정렬 · 인쇄도 세로 flex라 순서 유지) · 편집 화면 '장 구성' 패널(`DeckParts` `DeckPanel`)에서 켜기·끄기·순서·**사례 넣기**(회원 목표와 같은 목적 먼저) · 사례 장은 2개씩 '이런 변화를 만들어요'(`CaseSlideBody` · 숫자·사진은 스냅샷 그대로, **AI가 다시 쓰지 않음**). deck 없으면 예전 순서 그대로. **1차 세일즈북(1차 제안 · 2026-10-02):** 1차 OT 클로징 요청 직전 2~3분용. 처음엔 AI 없는 짧은 판이었는데 대표가 "너무 부실하다" → **AI가 쓴 `report.first_salesbook`**(phase `first_salesbook` · Sonnet · `SALESBOOK_PREAMBLE` · 근거 = 사전 문진 + 1차 준비 리포트의 4칸 운동·추천 프로그램 · **관찰 단정 금지**). 장: 표지 → 목표(문진) → **오늘 해본 운동**(`today` 장 · 4칸의 이유·바로 느낌·so_what) → 같은 목적 사례 2개 자동(`pickFirstCases`) → 로드맵 → 플랜·가격 → 혜택 → 약속. **1차 준비 리포트를 서버가 저장하면 이어서(`follow` · after) 1차 세일즈북도 만들어 같은 1차 행에 저장** → 클로징 때 기다림 0. 없으면 `FirstProposalLauncher`가 처음 열 때 한 번 생성(약 20초 · 생성은 `useRef`로 한 번만 — effect 재실행이 요청을 끊지 않게). 생성 실패 시 회원 정보만으로 만든 짧은 판으로 대신. 고친 것은 `report.first_proposal`. **진입은 세일즈북 탭 하나**(2026-10-02 대표: "운동 다 시키고 홈 › 세일즈북에서 보여준다" — OT 준비하기·대시보드의 세일즈북 버튼·2차 OT의 '회원 세일즈북' 칸은 **제거**). 2차 세일즈북도 서버가 2차 리포트 저장 뒤 이어서 만든다(`follow` · 화면이 `photoLabels`를 같이 보냄 · 다시 만들 때 트레이너의 `deck` 유지). 2차 세일즈북 편집은 세일즈북 탭 '편집'. 2차 세일즈북(관찰 근거)과 겹치지 않는다. **PT 가격표(2026-10-02):** `components/salesbook/PriceSheet`(포털 · z-[130]) — 설정의 `pt_package`(노출 켠 것)를 **그대로 읽어** 보여준다(AI 아님 · 패키지를 고치면 다음에 열 때 자동 최신). 열기: 세일즈북·재등록 세일즈북 상단 바와 발표 모드 오른쪽 위 '가격표'(어느 장에서든 · 닫으면 보던 장) · 세일즈북 탭 '가격표'(회원 안 골라도). 6개까지 카드 · **7개부터 표**(한 줄 한 패키지 · '회차 순' 정렬 선택 · 폰은 회차·기간을 이름 아래로) · 표시: 정가 취소선·할인율 · 실판매가 · 회당 · 설명 · 이 회원 추천(`pick_ref`)='추천' · 회당 최저. 가격표가 떠 있는 동안 ESC·화살표는 캡처 단계에서 가격표가 가져간다. ⚠️ 세일즈북(fixed 전체화면)은 `@container` 안에 두지 말 것(레이아웃 격리가 fixed 기준이 됨 · OtDashboard는 바깥에 렌더).

### 대표 아침 보고서 + 대표 피드백 (2026-10-03)

대표 화면 '브리핑' 탭 = 보고서 한 장(`components/admin/OwnerBriefing`): AI 총평 → **① 어제 결과(건별)** → **② 오늘 예정** → ③ 이달 · 앞으로 들어올 매출 → ④ 주의 회원 → ⑤ 코칭. 예전 위쪽 '오늘 챙길 것' 카드 3개는 ②·④와 겹쳐 합쳤다.
- **숫자:** `ownerReportData`(+ `dailyResults` 어제 결과 · `todayPlan` 오늘 예정 · `lib/memberStatus`). 어제 결과 = 그날 시작한 매출 계약(신규 · 재등록 · 횟수 · 회당 · 금액) + 그날 결과를 남긴 OT(보류 · 제안 못 함 · 그만 · 이유 · 회원의 말) + 그날 남긴 재등록 보류 · 안 함. OT 등록은 같은 날 신규 계약이 있으면 계약 줄로만.
- **결과 시각:** `ot_log.closing_recorded_at` · `session_log.reg_recorded_at` — **DB 트리거**가 결과(closing_result · reg_result)나 OT 피드백 저장 시각(`report.feedbackAt` · ObservationTab이 씀)이 바뀔 때 서버 시각으로 채운다(`docs/migrations/2026-10-03-owner-daily-report.sql`). 이전 기록은 비어 있어 보고서에 안 잡힌다.
- **매일 9시(KST) 미리 만들기:** Vercel Cron `0 0 * * *` → `app/api/cron/owner-daily-report`(CRON_SECRET · center 계정마다 service_role로 읽어 ownerReportData + AI(프리미엄 · 구독 활성만) → `owner_daily_report` upsert(account_id, ymd)). 대표만 SELECT · 클라 쓰기 없음. 화면은 그날 행이 있으면 그것('아침 9시 기준'), 없으면 지금 데이터로 만든다(예전 방식 · 하루 캐시 `owner-report-v3`). 지난 보고서는 날짜 선택. 점검: `?account=<id>`로 한 센터만.
- **AI 프롬프트 공용** `lib/ownerReportAI`(`buildOwnerAIInput` · `generateOwnerAI`) — `app/api/owner-report`(열 때)와 9시 작업이 같이 쓴다. 회원 이름은 AI에 안 넘김(트레이너 이름 · 이유 분류 · 회원의 말만).
- **대표 피드백** `owner_feedback`: 어제 결과 줄마다 '피드백 남기기'(대표만 insert · 본인 담당 건엔 버튼 없음) → 받는 트레이너 `OwnerFeedbackToday`(폰 홈 오늘 카드 아래 · '오늘' 탭 맨 위 · 넓은 홈) · '확인했어요' = rpc `mark_owner_feedback_seen`(트레이너는 본문 수정 불가) → 대표 화면에 '트레이너 확인함'. 같은 회원의 다음 리포트(first · second · reregister) 프롬프트에 `[★대표 피드백]` 블록(`app/api/ot-brief` fetchOwnerFeedback · 최근 3개 · 대사에 그대로 옮기거나 대표 언급 금지).

### 수업일지 회원 확인·서명 (v2 · 2026-07-21)

`daily_workout_log`(수업확인서 겸 운동일지)를 **회원이 회원앱에서 '확인'** → 종이 수업확인 서명 대체. 데이터·근거는 `docs/v2-스펙-수업일지-회원확인서명+진입게이트.md`(v2.1).

- **테이블 `workout_log_confirmation`**(append-only 감사): `log_id`·`member_id`·`result`(현재 confirm만)·`method`(tap·drawn은 후속)·`content_hash`(확인 시점 내용 동결)·`confirmed_at`. confirm 1건/일지(partial unique). **IP·UA 미수집**(개인정보/약한 증거가치). 회원 SELECT own · 트레이너 SELECT account 스코프 · **회원 직접 write 없음**(서버 라우트만).
- **뷰 확장:** `member_workout_log`에 `confirmed_at`·`confirm_result` append(집계 lateral · confirm 우선).
- **write 라우트 `app/api/member-confirm`:** 회원 JWT→`member_id` 매핑 → service_role로 일지 재조회(소유·voided/noshow 검증) → **서버가 `content_hash` 계산**(클라 위조 불가) → insert(교훈1 `.select()`). **`result`는 confirm 전용**(그 외 400 · dispute 구조적 차단). 키 없으면 503(fail-closed).
- **해시 공용 `lib/workoutHash.js`:** `workoutCanonical(log)` 단일 출처 → `contentHashNode`(라우트·Node crypto 주입) / `contentHashBrowser`(트레이너 뱃지·subtle). **★둘이 반드시 같은 canonical** — 다르면 오탐("항상 변경됨"). `sets_structured` jsonb 키 순서는 양쪽 PostgREST라 안정(스모크 확인 권장).
- **회원 게이트(`ConfirmFlow` in `app/m/[token]/page.jsx`):** **소프트** — 상단 배너+뱃지 상시, `pending≥3`일 때만 소프트 모달(닫기·"나중에" snooze). 확인 전용. ⚠️ **fail-open**(503/로드실패 시 게이트 끔 · 락아웃 금지). 유예: `session_at < 오늘(KST)`.
- **트레이너 대응(`PtWorkoutTab` 대시보드=tab 10):** 각 로그 뱃지(확인됨/미확인) + **해시 대조 "확인 후 변경됨 ⚠️"**. 로그 **수정**(ai_summary 인라인) + **삭제=void(소프트)**(`voided=true` · 오운완·차감 자동 제외 · 무르기). ⚠️ **하드 DELETE 금지**(confirmation `on delete cascade`로 서명 삭제). RLS는 `auth_all_daily_workout_log`(for all)로 트레이너 수정/삭제 이미 허용.
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
