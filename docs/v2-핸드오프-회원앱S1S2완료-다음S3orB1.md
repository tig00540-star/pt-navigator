# v2 인계 — 회원 앱 S1(인증·RLS)·S2(홈·열람) 완료 → 다음 S3 or B1

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): **이 문서** · CLAUDE.md · docs/MASTERPLAN.md · docs/pt-navigator-총정리.md · `docs/v2-설계-회원앱-MVP-아키텍처.md` · (S3면) `docs/v2-스펙-회원앱-S2-회원홈-열람-구현.md` · (B면) `docs/v2-설계-구독등급+접근통제+카카오로그인.md`.
> 역할·흐름: 웹Claude(스펙·검토) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰/Supabase 검증.
> 커밋은 트레이너 직접(파일지정 `git add` · `npm.cmd run lint` 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 `docs/migrations` 기록본.
> 환경: PowerShell(`C:\Users\tig00\pt-navigator` · grep 없음→`Select-String`). 폰=Vercel 배포본(`https://pt-navigator.vercel.app`) 하드리프레시.

---

## 0. 이번 세션 성과 (전부 배포·검증 완료)

**회원 앱 v1(열람) 완성** — 회원이 카톡 링크 + 휴대 끝4로 로그인해 자기 수업일지·인바디를 보는 것까지 end-to-end 실동작 확인.

**S1 — 인증·RLS 뼈대 (완료·격리 실증 통과):**
- `user_table`에 `member_token`(초대 토큰)·`member_auth_id`(회원 auth 연결 · `on delete set null`) 추가 + 부분 유니크 인덱스 2개.
- 헬퍼 `auth_member_id()`(security definer · 회원 세션 → 내 `user_table.id` · 트레이너 세션엔 NULL).
- `app/api/member-auth/route.js` — 카톡 토큰 + 휴대끝4 검증 → (최초) 회원 auth 유저 생성·연결 → **비번 회전 후 `signInWithPassword`로 세션 발급** → `{access_token, refresh_token, member}` 반환. service_role 서버전용, 토큰별 스로틀(6/10분), 에러 일반화.
- **격리 실증 통과:** 회원 JWT로 `user_table` 1행(내 것)·`daily_workout_log` 내 것만, `session_log`·`ot_log`·`trainer` **0행**(트레이너·매출 데이터 원천 차단).

**S2 — 회원 홈(열람) (완료·폰 실검증 통과):**
- **§5 컬럼 누출 차단:** S1의 raw 회원 SELECT 정책 3개 제거 → **안전 뷰 3개**로 교체. `member_me`(id·name·goal·goal_deadline·trainer_name) / `member_workout_log`(created_at·ai_summary) / `member_inbody`(측정일·수치6). `security definer`(security_invoker=false) + 내부 `where = auth_member_id()`. 제외: `member_note`·`quit_reason`·`raw_voice_text`·inbody `note`. `grant ... to authenticated` + `revoke ... from anon`.
- `components/AuthGate.jsx` — `/m` 회원 라우트 게이트 우회(`isMemberRoute` · 훅 뒤·ready 앞).
- `lib/memberSupabase.js` — 회원 전용 클라(storageKey `pt-member-auth` 분리 · persist·autoRefresh → 트레이너 세션과 충돌 없음·재방문 유지).
- `app/m/[token]/page.jsx` — 끝4 로그인(S1 라우트) → setSession → 홈(프로필 헤더 · 수업일지 타임라인 `ai_summary` · 인바디 추이 delta색·스파크라인). 기존 레드 브랜드·`ui/` 프리미티브·`lib/labels` INBODY_FIELDS 재사용. `me` null·데모 가드 포함.
- **폰 검증:** `/m/<토큰>` + 끝4 → 홈 렌더, 수업일지·인바디(앱에서 저장한 실데이터) 정상 표시.

**커밋된 파일:** (S1) `app/api/member-auth/route.js` · `docs/migrations/2026-07-16-member-auth-rls.sql` · `docs/v2-스펙-회원앱-S1-인증RLS-구현.md`. (S2) `app/m/[token]/page.jsx` · `components/AuthGate.jsx` · `lib/memberSupabase.js` · `docs/migrations/2026-07-16-member-views.sql` · `docs/v2-스펙-회원앱-S2-회원홈-열람-구현.md`.

**실행된 SQL(Supabase):** `2026-07-16-member-auth-rls.sql` · `2026-07-16-member-views.sql` 둘 다 실행 완료.

---

## 1. 남은 즉시 확인 / 미결

- [ ] **테스트 흔적 teardown(한 번에):** 샘플 회원의 `member_token`·`phone_number`(원래 null이었음 → null 복원 가능) · 테스트로 저장한 인바디 행 · 그때 생성된 회원 auth 유저 `m-<id>@member.pt-navigator.app`(Supabase Authentication에서 삭제 → FK `on delete set null`로 링크 자동 해제). 지금 급하지 않음.
- [ ] **`2026-07-15-member-intake.sql` 실행 확인** — 회원 등록폼 9필드. 실행 안 됐으면 신규 회원 등록 insert 실패(테스트는 기존 회원 UPDATE로 우회했음).
- [ ] (런칭 전) Anthropic 크레딧 **Auto-reload** · Email **"Confirm email" ON**(회원 로그인은 `email_confirm:true`라 무관) · 실계정 스모크.
- [ ] **B계열 설계 문서 git add** — `docs/v2-설계-구독등급+접근통제+카카오로그인.md`가 디스크에 있으나 미커밋일 수 있음(다음 착수 시 함께 add).
- [ ] **루트 스크래치 청소(선택·리스크0):** gitignore된 `caf.txt`·`diff-*.txt`·`inactive.txt`·`memberlist.txt`·`page-slices.txt`·`reapproach.txt`·`save.txt`·`shell.txt` 12개(전부 커밋된 실파일의 옛 덤프 = 안전 삭제). `Remove-Item ...` 또는 `_trash`로 이동 후 build green 확인.

---

## 2. 다음 = 둘 중 택1

**A) S3 — 트레이너 링크 발급 UI (작음 · 회원앱 v1 완결):**
- 회원 카드/상세에 **'회원앱 링크 생성·복사·재발급'** 버튼 → `member_token = gen_random_uuid()`(없으면) → `/m/<token>` 클립보드 복사(기존 카톡 복사 패턴 재사용). '재발급' = 토큰 덮어쓰기(이전 링크 무효).
- `user_table` UPDATE 정책 **이미 있음**(추가 SQL 불필요). (선택) '회원앱 연결됨' 배지.
- 이거 하면 손으로 SQL 안 만지고도 회원 앱 v1(인증·열람·발급) **완결**.

