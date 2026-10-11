-- =============================================================================
-- 2026-10-12 · AI 한도 = 결제일 기준(대표 결정 · 예전 매달 1일 한국 시간)
--   한 기간 = 이번 결제일 ~ 다음 결제일 전날. 다음 결제일(account.current_period_end)에 다시 채운다.
--   기간 시작 = 구독 결제 기록(payment · basic/solo/center · DONE/TRIAL)에서
--               '지금보다 앞인 마지막 기간 끝'(= 이번 기간 시작)과 '지금보다 앞인 마지막 결제 시작' 중 늦은 것.
--               결제 기록이 없으면(시연 계정 등) current_period_end에서 한 달씩 거꾸로,
--               그것도 없으면 이번 달 1일(한국 시간). 한 달 넘게 결제가 없으면 한 달씩 앞으로 넘긴다.
--   세는 방법: ym(달) 대신 기간 시작 이후에 만든 사용 기록(created_at)으로 센다.
--     ai_usage.ym은 그대로 '한국 달'(운영 원가 집계용)이고, 새 칸 period_start에 기간 시작을 남긴다.
--   같은 단위(회원 · 차수 등)를 한 기간에 한 번만 세는 규칙 · 다시 만들기 3번 · 팩 · 하루 상한은 그대로.
-- 실행: Supabase SQL Editor에 통째로. 여러 번 실행해도 됨.
-- =============================================================================

-- 1) 사용 기록에 기간 시작 · 색인
alter table ai_usage add column if not exists period_start timestamptz;
create index if not exists ai_usage_account_created_idx on ai_usage(account_id, created_at);
drop index if exists ai_usage_counted_uq;   -- (account_id, ym, unit_key) — 기간이 달을 걸치면 같은 ym 안에서 두 번 셀 수 있어야 한다
create unique index if not exists ai_usage_counted_period_uq on ai_usage(account_id, period_start, unit_key)
  where counted and period_start is not null;

-- 2) 한국 시간으로 한 달 더하기 · 빼기(말일은 그 달 말일로)
create or replace function kst_add_months(p_ts timestamptz, p_n integer) returns timestamptz
language sql stable as $$
  select ((p_ts at time zone 'Asia/Seoul') + make_interval(months => p_n)) at time zone 'Asia/Seoul'
$$;

