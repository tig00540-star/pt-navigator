-- =============================================================================
-- 2026-10-11 · AI 추가 팩 기간 저장(대표 결정 · 처음 3개월로 실행 → 같은 날 '산 날부터 1개월'로 바꿈 = 2026-10-11-pack-1month.sql)
--   예전: 팩은 산 달 말일까지 · 그달 사용량에서 기본 한도를 넘친 만큼을 산 순서로 나눠 '썼다'고 계산(저장 없음).
--   지금: 팩마다 쓸 수 있는 기간(expires_at = 산 날 + 1개월 · 한국 시간 0시) · 쓴 수(used)를 저장.
--         기본 한도(매달 1일 다시 채움)를 먼저 쓰고, 다 쓰면 기간이 먼저 끝나는 팩부터 한 건씩 꺼내 쓴다.
--         그 사용 기록(ai_usage.credit_id)에 어느 팩에서 나갔는지 남긴다 → 실패(ai_finish ok=false)면 팩에 돌려준다.
--   요금제를 바꿔도 남은 팩은 기간 안에 그대로 쓴다(베이직으로 내려가면 '대본' 팩은 OT · 재등록 둘 다에 쓰임).
--   환불 = 산 뒤 7일 안 · used = 0 일 때만(그대로).
-- 실행: Supabase SQL Editor에 통째로. 여러 번 실행해도 됨.
-- =============================================================================

-- 1) 팩: 기간 · 쓴 수
alter table ai_credit add column if not exists expires_at timestamptz;
alter table ai_credit add column if not exists used integer not null default 0;
update ai_credit
   set expires_at = ((((created_at at time zone 'Asia/Seoul')::date + interval '1 month')::date)::timestamp at time zone 'Asia/Seoul')
 where expires_at is null;
alter table ai_credit alter column expires_at
  set default ((((now() at time zone 'Asia/Seoul')::date + interval '1 month')::date)::timestamp at time zone 'Asia/Seoul');
alter table ai_credit alter column expires_at set not null;
alter table ai_credit drop constraint if exists ai_credit_used_check;
alter table ai_credit add constraint ai_credit_used_check check (used >= 0 and used <= amount);
create index if not exists ai_credit_account_exp_idx on ai_credit(account_id, expires_at);

-- 2) 사용 기록 → 어느 팩에서 나갔나
alter table ai_usage add column if not exists credit_id uuid references ai_credit(id) on delete set null;

-- 3) 팩 종류가 한도 묶음에 맞나('대본' 팩은 베이직의 ot · rereg 둘 다)
create or replace function ai_credit_fits(p_credit_kind text, p_group text) returns boolean
language sql immutable as $$
  select p_credit_kind = p_group or (p_credit_kind = 'prep' and p_group in ('ot', 'rereg'))
$$;