**B) B1 — 구독 잠금 (돈 받는 스위치 · 좀 큼):**
- 설계 = `docs/v2-설계-구독등급+접근통제+카카오로그인.md`(두 층 잠금: 층1 결제활성=앱사용 / 층2 premium=회원관리).
- B1 스코프: `account`에 `subscription_status`·`plan` 딱지 + `auth_account_id()`에 subscription AND + **기존 계정 전부 active 백필**(안 하면 본인 잠김) + `my_account_status()`(결제벽/온보딩 분기용) + 화면 분기. **활성은 처음엔 수동 스위치**(결제 자동=B4).
- B2(프리미엄 게이트=회원관리 링크발급·member-auth에 plan 체크)는 S3와 함께 붙이면 자연스러움. B3 카카오(트레이너 로그인)·B4 결제 웹훅은 이후.

> 추천 순서 감: **S3 먼저**(회원앱 완결·작음) → B1(구독) → B2(프리미엄) → B3/B4. 단 급하면 순서 바꿔도 됨.

---

## 3. 회원 앱 규약 (S1·S2에서 확립 — 이어서 작업 시 준수)

- **격리 원리:** 회원 auth 유저는 `trainer` 행이 없음 → `auth_account_id()`/`auth_is_owner()`=NULL → 트레이너·account 스코프 정책 전부 거짓 → 매출·급여·타회원·session_log·ot_log 원천 0행. 회원은 `auth_member_id()` 기반으로만 자기 것.
- **회원 세션 = 실제 Supabase auth 유저:** 합성 이메일 `m-<user_table.id>@member.pt-navigator.app` + `email_confirm:true`. ★생성 시 `user_metadata`에 **`account_type` 절대 금지**(넣으면 가입 트리거가 account+trainer 생성 → 격리 붕괴). `role:"member"`만.
- **세션 발급:** 서버가 비번 회전 → anon 클라 `signInWithPassword` → 토큰 반환 → 클라 `setSession`. (create-trainer와 동일 service_role 패턴.)
- **회원 데이터 노출 = 안전 뷰만:** 원시 테이블 회원 정책 없음. 새 회원 화면은 뷰(또는 새 definer 뷰)로만 조회. 민감 컬럼은 뷰에서 제외. Supabase Security Advisor의 "security definer view" 경고는 **의도된 설계**(컬럼 은닉)라 무시.
- **회원 라우트 = `/m`:** `AuthGate`가 `isMemberRoute`로 우회. 회원 클라는 `lib/memberSupabase.js`(storageKey 분리) 사용 — 트레이너 `lib/supabaseClient.js`와 섞지 말 것.
- **클로드코드 넘길 때:** md 통째 X → PART별 실행 지시(코드블록)만. 파일지정 `git add` · lint 후 커밋 · `git show --stat HEAD`. SQL 바꾸면 Supabase 실행 + 폰 실검증.

