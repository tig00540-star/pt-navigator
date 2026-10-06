-- =============================================================================
-- 회원 수업 예약 · 변경 · 취소 요청 + 운동일지 자동 확인 24시간 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-06-auto-confirm.sql · trainer-event.sql 실행 완료.
--
-- 규칙(대표 결정 2026-10-06):
--   · 회원은 '이번 주 + 다음 주' 안에서 1시간 칸으로 새 수업을 요청하고, 잡힌 수업의 변경 · 취소를 요청한다.
--   · 변경 · 취소(그리고 새 요청 시각)는 수업 시각 'N시간 전'까지만 — N은 트레이너가 정한다(기본 12 · 1~72).
--     그 뒤에는 화면이 "트레이너와 직접 이야기해 주세요"를 띄운다(DB도 막는다).
--   · 트레이너가 승인해야 예약이 생기거나 바뀌거나 취소된다(같은 시각 다른 수업이 있으면 승인 불가).
--   · 남은 수업 0회 · 지난 회원 · 환불 회원은 요청 불가(auth_member_writable).
--   · 회원에겐 트레이너의 바쁜 시각만(누구 수업인지 · 일정 제목은 안 보임).
-- =============================================================================

-- ── 1) 트레이너 예약 규칙 ─────────────────────────────────────────────────────
create table if not exists trainer_booking_pref (
  trainer_id    uuid primary key references trainer(id) on delete cascade,
  accept        boolean not null default true,                         -- 회원 요청 받기
  cutoff_hours  int not null default 12 check (cutoff_hours between 1 and 72),
  updated_at    timestamptz not null default now()
);
alter table trainer_booking_pref enable row level security;
drop policy if exists "booking_pref_select" on trainer_booking_pref;
create policy "booking_pref_select" on trainer_booking_pref for select to authenticated using (trainer_id = auth.uid());
drop policy if exists "booking_pref_insert" on trainer_booking_pref;
create policy "booking_pref_insert" on trainer_booking_pref for insert to authenticated with check (trainer_id = auth.uid());
drop policy if exists "booking_pref_update" on trainer_booking_pref;
create policy "booking_pref_update" on trainer_booking_pref for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ── 2) 요청 ─────────────────────────────────────────────────────────────────
create table if not exists appt_request (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  account_id      uuid not null references account(id) on delete cascade,
  member_id       uuid not null references user_table(id) on delete cascade,
  trainer_id      uuid not null references trainer(id) on delete cascade,
  kind            text not null check (kind in ('new', 'change', 'cancel')),
  appointment_id  uuid references appointment(id) on delete cascade,
  orig_start      timestamptz,                                           -- 변경 · 취소할 때 원래 시각(기록용)
  want_start      timestamptz,                                           -- 새 · 변경 원하는 시각
  note            text check (note is null or char_length(note) <= 200),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_at      timestamptz,
  decided_by      uuid,
  decide_note     text check (decide_note is null or char_length(decide_note) <= 200),
  seen_at         timestamptz                                            -- 회원이 결과를 본 시각
);
create index if not exists appt_request_trainer_idx on appt_request (trainer_id, status, created_at desc);
create index if not exists appt_request_member_idx on appt_request (member_id, created_at desc);
alter table appt_request enable row level security;
drop policy if exists "appt_request_member_select" on appt_request;
create policy "appt_request_member_select" on appt_request for select to authenticated using (member_id = auth_member_id());
drop policy if exists "appt_request_trainer_select" on appt_request;
create policy "appt_request_trainer_select" on appt_request for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
-- 쓰기 정책 없음 = 아래 함수로만.

-- 이번 주 + 다음 주의 끝(KST 다음 주 일요일 24시)
create or replace function booking_window_end() returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Asia/Seoul')) + interval '14 days') at time zone 'Asia/Seoul')
$$;

