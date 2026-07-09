# v2 — 스프린트7-c 인계 · 권한차등 + 내 회원만 + 초대 온보딩 **완료** · ⑦ 사실상 종료

> ⑦-c 대부분 종료. (1) `/admin` 원장전용 게이트 (2) "내 회원만" 격리(RLS+위젯) (3) 트레이너 초대 온보딩(앱 내 생성)
> 까지 배포·실증 완료. + 기능 D(클로징 케이스 수집·집계) 착수. **남은 ⑦-c = QC 실데이터화 하나(파킹).**
> ⑦(로그인·RLS·소유권·권한·온보딩·격리) 대공사 = **사실상 완료 → 파일럿 다중 트레이너 배포 가능.**
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ 커밋은 트레이너 직접 터미널(`git add` 파일지정) · diff 통과 후 · 직후 `git show --stat HEAD`.
> ★ SQL은 Supabase 대시보드 직접 실행 → git엔 `docs/migrations/*.sql` 기록본만. SQL 성공 ≠ 반영(실증 필수).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` · `docs/v2-roadmap-next.md` ·
> `docs/v2-sprint7-handoff.md` · `docs/v2-sprint7-postscript-handoff.md`(⑦-a) · `-b`(⑦-b) ·
> `docs/v2-closing-cases-D3-design-note.md`(D-3 설계) · migrations(step7a · step7b 4파일 · **step7c2a** · otlog-closing-case) · `CLAUDE.md`.

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
①~⑥                 ✅
⑦ 로그인·RLS
   ├ ⑦-a 로그인 + anon 잠금            ✅
   ├ ⑦-b account_id 소유권 RLS         ✅
   └ ⑦-c ├ c-1 /admin owner 게이트      ✅ ← 이번 세션 (클라 게이트)
          ├ c-2 내 회원만 (2a RLS + 2b 위젯)  ✅ ← 이번 세션
          └ c-3 초대 온보딩(A) ✅  +  QC 실데이터 ⏳(아직 데모 · 파킹)
기능 D 클로징 케이스   ├ D-1a 2차 수집 ✅  ├ D-1b 집계·카드 ✅  ├ D-2 1차 수집 ⏳  └ D-3 AI 활용 ⏳(파일럿 뒤)
```

**커밋 체인(origin/main · push 완료):**
`ae4d699`(S7-⑥) → `826e144`·`ade42f4`(⑦-a) → `a9cb080`(⑦-a 인계) → `cea5888`·`da271cc`·`e0464e8`·`2a331ee`(⑦-b) →
`7ca4369`(⑦-b 인계+migrations) → **`e18bd9e`(⑦-c-1 /admin 게이트)** → **`6b244e8`(D-1a + otlog-closing-case.sql + D-3 노트)** →
**`1f2be72`(D-1b 집계 카드 · 해시 git log로 확인)** → **`37bcbb0`(A 온보딩)** → **(2b ReapproachToday 스코프 · push 후 최신 HEAD)**.

> ⚠️ ⑦-c-1·2b·A = **코드 커밋**(git diff 있음). ⑦-c-2a = **SQL만**(대시보드 · 기록본 아래 §5 — **아직 미커밋, 커밋할 것**).

---

## 1. 이번 세션 완료·확정

### ⑦-c-1 · /admin 원장(owner) 전용 게이트 (`e18bd9e` · 클라 층 · SQL 0)
- `app/admin/page.jsx`: 마운트 시 `trainer.role` 조회 → `owner` 아니면 "권한 없음" 화면(+ `/` 링크), 데이터 조회 스킵.
- role 상태 3값(null=조회중 / owner / denied). 데모 모드(`!supabase`)는 owner로 스킵.
- **정직한 한계:** 클라 UX 게이트. /admin이 읽는 ot_log·session은 account 스코프라, 진짜 DB 차단은 c-2가 채움(트레이너 스코프).

### D-1a · 2차 클로징 케이스 수집 (`6b244e8` · SQL 2컬럼)
- SQL(대시보드·기록본 `docs/migrations/2026-07-08-otlog-closing-case.sql`): `ot_log += closing_reason text` · `closing_detail jsonb`.
- `lib/labels.js`: `CLOSING_REASON_OPTS`(8개 카테고리 · provisional). `SecondOTTab.jsx`: 결과 fail/hold → 사유 select, success/fail/hold → 케이스 3박자(`{approach,reaction,outcome}`, 다 선택) → 저장·프리필.
- **카테고리=집계 / detail jsonb=맥락(집계 안 함).** D-3 AI 재료.