-- 4) 한도 계산 — limit(이번 달 기본) · used(이번 달 쓴 수 · 팩에서 나간 것 포함) · pack_used(이번 달 팩에서 나간 수)
--    pack_left(지금 쓸 수 있는 팩 남은 수) · pack_expires(가장 먼저 끝나는 팩) · extra = pack_used + pack_left(화면 '쓴 수 / 전체'용)
--    left = 기본 남은 수 + 팩 남은 수
create or replace function ai_quota_for(p_account uuid, p_ym text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record; tier text; v_ym text := coalesce(p_ym, kst_ym()); trial boolean; seats integer;
  lim jsonb; g text; base integer; used integer; pused integer; pleft integer; pexp timestamptz; v_out jsonb := '{}'::jsonb;
begin
  select type, billing_plan, extra_seats into a from account where id = p_account;
  if not found then return null; end if;
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
     where u.account_id = p_account and u.ym = v_ym and u.counted and ai_group_of(tier, u.kind) = g;
    select coalesce(sum(c.amount - c.used), 0), min(c.expires_at) into pleft, pexp from ai_credit c
     where c.account_id = p_account and c.refunded_at is null and c.expires_at > now() and c.used < c.amount
       and ai_credit_fits(c.kind, g);
    v_out := v_out || jsonb_build_object(g, jsonb_build_object(
      'limit', base, 'used', used, 'pack_used', pused, 'pack_left', pleft, 'pack_expires', pexp,
      'extra', pused + pleft,
      'left', greatest(base - (used - pused), 0) + pleft));
  end loop;
  return jsonb_build_object('tier', tier, 'trial', trial, 'ym', v_ym, 'groups', v_out);
end $$;

-- 5) 자리 잡기 — 기본 한도를 다 썼으면 기간이 먼저 끝나는 팩에서 한 건
create or replace function ai_reserve(p_account uuid, p_trainer uuid, p_kind text, p_unit_key text, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ym text := kst_ym(); q jsonb; tier text; g text; left_n integer; rid uuid; dup boolean;
  v_regen integer; v_extra integer; v_key text := p_unit_key; v_day_cnt integer; v_cap integer;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  v_base_left integer; v_credit uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_account::text || v_ym));
  q := ai_quota_for(p_account, v_ym);
  if q is null then return jsonb_build_object('ok', false, 'code', 'no_account'); end if;
  tier := q ->> 'tier';
  g := ai_group_of(tier, p_kind);

  if g is null then
    v_cap := case p_kind when 'salesbook' then 40 when 'owner' then 20 when 'cues' then 30 else 50 end;
    select count(*) into v_day_cnt from ai_usage
     where account_id = p_account and kind = p_kind and created_at >= v_day_start and ok is distinct from false;
    if v_day_cnt >= v_cap then
      return jsonb_build_object('ok', false, 'code', 'daily_cap', 'kind', p_kind, 'limit', v_cap);
    end if;
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym) returning id into rid;
    return jsonb_build_object('ok', true, 'id', rid, 'counted', false);
  end if;

  select exists (select 1 from ai_usage where account_id = p_account and ai_usage.ym = v_ym and unit_key = p_unit_key and counted) into dup;
  if dup then
    select count(*) into v_regen from ai_usage
     where account_id = p_account and ai_usage.ym = v_ym and unit_key = p_unit_key and not counted and ok is distinct from false;
    if v_regen < 3 then
      insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
      values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym) returning id into rid;
      return jsonb_build_object('ok', true, 'id', rid, 'counted', false, 'again', true);
    end if;
    select count(*) into v_extra from ai_usage
     where account_id = p_account and ai_usage.ym = v_ym and unit_key like p_unit_key || '#x%' and counted;
    v_key := p_unit_key || '#x' || (v_extra + 1);
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, ok)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym, null);
  end if;

  left_n := coalesce((q -> 'groups' -> g ->> 'left')::integer, 0);
  if left_n <= 0 then
    if dup then
      update ai_usage set ok = false
       where id = (select id from ai_usage where account_id = p_account and unit_key = p_unit_key and ok is null and not counted
                   order by created_at desc limit 1);
    end if;
    return jsonb_build_object('ok', false, 'code', 'quota', 'group', g, 'tier', tier,
                              'limit', (q -> 'groups' -> g ->> 'limit')::integer);
  end if;
  insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
  values (p_account, p_trainer, p_kind, v_key, true, p_member, v_ym) returning id into rid;

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

-- 6) 마무리 — 실패면 안 셈 + 팩에서 나간 건 팩에 돌려줌
create or replace function ai_finish(p_id uuid, p_ok boolean, p_model text default null, p_in integer default null,
                                     p_out integer default null, p_cache integer default null, p_cost numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_credit uuid;
begin
  select credit_id into v_credit from ai_usage where id = p_id for update;
  if not p_ok and v_credit is not null then
    update ai_credit set used = greatest(used - 1, 0) where id = v_credit;
  end if;
  update ai_usage
     set ok = p_ok,
         counted = case when p_ok then counted else false end,
         credit_id = case when p_ok then credit_id else null end,
         model = coalesce(p_model, model),
         input_tokens = coalesce(p_in, input_tokens),
         output_tokens = coalesce(p_out, output_tokens),
         cache_read_tokens = coalesce(p_cache, cache_read_tokens),
         cost_usd = coalesce(p_cost, cost_usd)
   where id = p_id;
end $$;

-- 확인: select column_name from information_schema.columns where table_name = 'ai_credit' and column_name in ('expires_at', 'used');
--       select my_ai_quota();   -- groups 안에 pack_left · pack_expires가 보이면 끝

-- 7) 권한(다시 만들어도 유지되지만 한 번 더 · 서버만)
revoke all on function ai_quota_for(uuid, text) from public, anon, authenticated;
grant execute on function ai_quota_for(uuid, text) to service_role;
revoke all on function ai_reserve(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function ai_reserve(uuid, uuid, text, text, uuid) to service_role;
revoke all on function ai_finish(uuid, boolean, text, integer, integer, integer, numeric) from public, anon, authenticated;
grant execute on function ai_finish(uuid, boolean, text, integer, integer, integer, numeric) to service_role;
