-- =============================================================================
-- 요금제 개편(2026-10-07 · 계획서 docs/v2-계획-요금제-개편.md)
--   베이직 19,900 · 프로 59,000 · 센터 149,000(부가세 포함) · AI 월 한도 · 추가 팩 · 센터 트레이너 추가
-- 실행: Supabase SQL Editor(수동). 다시 실행해도 같은 결과(멱등).
--
-- ⚠️ account.plan('premium')은 그대로 — 회원 전용 페이지 관문이다(베이직도 회원 페이지를 쓴다).
--    요금 등급은 account.billing_plan: 'basic' | 'solo'(화면 이름 '프로') | 'center'.
-- ⚠️ ai_usage의 회원 칸 이름은 일부러 target_member — _move_member가 user_id · member_id 칸을 찾아
--    회원 이동 때 같이 옮기는데, 사용량은 돈을 낸 계정 것이라 옮기면 안 된다.
-- =============================================================================

-- 1) 계정: 등급 값 · 추가 좌석 · 다음 결제일부터 바뀌는 값
alter table account add column if not exists extra_seats       integer not null default 0;
alter table account add column if not exists next_billing_plan text;      -- 내리기(프로 → 베이직) 예약 · 다음 결제일에 적용
alter table account add column if not exists next_extra_seats  integer;   -- 좌석 줄이기 예약 · 다음 결제일에 적용

alter table account drop constraint if exists account_billing_plan_chk;
alter table account add constraint account_billing_plan_chk
  check (billing_plan is null or billing_plan in ('basic', 'solo', 'center'));
alter table account drop constraint if exists account_next_billing_plan_chk;
alter table account add constraint account_next_billing_plan_chk
  check (next_billing_plan is null or next_billing_plan in ('basic', 'solo'));
alter table account drop constraint if exists account_extra_seats_chk;
alter table account add constraint account_extra_seats_chk
  check (extra_seats between 0 and 20 and (next_extra_seats is null or next_extra_seats between 0 and 20));

-- 등급이 비어 있던 계정(체험 · 시험 · 데모) = 계정 종류대로(개인 = 프로 · 센터 = 센터)
update account set billing_plan = case when type = 'center' then 'center' else 'solo' end
 where billing_plan is null;

grant select (extra_seats, next_billing_plan, next_extra_seats) on account to authenticated;

-- 2) AI 사용 기록 — 한 번 부를 때마다 한 행. 세는 단위(counted)는 (계정, 달, unit_key)마다 한 번.
create table if not exists ai_usage (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references account(id) on delete cascade,
  trainer_id        uuid,
  kind              text not null check (kind in ('voice', 'ot', 'rereg', 'inbody', 'roadmap', 'salesbook', 'owner', 'monthly', 'cues')),
  unit_key          text not null,
  counted           boolean not null default false,
  target_member     uuid,
  model             text,
  input_tokens      integer,
  output_tokens     integer,
  cache_read_tokens integer,
  cost_usd          numeric(10, 5),
  ok                boolean,                     -- null = 진행 중 · true = 성공 · false = 실패(세지 않음 · 원가는 남김)
  ym                text not null,               -- KST 'YYYY-MM'
  created_at        timestamptz not null default now()
);
create unique index if not exists ai_usage_counted_uq on ai_usage(account_id, ym, unit_key) where counted;
create index if not exists ai_usage_account_ym_idx on ai_usage(account_id, ym);

alter table ai_usage enable row level security;
drop policy if exists ai_usage_owner_select on ai_usage;
create policy ai_usage_owner_select on ai_usage for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());
-- 쓰기 정책 없음 = 서버(service_role)만

-- 3) 추가 팩 — 그달 말까지 · 프로 · 센터만(베이직은 못 삼 · 서버가 막음)
create table if not exists ai_credit (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  kind        text not null check (kind in ('voice', 'prep')),
  amount      integer not null check (amount > 0),
  ym          text not null,
  payment_id  uuid references payment(id) on delete set null,
  refunded_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ai_credit_account_ym_idx on ai_credit(account_id, ym);
alter table ai_credit enable row level security;
drop policy if exists ai_credit_owner_select on ai_credit;
create policy ai_credit_owner_select on ai_credit for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());

-- 4) 한도 계산 — 묶음(group)별 기본 한도 · 팩 · 쓴 수 · 남은 수
--    베이직: voice · ot · rereg · inbody · roadmap 각 3
--    프로:   voice 120 · prep(ot + rereg) 25 · inbody 60 · roadmap 60
--    센터:   voice 300 + 100×추가 좌석 · prep 60 + 20×추가 좌석 · inbody 150 · roadmap 150
--    체험 중(결제 DONE 없이 TRIAL만) = 프로(개인) · 센터(센터) 한도
create or replace function kst_ym() returns text language sql stable as $$
  select to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')
$$;