---

## 4. 이번 세션 생성 문서 (docs/)

- 회원앱 구현 스펙: `v2-스펙-회원앱-S1-인증RLS-구현.md` · `v2-스펙-회원앱-S2-회원홈-열람-구현.md`
- 회원앱 마이그레이션: `migrations/2026-07-16-member-auth-rls.sql` · `migrations/2026-07-16-member-views.sql`
- 수익화 설계(미착수): `v2-설계-구독등급+접근통제+카카오로그인.md` (구독 2층 잠금·결제 자동활성·트레이너 카카오 로그인·로드맵 B1~B4)

---

## 5. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰/Supabase).
> 커밋은 내가 직접(파일지정 git add · `npm.cmd run lint` 통과 후 · 직후 `git show --stat HEAD`). 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 배포본(https://pt-navigator.vercel.app) 하드리프레시.
> 첨부 먼저 읽어줘: **이 문서(v2-핸드오프-회원앱S1S2완료-다음S3orB1.md · 제일 최신)** + CLAUDE.md + docs/MASTERPLAN.md + docs/pt-navigator-총정리.md + docs/v2-설계-회원앱-MVP-아키텍처.md.
> 상태: **회원 앱 S1(인증·RLS)·S2(홈·열람) 완료·배포·검증** — 회원이 카톡링크+휴대끝4로 로그인해 자기 수업일지·인바디를 보는 v1(열람) 완성. 격리·컬럼누출(안전뷰)까지 닫음. 다음 = **S3(트레이너 링크 발급 UI · 작음 · 회원앱 완결)** 또는 **B1(구독 잠금 · 돈 받는 스위치)** 중 택1. (S3면 docs/v2-스펙-회원앱-S2 참고, B면 docs/v2-설계-구독등급+접근통제+카카오로그인 참고.) 착수 전 관련 파일 읽고 스펙 잡아줘.
> 미결: 테스트 흔적 teardown(샘플 회원 토큰·phone·인바디 행·회원 auth 유저) · member-intake SQL 실행 확인 · B설계문서 git add · (런칭 전)Anthropic 크레딧·Confirm email.