### D-1b · 클로징 실패·보류 사유 집계 카드 (`1f2be72`)
- `lib/memberStatus.js`: `closingReasonStats(otRows)`(reregisterReasonStats 거울 · **fail/hold 행만** = 성공 후 stale 제외).
- `app/admin/page.jsx`: "클로징 실패·보류 사유" 카드 추가, 섹션 그리드 2x2(방향강점·클로징약점 / 재등록사유·수업수), Eyebrow "클로징·재등록 분석".

### A · 트레이너 초대 온보딩 (`37bcbb0` · 앱 내 계정 생성)
- **신규** `app/api/create-trainer/route.js`(Node · service_role 키 서버 전용): 호출자 owner 검증(`getUser(token)`→role) → `auth.admin.createUser`(임시비번 자동·email_confirm) → `trainer` insert(owner의 account_id 상속·role=trainer) → 실패 시 `deleteUser` 롤백. 반환에 임시비번.
- **신규** `components/AddTrainerForm.jsx`: 이메일+이름 폼 → 세션 토큰 Bearer로 POST → 임시비번 1회 표시.
- `app/admin/page.jsx`: `<main>` 최상단에 `<AddTrainerForm/>`.
- **환경변수:** `SUPABASE_SERVICE_ROLE_KEY` — Vercel(Production) 설정 완료. 로컬 `.env.local`도 넣음(선택).
- 결과: **owner가 Supabase 안 들어가고 트레이너 추가.** 실증 = 폼 추가 → 그 계정 로그인 성공 · /admin 권한없음 · Auth/trainer 행 자동 생성.

### ⑦-c-2 · "내 회원만" 격리 (owner=전체 / 트레이너=본인)
**2a — user_table RLS (SQL · 대시보드 · 기록본 §5 — 미커밋):**
- `auth_is_owner()` 헬퍼(SECURITY DEFINER, trainer.role='owner') 신설.
- `user_table` SELECT/UPDATE 정책 → `account_id = auth_account_id() AND (auth_is_owner() OR trainer_id = auth.uid())`. INSERT 그대로(DEFAULT trainer_id=auth.uid()).
- **앱 코드 무변경**(RLS 자동필터). 실증: owner 전체 · 테스트 트레이너 회원목록 빈칸(기존은 owner 것).

**2b — ReapproachToday 위젯 스코프 (코드 · 방금 커밋):**
- `components/views/ReapproachToday.jsx`: ot_log hold 조회가 user_id 필터 없이 account 전체를 긁던 유일 누수 → `memberKey`(members id) 만들고 `.in("user_id", ids)` + deps `[today, memberKey]`. RegisterDueToday·RegisterReapproachToday는 **이미** `.in(ptIds)`로 스코프돼 있었음(무변경).
- 실증: owner 전체 · 테스트 트레이너엔 남 회원 보류 미표시.

---

## 2. 소관/경계 (오버빌드 방지)

- **⑦-c가 한 것:** 로그인한 트레이너가 **자기 회원만**(목록·선택·탭·홈 위젯) 보고, **owner는 계정 전체**를 봄. `/admin`은 owner 전용. 트레이너 계정은 앱에서 생성.
- **정상 동선 격리 완결:** 회원목록(RLS) → 그 안에서만 선택 → 선택 회원 데이터만 fetch. 홈 위젯 3개 다 members로 스코프.
- **안 한 것 (의도):**
  - **ot_log·session_log·daily_workout_log에 trainer_id RLS 안 검** — account 스코프만. 정상 UI 동선에선 안 새지만(선택이 내 회원으로 제한), **직접 REST 호출 방어는 아직 없음.** 필요해지면 그 테이블에 trainer_id 박고 RLS(더 큼) — 지금 불필요.
  - **QC 실데이터화** = `/admin`의 `TRAINERS` 하드코딩 데모 그대로. 다중 트레이너 지표 쌓인 뒤.
  - **비번 변경 UI 없음** — 임시비번이 그냥 그 트레이너 비번(나중 `updateUser` 화면 얹기 쉬움).
  - **초대 메일(B)** 안 함 — A는 임시비번 방식. SMTP 붙이면 승급.