create or replace function ai_group_of(p_tier text, p_kind text) returns text language sql immutable as $$
  select case
    when p_kind in ('ot', 'rereg') and p_tier <> 'basic' then 'prep'
    when p_kind in ('voice', 'ot', 'rereg', 'inbody', 'roadmap') then p_kind
    else null end
$$;

create or replace function ai_quota_for(p_account uuid, p_ym text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record; tier text; v_ym text := coalesce(p_ym, kst_ym()); trial boolean; seats integer;
  lim jsonb; g text; base integer; extra integer; used integer; v_out jsonb := '{}'::jsonb;
begin
  select type, billing_plan, extra_seats into a from account where id = p_account;
  if not found then return null; end if;
  tier := coalesce(a.billing_plan, case when a.type = 'center' then 'center' else 'solo' end);
  trial := not exists (select 1 from payment where account_id = p_account and status = 'DONE')
           and exists (select 1 from payment where account_id = p_account and status = 'TRIAL');
  if trial and tier = 'basic' then tier := 'solo'; end if;
  seats := coalesce(a.extra_seats, 0);
  lim := case tier
    when 'basic'  then jsonb_build_object('voice', 3, 'ot', 3, 'rereg', 3, 'inbody', 3, 'roadmap', 3)
    when 'center' then jsonb_build_object('voice', 300 + 100 * seats, 'prep', 60 + 20 * seats, 'inbody', 150, 'roadmap', 150)
    else               jsonb_build_object('voice', 120, 'prep', 25, 'inbody', 60, 'roadmap', 60)
  end;
  for g in select jsonb_object_keys(lim) loop
    base := (lim ->> g)::integer;
    select coalesce(sum(amount), 0) into extra from ai_credit
     where account_id = p_account and ai_credit.ym = v_ym and kind = g and refunded_at is null;
    select count(*) into used from ai_usage u
     where u.account_id = p_account and u.ym = v_ym and u.counted and ai_group_of(tier, u.kind) = g;
    v_out := v_out || jsonb_build_object(g, jsonb_build_object('limit', base, 'extra', extra, 'used', used,
                                                           'left', greatest(base + extra - used, 0)));
  end loop;
  return jsonb_build_object('tier', tier, 'trial', trial, 'ym', v_ym, 'groups', v_out);
end $$;
revoke all on function ai_quota_for(uuid, text) from public, anon, authenticated;
grant execute on function ai_quota_for(uuid, text) to service_role;

-- 화면용: 내 계정 한도(센터는 계정 공용이라 트레이너도 같은 숫자를 본다)
create or replace function my_ai_quota()
returns jsonb language sql stable security definer set search_path = public as $$
  select ai_quota_for(auth_account_id())
$$;
grant execute on function my_ai_quota() to authenticated;

-- 5) 자리 잡기(AI 부르기 전) — 같은 단위면 새로 안 셈 · 남은 수 0이면 거절. 서버(service_role)만.
create or replace function ai_reserve(p_account uuid, p_trainer uuid, p_kind text, p_unit_key text, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ym text := kst_ym(); q jsonb; tier text; g text; left_n integer; rid uuid; dup boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_account::text || v_ym));
  q := ai_quota_for(p_account, v_ym);
  if q is null then return jsonb_build_object('ok', false, 'code', 'no_account'); end if;
  tier := q ->> 'tier';
  g := ai_group_of(tier, p_kind);
  if g is null then                                   -- 세지 않는 종류(세일즈북 · 보고서 · 장비 큐)
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym) returning id into rid;
    return jsonb_build_object('ok', true, 'id', rid, 'counted', false);
  end if;
  select exists (select 1 from ai_usage where account_id = p_account and ai_usage.ym = v_ym and unit_key = p_unit_key and counted) into dup;
  if dup then                                         -- 다시 만들기 = 새로 안 셈(원가는 기록)
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym) returning id into rid;
    return jsonb_build_object('ok', true, 'id', rid, 'counted', false, 'again', true);
  end if;
  left_n := coalesce((q -> 'groups' -> g ->> 'left')::integer, 0);
  if left_n <= 0 then
    return jsonb_build_object('ok', false, 'code', 'quota', 'group', g, 'tier', tier,
                              'limit', (q -> 'groups' -> g ->> 'limit')::integer);
  end if;
  insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
  values (p_account, p_trainer, p_kind, p_unit_key, true, p_member, v_ym) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'counted', true, 'group', g, 'left', left_n - 1);
