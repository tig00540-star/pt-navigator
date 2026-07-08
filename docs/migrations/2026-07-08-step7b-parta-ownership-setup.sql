-- =============================================================================
-- ⑦-b Part A — 소유권 뼈대 세우기 (안전·비파괴: 아무것도 "잠그지" 않음)
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일 (셋 다 되돌리기 쉬움 = 접근을 바꾸는 게 하나도 없음):
--   Step 0 : account · trainer 테이블 신설 + seed(파일럿 센터 1 + 기존 로그인 트레이너 owner)
--            + auth_account_id() 헬퍼 함수
--   Step 1 : 5개 데이터 테이블에 account_id 컬럼 추가 (nullable · 기본값 없음 → 전부 NULL로 시작)
--
-- ★ 무서운 부분은 이 파일에 없다:
--   · NULL 백필(기존 행에 계정 도장)          → Part B
--   · RLS를 account 스코프로 좁힘(진짜 격리)    → Part B
--   · FK · NOT NULL · DEFAULT auth_account_id() → Part B (백필 뒤에 걸어야 안전)
--   지금은 컬럼만 생기고 아무 접근도 안 바뀜 → 앱은 ⑦-a 상태 그대로 동작한다.
--   (app/page.jsx·admin은 account/trainer를 읽지 않으므로 이 파일은 실행 중 앱에 무해.)
--
-- 전제(⑦-a 완료): 로그인 게이트 + RLS authenticated 잠금(HEAD ade42f4). auth.users에 트레이너 존재.
-- 멱등: create if not exists / or replace / add column if not exists / on conflict do nothing → 재실행 안전.
-- 롤백: 파일 하단 주석 블록(정책·함수·컬럼·테이블 drop).
-- 범위 밖(Part B/C): 백필 · account 스코프 RLS · FK/NOT NULL/DEFAULT · 센터 내 격리 · 초대 온보딩 · 좌석 과금.
--
-- ※ 파일럿 센터 계정 id = 고정 UUID '11111111-1111-1111-1111-111111111111'
--   Part B 백필이 이 값을 그대로 참조하므로 바꾸지 말 것.
-- =============================================================================


-- ========== STEP 0-1 · account 테이블 (소유·청구 단위 = RLS 격리 기준) =========
create table if not exists account (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'center' check (type in ('center','solo')),
  name       text,
  created_at timestamptz not null default now()
);
alter table account enable row level security;   -- 신설 테이블은 RLS 명시적으로 켜야 anon 차단됨

-- seed: 파일럿 센터 1행 (고정 id · 멱등)
insert into account (id, type, name)
values ('11111111-1111-1111-1111-111111111111', 'center', '파일럿 센터')
on conflict (id) do nothing;


-- ========== STEP 0-2 · trainer 테이블 (auth.users ↔ account ↔ role) ===========
-- 좌석 = 행. active=false = 과금중단 + 데이터보존(삭제 금지 철학). role/active는 "자리만"(⑦-b RLS 미사용).
create table if not exists trainer (
  id         uuid primary key references auth.users(id),  -- = 로그인 유저 id (한 유저 한 계정)
  account_id uuid not null references account(id),
  role       text not null default 'trainer' check (role in ('owner','trainer')),
  active     boolean not null default true,
  name       text,
  created_at timestamptz not null default now()
);
alter table trainer enable row level security;

-- seed: 기존 로그인 트레이너를 파일럿 센터 owner로 자동 등록.
--   ⚠️ auth.users 유저가 "정확히 1명"일 때만 자동 채택(⑦-a Add user 1명 전제).
--      2명 이상이면 아무도 seed 안 함 → 아래 검증쿼리에서 trainer 0행으로 드러남(그럼 수동 처리/문의).
insert into trainer (id, account_id, role, name)
select u.id, '11111111-1111-1111-1111-111111111111', 'owner', u.email
from auth.users u
where (select count(*) from auth.users) = 1
on conflict (id) do nothing;


