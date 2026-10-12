-- =============================================================================
-- 2026-10-12 · 회원 한꺼번에 등록(대표 결정 · 설계 docs/v2-계획-처음시작-회원일괄등록.md)
--   bulk_add_members(rows)  = 여러 명을 한 번에(다 되거나 하나도 안 되거나). 보안 규칙(RLS) 그대로 = security invoker.
--   undo_bulk_members(ids)  = 방금(15분 안) 등록한 회원만 지우기. 회원 · 계약 삭제 정책이 없어 security definer + 직접 확인.
-- 한 줄 rows 원소:
--   { name, phone?, kind: 'pt'|'ot', remaining?, price?, pre_this_month?, trainer_id?(대표만),
--     this_month?: { date:'YYYY-MM-DD', kind:'new'|'reregister', amount, total } }
--   PT · this_month 없음 = 이월 계약(origin external · 매출 제외 · 남은 수업만 · 단가 빈칸 허용)
--   PT · this_month 있음 = 매출 계약(started_at = 등록일 · amount_total = 결제 금액 · 단가 = 금액 ÷ 등록 횟수 · 횟수 = 남은 수업)
--   계약 report.imported = { batch, at, purchased_total?, used_before?, pre_this_month } (첫 달 급여 안내 · 막대 보정용)
-- 실행: Supabase SQL Editor에 통째로. 여러 번 실행해도 됨. 새 표 · 새 뷰 없음.
-- =============================================================================