---

## 3. 살아있는 부채·주의

- **★ ⑦-c-2a migration 기록본 커밋** — 아래 §5 SQL을 `docs/migrations/2026-07-08-step7c2a-member-scope.sql`로 저장·커밋할 것. 되돌리기 어려운 RLS의 유일한 git 기록(롤백 주석 포함).
- **★ service_role 키** — Vercel Production에 있음. 마스터키(RLS 우회)라 절대 브라우저/깃 금지. `create-trainer` route(서버)에서만 `process.env`로 읽음. 재배포 시 유지 확인.
- **★ trainer FK `on delete` 미정** — `trainer.id → auth.users(id)`가 `on delete` 없이 걸림 → 유저 삭제 시 trainer 행 먼저 지워야(안전벨트로 유효). **결정: restrict 유지 + 오프보딩=`active=false`(하드삭제 안 씀).** 오프보딩 UI 설계 때 명시.
- **★ 테스트 트레이너 청소** — A 실증으로 만든 `test-trainer@x.com`(+ 이전 role='trainer' 테스트) go-live 전 정리. FK 순서: `delete from trainer where id=...` → 대시보드 auth user 삭제.
- **QC 실데이터화** = ⑦-c 남은 조각(파킹). `/admin` TRAINERS 데모.
- **④ 테스트행 청소**(go-live 직전) — 옛 한글 '성공' 행 + 각 세션 테스트 데이터. DELETE 정책 없음(대시보드 수동).
- **직접 REST 격리(위 §2)** — 파일럿(신뢰) 무방. 필요 시 ot_log/session trainer_id RLS.

---

## 4. 다음 후보 (트레이너 판단)

- **QC 실데이터화** — `/admin` 트레이너 QC(조회율·리딩률·grade) 데모 → 실데이터. 다중 트레이너 전제라 이제 소관.
- **D-2 · 1차 클로징 케이스 수집** — D-1a의 1차판(FirstOTTab/FirstOTAssist 계열). 꼬리 케이스(1차 즉등록 드묾)라 값어치 낮음.
- **D-3 · 클로징 케이스 AI 활용** — 실패·성공 케이스를 1·2차 브리핑에 되비춤. **파일럿 데이터 축적 뒤.** 설계 = `docs/v2-closing-cases-D3-design-note.md`(4장치·결정권자 키트·진짜 욕구 리딩·압박 재정의·성공 케이스).
- **스케줄표** — `scheduled_at` 자리만 있음. 파킹 국면.
- **[파킹]** (B) AI 패키지 제안(가격표 선행) · (C) 클로징/재등록 예측(구간·왜·지렛대) · 초대 메일(B)·비번변경 UI · 회원 기본정보 수정 UI · 음성 디테일.

---

## 5. ⑦-c-2a 마이그레이션 기록 (★ 이 SQL을 migrations 파일로 커밋)

```sql
-- ⑦-c-2a — user_table 트레이너별 격리 (owner=전체 / trainer=본인 회원)
-- 실행: Supabase 대시보드(2026-07-08). 앱 무변경(RLS 자동필터).

-- 1) 헬퍼: 로그인 유저가 owner인가
create or replace function auth_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from trainer where id = auth.uid() and role = 'owner') $$;
grant execute on function auth_is_owner() to authenticated;

-- 2) SELECT: 같은 계정 AND (owner거나 내 회원)
drop policy if exists "auth_read_user_table" on user_table;
create policy "auth_read_user_table" on user_table for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

-- 3) UPDATE: 동일 조건
drop policy if exists "auth_update_user_table" on user_table;
create policy "auth_update_user_table" on user_table for update to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()))
  with check (account_id = auth_account_id());

-- ROLLBACK (사고 시 = ⑦-b account-only 복원):
-- drop policy if exists "auth_read_user_table" on user_table;
-- create policy "auth_read_user_table" on user_table for select to authenticated using (account_id = auth_account_id());
-- drop policy if exists "auth_update_user_table" on user_table;
-- create policy "auth_update_user_table" on user_table for update to authenticated using (account_id = auth_account_id()) with check (account_id = auth_account_id());
-- drop function if exists auth_is_owner();
```