end $$;
revoke all on function ai_reserve(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function ai_reserve(uuid, uuid, text, text, uuid) to service_role;

-- 6) 끝내기 — 성공이면 토큰 · 원가 기록, 실패면 세지 않음(세는 자리를 풀고 원가는 남긴다)
create or replace function ai_finish(p_id uuid, p_ok boolean, p_model text default null,
  p_in integer default null, p_out integer default null, p_cache integer default null, p_cost numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update ai_usage
     set ok = p_ok,
         counted = case when p_ok then counted else false end,
         model = coalesce(p_model, model),
         input_tokens = coalesce(p_in, input_tokens),
         output_tokens = coalesce(p_out, output_tokens),
         cache_read_tokens = coalesce(p_cache, cache_read_tokens),
         cost_usd = coalesce(p_cost, cost_usd)
   where id = p_id;
end $$;
revoke all on function ai_finish(uuid, boolean, text, integer, integer, integer, numeric) from public, anon, authenticated;
grant execute on function ai_finish(uuid, boolean, text, integer, integer, integer, numeric) to service_role;

-- 6.5) 센터 합류 좌석 = 3 + 추가 좌석(2026-10-07-join-center.sql의 _join_center에서 좌석 줄만 바뀜 · 나머지 그대로)
create or replace function _join_center(p_trainer uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv account_invite; v_from uuid; v_role text; v_from_type text; v_to_name text; v_used int; v_n int := 0; r record;
begin
  select * into v_inv from account_invite where code = p_code for update;
  if v_inv.id is null then return jsonb_build_object('error', 'invalid'); end if;
  if v_inv.used_at is not null or v_inv.canceled_at is not null or v_inv.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;

  select t.account_id, t.role, a.type into v_from, v_role, v_from_type
    from trainer t join account a on a.id = t.account_id where t.id = p_trainer and t.active;
  if v_from is null then return jsonb_build_object('error', 'no_trainer'); end if;
  if v_from = v_inv.account_id then return jsonb_build_object('error', 'same'); end if;
  if v_role <> 'owner' or v_from_type <> 'solo' then return jsonb_build_object('error', 'not_solo'); end if;

  -- 좌석(센터 3인 + 결제한 추가 좌석 · 대표 제외 · create-trainer와 같은 규칙)
  select count(*) into v_used from trainer where account_id = v_inv.account_id and role = 'trainer' and active;
  if v_used >= 3 + coalesce((select extra_seats from account where id = v_inv.account_id), 0) then
    return jsonb_build_object('error', 'seat_limit');
  end if;

  select name into v_to_name from account where id = v_inv.account_id;

  -- 트레이너 → 센터 소속
  update trainer set account_id = v_inv.account_id, role = 'trainer' where id = p_trainer;

  -- 트레이너 본인 것(가격표 · 사례 · QR · 개인 일정 · 예약 받기 설정 · 프로필) — 있으면 옮김
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.columns k
        on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = 'trainer_id'
     where c.table_schema = 'public' and c.column_name = 'account_id'
       and c.table_name in ('pt_package', 'sales_case', 'intake_link', 'trainer_event', 'trainer_booking_pref', 'trainer_profile', 'library_item', 'notify_pref')
  loop
    execute format('update public.%I set account_id = $1 where trainer_id = $2 and account_id = $3', r.table_name)
      using v_inv.account_id, p_trainer, v_from;
  end loop;

  -- 회원마다 이동 동의 요청(숨김 회원 제외 · 이미 요청 중이면 그대로)
  insert into member_transfer (member_id, member_name, from_account, to_account, trainer_id, kind, to_name)
  select u.id, u.name, v_from, v_inv.account_id, p_trainer, 'join', v_to_name
    from user_table u
   where u.account_id = v_from and not coalesce(u.hidden, false)
     and not exists (select 1 from member_transfer m where m.member_id = u.id and m.status = 'pending');
  get diagnostics v_n = row_count;

  -- 개인 계정 닫기 — 다음 결제 없음 · 지금부터 30일 볼 수만(회원이 동의할 시간) · 결제 수단 지움
  update account set
    subscription_status = 'inactive',
    current_period_end  = least(coalesce(current_period_end, now()), now()),
    cancel_at_period_end = true,
    billing_key = null,
    merged_into = v_inv.account_id,
    closed_at = now(),
    closed_reason = 'join'
   where id = v_from;

  update account_invite set used_by = p_trainer, used_at = now() where id = v_inv.id;

  return jsonb_build_object('ok', true, 'from', v_from, 'to', v_inv.account_id, 'center_name', v_to_name, 'members', v_n);
end $$;


-- 7) 해지 뒤 30일 '볼 수만' 규칙에 새 표 넣기
select refresh_read_only_policies();

-- =============================================================================
-- 검증:
--   select billing_plan, count(*) from account group by 1;            -- null 없어야 함
--   select my_ai_quota();                                              -- (앱에서 로그인한 사람으로) 한도 JSON
--   select has_column_privilege('authenticated', 'account', 'extra_seats', 'select');  -- true
-- 롤백:
--   drop function if exists ai_finish(uuid, boolean, text, integer, integer, integer, numeric);
--   drop function if exists ai_reserve(uuid, uuid, text, text, uuid);
--   drop function if exists my_ai_quota(); drop function if exists ai_quota_for(uuid, text);
--   drop function if exists ai_group_of(text, text); drop function if exists kst_ym();
--   drop table if exists ai_credit; drop table if exists ai_usage;
--   alter table account drop column if exists extra_seats, drop column if exists next_billing_plan, drop column if exists next_extra_seats;
-- =============================================================================
