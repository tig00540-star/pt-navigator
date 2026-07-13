# v2 인계 — Phase 0·1 완료 → 다음 Phase 2 (새 채팅 시작점)

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): CLAUDE.md · MASTERPLAN.md · pt-navigator-총정리.md · v2-디자인-감사-폴리시.md · **이 문서**.
> 역할·흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드 실행, git엔 `docs/migrations` 기록본.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본 하드리프레시.

---

## 0. 이번 세션 성과

### A. 월간 리포트(기능4) 4-a **완성** (`components/views/MonthlyReport.jsx`)
파스였던 "얇음" 해소 — 원장 보고용 두께 확보:
- **전월대비(MoM):** 급여·순매출·수업에 ↑↓%(`prevYm` 재집계, 추가 fetch 0). 전월 0이면 줄 숨김.
- **클로징 성과 상세(누적):** 성공/보류/실패 분해 + 통한 방향(`closingApproachStats`) + 놓친 이유(`closingReasonStats`). ※ ot_log에 closed_at 없어 **월 스코프 불가 → "누적" 라벨**.
- **재등록 파이프라인:** 이달 재등록(월) + 누적 전환 퍼널(`reregisterStats`) + 미등록 사유(`reregisterReasonStats`).
- **목표 달성률:** 급여 Card **밖 독립 블록** — 확정월(과거월)에도 매출 기준으로 표시. 목표 없으면 "다음 급여 구간" 프록시.
- **트레이너 실명:** MyStats가 `trainer.name` 조회해 리포트 헤더에 실명(이메일 노출 제거, `personName` 폴백 유지).

### B. Phase 0 — 트레이너 목표 + 프로필
- **월별 목표매출:** `trainer_goal` 테이블. 설정 UI + 내실적/리포트 달성률 게이지.
- **트레이너 프로필:** `trainer_profile` 테이블(**별도 테이블 = role/active 자기수정 권한상승 차단**). 강한 방향(`strong_approaches`=CLOSING_APPROACH_OPTS 값)·세일즈 스타일(`sales_style`=SALES_INTENSITY_OPTS)·mbti·소개. **지금은 저장만** — AI 연동은 후속.

### C. Phase 1
- **트레이너 라이브러리:** `library_item` 테이블. 카테고리별 영상·링크 CRUD + **카테고리 접기 + 검색**(클라 필터). 관리만 — 수업중 표시·회원 공유는 후속.
- **실적/설정 탭 분리:** 트레이너 앱에 **설정 탭(id 7)** 신설. 설정 5종(목표·프로필·라이브러리·PT가격·계정)을 MyStats→`SettingsView`로 이동. **내 실적 = 조회+달성률만.** `TrainerGoalSetter` 자기완결 리팩터(props 제거).
- **admin 4탭 분리:** `app/admin/page.jsx` 8섹션 → **실적·QC·급여·운영** 게이팅(섹션 내용·계산 불변, 감싸기만).

### D. 기타
- **앱 로고/아이콘 교체**: "오직 트레이너" 로고 → `public/icons/`(192·512·maskable·apple) + `app/favicon.ico`. 코드 무변(파일명 동일).
- **FC 역할 보류**(`docs/v2-백로그-FC역할-보류.md`): 정의·AI 레버리지(배정 매칭)·재개 조건 기록. 트레이너가 FC 직관 약함 → 실제 FC와 설계할 때로.

---

## 1. 새 스키마 (전부 Supabase 실행 완료 · 기록본 `docs/migrations/`)
- `2026-07-12-trainer-goal.sql` — 월별 목표매출. `unique(trainer_id, ym)` · 쓰기=본인.
- `2026-07-12-trainer-profile.sql` — 프로필(격리 테이블). 쓰기=본인, SELECT=계정 내.
- `2026-07-12-library-item.sql` — 라이브러리(pt_package 패턴). 쓰기=본인.
> 공통: `account_id` DEFAULT `auth_account_id()` · `trainer_id` DEFAULT `auth.uid()` → 앱 insert 시 생략. RLS with_check가 `trainer_id = auth.uid()`.

