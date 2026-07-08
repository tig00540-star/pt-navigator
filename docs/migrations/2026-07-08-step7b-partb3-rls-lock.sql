-- =============================================================================
-- ⑦-b Part B-3 — RLS 잠금 (using(true) → account_id 스코프) ★진짜 격리★
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   5개 데이터 테이블의 authenticated 정책을 using(true)(로그인한 누구나 전체) →
--   using(account_id = auth_account_id())(내 계정 것만)로 좁힌다. = 계정 간 격리 ON.
--   insert는 with check(account_id = auth_account_id())로 남의 계정 위조 차단.
--
-- ★ 두 단계로 나눠 실행(⑦-a 방식):
--   B-3a = center_machine 1개만 먼저(리트머스 · 피해 최소) → 폰에서 머신목록 보이면 헬퍼 end-to-end 확증.
--   B-3b = 리트머스 통과 후 나머지 4개.
--
-- 전제: B-2 완료(account_id NOT NULL·DEFAULT·FK · 전 행 파일럿 계정 도장). auth_account_id() 헬퍼 존재.
-- 멱등: drop policy if exists → create 패턴이라 재실행 안전.
-- 롤백: 파일 하단 주석 = ⑦-a 상태(using(true))로 복원. RLS 사고 시 즉시 되돌림.
-- 범위 밖: 센터 내 격리(내 회원만) · role 게이트(/admin 원장전용) · 초대 온보딩 = ⑦-c.
--
-- ⚠️ ⑦-a 정책 이름을 그대로 재사용(auth_read_*/auth_write_*/auth_update_*/auth_all_*)한다.
--    drop→create라 같은 이름에 조건만 바뀜(using(true) → account 스코프).
-- =============================================================================


-- ########## B-3a · 리트머스: center_machine 먼저 ############################
-- 이것만 실행 → 커밋/폰확인 멈춤 → 머신목록 정상 노출 확인 후에 B-3b로.
drop policy if exists "auth_read_center_machine" on center_machine;
create policy "auth_read_center_machine"
  on center_machine for select to authenticated
  using (account_id = auth_account_id());

drop policy if exists "auth_write_center_machine" on center_machine;
create policy "auth_write_center_machine"
  on center_machine for insert to authenticated
  with check (account_id = auth_account_id());

-- ▶ 여기서 멈추고 검증(파일 하단 검증쿼리 (1) + 폰 리트머스). 통과하면 아래 B-3b.


-- ########## B-3b · 나머지 4개 (리트머스 통과 후) ############################

-- ---- user_table (회원 개인정보) ----
drop policy if exists "auth_read_user_table" on user_table;
create policy "auth_read_user_table"
  on user_table for select to authenticated
  using (account_id = auth_account_id());

drop policy if exists "auth_write_user_table" on user_table;
create policy "auth_write_user_table"
  on user_table for insert to authenticated
  with check (account_id = auth_account_id());

drop policy if exists "auth_update_user_table" on user_table;
create policy "auth_update_user_table"
  on user_table for update to authenticated
  using (account_id = auth_account_id()) with check (account_id = auth_account_id());

-- ---- ot_log (관찰·클로징) ----
drop policy if exists "auth_read_ot_log" on ot_log;
create policy "auth_read_ot_log"
  on ot_log for select to authenticated
  using (account_id = auth_account_id());

drop policy if exists "auth_write_ot_log" on ot_log;
create policy "auth_write_ot_log"
  on ot_log for insert to authenticated
  with check (account_id = auth_account_id());

drop policy if exists "auth_update_ot_log" on ot_log;
create policy "auth_update_ot_log"
  on ot_log for update to authenticated
  using (account_id = auth_account_id()) with check (account_id = auth_account_id());

-- ---- session_log (계약·수업) ----
drop policy if exists "auth_all_session_log" on session_log;
create policy "auth_all_session_log"
  on session_log for all to authenticated
  using (account_id = auth_account_id()) with check (account_id = auth_account_id());

-- ---- daily_workout_log (음성일지) ----
drop policy if exists "auth_all_daily_workout_log" on daily_workout_log;
create policy "auth_all_daily_workout_log"
  on daily_workout_log for all to authenticated
  using (account_id = auth_account_id()) with check (account_id = auth_account_id());

