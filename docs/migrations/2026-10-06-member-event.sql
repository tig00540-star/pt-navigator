-- =============================================================================
-- 회원 이벤트(포상 → 이벤트로 합침) · 참여하기 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-07-20-ounwan-reward.sql(ounwan_days · trainer_reward).
--
-- 규칙(대표 결정 2026-10-06):
--   · 트레이너(내 회원) 또는 대표(센터 전체 · 특정 트레이너 회원)가 연다. 종류: 출석 챌린지(기간 안 오운완 N회) · 일반 이벤트.
--   · 이벤트 기간(starts_on~ends_on · 비우면 상시) · 신청 기간(join_from~join_until · 비우면 이벤트 기간 동안) · 정원(선택).
--   · 회원은 [참여하기] — ★참여 취소 없음(삭제 정책 · 함수 없음).
--   · 트레이너 · 대표는 참여 명단(진행 · 달성)과 '지급 완료'를 본다.
--   · 기존 포상(trainer_reward)은 '상시 출석 챌린지'로 옮긴다(표는 지우지 않음 · 앱이 더는 안 읽음).
-- =============================================================================

create table if not exists member_event (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  account_id      uuid not null default auth_account_id() references account(id) on delete cascade,
  created_by      uuid not null default auth.uid() references trainer(id) on delete cascade,
  scope           text not null default 'trainer' check (scope in ('trainer', 'center')),
  target_trainer  uuid references trainer(id) on delete cascade,      -- scope='trainer'일 때 그 트레이너의 회원
  kind            text not null check (kind in ('challenge', 'general')),
  title           text not null check (char_length(title) between 1 and 40),
  body            text check (body is null or char_length(body) <= 500),
  goal_count      int check (goal_count is null or goal_count between 1 and 365),   -- 챌린지: 오운완 N회
  reward_text     text check (reward_text is null or char_length(reward_text) <= 60),
  starts_on       date,
  ends_on         date,
  join_from       date,
  join_until      date,
  capacity        int check (capacity is null or capacity between 1 and 1000),
  active          boolean not null default true,
  legacy_reward_id uuid unique,                                        -- 옮겨 온 trainer_reward.id
  check (scope = 'center' or target_trainer is not null),
  check (kind = 'general' or goal_count is not null),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists member_event_account_idx on member_event (account_id, active);
alter table member_event enable row level security;

drop policy if exists "member_event_select" on member_event;
create policy "member_event_select" on member_event for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or scope = 'center' or target_trainer = auth.uid() or created_by = auth.uid()));
drop policy if exists "member_event_insert" on member_event;
create policy "member_event_insert" on member_event for insert to authenticated
  with check (account_id = auth_account_id() and created_by = auth.uid()
              and (auth_is_owner() or (scope = 'trainer' and target_trainer = auth.uid())));
drop policy if exists "member_event_update" on member_event;
create policy "member_event_update" on member_event for update to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or created_by = auth.uid()))
  with check (account_id = auth_account_id() and (auth_is_owner() or (scope = 'trainer' and target_trainer = auth.uid())));
drop policy if exists "member_event_delete" on member_event;
create policy "member_event_delete" on member_event for delete to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or created_by = auth.uid()));