-- 3) 지금 기간(시작 · 다시 채우는 때)
create or replace function ai_period(p_account uuid, out period_start timestamptz, out resets_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_end timestamptz; v_a timestamptz; v_b timestamptz; n integer := 0;
begin
  select current_period_end into v_end from account where id = p_account;
  select max(p.period_end) into v_a from payment p
   where p.account_id = p_account and p.status in ('DONE', 'TRIAL') and p.plan in ('basic', 'solo', 'center') and p.period_end <= now();
  select max(p.period_start) into v_b from payment p
   where p.account_id = p_account and p.status in ('DONE', 'TRIAL') and p.plan in ('basic', 'solo', 'center') and p.period_start <= now();
  period_start := greatest(v_a, v_b);
  if period_start is null and v_end is not null then
    period_start := v_end;
    while period_start > now() and n < 240 loop period_start := kst_add_months(period_start, -1); n := n + 1; end loop;
  end if;
  if period_start is null then
    period_start := (date_trunc('month', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
  end if;
  n := 0;
  while kst_add_months(period_start, 1) <= now() and n < 240 loop period_start := kst_add_months(period_start, 1); n := n + 1; end loop;
  -- 다시 채우는 때 = 다음 결제일(이 기간 안에서 끝나면) · 아니면 시작 + 한 달
  resets_at := case when v_end is not null and v_end > now() and v_end <= kst_add_months(period_start, 1) + interval '3 days'
                    then v_end else kst_add_months(period_start, 1) end;
end $$;
revoke all on function ai_period(uuid) from public, anon, authenticated;
grant execute on function ai_period(uuid) to service_role;

-- 4) 한도 계산 — 기간 안 사용 기록으로 센다(p_ym은 예전 호출 호환용 · 쓰지 않음)
create or replace function ai_quota_for(p_account uuid, p_ym text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record; tier text; trial boolean; seats integer; per record;
  lim jsonb; g text; base integer; used integer; pused integer; pleft integer; pexp timestamptz; v_out jsonb := '{}'::jsonb;
begin
  select type, billing_plan, extra_seats into a from account where id = p_account;
  if not found then return null; end if;
  select * into per from ai_period(p_account);
  tier := coalesce(a.billing_plan, case when a.type = 'center' then 'center' else 'solo' end);
  trial := not exists (select 1 from payment where account_id = p_account and status = 'DONE')
           and exists (select 1 from payment where account_id = p_account and status = 'TRIAL');
  if trial and tier = 'basic' then tier := 'solo'; end if;
  seats := coalesce(a.extra_seats, 0);
  lim := case tier
    when 'basic'  then jsonb_build_object('voice', 3, 'ot', 3, 'rereg', 3, 'inbody', 3, 'roadmap', 3, 'diet', 3)
    when 'center' then jsonb_build_object('voice', 300 + 100 * seats, 'prep', 60 + 20 * seats, 'inbody', 150, 'roadmap', 150, 'diet', 900 + 300 * seats)
    else               jsonb_build_object('voice', 120, 'prep', 25, 'inbody', 60, 'roadmap', 60, 'diet', 300)
  end;
  for g in select jsonb_object_keys(lim) loop
    base := (lim ->> g)::integer;
    select count(*), count(*) filter (where u.credit_id is not null) into used, pused from ai_usage u
     where u.account_id = p_account and u.created_at >= per.period_start and u.counted and ai_group_of(tier, u.kind) = g;
    select coalesce(sum(c.amount - c.used), 0), min(c.expires_at) into pleft, pexp from ai_credit c
     where c.account_id = p_account and c.refunded_at is null and c.expires_at > now() and c.used < c.amount
       and ai_credit_fits(c.kind, g);
    v_out := v_out || jsonb_build_object(g, jsonb_build_object(
      'limit', base, 'used', used, 'pack_used', pused, 'pack_left', pleft, 'pack_expires', pexp,
      'extra', pused + pleft,
      'left', greatest(base - (used - pused), 0) + pleft));
  end loop;
  return jsonb_build_object('tier', tier, 'trial', trial, 'ym', kst_ym(),
                            'period_start', per.period_start, 'resets_at', per.resets_at, 'groups', v_out);
end $$;

-- 5) 자리 잡기 — 같은 규칙을 기간 기준으로
create or replace function ai_reserve(p_account uuid, p_trainer uuid, p_kind text, p_unit_key text, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ym text := kst_ym(); q jsonb; tier text; g text; left_n integer; rid uuid; dup boolean; v_start timestamptz;
  v_regen integer; v_extra integer; v_key text := p_unit_key; v_day_cnt integer; v_cap integer;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  v_base_left integer; v_credit uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ai:' || p_account::text));
  q := ai_quota_for(p_account);
  if q is null then return jsonb_build_object('ok', false, 'code', 'no_account'); end if;
  v_start := (q ->> 'period_start')::timestamptz;
  tier := q ->> 'tier';
  g := ai_group_of(tier, p_kind);

  if g is null then
    v_cap := case p_kind when 'salesbook' then 40 when 'owner' then 20 when 'cues' then 30 else 50 end;
    select count(*) into v_day_cnt from ai_usage
     where account_id = p_account and kind = p_kind and created_at >= v_day_start and ok is distinct from false;
    if v_day_cnt >= v_cap then
      return jsonb_build_object('ok', false, 'code', 'daily_cap', 'kind', p_kind, 'limit', v_cap);
    end if;
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, period_start)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym, v_start) returning id into rid;
    return jsonb_build_object('ok', true, 'id', rid, 'counted', false);
  end if;

  select exists (select 1 from ai_usage where account_id = p_account and created_at >= v_start and unit_key = p_unit_key and counted) into dup;
  if dup then
    select count(*) into v_regen from ai_usage
     where account_id = p_account and created_at >= v_start and unit_key = p_unit_key and not counted and ok is distinct from false;
    if v_regen < 3 then
      insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, period_start)
      values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym, v_start) returning id into rid;
      return jsonb_build_object('ok', true, 'id', rid, 'counted', false, 'again', true);
    end if;
    select count(*) into v_extra from ai_usage
     where account_id = p_account and created_at >= v_start and unit_key like p_unit_key || '#x%' and counted;
    v_key := p_unit_key || '#x' || (v_extra + 1);
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, ok, period_start)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym, null, v_start);
  end if;

  left_n := coalesce((q -> 'groups' -> g ->> 'left')::integer, 0);
  if left_n <= 0 then
    if dup then
      update ai_usage set ok = false
       where id = (select id from ai_usage where account_id = p_account and unit_key = p_unit_key and ok is null and not counted
                   order by created_at desc limit 1);
    end if;
    return jsonb_build_object('ok', false, 'code', 'quota', 'group', g, 'tier', tier,
                              'limit', (q -> 'groups' -> g ->> 'limit')::integer, 'resets_at', q ->> 'resets_at');
  end if;
  insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, period_start)
  values (p_account, p_trainer, p_kind, v_key, true, p_member, v_ym, v_start) returning id into rid;

  v_base_left := (q -> 'groups' -> g ->> 'limit')::integer
                 - ((q -> 'groups' -> g ->> 'used')::integer - coalesce((q -> 'groups' -> g ->> 'pack_used')::integer, 0));
  if v_base_left <= 0 then
    select c.id into v_credit from ai_credit c
     where c.account_id = p_account and c.refunded_at is null and c.expires_at > now() and c.used < c.amount
       and ai_credit_fits(c.kind, g)
     order by c.expires_at, c.created_at
     limit 1 for update;
    if v_credit is not null then
      update ai_credit set used = used + 1 where id = v_credit;
      update ai_usage set credit_id = v_credit where id = rid;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', rid, 'counted', true, 'group', g, 'left', left_n - 1, 'pack', v_credit is not null);
end $$;

revoke all on function ai_quota_for(uuid, text) from public, anon, authenticated;
grant execute on function ai_quota_for(uuid, text) to service_role;
revoke all on function ai_reserve(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function ai_reserve(uuid, uuid, text, text, uuid) to service_role;

-- 확인: 결과에 period_start · resets_at가 보이면 끝
select id, ai_quota_for(id) ->> 'period_start' as period_start, ai_quota_for(id) ->> 'resets_at' as resets_at
  from account where subscription_status = 'active' order by created_at desc limit 5;