drop policy if exists "auth_read_daily_log" on daily_workout_log;
create policy "auth_read_daily_log"
  on daily_workout_log for select to authenticated
  using (account_id = auth_account_id());

drop policy if exists "auth_write_daily_log" on daily_workout_log;
create policy "auth_write_daily_log"
  on daily_workout_log for insert to authenticated
  with check (account_id = auth_account_id());


-- =============================================================================
-- 검증
-- -----------------------------------------------------------------------------
-- (1) B-3a 직후 · SQL로 정책 조건 확인 — 기대: center_machine 정책 qual에 auth_account_id() 들어감
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename='center_machine'
-- order by cmd, policyname;
--
-- (2) B-3a 폰 리트머스(앱): 로그인 상태에서 1차 OT 등록 폼의 "머신 선택" 목록이 그대로 보이면 통과.
--     (안 보이면 → 하단 B-3a 롤백만 실행, 나머지는 아직 안 건드렸으니 앱 멀쩡.)
--
-- (3) B-3b 후 앱: 회원목록·탭·음성일지·세션 전부 정상(= 내 계정 것 다 보임).
--
-- (4) 교차 격리 실증(⑦-b 진짜 합격선 · B-3b 후):
--     대시보드에서 2번째 auth 유저 생성 + trainer 행(role=trainer, account_id=2번째 account) +
--     그 계정으로 회원 1명 등록 → 1번째 트레이너로 로그인 시 "그 회원 안 보임" 확인.
--     (2번째 account/trainer seed SQL은 실증 스텝에서 별도로 준다.)
-- =============================================================================


-- =============================================================================
-- ROLLBACK — ⑦-a 상태(using(true))로 복원. RLS 사고(로그인 트레이너도 못 읽음) 시 즉시 실행.
--   ⚠️ 이걸 실행하면 계정 격리가 풀려 "로그인한 누구나 전체 열람"으로 되돌아감(⑦-a 수준).
-- -----------------------------------------------------------------------------
-- -- center_machine
-- drop policy if exists "auth_read_center_machine" on center_machine;
-- create policy "auth_read_center_machine" on center_machine for select to authenticated using (true);
-- drop policy if exists "auth_write_center_machine" on center_machine;
-- create policy "auth_write_center_machine" on center_machine for insert to authenticated with check (true);
-- -- user_table
-- drop policy if exists "auth_read_user_table" on user_table;
-- create policy "auth_read_user_table" on user_table for select to authenticated using (true);
-- drop policy if exists "auth_write_user_table" on user_table;
-- create policy "auth_write_user_table" on user_table for insert to authenticated with check (true);
-- drop policy if exists "auth_update_user_table" on user_table;
-- create policy "auth_update_user_table" on user_table for update to authenticated using (true) with check (true);
-- -- ot_log
-- drop policy if exists "auth_read_ot_log" on ot_log;
-- create policy "auth_read_ot_log" on ot_log for select to authenticated using (true);
-- drop policy if exists "auth_write_ot_log" on ot_log;
-- create policy "auth_write_ot_log" on ot_log for insert to authenticated with check (true);
-- drop policy if exists "auth_update_ot_log" on ot_log;
-- create policy "auth_update_ot_log" on ot_log for update to authenticated using (true) with check (true);
-- -- session_log
-- drop policy if exists "auth_all_session_log" on session_log;
-- create policy "auth_all_session_log" on session_log for all to authenticated using (true) with check (true);
-- -- daily_workout_log
-- drop policy if exists "auth_all_daily_workout_log" on daily_workout_log;
-- create policy "auth_all_daily_workout_log" on daily_workout_log for all to authenticated using (true) with check (true);
-- drop policy if exists "auth_read_daily_log" on daily_workout_log;
-- create policy "auth_read_daily_log" on daily_workout_log for select to authenticated using (true);
-- drop policy if exists "auth_write_daily_log" on daily_workout_log;
-- create policy "auth_write_daily_log" on daily_workout_log for insert to authenticated with check (true);
-- =============================================================================
