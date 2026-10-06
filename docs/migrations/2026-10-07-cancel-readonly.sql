-- =============================================================================
-- 2026-10-07 해지 예약 · 기간이 끝난 뒤 30일 '볼 수만' · 내보내기 (계획서 1단계)
-- -----------------------------------------------------------------------------
-- 지금: 이용 기간이 끝나면 곧바로 잠김(대표 · 트레이너 · 회원 페이지 모두) → 기록을 꺼낼 길이 없다.
-- 바꿈: 기간이 끝난 뒤 30일은 '읽기 전용' — 로그인 · 열람 · 내 데이터 내려받기 · 카드 다시 등록만.
--       새 기록 · AI는 안 된다(쓰기 규칙은 그대로 '이용 중'만 통과).
--   · 읽기 = 기존 규칙(auth_account_id · auth_is_owner · auth_account_plan)을 그대로 본뜬 SELECT 규칙을 하나씩 덧붙임(__ro).
--     기존 규칙은 손대지 않는다 → 이 파일을 되돌려도(아래 롤백) 지금 상태 그대로.
--   · 새 표 · 새 규칙을 만들면 끝에서 select refresh_read_only_policies(); 를 한 번 더 실행한다.
--   · 저장소(사진 · 서명 그림)는 읽기 전용 기간에 안 열린다(목록 · 기록만).
--   · 30일 뒤 파기는 아직 자동으로 하지 않는다(대표 확인 뒤 별도 작업) — 하루 전 대표 알림만.
-- 실행: Supabase SQL Editor에서 이 파일 전체를 한 번.
-- =============================================================================

-- 1) 계정 칸 — 해지 예약 시각 · 이유(선택) · 파기 예정 알림 보낸 시각
alter table account add column if not exists cancel_requested_at timestamptz;
alter table account add column if not exists cancel_reason       text;
alter table account add column if not exists purge_notified_at   timestamptz;
alter table account drop constraint if exists account_cancel_reason_len;
alter table account add constraint account_cancel_reason_len check (cancel_reason is null or char_length(cancel_reason) <= 300);
-- 화면이 읽는 칸만 열 권한(billing_key 등은 계속 숨김 · account UPDATE 정책은 열지 않는다 — 쓰기는 /api/billing/cancel만)
grant select (cancel_requested_at, cancel_reason) on account to authenticated;

-- 2) 읽기 전용 기간 = 이용 기간 끝 ~ 끝 + 30일
create or replace function account_read_window(p_status text, p_end timestamptz)
returns boolean language sql stable as $$
  select coalesce(p_status = 'active' and (p_end is null or p_end > now()), false)
      or (p_end is not null and p_end <= now() and p_end > now() - interval '30 days')
$$;

create or replace function auth_read_account_id()
returns uuid language sql stable security definer set search_path = public as $$
  select t.account_id
    from trainer t
    join account a on a.id = t.account_id
   where t.id = auth.uid()
     and t.active
     and account_read_window(a.subscription_status, a.current_period_end)
$$;
grant execute on function auth_read_account_id() to authenticated;

create or replace function auth_read_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from trainer t
      join account a on a.id = t.account_id
     where t.id = auth.uid()
       and t.role = 'owner'
       and t.active
       and account_read_window(a.subscription_status, a.current_period_end)
  )
$$;
grant execute on function auth_read_is_owner() to authenticated;

create or replace function auth_read_account_plan()
returns text language sql stable security definer set search_path = public as $$
  select a.plan
    from trainer t
    join account a on a.id = t.account_id
   where t.id = auth.uid()
     and t.active
     and account_read_window(a.subscription_status, a.current_period_end)
$$;
grant execute on function auth_read_account_plan() to authenticated;

-- 3) 기존 읽기 규칙을 본뜬 '읽기 전용' SELECT 규칙 — 표마다 자동 생성(다시 실행해도 같은 결과)
create or replace function refresh_read_only_policies()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; q text; nm text; n integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, roles, qual
      from pg_policies
     where schemaname = 'public'
       and cmd in ('ALL', 'SELECT')
       and qual is not null
       and (qual like '%auth_account_id()%' or qual like '%auth_is_owner()%' or qual like '%auth_account_plan()%')
       and right(policyname, 4) <> '__ro'
  loop
    q := replace(replace(replace(r.qual,
           'auth_account_id()',   'auth_read_account_id()'),
           'auth_is_owner()',     'auth_read_is_owner()'),
           'auth_account_plan()', 'auth_read_account_plan()');
    nm := left(r.policyname, 59) || '__ro';
    execute format('drop policy if exists %I on %I.%I', nm, r.schemaname, r.tablename);
    execute format('create policy %I on %I.%I for select to %s using (%s)',
                   nm, r.schemaname, r.tablename, array_to_string(r.roles, ', '), q);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function refresh_read_only_policies() from public, anon, authenticated;