**기존 헬퍼(⑦-b):** `auth_account_id()` = 로그인 유저 → 소속 account_id. 파일럿 계정 id = `11111111-1111-1111-1111-111111111111`.

---

## 6. 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main)

- `app/admin/page.jsx` — QC 실데이터화(TRAINERS 데모 교체) · role 게이트·AddTrainerForm 자리.
- `components/tabs/FirstOTTab.jsx`·`FirstOTAssist.jsx` — D-2(1차 클로징 케이스 입력).
- `app/api/ot-brief/route.js`·`SecondOTTab.jsx` renderBrief — D-3(케이스 근거 피드백 · SecondOTTab 810줄이라 이때 분리 예약).
- `lib/memberStatus.js` — 통계 함수 소재지.
- `app/api/create-trainer/route.js`·`components/AddTrainerForm.jsx` — 초대 메일(B)·비번변경 UI 확장점.

⚠️ 붙는 코드는 항상 최신 main. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 해시와 어긋나면 알림.

---

## 7. 관통 철학 (유지 — MASTERPLAN ⭐⭐)

- **뼈대 먼저, 상품화 로직은 검증 뒤:** ⑦은 소유권·권한 "자리+실작동". 결제·초대메일·QC 실데이터는 파일럿 검증 후.
- **되돌리기 어려운 SQL 신중:** RLS는 잘게 + 롤백 손에 + 실증(리트머스 owner 먼저).
- **오버빌드 방지:** 파일럿이 다중 SaaS 설계에 인질 안 잡히게.
- **스파링 파트너 · 운동처방 숫자금지(세일즈 숫자는 별개) · 압박(소진강요) 아닌 정당한 강조(책임·근거) · 상향평준화 · 실패를 데이터로.** (압박 재정의·리딩 톤 = D-3 노트 §4·§5.)

---

## 8. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 붙여넣기 블록:** `[작업]` + 대상파일 + `diff 작게` + `lint green` + ■목표/변경(정확 위치)/절대무변경/범위밖/lint/확인 + ★"커밋 금지 — 트레이너 직접".
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설은 `--no-index /dev/null <파일>` 또는 전체 붙여넣기.
- **커밋 = 트레이너 직접** · 파일지정 `git add` · 통과 후 · 직후 `git show --stat HEAD` · push 확인.
- **SQL = 대시보드** · git엔 `docs/migrations/*.sql` 기록본만 · 멱등 · 잘게(리트머스 먼저) · 롤백 짝 · 실증.
- **환경:** PowerShell(`C:\Users\tig00\pt-navigator`) · `grep` 없음(Select-String/업로드) · lint `npm.cmd run lint` · 폰=Vercel 배포본 하드리프레시 · `.next` stale 주의 · service_role 등 키는 Vercel/`.env.local` 서버환경만.

---

## 9. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 환경: PowerShell(grep 없음). lint = npm.cmd run lint. SQL은 Supabase 대시보드 직접 실행(git엔 migrations 기록만).
> 첨부 먼저 읽어줘: v2-sprint7c-handoff.md(직전 인계·제일 중요) + MASTERPLAN · v2-roadmap-next ·
> v2-sprint7-handoff · v2-sprint7-postscript-handoff(⑦-a) · -b(⑦-b) · v2-closing-cases-D3-design-note ·
> migrations(step7a · step7b 4파일 · step7c2a · otlog-closing-case) · CLAUDE.md.
>
> ⑦-c **사실상 종료** — /admin owner 게이트 + 내 회원만(2a RLS + 2b 위젯) + 트레이너 초대 온보딩(A) 배포·실증 완료.
> 기능 D도 착수(D-1a 2차 클로징 케이스 수집 + D-1b 집계 카드). ⑦ 대공사 끝 = 파일럿 다중 트레이너 배포 가능.
>
> 다음 후보: QC 실데이터화 · D-2(1차 수집) · D-3(케이스 AI 활용·파일럿 데이터 뒤) · 스케줄표 · 파킹(B/C).
> 부채 먼저 짚자: (1) ⑦-c-2a migration 기록본 커밋 (2) trainer FK on delete(restrict 유지·오프보딩=active) (3) 테스트 트레이너 청소.
> 되돌리기 어려운 SQL은 잘게+롤백+실증. 필요 코드는 짚어서 청구. 방식은 §8.
