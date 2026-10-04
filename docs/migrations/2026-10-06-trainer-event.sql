-- =============================================================================
-- 트레이너 개인 일정(회의 · 청소 · 휴무 …) — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 한 행 = 일정 하나(반복이면 규칙 하나 · 화면이 보는 기간만큼 펼친다 · lib/trainerEvents.js).
--   repeat: none · daily · weekly(repeat_days 0=일~6=토) · monthly · repeat_until(마지막 날 · 없으면 계속) · skip_dates(이번만 빼기)
-- 쓰기 = 본인 일정만. 읽기 = 본인 + 대표는 센터 전체(대표 스케줄 화면).
-- =============================================================================

create table if not exists trainer_event (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  account_id   uuid not null default auth_account_id() references account(id) on delete cascade,
  trainer_id   uuid not null default auth.uid() references trainer(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 60),
  color        text not null default 'gray' check (color in ('gray','sky','amber','violet','pink','teal')),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  all_day      boolean not null default false,
  repeat       text not null default 'none' check (repeat in ('none','daily','weekly','monthly')),
  repeat_days  smallint[],
  repeat_until date,
  skip_dates   date[] not null default '{}',
  note         text,
  check (end_at > start_at)
);
create index if not exists trainer_event_trainer_idx on trainer_event (trainer_id, start_at);
alter table trainer_event enable row level security;

drop policy if exists "trainer_event_select" on trainer_event;
create policy "trainer_event_select" on trainer_event for select to authenticated
  using (account_id = auth_account_id() and (trainer_id = auth.uid() or auth_is_owner()));
drop policy if exists "trainer_event_insert" on trainer_event;
create policy "trainer_event_insert" on trainer_event for insert to authenticated
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
drop policy if exists "trainer_event_update" on trainer_event;
create policy "trainer_event_update" on trainer_event for update to authenticated
  using (account_id = auth_account_id() and trainer_id = auth.uid())
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
drop policy if exists "trainer_event_delete" on trainer_event;
create policy "trainer_event_delete" on trainer_event for delete to authenticated
  using (account_id = auth_account_id() and trainer_id = auth.uid());

-- =============================================================================
-- 검증: select count(*) from pg_policies where tablename = 'trainer_event';  -- 4
-- 롤백: drop table if exists trainer_event;
-- =============================================================================
