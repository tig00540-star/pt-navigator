-- =============================================================================
-- 회원 자가입력 M3 — schedule_check(개인운동/PT 체크) + 회원 CRUD RLS + 트레이너 조회
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. M1 cardio_log와 동일 패턴.
-- 전제: auth_member_id() · auth_account_id().
-- =============================================================================
create table if not exists schedule_check (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references user_table(id) on delete cascade,
  on_date    date not null default current_date,
  kind       text not null,
  note       text,
  created_at timestamptz default now()
);
create index if not exists schedule_check_user_idx on schedule_check (user_id, on_date desc);
alter table schedule_check enable row level security;

-- 회원: 본인 것만 CRUD (추가·삭제 위주 · update 불필요)
drop policy if exists "member_sched_select" on schedule_check;
create policy "member_sched_select" on schedule_check for select to authenticated
  using (user_id = auth_member_id());
drop policy if exists "member_sched_insert" on schedule_check;
create policy "member_sched_insert" on schedule_check for insert to authenticated
  with check (user_id = auth_member_id());
drop policy if exists "member_sched_delete" on schedule_check;
create policy "member_sched_delete" on schedule_check for delete to authenticated
  using (user_id = auth_member_id());

-- 트레이너: 자기 account 회원 것 조회(읽기만)
drop policy if exists "trainer_sched_select" on schedule_check;
create policy "trainer_sched_select" on schedule_check for select to authenticated
  using (exists (
    select 1 from user_table u where u.id = schedule_check.user_id and u.account_id = auth_account_id()
  ));

-- 검증: 정책 4개(member 3 + trainer 1). 회원=본인 것만, 트레이너=account 회원.
-- 롤백: drop table if exists schedule_check cascade;