create or replace function bulk_add_members(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; v_uid uuid := auth.uid(); v_acc uuid := auth_account_id(); v_owner boolean := coalesce(auth_is_owner(), false);
  v_now timestamptz := now(); v_batch uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_name text; v_phone text; v_digits text; v_kind text; v_trainer uuid; v_id uuid;
  v_rem integer; v_price integer; v_pre integer; v_tm jsonb; v_date date; v_total integer; v_amount integer; v_ckind text;
  v_added jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_seen text[] := '{}';
begin
  if v_uid is null or v_acc is null then raise exception 'not_allowed'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'empty'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'too_many'; end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(r->>'name', ''));
    if v_name = '' or length(v_name) > 40 then raise exception 'bad_name'; end if;
    v_phone := nullif(btrim(coalesce(r->>'phone', '')), '');
    v_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');
    v_kind := coalesce(r->>'kind', 'pt');
    if v_kind not in ('pt', 'ot') then raise exception 'bad_kind'; end if;

    -- 같은 번호: 이번 목록 안 중복 · 이미 있는 회원(숨김 제외)은 건너뜀
    if v_digits is not null then
      if v_digits = any(v_seen) then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'phone', v_phone, 'reason', 'dup_in_list'); continue;
      end if;
      if exists (select 1 from user_table u where u.account_id = v_acc and not coalesce(u.hidden, false)
                   and regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g') = v_digits) then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'phone', v_phone, 'reason', 'exists'); continue;
      end if;
      v_seen := v_seen || v_digits;
    end if;

    -- 담당: 대표만 다른 트레이너를 고를 수 있다(같은 센터 · 켜진 아이디)
    v_trainer := v_uid;
    if nullif(r->>'trainer_id', '') is not null and (r->>'trainer_id')::uuid <> v_uid then
      if not v_owner then raise exception 'not_owner'; end if;
      if not exists (select 1 from trainer t where t.id = (r->>'trainer_id')::uuid and t.account_id = v_acc and coalesce(t.active, true)) then
        raise exception 'bad_trainer';
      end if;
      v_trainer := (r->>'trainer_id')::uuid;
    end if;

    insert into user_table(name, phone_number, origin, status, status_changed_at, trainer_id)
    values (v_name, v_phone, case when v_kind = 'pt' then 'external' else 'ot_funnel' end,
            case when v_kind = 'pt' then 'pt_active' else 'ot_active' end, v_now, v_trainer)
    returning id into v_id;

    if v_kind = 'pt' then
      v_rem := nullif(r->>'remaining', '')::integer;
      if v_rem is null or v_rem < 1 or v_rem > 500 then raise exception 'bad_remaining'; end if;
      v_tm := r->'this_month';
      if v_tm is not null and jsonb_typeof(v_tm) = 'object' then
        v_date := (v_tm->>'date')::date;
        if v_date is null or v_date > v_today or date_trunc('month', v_date) <> date_trunc('month', v_today) then raise exception 'bad_date'; end if;
        v_total := nullif(v_tm->>'total', '')::integer;
        v_amount := nullif(v_tm->>'amount', '')::integer;
        if v_total is null or v_total < v_rem or v_total > 500 then raise exception 'bad_total'; end if;
        if v_amount is null or v_amount < 1 or v_amount > 100000000 then raise exception 'bad_amount'; end if;
        v_ckind := case when v_tm->>'kind' = 'reregister' then 'reregister' else 'new' end;
        insert into session_log(user_id, sessions_total, price_per_session, amount_total, service_sessions,
                                counts_as_revenue, kind, started_at, trainer_id, report)
        values (v_id, v_rem, round(v_amount::numeric / v_total)::integer, v_amount, 0, true, v_ckind,
                (v_date + time '12:00') at time zone 'Asia/Seoul', v_trainer,
                jsonb_build_object('imported', jsonb_build_object('batch', v_batch, 'at', v_now,
                  'purchased_total', v_total, 'used_before', v_total - v_rem, 'pre_this_month', v_total - v_rem)));
      else
        v_price := nullif(nullif(r->>'price', '')::integer, 0);
        if v_price is not null and (v_price < 0 or v_price > 10000000) then raise exception 'bad_price'; end if;
        v_pre := least(greatest(coalesce(nullif(r->>'pre_this_month', '')::integer, 0), 0), 200);
        insert into session_log(user_id, sessions_total, price_per_session, amount_total, service_sessions,
                                counts_as_revenue, kind, started_at, trainer_id, report)
        values (v_id, v_rem, v_price, null, 0, false, null, v_now, v_trainer,
                jsonb_build_object('imported', jsonb_build_object('batch', v_batch, 'at', v_now, 'pre_this_month', v_pre)));
      end if;
    end if;

    v_added := v_added || jsonb_build_object('id', v_id, 'name', v_name, 'kind', v_kind);
  end loop;

  return jsonb_build_object('ok', true, 'batch', v_batch, 'added', v_added, 'skipped', v_skipped);
end $$;

revoke all on function bulk_add_members(jsonb) from public, anon;
grant execute on function bulk_add_members(jsonb) to authenticated;

-- 되돌리기 — 내가(대표면 센터 안) 15분 안에 만든 회원만 · 그 사이 운동일지 · 예약 · OT 기록 · 인바디 · 다른 계약이 생긴 회원은 남김
create or replace function undo_bulk_members(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_acc uuid := auth_account_id(); v_owner boolean := coalesce(auth_is_owner(), false);
  m record; v_deleted integer := 0; v_kept jsonb := '[]'::jsonb;
begin
  if v_uid is null or v_acc is null then raise exception 'not_allowed'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return jsonb_build_object('ok', true, 'deleted', 0, 'kept', v_kept); end if;
  if array_length(p_ids, 1) > 200 then raise exception 'too_many'; end if;

  for m in select u.id, u.name, u.trainer_id, u.created_at from user_table u
            where u.id = any(p_ids) and u.account_id = v_acc
              and (v_owner or u.trainer_id = v_uid) loop
    if m.created_at < now() - interval '15 minutes' then
      v_kept := v_kept || jsonb_build_object('id', m.id, 'name', m.name, 'reason', 'old'); continue;
    end if;
    if exists (select 1 from daily_workout_log where user_id = m.id)
       or exists (select 1 from appointment where user_id = m.id)
       or exists (select 1 from ot_log where user_id = m.id)
       or exists (select 1 from inbody_log where user_id = m.id)
       or exists (select 1 from session_log where user_id = m.id and not (coalesce(report, '{}'::jsonb) ? 'imported')) then
      v_kept := v_kept || jsonb_build_object('id', m.id, 'name', m.name, 'reason', 'has_records'); continue;
    end if;
    delete from session_log where user_id = m.id;
    delete from user_table where id = m.id;
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'deleted', v_deleted, 'kept', v_kept);
end $$;

revoke all on function undo_bulk_members(uuid[]) from public, anon;
grant execute on function undo_bulk_members(uuid[]) to authenticated;

-- 확인: 두 함수가 보이면 끝
select proname from pg_proc where proname in ('bulk_add_members', 'undo_bulk_members');