-- ========== STEP 0-3 · auth_account_id() 헬퍼 (로그인 유저 → 소속 계정 id) =====
-- SECURITY DEFINER = trainer 테이블 RLS를 우회해 안전하게 조회(정책 재귀 방지).
-- STABLE · search_path 고정(인젝션 방지). Part B의 모든 데이터 테이블 정책이 이 함수를 씀.
create or replace function auth_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id from trainer where id = auth.uid()
$$;
grant execute on function auth_account_id() to authenticated;


-- ========== STEP 0-4 · account/trainer 읽기 정책 (anon 차단·본인 것만) =========
-- 데이터 테이블(Part B)과 달리 여기선 지금 걸어도 무해(앱이 안 읽음). anon은 RLS-on + 정책없음으로 차단.
drop policy if exists "auth_read_account" on account;
create policy "auth_read_account"
  on account for select to authenticated
  using (id = auth_account_id());               -- 내 계정 1행만

drop policy if exists "auth_read_own_trainer" on trainer;
create policy "auth_read_own_trainer"
  on trainer for select to authenticated
  using (id = auth.uid());                       -- 내 trainer 행만(재귀 없음). owner 전체열람 = ⑦-c
-- insert/update 정책 없음 = 시딩은 SQL 에디터(service role, RLS 우회)로만. 초대 온보딩 = ⑦-c.


-- ========== STEP 1 · 5개 데이터 테이블에 account_id 컬럼 (nullable · 도장 전) ===
-- 지금은 값이 전부 NULL. 기본값·NOT NULL·FK·RLS는 Part B에서 백필 뒤에 건다(순서 = 안전).
alter table user_table        add column if not exists account_id uuid;   -- trainer_id는 이미 선반영됨(유지)
alter table center_machine    add column if not exists account_id uuid;
alter table ot_log            add column if not exists account_id uuid;
alter table session_log       add column if not exists account_id uuid;
alter table daily_workout_log add column if not exists account_id uuid;


-- =============================================================================
-- 검증 쿼리 (읽기 전용 · 재실행 안전) — 실행 후 아래 3개를 돌려 결과 확인
-- -----------------------------------------------------------------------------
-- (1) account seed 확인 — 기대: 파일럿 센터 1행(type=center)
-- select id, type, name from account;
--
-- (2) trainer seed 확인 — 기대: 1행, role=owner, name=본인 로그인 이메일
--     ⚠️ 0행이면 auth.users가 2명 이상이라 자동 seed 안 된 것 → 멈추고 문의.
-- select id, account_id, role, active, name from trainer;
--
-- (3) 컬럼 실존 + 전부 NULL 확인 — 기대: 각 테이블 null_ct = total (모든 행이 아직 NULL)
-- select 'user_table' t, count(*) total, count(*) filter (where account_id is null) null_ct from user_table
-- union all select 'center_machine',    count(*), count(*) filter (where account_id is null) from center_machine
-- union all select 'ot_log',            count(*), count(*) filter (where account_id is null) from ot_log
-- union all select 'session_log',       count(*), count(*) filter (where account_id is null) from session_log
-- union all select 'daily_workout_log', count(*), count(*) filter (where account_id is null) from daily_workout_log;
-- =============================================================================


-- =============================================================================
-- ROLLBACK — Part A를 통째로 원복 (긴급 시에만 · 아래 블록 전체를 SQL Editor에 붙여 실행)
-- ⚠️ Part B(백필·RLS)를 이미 실행했으면 이 롤백만으론 부족(먼저 Part B 롤백부터).
--    Part A 단독 실행 직후 상태에서만 이 블록이 깨끗이 되돌린다.
-- -----------------------------------------------------------------------------
-- alter table user_table        drop column if exists account_id;
-- alter table center_machine    drop column if exists account_id;
-- alter table ot_log            drop column if exists account_id;
-- alter table session_log       drop column if exists account_id;
-- alter table daily_workout_log drop column if exists account_id;
-- drop policy if exists "auth_read_account" on account;
-- drop policy if exists "auth_read_own_trainer" on trainer;
-- drop function if exists auth_account_id();
-- drop table if exists trainer;   -- account보다 먼저(FK 참조)
-- drop table if exists account;
-- =============================================================================
