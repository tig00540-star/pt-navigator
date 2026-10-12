-- =============================================================================
-- 2026-10-12 · 전체 점검(오류 · 보안) 뒤 DB 수정
--   Supabase SQL Editor에 통째로. 여러 번 실행해도 됨. 새 표 없음.
-- =============================================================================

-- 1) 사례 사진 읽기 규칙 — 사례 data의 경로는 트레이너가 쓴 값이라, 경로만 맞추면 다른 센터 회원 사진을 읽을 수 있었다.
--    이 계정 폴더(sales-cases/{계정}/…) 또는 이 계정 회원 폴더(member-photos/{회원}/…)인 경로만.
create or replace function sales_case_file_in_my_account(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sales_case s
                  where s.account_id = auth_account_id()
                    and (s.data->>'path' = p_name or s.data->'before'->>'path' = p_name or s.data->'after'->>'path' = p_name))
     and (split_part(p_name, '/', 1) = auth_account_id()::text
          or exists (select 1 from user_table u where u.id::text = split_part(p_name, '/', 1) and u.account_id = auth_account_id()))
$$;

-- 2) 식단 도우미 함수 — 로그인 안 한 사람도 부를 수 있었다(기본 PUBLIC 실행 권한).
revoke execute on function diet_enabled_for(uuid) from public, anon;
revoke execute on function diet_day_fed(uuid, date) from public, anon;
grant execute on function diet_enabled_for(uuid) to authenticated;
grant execute on function diet_day_fed(uuid, date) to authenticated;

-- 3) 추가 팩 — 같은 결제로 팩이 두 번 들어가지 않게
create unique index if not exists ai_credit_payment_uniq on ai_credit(payment_id) where payment_id is not null;

-- 4) 회원 한꺼번에 등록 되돌리기 — OT 신청서 · 동의 기록이 있는 회원(신청서로 들어온 회원)은 지우지 않는다.
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
       or exists (select 1 from ot_application where member_id = m.id)
       or exists (select 1 from member_consent where member_id = m.id)
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

-- 5) OT 신청서 — 같은 번호 다시 제출 때 열쇠를 돌려주지 않는다(나머지는 2026-10-06-intake-steps.sql 그대로)
create or replace function submit_ot_application(p_code text, p_name text, p_phone text,
                                                 p_answers jsonb, p_slots jsonb, p_consent jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l intake_link; acc account; app_id uuid; dup uuid; recent ot_application; tok text;
begin
  select * into l from intake_link where code = p_code and active;
  if l.id is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into acc from account where id = l.account_id;
  if acc.subscription_status is distinct from 'active' or (acc.current_period_end is not null and acc.current_period_end <= now()) then
    return jsonb_build_object('error', 'closed');
  end if;
  if l.trainer_id is not null and not exists (select 1 from trainer where id = l.trainer_id and coalesce(active, true)) then
    return jsonb_build_object('error', 'closed');
  end if;
  if (select count(*) from ot_application where link_id = l.id and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'busy');
  end if;
  select * into recent from ot_application
   where link_id = l.id and phone = p_phone and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
  if recent.id is not null then
    -- 같은 번호로 10분 안 다시 내면 '신청했어요'만(예전엔 처음 신청의 이어 적기 열쇠를 돌려줘, 번호를 아는 사람이 남의 답을 고칠 수 있었다)
    return jsonb_build_object('ok', true, 'repeat', true,
                              'kind', case when l.trainer_id is null then 'center' else 'trainer' end);
  end if;

  select id into dup from user_table
   where account_id = l.account_id and not coalesce(hidden, false)
     and regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g') = p_phone
   order by created_at desc limit 1;

  tok := replace(gen_random_uuid()::text, '-', '');
  insert into ot_application (account_id, link_id, source, trainer_id, duplicate_of, name, phone, answers, slots, consent, edit_token)
  values (l.account_id, l.id, case when l.trainer_id is null then 'center' else 'trainer' end,
          l.trainer_id, dup, p_name, p_phone, coalesce(p_answers, '{}'::jsonb), p_slots, p_consent, tok)
  returning id into app_id;

  if l.trainer_id is not null then
    perform _ot_member_from_app(app_id, l.trainer_id);
  end if;
  return jsonb_build_object('ok', true, 'kind', case when l.trainer_id is null then 'center' else 'trainer' end,
                            'app', app_id, 'token', tok);
end $$;
revoke all on function submit_ot_application(text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function submit_ot_application(text, text, text, jsonb, jsonb, jsonb) to service_role;

-- 6) 식단 요청 취소 — AI가 답을 만들다 멈춘(10분 넘은) 요청은 회원이 취소할 수 있게(예전엔 영원히 못 취소)
create or replace function withdraw_diet_request(p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare m uuid := auth_member_id();
begin
  update diet_request set status = 'withdrawn'
   where id = p_id and user_id = m and status = 'open'
     and (auto_claim_at is null or auto_claim_at < now() - interval '10 minutes');
  return found;
end $$;

-- 확인: 결과 세 칸이 f · f · t 로 나오면 끝
select has_function_privilege('anon', 'diet_enabled_for(uuid)', 'execute') anon_diet,
       has_function_privilege('anon', 'undo_bulk_members(uuid[])', 'execute') anon_undo,
       exists (select 1 from pg_indexes where indexname = 'ai_credit_payment_uniq') pack_index;
