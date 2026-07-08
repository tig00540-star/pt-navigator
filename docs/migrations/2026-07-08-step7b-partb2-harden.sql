-- =============================================================================
-- ⑦-b Part B-2 — 굳히기 (자동 도장 DEFAULT + NOT NULL + FK · trainer_id 자리)
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일 (3가지):
--   (1) account_id DEFAULT auth_account_id() — 앞으로 insert 시 로그인 유저 계정 자동 도장
--       → 앱 insert 코드에 account_id 안 실어도 DB가 알아서 찍음(앱 변경 최소화의 핵심).
--   (2) account_id NOT NULL + FK → account(id) — 값 다 찼으니 빈칸 금지 + 실재 계정만 참조(정합성).
--   (3) user_table.trainer_id DEFAULT auth.uid() + 기존 행 백필 — "등록 트레이너가 주인" 도장.
--       ⚠️ ⑦-b RLS는 trainer_id를 안 씀(account_id만 격리). trainer_id는 "자리만"(센터 내 필터=⑦-c).
--
-- ★ 아직 "잠그지 않는다": RLS는 여전히 using(true). 앱 그대로 동작. 진짜 격리 = Part B-3.
--
-- 전제: Part B-1 백필 완료(5테이블 account_id NULL 0행). trainer 테이블에 owner 1행 존재.
-- 멱등:
--   · set default / set not null → 재실행 무해(같은 상태로 수렴).
--   · add constraint: 이름 지정 + 존재 시 먼저 drop(아래 do 블록)이라 재실행 안전.
--   · trainer_id 백필 = where trainer_id is null → 재실행 시 대상 0.
-- 롤백: 파일 하단 주석(default/not null/FK 해제 → B-1 롤백 가능 상태로 되돌림).
-- 범위 밖(B-3): RLS using(true) → account 스코프 좁힘 · 교차격리 실증.
-- =============================================================================


-- ========== (3-준비) trainer_id 백필 먼저 (NOT NULL은 안 검 · 자리만) =========
-- 기존 테스트 회원의 주인 = 파일럿 owner. (trainer 테이블의 owner 1명을 참조.)
update user_table
  set trainer_id = (select id from trainer where role = 'owner'
                    and account_id = '11111111-1111-1111-1111-111111111111' limit 1)
  where trainer_id is null;


-- ========== (1) DEFAULT 자동 도장 ============================================
alter table user_table        alter column account_id set default auth_account_id();
alter table center_machine    alter column account_id set default auth_account_id();
alter table ot_log            alter column account_id set default auth_account_id();
alter table session_log       alter column account_id set default auth_account_id();
alter table daily_workout_log alter column account_id set default auth_account_id();

-- trainer_id 자동 도장 (user_table만 · "등록 트레이너=본인")
alter table user_table alter column trainer_id set default auth.uid();


-- ========== (2) NOT NULL (빈칸 금지 · 값 다 찬 뒤라 안전) =====================
alter table user_table        alter column account_id set not null;
alter table center_machine    alter column account_id set not null;
alter table ot_log            alter column account_id set not null;
alter table session_log       alter column account_id set not null;
alter table daily_workout_log alter column account_id set not null;


-- ========== (2) FK → account(id) (실재 계정만 참조 · 멱등 do 블록) ===========
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_user_table_account') then
    alter table user_table add constraint fk_user_table_account
      foreign key (account_id) references account(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_center_machine_account') then
    alter table center_machine add constraint fk_center_machine_account
      foreign key (account_id) references account(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_ot_log_account') then
    alter table ot_log add constraint fk_ot_log_account
      foreign key (account_id) references account(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_session_log_account') then
    alter table session_log add constraint fk_session_log_account
      foreign key (account_id) references account(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_daily_workout_log_account') then
    alter table daily_workout_log add constraint fk_daily_workout_log_account
      foreign key (account_id) references account(id);
  end if;
end $$;


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- -----------------------------------------------------------------------------
-- (A) 컬럼 상태 — 기대: account_id 5행 전부 is_nullable=NO, column_default에 auth_account_id() ·
--                        user_table.trainer_id default에 auth.uid()
-- select table_name, column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public'
--   and ((column_name='account_id' and table_name in
--         ('user_table','center_machine','ot_log','session_log','daily_workout_log'))
--        or (column_name='trainer_id' and table_name='user_table'))
-- order by table_name, column_name;
--
-- (B) FK 5개 붙었나 — 기대: 5행
-- select conname from pg_constraint where conname like 'fk_%_account' order by conname;
--
-- (C) trainer_id 백필 — 기대: null_ct = 0
-- select count(*) filter (where trainer_id is null) null_ct, count(*) total from user_table;
-- =============================================================================


-- =============================================================================
-- ROLLBACK — 굳히기 해제(FK → NOT NULL → DEFAULT 순). 실행하면 B-1 롤백 가능 상태로.
-- -----------------------------------------------------------------------------
-- alter table user_table        drop constraint if exists fk_user_table_account;
-- alter table center_machine    drop constraint if exists fk_center_machine_account;
-- alter table ot_log            drop constraint if exists fk_ot_log_account;
-- alter table session_log       drop constraint if exists fk_session_log_account;
-- alter table daily_workout_log drop constraint if exists fk_daily_workout_log_account;
-- alter table user_table        alter column account_id drop not null;
-- alter table center_machine    alter column account_id drop not null;
-- alter table ot_log            alter column account_id drop not null;
-- alter table session_log       alter column account_id drop not null;
-- alter table daily_workout_log alter column account_id drop not null;
-- alter table user_table        alter column account_id drop default;
-- alter table center_machine    alter column account_id drop default;
-- alter table ot_log            alter column account_id drop default;
-- alter table session_log       alter column account_id drop default;
-- alter table daily_workout_log alter column account_id drop default;
-- alter table user_table        alter column trainer_id drop default;
-- =============================================================================