## 2. 새 컴포넌트 (`components/views/`)
- `SettingsView.jsx` — 설정 탭 셸(설정 5종 렌더).
- `TrainerGoalSetter.jsx` — 자기완결 목표 편집(달성률은 내실적).
- `TrainerProfileSettings.jsx` — 프로필 편집(칩 토글).
- `TrainerLibrary.jsx` — 라이브러리 CRUD+접기+검색.

## 3. 진행중/후속 (착수 대기)
- **월간 리포트 4-b 내보내기(PDF·이미지):** 보류. `.report-sheet`/`.no-print` 훅 이미 있음. window.print+@media print · html2canvas-pro(oklch·lazy). 필요 시.
- **트레이너 프로필 AI 연동:** ot-brief 프롬프트에 프로필 주입(내 스타일 맞춤) + 배정 매칭. 데이터만 쌓이는 중.
- **라이브러리:** 수업중 표시(세션뷰 카테고리 필터) · 회원 공유. 후속.
- **클로징 통계 확장:** 선언(`trainer_profile.strong_approaches`) vs 측정(`closingApproachStats`) 대조 대시보드. **실데이터 축적 후**(지금 표본 얇음).

---

## 4. 다음 순서 (권장) — Phase 2

1. **보안 하드닝 스프린트 (회원앱 불변 선행).** 회원별 RLS 설계 + **트레이너 내부데이터(closing_result/detail·sales_intensity·AI브리핑) 회원한테 은폐** + 총정리 §5.1 구멍(오프보딩 active·로그 trainer_id RLS·API 인증/레이트리밋·프롬프트 인젝션) + 개인정보 동의 + SIM teardown(`residence='SIM-데이터'`).
2. **기능5 회원앱** — 회원 로그인, 본인 일지·인바디 추이·예약 조회. **"역할=별도 라우트(/m)+lazy" 원칙**으로(회원 번들에 트레이너 코드 안 실림 = 무게+보안 동시).
3. **기능4 solo(개인트레이너)** — `account.type='solo'` 스키마 이미 있음. solo 온보딩+UI 분기(원장/FC 레이어 없음). 보안 게이트 없이 먼저 가능 — 타깃 고객이 개인이면 앞당김.
4. 사진 비포애프터(Storage RLS+동의)·클로징 통계 확장 = 보안/데이터 쌓인 뒤.

## 5. 보안 게이트 (불변)
실회원 개인정보 입력/**로그인 전 = 보안 하드닝 필수.** 회원앱(기능5)이 이 게이트를 당김. 지금까진 트레이너 본인 데이터라 기존 계정 RLS로 충분했음.

## 6. 참고 — 데이터/유틸
- `lib/format.js`: `won`·`personName`(이메일→@앞)·`hasVal`.
- `lib/memberStatus.js`: 집계 대부분 `ym` 인자로 월필터. **누적(월 스코프 불가):** `closingStats`·`closingApproachStats`·`closingReasonStats`·`reregisterStats`·`reregisterReasonStats`(ot_log·reg_result에 처리일 없음).
- `lib/labels.js`: `CLOSING_APPROACH_OPTS`·`SALES_INTENSITY_OPTS`·`CLOSING_REASON_OPTS`·`REG_REASON_OPTS`·`labelOf`.
- **트레이너 탭**(`page.jsx` TABS): 오늘9·회원0·내실적8·**설정7** ‖ 1차지원1·관찰5·2차2(ot amber) / 운동일지10·인바디12·재등록11(pt sky).
- **admin 탭**: 실적·QC·급여·운영(`atab` 게이팅).
- **`trainer` 테이블**: id(=auth.uid)·account_id·role(owner/trainer)·active·name. 헬퍼: `auth_account_id()`·`auth_is_owner()`. RLS 격리 = `account_id = auth_account_id()`.

---

## 7. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · 통과 후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 하드리프레시.
> 첨부 먼저 읽어줘: **v2-핸드오프-Phase1완료-다음Phase2.md(이 문서·제일 최신)** + CLAUDE.md + MASTERPLAN.md + pt-navigator-총정리.md + v2-디자인-감사-폴리시.md.
> 상태: 월간 리포트 4-a 완성 · Phase 0(목표매출·프로필)·Phase 1(라이브러리·실적/설정 탭 분리·admin 4탭) 완료. 다음 = **Phase 2(회원앱은 보안 하드닝 선행 / solo는 먼저 가능)**. 보안은 실회원 로그인 전 게이트.
