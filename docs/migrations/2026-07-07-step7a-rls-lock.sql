-- =============================================================================
-- ⑦-a — RLS 잠금 (anon 전면 개방 → authenticated 전용)
-- 실행일: 2026-07-07 · 실행: Supabase SQL Editor (수동)
-- 커밋: 이 파일은 "이미 대시보드에서 실행 완료된" SQL의 기록본이다.
--       git에 남기는 이유 = 되돌리기 어려운 보안 마이그레이션의 추적·재현·감사.
--       (Supabase에서 직접 실행되므로 이 파일 자체가 앱을 바꾸지는 않음.)
--
-- 배경:
--   MASTERPLAN §4/§7 최초 보안 부채 = 모든 테이블 anon 전면 개방
--   (URL+anon key만 알면 회원 개인정보·매출 접근). ⑤·⑥까지 미뤄온 청산 대상.
--   ⑦-a에서 (1) 로그인 게이트(AuthGate + layout, 커밋 826e144·ade42f4)
--   (2) 아래 RLS 잠금으로 완결.
--
-- 대상 5테이블: user_table · center_machine · ot_log · session_log · daily_workout_log
-- 방식 두 갈래(잠그기 전 pg_policies 실측 기준):
--   · `to public` 정책   → `to authenticated`로 교체 (public은 anon 포함이라 그냥 두면 옆문)
--   · `{anon,authenticated}` 정책 → `to authenticated`로 교체 (anon만 탈락)
--
-- 전제(실증 완료):
--   · 5테이블 모두 relrowsecurity = true (RLS 켜짐 — 정책이 실제 작동)
--   · 이메일+비번 로그인이 authenticated 역할로 동작
--     (리트머스: center_machine 먼저 좁힌 뒤 로그인 앱에서 머신목록 정상 노출 확인)
--   · 잠근 뒤 시크릿창 REST 직접호출(anon key)로 user_table SELECT = [] (anon 차단 실증)
--
-- 멱등: drop policy if exists → create 패턴이라 재실행 안전.
-- 범위 밖(⑦-b 이후): trainer_id/account 소유권 격리, 초대 온보딩, 역할 차등.
--   지금은 "로그인한 사람은 전체 회원 열람" 상태(파일럿 한 센터 무방).
-- =============================================================================


-- ========== STEP 3-1 · center_machine (리트머스: 개인정보 아님, 피해 최소) ======
drop policy if exists "demo_read_center_machine" on center_machine;
create policy "auth_read_center_machine"
  on center_machine for select to authenticated using (true);

drop policy if exists "demo_write_center_machine" on center_machine;
create policy "auth_write_center_machine"
  on center_machine for insert to authenticated with check (true);


-- ========== STEP 3-2 · 나머지 4개 일괄 =========================================

-- ---- user_table (회원 개인정보) ----
drop policy if exists "demo_read_user_table" on user_table;
create policy "auth_read_user_table"
  on user_table for select to authenticated using (true);

drop policy if exists "demo_write_user_table" on user_table;
create policy "auth_write_user_table"
  on user_table for insert to authenticated with check (true);

drop policy if exists "user_table anon update (v2-② 개방, ⑦에서 잠글 부채)" on user_table;
create policy "auth_update_user_table"
  on user_table for update to authenticated using (true) with check (true);

-- ---- ot_log (관찰·클로징) ----
drop policy if exists "demo_read_ot_log" on ot_log;
create policy "auth_read_ot_log"
  on ot_log for select to authenticated using (true);

drop policy if exists "demo_write_ot_log" on ot_log;
create policy "auth_write_ot_log"
  on ot_log for insert to authenticated with check (true);

drop policy if exists "demo_update_ot_log" on ot_log;
create policy "auth_update_ot_log"
  on ot_log for update to authenticated using (true) with check (true);

