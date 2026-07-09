-- =============================================================================
-- ⑦-c-2a — user_table 트레이너별 격리 (owner=전체 / trainer=본인 회원)
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   "같은 계정이면 트레이너끼리 회원 다 보임"(⑦-b account 격리) 위에
--   "트레이너는 본인 회원만 · owner는 계정 전체"를 얹는다.
--   재료 = user_table.trainer_id(⑦-b에서 도장됨) + 새 헬퍼 auth_is_owner().
--   앱 코드 무변경(RLS가 자동 필터 — loadMembers에 .eq 불필요).
--
-- 전제(⑦-b 완료): account/trainer 테이블 · auth_account_id() 헬퍼 · user_table account_id/trainer_id.
-- 멱등: create or replace / drop policy if exists → create → 재실행 안전.
-- 롤백: 파일 하단 주석(⑦-b account-only 상태로 복원 + 헬퍼 drop).
-- 실증(합격선):
--   · owner 로그인 → 회원목록 전체 그대로(리트머스 — auth_is_owner 작동).
--   · 다른 트레이너 로그인 → 회원목록 본인 것만(기존 회원은 owner 소유라 빈칸).
-- 범위 밖: ot_log/session_log trainer 스코프(정상 동선 격리는 위젯이 members로 처리 = ⑦-c-2b).
-- =============================================================================


-- ========== 1) 헬퍼 · 로그인 유저가 owner인가 ================================
-- SECURITY DEFINER = trainer 테이블 RLS 우회해 안전 조회(auth_account_id()와 동일 패턴).
create or replace function auth_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from trainer where id = auth.uid() and role = 'owner') $$;
grant execute on function auth_is_owner() to authenticated;


-- ========== 2) user_table SELECT · 같은 계정 AND (owner거나 내 회원) =========
drop policy if exists "auth_read_user_table" on user_table;
create policy "auth_read_user_table"
  on user_table for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));


-- ========== 3) user_table UPDATE · 동일 조건 =================================
drop policy if exists "auth_update_user_table" on user_table;
create policy "auth_update_user_table"
  on user_table for update to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()))
  with check (account_id = auth_account_id());

-- INSERT 정책은 그대로(account 체크 + DEFAULT trainer_id = auth.uid() → 등록 트레이너가 주인).


-- =============================================================================
-- ROLLBACK — 사고 시(예: owner인데 회원 안 보임) ⑦-b account-only 상태로 복원.
-- 아래 블록 전체를 SQL Editor에 붙여 실행.
-- -----------------------------------------------------------------------------
-- drop policy if exists "auth_read_user_table" on user_table;
-- create policy "auth_read_user_table" on user_table for select to authenticated
--   using (account_id = auth_account_id());
-- drop policy if exists "auth_update_user_table" on user_table;
-- create policy "auth_update_user_table" on user_table for update to authenticated
--   using (account_id = auth_account_id()) with check (account_id = auth_account_id());
-- drop function if exists auth_is_owner();
-- =============================================================================


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 정책 조건에 auth_is_owner()·trainer_id 들어갔나
-- -----------------------------------------------------------------------------
-- select policyname, cmd, qual, with_check from pg_policies
-- where schemaname='public' and tablename='user_table' order by cmd, policyname;
-- =============================================================================
