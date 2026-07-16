-- =============================================================================
-- 회원 자가입력 M1 — cardio_log(유산소) 테이블 + 회원 쓰기 토대(RLS 4종) + 트레이너 조회
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: auth_member_id()(회원 세션→user_table.id) · auth_account_id()(트레이너 세션→account_id).
-- =============================================================================
create table if not exists cardio_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references user_table(id) on delete cascade,
  performed_on date not null default current_date,
  kind         text,
  minutes      int,
  note         text,
  created_at   timestamptz default now()
);
create index if not exists cardio_log_user_idx on cardio_log (user_id, performed_on desc);

alter table cardio_log enable row level security;

-- 회원: 본인 것만 CRUD (user_id = 내 회원 id)
drop policy if exists "member_cardio_select" on cardio_log;
create policy "member_cardio_select" on cardio_log for select to authenticated
  using (user_id = auth_member_id());
drop policy if exists "member_cardio_insert" on cardio_log;
create policy "member_cardio_insert" on cardio_log for insert to authenticated
  with check (user_id = auth_member_id());
drop policy if exists "member_cardio_update" on cardio_log;
create policy "member_cardio_update" on cardio_log for update to authenticated
  using (user_id = auth_member_id()) with check (user_id = auth_member_id());
drop policy if exists "member_cardio_delete" on cardio_log;
create policy "member_cardio_delete" on cardio_log for delete to authenticated
  using (user_id = auth_member_id());

-- 트레이너: 자기 account 회원 것 조회(읽기만). user_table 조인으로 account 스코프.
drop policy if exists "trainer_cardio_select" on cardio_log;
create policy "trainer_cardio_select" on cardio_log for select to authenticated
  using (exists (
    select 1 from user_table u
    where u.id = cardio_log.user_id and u.account_id = auth_account_id()
  ));

-- 검증:
--   (회원 세션) insert/select/update/delete 본인 것만 됨. 타 user_id insert 거부.
--   (트레이너 세션) 자기 account 회원 cardio 조회됨 · 타 account 0행.
-- 롤백: drop table if exists cardio_log cascade;