-- ---- session_log (계약·수업) ----
drop policy if exists "session_log anon all (v2-3 open, lock in step7)" on session_log;
create policy "auth_all_session_log"
  on session_log for all to authenticated using (true) with check (true);

-- ---- daily_workout_log (음성일지) ----
-- 원래 정책 3개(ALL + SELECT + INSERT) → 셋 다 authenticated로 통일(ALL이 덮지만 명시 유지).
drop policy if exists "daily_workout_log anon all (v2-3 open, lock in step7)" on daily_workout_log;
create policy "auth_all_daily_workout_log"
  on daily_workout_log for all to authenticated using (true) with check (true);

drop policy if exists "demo_read_daily_log" on daily_workout_log;
create policy "auth_read_daily_log"
  on daily_workout_log for select to authenticated using (true);

drop policy if exists "demo_write_daily_log" on daily_workout_log;
create policy "auth_write_daily_log"
  on daily_workout_log for insert to authenticated with check (true);


-- =============================================================================
-- ROLLBACK — anon 전면 개방으로 원복 (긴급 시에만: 로그인 트레이너도 못 읽는 사고 등)
-- ⚠️ 이걸 실행하면 보안 부채가 되살아난다. 실회원 데이터가 들어간 뒤엔 신중.
-- 아래 블록 전체를 SQL Editor에 붙여 실행하면 잠그기 전 상태로 되돌아감.
-- -----------------------------------------------------------------------------
-- -- center_machine
-- drop policy if exists "auth_read_center_machine" on center_machine;
-- create policy "demo_read_center_machine" on center_machine for select to public using (true);
-- drop policy if exists "auth_write_center_machine" on center_machine;
-- create policy "demo_write_center_machine" on center_machine for insert to public with check (true);
--
-- -- user_table
-- drop policy if exists "auth_read_user_table" on user_table;
-- create policy "demo_read_user_table" on user_table for select to public using (true);
-- drop policy if exists "auth_write_user_table" on user_table;
-- create policy "demo_write_user_table" on user_table for insert to public with check (true);
-- drop policy if exists "auth_update_user_table" on user_table;
-- create policy "user_table anon update (v2-② 개방, ⑦에서 잠글 부채)" on user_table for update to anon, authenticated using (true) with check (true);
--
-- -- ot_log
-- drop policy if exists "auth_read_ot_log" on ot_log;
-- create policy "demo_read_ot_log" on ot_log for select to public using (true);
-- drop policy if exists "auth_write_ot_log" on ot_log;
-- create policy "demo_write_ot_log" on ot_log for insert to public with check (true);
-- drop policy if exists "auth_update_ot_log" on ot_log;
-- create policy "demo_update_ot_log" on ot_log for update to public using (true) with check (true);
--
-- -- session_log
-- drop policy if exists "auth_all_session_log" on session_log;
-- create policy "session_log anon all (v2-3 open, lock in step7)" on session_log for all to anon, authenticated using (true) with check (true);
--
-- -- daily_workout_log
-- drop policy if exists "auth_all_daily_workout_log" on daily_workout_log;
-- create policy "daily_workout_log anon all (v2-3 open, lock in step7)" on daily_workout_log for all to anon, authenticated using (true) with check (true);
-- drop policy if exists "auth_read_daily_log" on daily_workout_log;
-- create policy "demo_read_daily_log" on daily_workout_log for select to public using (true);
-- drop policy if exists "auth_write_daily_log" on daily_workout_log;
-- create policy "demo_write_daily_log" on daily_workout_log for insert to public with check (true);
-- =============================================================================


-- =============================================================================
-- 검증 쿼리 (읽기 전용 · 재실행 안전) — 잠금 상태 재확인용
-- 기대: 아래 결과의 roles가 전부 {authenticated} (anon/public 없어야 함)
-- -----------------------------------------------------------------------------
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in
--   ('user_table','center_machine','ot_log','session_log','daily_workout_log')
-- order by tablename, cmd, policyname;
-- =============================================================================