select refresh_read_only_policies();   -- 만든 규칙 수가 나온다

-- 4) 화면이 쓰는 계정 상태 — mode(full · read_only · locked) · 읽기 전용 끝나는 날 · 해지 예약 여부 덧붙임
--    반환 칸이 바뀌어 drop 뒤 다시 만든다(다른 SQL 함수가 이걸 부르지 않음 · 화면 · 서버 라우트만 rpc로 부름)
drop function if exists my_account_status();
create function my_account_status()
returns table (has_account boolean, subscription_status text, plan text,
               current_period_end timestamptz, is_expired boolean, access boolean,
               mode text, read_only_until timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select
    (t.id is not null)                                                     as has_account,
    a.subscription_status,
    a.plan,
    a.current_period_end,
    (a.current_period_end is not null and a.current_period_end <= now())    as is_expired,
    (a.subscription_status = 'active'
       and (a.current_period_end is null or a.current_period_end > now()))  as access,
    case
      when a.subscription_status = 'active'
           and (a.current_period_end is null or a.current_period_end > now()) then 'full'
      when a.current_period_end is not null and a.current_period_end <= now()
           and a.current_period_end > now() - interval '30 days'          then 'read_only'
      else 'locked'
    end                                                                     as mode,
    case when a.current_period_end is not null
         then a.current_period_end + interval '30 days' end                 as read_only_until,
    coalesce(a.cancel_at_period_end, false)                                 as cancel_at_period_end
  from trainer t
  left join account a on a.id = t.account_id
  where t.id = auth.uid()
  limit 1
$$;
grant execute on function my_account_status() to authenticated;

-- 5) 회원 페이지 — 센터가 읽기 전용 기간이면 회원도 '볼 수만'(지난 회원 읽기 전용과 같은 화면)
create or replace function auth_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select u.id
    from user_table u
    join account a on a.id = u.account_id
   where u.member_auth_id = auth.uid()
     and not coalesce(u.hidden, false)
     and a.plan = 'premium'
     and account_read_window(a.subscription_status, a.current_period_end)
     and not (coalesce(u.status, '') = 'inactive'
              and u.status_changed_at is not null
              and u.status_changed_at < now() - interval '6 months')
$$;
grant execute on function auth_member_id() to authenticated;

-- 쓰기는 센터가 '이용 중'일 때만(+ 지난 회원 아님 · 남은 수업 1회 이상 — 기존 규칙 그대로)
create or replace function auth_member_writable()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from user_table u
      join account a on a.id = u.account_id
     where u.id = auth_member_id()
       and a.subscription_status = 'active'
       and (a.current_period_end is null or a.current_period_end > now())
       and coalesce(u.status, '') <> 'inactive'
       and member_remaining_sessions(u.id) > 0
  )
$$;
grant execute on function auth_member_writable() to authenticated;

-- 6) 회원 페이지가 '센터 이용이 멈춰서 볼 수만'을 알 수 있게 — member_me 끝에 center_open 덧붙임(열은 뒤에만)
create or replace view member_me
  with (security_invoker = false) as
  select u.id, u.name, u.goal, u.goal_deadline, t.name as trainer_name,
         u.status, u.status_changed_at,
         case when a.type = 'solo' then a.brand_name else a.name end as center_name,
         u.member_token, auth_member_writable() as writable,
         (a.type = 'solo') as is_solo,
         (a.subscription_status = 'active' and (a.current_period_end is null or a.current_period_end > now())) as center_open
  from user_table u
  left join trainer t on t.id = u.trainer_id
  left join account a on a.id = u.account_id
  where u.id = auth_member_id();
grant select on member_me to authenticated;
revoke select on member_me from anon;

-- 검증(대표 세션): select mode, read_only_until, cancel_at_period_end from my_account_status();
-- 검증(전체): select count(*) from pg_policies where right(policyname, 4) = '__ro';
--
-- 롤백:
--   do $$ declare r record; begin
--     for r in select schemaname, tablename, policyname from pg_policies where right(policyname, 4) = '__ro' loop
--       execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
--     end loop; end $$;
--   그리고 2026-10-06-bugfix-sweep.sql의 auth_member_id · auth_member_writable, 2026-07-16-b1c의 my_account_status를 다시 실행.
