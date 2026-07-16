-- =============================================================================
-- 보유 장비 관리(②) — kind 컬럼 + account_id 기본값/인덱스 + owner 쓰기 정책(update/delete 추가)
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 멱등. 데이터 무변경(정책·컬럼만).
-- =============================================================================

-- 1) 장비 종류 컬럼(머신/프리웨이트/맨몸 · null=미분류)
alter table center_machine add column if not exists kind text;

-- 2) account_id 기본값 = 내 계정(클라 insert 시 미포함 가능 · library_item 패턴)
alter table center_machine alter column account_id set default auth_account_id();

-- 3) account_id 인덱스 — '내 것만' 조회를 전체 테이블 크기와 무관하게 빠르게(스케일 대비)
create index if not exists center_machine_account_idx on center_machine (account_id);

-- 4) 쓰기 = 대표(owner)만. 기존 INSERT(account 스코프)를 owner로 좁히고 UPDATE/DELETE 추가.
--    SELECT(auth_read_center_machine · account 스코프)는 그대로 = 트레이너 열람 유지.
drop policy if exists "auth_write_center_machine" on center_machine;
create policy "owner_insert_center_machine" on center_machine for insert to authenticated
  with check (account_id = auth_account_id() and auth_is_owner());
create policy "owner_update_center_machine" on center_machine for update to authenticated
  using      (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());
create policy "owner_delete_center_machine" on center_machine for delete to authenticated
  using      (account_id = auth_account_id() and auth_is_owner());

-- 검증: select policyname, cmd from pg_policies where tablename='center_machine' order by cmd;
--   기대: SELECT(auth_read_center_machine) + INSERT/UPDATE/DELETE(owner_*_center_machine)
-- =============================================================================