create table if not exists member_event_join (
  event_id     uuid not null references member_event(id) on delete cascade,
  member_id    uuid not null references user_table(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  rewarded_at  timestamptz,
  rewarded_by  uuid,
  primary key (event_id, member_id)
);
alter table member_event_join enable row level security;
drop policy if exists "member_event_join_member_select" on member_event_join;
create policy "member_event_join_member_select" on member_event_join for select to authenticated using (member_id = auth_member_id());
-- 트레이너 · 대표 읽기 · 쓰기는 아래 함수로(진행 계산이 RLS를 넘는 ounwan_days를 쓰므로).

-- 이 이벤트가 이 회원에게 열려 있나(대상)
create or replace function _event_for_member(e member_event, m user_table) returns boolean
language sql immutable as $$
  select e.account_id = m.account_id and (e.scope = 'center' or e.target_trainer = m.trainer_id)
$$;

-- 챌린지 진행 = 이벤트 기간 안 오운완일 수(상시면 전체)
create or replace function _event_progress(e member_event, p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from ounwan_days(p_member) d
   where (e.starts_on is null or d >= e.starts_on) and (e.ends_on is null or d <= e.ends_on)
$$;
revoke all on function _event_progress(member_event, uuid) from public, anon, authenticated;   -- ⛔ ounwan_days 우회 · 래퍼로만

-- ── 회원: 나에게 열린 이벤트(끝난 지 7일 지나면 안 보임) ──────────────────────────
create or replace view member_events_view
  with (security_invoker = false) as
  select e.id, e.kind, e.title, e.body, e.goal_count, e.reward_text, e.starts_on, e.ends_on, e.join_from, e.join_until, e.capacity,
         (select count(*) from member_event_join j where j.event_id = e.id)::int as joined_count,
         (j.member_id is not null) as joined, j.joined_at, j.rewarded_at,
         case when j.member_id is not null and e.kind = 'challenge' then _event_progress(e, u.id) end as progress
  from member_event e
  join user_table u on u.id = auth_member_id()
  left join member_event_join j on j.event_id = e.id and j.member_id = u.id
  where e.active and _event_for_member(e, u)
    and (e.ends_on is null or e.ends_on >= (now() at time zone 'Asia/Seoul')::date - 7);
grant select on member_events_view to authenticated;
revoke select on member_events_view from anon;

-- ── 회원: 참여하기(취소 없음) ─────────────────────────────────────────────────
create or replace function join_member_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m user_table; e member_event; today date := (now() at time zone 'Asia/Seoul')::date; n int;
begin
  select * into m from user_table where id = auth_member_id();
  if m.id is null or m.status = 'inactive' then raise exception 'not_allowed'; end if;
  select * into e from member_event where id = p_event and active for update;
  if e.id is null or not _event_for_member(e, m) then raise exception 'not_found'; end if;
  if coalesce(e.join_from, e.starts_on) > today then raise exception 'not_yet'; end if;
  if coalesce(e.join_until, e.ends_on) < today then raise exception 'closed'; end if;
  if exists (select 1 from member_event_join where event_id = e.id and member_id = m.id) then return; end if;
  if e.capacity is not null then
    select count(*) into n from member_event_join where event_id = e.id;
    if n >= e.capacity then raise exception 'full'; end if;
  end if;
  insert into member_event_join (event_id, member_id) values (e.id, m.id);
end $$;
revoke all on function join_member_event(uuid) from public, anon;
grant execute on function join_member_event(uuid) to authenticated;

-- ── 트레이너 · 대표: 참여 명단(진행 · 달성 · 지급) ─────────────────────────────────
create or replace function event_participants(p_event uuid)
returns table (member_id uuid, name text, joined_at timestamptz, progress int, rewarded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare e member_event;
begin
  select * into e from member_event where id = p_event and account_id = auth_account_id();
  if e.id is null or not (auth_is_owner() or e.created_by = auth.uid() or e.target_trainer = auth.uid() or e.scope = 'center') then
    raise exception 'forbidden';
  end if;
  return query
    select j.member_id, u.name, j.joined_at,
           case when e.kind = 'challenge' then _event_progress(e, j.member_id) end, j.rewarded_at
      from member_event_join j join user_table u on u.id = j.member_id
     where j.event_id = e.id
       and (auth_is_owner() or e.scope = 'trainer' or u.trainer_id = auth.uid())   -- 센터 이벤트는 트레이너에게 자기 회원만
     order by j.joined_at;
end $$;
revoke all on function event_participants(uuid) from public, anon;
grant execute on function event_participants(uuid) to authenticated;

create or replace function set_event_reward(p_event uuid, p_member uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e member_event;
begin
  select * into e from member_event where id = p_event and account_id = auth_account_id();
  if e.id is null or not (auth_is_owner() or e.created_by = auth.uid() or e.target_trainer = auth.uid()
     or exists (select 1 from user_table where id = p_member and trainer_id = auth.uid())) then
    raise exception 'forbidden';
  end if;
  update member_event_join set rewarded_at = case when p_done then now() end, rewarded_by = case when p_done then auth.uid() end
   where event_id = p_event and member_id = p_member;
end $$;
revoke all on function set_event_reward(uuid, uuid, boolean) from public, anon;
grant execute on function set_event_reward(uuid, uuid, boolean) to authenticated;

-- ── 기존 포상 → 상시 출석 챌린지(한 번만 · 다시 실행해도 겹치지 않음) ───────────────────
insert into member_event (account_id, created_by, scope, target_trainer, kind, title, goal_count, reward_text, active, legacy_reward_id)
select r.account_id, r.trainer_id, 'trainer', r.trainer_id, 'challenge',
       left('오운완 ' || r.milestone || '회 달성', 40), r.milestone, left(r.reward_text, 60), r.active, r.id
  from trainer_reward r
 where exists (select 1 from trainer t where t.id = r.trainer_id)
on conflict (legacy_reward_id) do nothing;

-- =============================================================================
-- 검증: select tablename from pg_tables where tablename in ('member_event','member_event_join');   -- 2줄
--       select count(*) from member_event where legacy_reward_id is not null;                       -- 옮겨 온 포상 수
-- =============================================================================
