-- =============================================================================
-- AI 한도 우회 막기(2026-10-08 · 전체 점검)
--   ① 다시 만들기: 같은 단위(회원 · 차수 등)는 그달 3번까지만 공짜 → 4번째부터는 한 번씩 센다.
--      (예전: 같은 단위면 몇 번을 다시 만들어도 안 셈 → 같은 회원 번호로 내용만 바꿔 무제한)
--   ② 세지 않는 종류(세일즈북 · 대표 보고서 · 장비 큐)도 계정마다 하루 상한(원가 폭주 방지).
-- 실행: Supabase SQL Editor(수동). 다시 실행해도 같은 결과(멱등). 앞선 2026-10-07-pricing.sql의 ai_reserve를 바꾼다.
-- =============================================================================

create or replace function ai_reserve(p_account uuid, p_trainer uuid, p_kind text, p_unit_key text, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ym text := kst_ym(); q jsonb; tier text; g text; left_n integer; rid uuid; dup boolean;
  v_regen integer; v_extra integer; v_key text := p_unit_key; v_day_cnt integer; v_cap integer;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
begin
  perform pg_advisory_xact_lock(hashtext(p_account::text || v_ym));
  q := ai_quota_for(p_account, v_ym);
  if q is null then return jsonb_build_object('ok', false, 'code', 'no_account'); end if;
  tier := q ->> 'tier';
  g := ai_group_of(tier, p_kind);

  if g is null then                                   -- 세지 않는 종류 — 하루 상한만
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
    -- 이 단위로 이미 센 뒤 다시 만든 횟수(실패는 빼고)
    select count(*) into v_regen from ai_usage
     where account_id = p_account and ai_usage.ym = v_ym and unit_key = p_unit_key and not counted and ok is distinct from false;
    if v_regen < 3 then                               -- 3번까지 공짜(원가는 기록)
      insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
      values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym) returning id into rid;
      return jsonb_build_object('ok', true, 'id', rid, 'counted', false, 'again', true);
    end if;
    -- 4번째부터는 새로 센다 — 세는 줄은 (계정, 달, unit_key)마다 하나라서 꼬리표를 붙인다
    select count(*) into v_extra from ai_usage
     where account_id = p_account and ai_usage.ym = v_ym and unit_key like p_unit_key || '#x%' and counted;
    v_key := p_unit_key || '#x' || (v_extra + 1);
    -- 원래 단위로도 '다시 만들기' 한 줄을 남겨 다음 호출의 v_regen이 계속 3 이상이게
    insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym, ok)
    values (p_account, p_trainer, p_kind, p_unit_key, false, p_member, v_ym, null);
  end if;

  left_n := coalesce((q -> 'groups' -> g ->> 'left')::integer, 0);
  if left_n <= 0 then
    if dup then   -- 방금 남긴 '다시 만들기' 줄은 실제로 안 불렀으니 실패로 표시
      update ai_usage set ok = false
       where id = (select id from ai_usage where account_id = p_account and unit_key = p_unit_key and ok is null and not counted
                   order by created_at desc limit 1);
    end if;
    return jsonb_build_object('ok', false, 'code', 'quota', 'group', g, 'tier', tier,
                              'limit', (q -> 'groups' -> g ->> 'limit')::integer);
  end if;
  insert into ai_usage(account_id, trainer_id, kind, unit_key, counted, target_member, ym)
  values (p_account, p_trainer, p_kind, v_key, true, p_member, v_ym) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'counted', true, 'group', g, 'left', left_n - 1);
end $$;
revoke all on function ai_reserve(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function ai_reserve(uuid, uuid, text, text, uuid) to service_role;

-- 검증(대표 계정 id로):
--   select ai_reserve('<account>', null, 'ot', 'ot:test:r1');  -- 처음 = counted true
--   같은 줄을 4번 더: 2~4번째 = again(안 셈) · 5번째 = counted true(unit_key 'ot:test:r1#x1')
--   delete from ai_usage where unit_key like 'ot:test:%';     -- 시험 줄 정리
-- 롤백: 2026-10-07-pricing.sql의 '5) 자리 잡기' 블록을 다시 실행
