-- =============================================================================
-- 데모 센터 날짜 옮기기 — 2026-10-06
-- 실행: Supabase SQL Editor(한 번) · git 기록본. 멱등.
--
-- 왜: 데모 센터('강남 피트니스')는 만든 날 기준 '오늘 · 어제'로 채워져 있어서 하루만 지나도
--     오늘 예약 · 어제 결과 · 이탈 위험 같은 화면이 어긋난다. 다시 만들면 실제로 돌린 AI 결과가 다 사라진다.
--     → 데모 센터의 모든 날짜를 N일 통째로 옮긴다(AI 결과 · 서명 · 기록은 그대로).
-- 쓰는 법: node --import ./scripts/demo/alias-loader.mjs scripts/demo/shift-to-today.mjs --write
--          (서버 키로만 부를 수 있음 · 화면 · 회원 · 트레이너는 못 부름)
-- 안전장치: 대표 로그인 주소가 demo.owner@onlytrainer.co.kr 인 센터만 옮긴다(실제 센터는 건드릴 수 없음).
-- =============================================================================

-- jsonb 안의 날짜 글자('YYYY-MM-DD' · ISO 시각)를 N일 옮긴다. 'version' 키는 그대로(동의서 버전).
create or replace function _demo_shift_json(j jsonb, d int) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb; o jsonb; s text;
begin
  if j is null then return null; end if;
  case jsonb_typeof(j)
  when 'object' then
    o := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      o := o || jsonb_build_object(k, case when k = 'version' then v else _demo_shift_json(v, d) end);
    end loop;
    return o;
  when 'array' then
    select coalesce(jsonb_agg(_demo_shift_json(e, d) order by i), '[]'::jsonb) into o
      from jsonb_array_elements(j) with ordinality as t(e, i);
    return o;
  when 'string' then
    s := j #>> '{}';
    if s ~ '^\d{4}-\d{2}-\d{2}$' then
      return to_jsonb(to_char(s::date + d, 'YYYY-MM-DD'));
    elsif s ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$' then
      return to_jsonb(to_char((s::timestamptz + make_interval(days => d)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    return j;
  else
    return j;
  end case;
end $$;

create or replace function demo_shift_days(p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  acc uuid; mids uuid[]; t text; filt text; s1 text; s2 text; n int; out jsonb := '{}'::jsonb;
  tables text[] := array[
    'user_table','appointment','appt_request','daily_workout_log','inbody_log','ot_log','session_log',
    'trainer_todo','owner_feedback','owner_daily_report','sales_case','member_routine','member_roadmap',
    'announcement','payroll_run','expense','income','trainer_reward','member_event','member_event_join',
    'ot_application','trainer_event','workout_log_signature','workout_log_confirmation','member_consent',
    'cardio_log','schedule_check','member_photo','member_routine_log','member_routine_request'];
begin
  if p_days is null or p_days = 0 or abs(p_days) > 400 then raise exception 'days out of range'; end if;
  select tr.account_id into acc
    from trainer tr join auth.users u on u.id = tr.id
   where tr.role = 'owner' and u.email = 'demo.owner@onlytrainer.co.kr'
   limit 1;
  if acc is null then raise exception 'demo account not found'; end if;
  select coalesce(array_agg(id), '{}') into mids from user_table where account_id = acc;

  -- 트리거가 지금 시각으로 덮는 칸은 원래 값을 기억했다가 마지막에 되돌린다
  create temp table _demo_keep on commit drop as
    select 'ot_log'::text as tb, id, closing_recorded_at as v from ot_log where account_id = acc
    union all
    select 'daily_workout_log', id, edited_at from daily_workout_log where account_id = acc;

  foreach t in array tables loop
    continue when to_regclass('public.' || t) is null;
    filt := case
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'account_id') then 'account_id = $1'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then 'user_id = any($2)'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'member_id') then 'member_id = any($2)'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'event_id') then 'event_id in (select id from member_event where account_id = $1)'
    end;
    continue when filt is null;

    -- 1단계: 날짜를 100년 앞으로 비켜 둔다(날짜가 들어간 고유 제약이 옮기는 도중 부딪히지 않게)
    select string_agg(format('%I = %I - %s', column_name, column_name,
             case when data_type = 'date' then '36500' else 'interval ''36500 days''' end), ', ')
      into s1
      from information_schema.columns
     where table_schema = 'public' and table_name = t
       and data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
       and column_name not ilike '%birth%';
    -- 2단계: 제자리 + N일 · jsonb 안의 날짜도
    select string_agg(x, ', ') into s2 from (
      select format('%I = %I + %s', column_name, column_name,
               case when data_type = 'date' then (36500 + p_days)::text else format('interval ''%s days''', 36500 + p_days) end) as x
        from information_schema.columns
       where table_schema = 'public' and table_name = t
         and data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
         and column_name not ilike '%birth%'
      union all
      select format('%I = _demo_shift_json(%I, %s)', column_name, column_name, p_days)
        from information_schema.columns
       where table_schema = 'public' and table_name = t and data_type = 'jsonb'
    ) q;
    continue when s2 is null;
    if s1 is not null then
      execute format('update %I set %s where %s', t, s1, filt) using acc, mids;
    end if;
    execute format('update %I set %s where %s', t, s2, filt) using acc, mids;
    get diagnostics n = row_count;
    out := out || jsonb_build_object(t, n);
  end loop;

  update ot_log o set closing_recorded_at = k.v + make_interval(days => p_days)
    from _demo_keep k where k.tb = 'ot_log' and k.id = o.id;
  update daily_workout_log d set edited_at = k.v + make_interval(days => p_days)
    from _demo_keep k where k.tb = 'daily_workout_log' and k.id = d.id;
  return out;
end $$;

revoke all on function demo_shift_days(int) from public, anon, authenticated;
grant execute on function demo_shift_days(int) to service_role;
revoke all on function _demo_shift_json(jsonb, int) from public, anon, authenticated;
grant execute on function _demo_shift_json(jsonb, int) to service_role;

-- =============================================================================
-- 검증: select proname from pg_proc where proname in ('demo_shift_days', '_demo_shift_json');
--       select _demo_shift_json('{"a":"2026-10-05","b":"2026-10-05T01:00:00+00:00","version":"2026-10-06"}', 1);
--       → {"a": "2026-10-06", "b": "2026-10-06T01:00:00.000Z", "version": "2026-10-06"}
-- =============================================================================