-- ── 3) 회원: 요청 · 철회 · 결과 확인 ────────────────────────────────────────────
create or replace function request_appt(p_kind text, p_appt uuid default null, p_want timestamptz default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid := auth_member_id(); m user_table; ap appointment; acc boolean; cut int; rid uuid;
begin
  if mid is null or not auth_member_writable() then raise exception 'not_allowed'; end if;
  select * into m from user_table where id = mid;
  if m.trainer_id is null or m.status <> 'pt_active' then raise exception 'not_allowed'; end if;
  select coalesce(p.accept, true), coalesce(p.cutoff_hours, 12) into acc, cut
    from (select 1) x left join trainer_booking_pref p on p.trainer_id = m.trainer_id;
  if not acc then raise exception 'closed'; end if;
  if p_kind not in ('new', 'change', 'cancel') then raise exception 'bad'; end if;

  if p_kind in ('change', 'cancel') then
    select * into ap from appointment where id = p_appt and user_id = mid and status = 'booked';
    if ap.id is null then raise exception 'no_appt'; end if;
    if ap.start_at - now() < make_interval(hours => cut) then raise exception 'too_late'; end if;
    if exists (select 1 from appt_request where appointment_id = ap.id and status = 'pending') then raise exception 'pending'; end if;
  end if;
  if p_kind in ('new', 'change') then
    if p_want is null or extract(minute from p_want at time zone 'Asia/Seoul') <> 0 then raise exception 'bad_time'; end if;
    if p_want - now() < make_interval(hours => cut) or p_want >= booking_window_end() then raise exception 'bad_time'; end if;
    if extract(hour from p_want at time zone 'Asia/Seoul') not between 5 and 23 then raise exception 'bad_time'; end if;
  end if;
  if p_kind = 'new' and (select count(*) from appt_request where member_id = mid and kind = 'new' and status = 'pending') >= 3 then
    raise exception 'too_many';
  end if;

  insert into appt_request (account_id, member_id, trainer_id, kind, appointment_id, orig_start, want_start, note)
  values (m.account_id, mid, m.trainer_id, p_kind, ap.id, ap.start_at,
          case when p_kind = 'cancel' then null else p_want end, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  returning id into rid;
  return rid;
end $$;
revoke all on function request_appt(text, uuid, timestamptz, text) from public, anon;
grant execute on function request_appt(text, uuid, timestamptz, text) to authenticated;

create or replace function withdraw_appt_request(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update appt_request set status = 'withdrawn', decided_at = now()
   where id = p_id and member_id = auth_member_id() and status = 'pending';
$$;
revoke all on function withdraw_appt_request(uuid) from public, anon;
grant execute on function withdraw_appt_request(uuid) to authenticated;

create or replace function mark_appt_request_seen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update appt_request set seen_at = now() where id = p_id and member_id = auth_member_id() and seen_at is null;
$$;
revoke all on function mark_appt_request_seen(uuid) from public, anon;
grant execute on function mark_appt_request_seen(uuid) to authenticated;

-- ── 4) 트레이너: 승인 · 거절(승인 = 예약을 실제로 만들고 · 옮기고 · 취소) ─────────────────
create or replace function decide_appt_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r appt_request; ap appointment;
begin
  select * into r from appt_request where id = p_id for update;
  if r.id is null or r.account_id is distinct from auth_account_id() or not (r.trainer_id = auth.uid() or auth_is_owner()) then
    raise exception 'forbidden';
  end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;

  if p_approve then
    if r.kind in ('new', 'change') and exists (
      select 1 from appointment a where a.trainer_id = r.trainer_id and a.status = 'booked' and a.start_at = r.want_start
        and a.id is distinct from r.appointment_id) then
      raise exception 'conflict';
    end if;
    if r.kind = 'new' then
      insert into appointment (account_id, trainer_id, user_id, start_at, status)
      values (r.account_id, r.trainer_id, r.member_id, r.want_start, 'booked');
    else
      select * into ap from appointment where id = r.appointment_id for update;
      if ap.id is null or ap.status <> 'booked' then raise exception 'appt_gone'; end if;
      if r.kind = 'change' then update appointment set start_at = r.want_start where id = ap.id;
      else update appointment set status = 'canceled' where id = ap.id; end if;
    end if;
  end if;
  update appt_request set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(), decided_by = auth.uid(), decide_note = nullif(left(trim(coalesce(p_note, '')), 200), '')
   where id = p_id;
end $$;
revoke all on function decide_appt_request(uuid, boolean, text) from public, anon;
grant execute on function decide_appt_request(uuid, boolean, text) to authenticated;

-- ── 5) 회원이 보는 것(본인 · 담당 트레이너만) ─────────────────────────────────────
-- 앞으로 잡힌 내 수업(변경 · 취소 요청용 id)
create or replace view member_upcoming_appt
  with (security_invoker = false) as
  select a.id, a.start_at
  from appointment a
  where a.user_id = auth_member_id() and a.status = 'booked' and a.start_at > now() and a.start_at < now() + interval '30 days'
  order by a.start_at;
grant select on member_upcoming_appt to authenticated;
revoke select on member_upcoming_appt from anon;

-- 담당 트레이너의 예약 규칙
create or replace view member_booking_rule
  with (security_invoker = false) as
  select coalesce(p.accept, true) as accept, coalesce(p.cutoff_hours, 12) as cutoff_hours, booking_window_end() as window_end
  from user_table u left join trainer_booking_pref p on p.trainer_id = u.trainer_id
  where u.id = auth_member_id();
grant select on member_booking_rule to authenticated;
revoke select on member_booking_rule from anon;

-- 담당 트레이너의 바쁜 시각(다른 회원 수업 · 개인 일정) — 누구 · 무슨 일정인지는 빼고 시각만
create or replace view member_trainer_busy
  with (security_invoker = false) as
  select a.start_at, a.start_at + interval '1 hour' as end_at, false as all_day,
         'none'::text as repeat, null::smallint[] as repeat_days, null::date as repeat_until, '{}'::date[] as skip_dates
  from appointment a join user_table u on u.id = auth_member_id()
  where a.trainer_id = u.trainer_id and a.status = 'booked' and a.start_at > now() - interval '1 hour' and a.start_at < booking_window_end()
  union all
  select e.start_at, e.end_at, e.all_day, e.repeat, e.repeat_days, e.repeat_until, e.skip_dates
  from trainer_event e join user_table u on u.id = auth_member_id()
  where e.trainer_id = u.trainer_id and e.start_at < booking_window_end()
    and (e.repeat <> 'none' or e.end_at > now()) and (e.repeat_until is null or e.repeat_until >= (now() at time zone 'Asia/Seoul')::date);
grant select on member_trainer_busy to authenticated;
revoke select on member_trainer_busy from anon;

-- ── 6) 운동일지 자동 확인 48 → 24시간(폰 알림 붙은 뒤 · 대표 결정) ──────────────────────
--   24시간 문구(동의서 2026-10-06.2)에 동의한 회원부터 24시간 · 48시간 문구에만 동의한 회원은 그대로 48시간(알린 대로).
create or replace function auto_confirm_workout_logs(p_hours int default 48)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with consent as (
    select member_id, min(created_at) as at, bool_or(version >= '2026-10-06.2') as v24
      from member_consent
     where kind = 'general' and agreed and version >= '2026-10-06'
     group by member_id
  ), cand as (
    select d.id, d.user_id,
           'sql1:' || encode(sha256(convert_to(
             coalesce(d.ai_summary, '') || '|' || coalesce(d.session_at::text, '') || '|' || coalesce(d.sets_structured::text, ''),
             'UTF8')), 'hex') as h
      from daily_workout_log d
      join consent k on k.member_id = d.user_id
     where coalesce(d.voided, false) = false
       and coalesce(d.source, '') <> 'noshow'
       and coalesce(d.session_at, d.created_at) >= k.at
       and greatest(coalesce(d.session_at, d.created_at), coalesce(d.edited_at, d.created_at))
           + make_interval(hours => case when k.v24 then 24 else p_hours end) <= now()
       and not exists (select 1 from workout_log_confirmation c
                        where c.log_id = d.id and c.result = 'confirm')
       and not exists (select 1 from workout_log_confirmation c
                        where c.log_id = d.id and c.result = 'dispute'
                          and c.confirmed_at > coalesce(d.edited_at, d.created_at))
     limit 2000
  )
  insert into workout_log_confirmation (log_id, member_id, result, method, content_hash)
  select id, user_id, 'confirm', 'auto', h from cand
  on conflict (log_id) where result = 'confirm' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function auto_confirm_workout_logs(int) from public, anon, authenticated;

-- =============================================================================
-- 검증: select tablename from pg_tables where tablename in ('trainer_booking_pref','appt_request');   -- 2줄
--       select proname from pg_proc where proname in ('request_appt','decide_appt_request','withdraw_appt_request','mark_appt_request_seen');  -- 4줄
-- =============================================================================
