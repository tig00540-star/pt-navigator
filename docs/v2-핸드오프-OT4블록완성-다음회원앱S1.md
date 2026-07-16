# v2 인계 — OT 여정 4블록 전면 재편 완료 → 다음 회원 앱 S1(인증·RLS)

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): **이 문서** · CLAUDE.md · docs/MASTERPLAN.md · docs/pt-navigator-총정리.md · `docs/v2-설계-회원앱-MVP-아키텍처.md`.
> 역할·흐름: 웹Claude(스펙·검토) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 `docs/migrations` 기록본.
> 환경: PowerShell(`C:\Users\tig00\pt-navigator` · grep 없음→`Select-String`, 재귀 `Get-ChildItem -Recurse | Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본(`https://pt-navigator.vercel.app`) 하드리프레시.

---

## 0. 이번 세션 성과 (전부 배포·검증 완료)

**대전제 확립:** OT/재등록 지원 AI = **세일즈 클로징 확률 극대화** · **입장 3분 전 사전무장 컨닝페이퍼**(트레이너가 외우고 폰은 주머니). 세일즈+운동 모두 구체 대사 허용, **숫자 처방(세트·횟수·각도·중량·템포)·의료 단정 금지**. → `CLAUDE.md`에 원칙 박음.

**1차·2차·재등록 전부 4블록 컨닝페이퍼로 재편**(기존 arc·8섹션 등 걷어냄):
- **1차**(`firstPrompt`·`FirstOTAssist`): 앵커 → 오프닝 → **오늘 수업 운동 구성(session_plan)** → 타겟운동(증거 moves 2개·before/after) → 세일즈 비유 → **추천 프로그램(빈도·기간·session_logic '왜 이 횟수', 클로징 앞 배치)** → 클로징 한마디 → 거절 5방어(price/hesitation/doubt/time/compare). + 타겟운동 예시 앵커링 제거(백수 반복 fix).
- **2차**(`secondPrompt`·`SecondOTTab`): 앵커 → 지난 소환 → session_plan → **증명(proof moves 2·if_weak)** → 비유 → 강한 클로징 → 거절5. **1차 관찰(ot_log)이 유일 근거.** ㉠ 결과기록 폼·캐시·D-3 케이스거울 유지. 단일 클로징(3분기 제거).
- **재등록**(`reregisterPrompt`·`PtReRegTab`·`RegBriefView`): 앵커 → **왜 지금(빈도·일지 근거)** → **오늘 수업 흐름(session_flow: 부족분 인지·목표 상향·타이밍)** → 비유 → **재등록 결정 클로징 + 가격혜택(sweetener·덤)** → 거절5(money/sessions_left/low_effect/time/schedule). 빈도=클라가 일지 날짜로 주당 추정 전달. 결과폼·캐시 유지.

**문진표·등록폼:**
- `docs/OT_수업준비_문진표.pdf` — 회원 작성용(카톡링크+휴대 대신 종이 문진). 재정 신호(직업·과거 유료운동·페이스) 은근하게, "돕기 위한" 톤.
- 회원 등록폼 9필드 확장(`user_table`+`MemberForm`+`firstPrompt` 주입): goal_deadline·training_pace·injury_history·exercise_level·quit_reason·past_exercise·availability·activity_level·member_note. **재정 신호 여유 시 세션·단가 넉넉히**(단 출력에 '돈' 직접언급 금지). SQL=`docs/migrations/2026-07-15-member-intake.sql`.

**커밋된 파일:** `app/api/ot-brief/route.js` · `components/tabs/FirstOTAssist.jsx` · `components/tabs/SecondOTTab.jsx` · `components/views/PtReRegTab.jsx` · `components/views/RegBriefView.jsx` · `app/page.jsx`(MemberForm·mapMemberRow) · `CLAUDE.md` · `docs/migrations/2026-07-15-member-intake.sql`.

---

## 1. 남은 즉시 확인 / 미결
- [ ] **Anthropic API 크레딧** — 세션 중 소진돼 데모 폴백 떴었음(충전함). 콘솔(console.anthropic.com) **Plans & Billing에서 Auto-reload·사용한도 알림** 걸어두기(재발 방지).
- [ ] (예전 미결 유지) 런칭 전 Email **"Confirm email" ON** · 테스트계정 teardown · #1 총/잔여수업 실계정 스모크.
- [ ] SQL `2026-07-15-member-intake.sql` Supabase 실행 확인(안 했으면 회원 등록 insert 실패).

---

## 2. 다음 = 회원 앱 MVP · S1 (인증·RLS 뼈대)

**결정(확정):** 회원 앱은 **기존 스택(Next.js+Supabase)에 커스텀 신설**(노션 X — 프라이버시·마찰·기능·미래 확장 다 커스텀이 유리, 노션은 게스트 무료지만 핏 안 맞음). **인증 = 카톡 초대링크 + 휴대 4자리 확인** · **v1 = 열람 우선 MVP**(내 수업일지·인바디 변화량 읽기전용).

**설계 문서:** `docs/v2-설계-회원앱-MVP-아키텍처.md` (인증 흐름·DB·RLS·화면·스프린트 전부).

**S1 스코프(다음 스펙):**
1. SQL — `user_table`에 `member_token`(초대 토큰)·`member_auth_id`(회원 auth 연결) 추가 + **회원 스코프 RLS**(헬퍼 `auth_member_id()` · `user_table`/`daily_workout_log`/`inbody_log` SELECT를 `= auth_member_id()`로) + ★회원 세션엔 트레이너 헬퍼(`auth_account_id`/`auth_is_owner`)가 null이라 매출·급여·타회원 원천 차단.
2. `app/api/member-auth` 서버 라우트(service_role 서버전용 · create-trainer 패턴) — token+휴대끝4자리 검증 → 회원 auth 유저 생성/연결 → 세션 발급.
3. **회원 세션 = 실제 Supabase auth 유저**(RLS·세션 제일 깔끔 · §7 확정).

**S1 착수 전 읽기:** `lib/requireTrainer.js`(auth 패턴) · `lib/supabaseClient.js` · `app/api/create-trainer/route.js`(service_role 서버전용 패턴) · 기존 RLS 헬퍼 마이그레이션(`docs/migrations/2026-07-08-step7b-*` · `2026-07-13-*`) · `user_table` 스키마.

**이후 스프린트:** S2 회원 홈(`app/m/` · 수업일지 타임라인·인바디 추이 읽기전용) → S3 트레이너 '회원 링크 생성·복사' UI → (이후) 자가입력(비포애프터 업로드·유산소·개인운동 → 식단AI·루틴AI).

---

## 3. 백로그 (회원앱 이후 · 문서로 남아있음)
- **자기진화 루프**(`docs/v2-설계-자기진화루프-*.md`): `app_followed`(앱 방향 vs 개인 방법) 기록 · 트레이너 브리핑 피드백 캡처 · D-3 케이스 재등록 확장. → 현장 반응 모이면.
- 트레이너 프로필→맞춤 세일즈 주입(`docs/v2-스펙-프로필-맞춤세일즈-3phase.md` — 서버 fetch안, 미착수).
- 관리자: KPI 실데이터화 · 매월1일 매출 예측 리포트 · 인바디 순위. 트레이너: 월간리포트 3회미만 주의 · 강약점 리포트.

---

## 4. 이번 세션 규약 (다음에 참고)
- **4블록 스키마 공통:** member_read(앵커) · (오프닝/소환) · session_plan · (타겟/증명/왜지금) · sales_metaphor · closing_line · objection_defense[5] · data_gaps. 렌더도 대칭.
- **route.js 파서:** phase별 `REQUIRED_FIRST/SECOND/REREG`로 완전성 검사(신키 누락 시 파싱 실패 — 스키마 바꾸면 REQUIRED도 같이). `FIELD_TERMS`=출력 필드명 누출 방어(신필드 추가 시 함께).
- **구캐시 방어:** 각 렌더에 legacyCache 감지 → '이전 형식' 안내 + 재생성 유도(옛 스키마 캐시 회원 크래시 방지).
- **클로드코드 넘길 때:** md 통째 X → PART별 실행 지시(코드블록)만 복붙. 파일지정 add·lint 후 커밋·`git show --stat HEAD`. 스키마 바꾸면 폰에서 '다시 생성'으로 검증.

---

## 5. 이번 세션 생성 문서 (docs/)
- OT 재편: `v2-설계-OT여정-전후재편-제안.md` · `v2-스펙-1차OT-사전무장-프롬프트최적화.md` · `v2-스펙-1차OT-사전무장-구현.md` · `v2-스펙-2차OT-4블록-구현.md` · `v2-스펙-재등록-4블록+수업흐름-구현.md`
- 문진·등록폼: `OT_수업준비_문진표.pdf` · `v2-스펙-회원문진-등록폼확장+프롬프트주입.md` · `migrations/2026-07-15-member-intake.sql`
- 회원앱·진화: `v2-설계-회원앱-MVP-아키텍처.md` · `v2-설계-자기진화루프-트레이너맞춤세일즈선생님.md` · `v2-스펙-프로필-맞춤세일즈-3phase.md`

---

## 6. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String, 재귀는 Get-ChildItem -Recurse | Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 배포본(https://pt-navigator.vercel.app) 하드리프레시.
> 첨부 먼저 읽어줘: **이 문서(v2-핸드오프-OT4블록완성-다음회원앱S1.md · 제일 최신)** + CLAUDE.md + docs/MASTERPLAN.md + docs/pt-navigator-총정리.md + docs/v2-설계-회원앱-MVP-아키텍처.md.
> 상태: OT 여정(1차·2차·재등록) 전부 **3분 사전무장 4블록 컨닝페이퍼로 재편 완료**(세일즈 클로징 극대화 대전제). 문진표 PDF + 회원 등록폼 9필드 확장도 완료. 다음 = **회원 앱 MVP S1(인증·RLS 뼈대)**. 회원 앱은 커스텀(Next.js+Supabase)·카톡링크+휴대인증·열람 MVP로 확정. 착수 전 `lib/requireTrainer.js`·`lib/supabaseClient.js`·`app/api/create-trainer/route.js`·기존 RLS 헬퍼 마이그레이션·`user_table` 스키마 읽고 S1 스펙(SQL: member_token·member_auth_id·회원 RLS·auth_member_id() + member-auth 서버 라우트) 잡아줘. (미결: Anthropic 크레딧 Auto-reload · Confirm email ON · 테스트계정 teardown.)
