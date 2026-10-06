-- =============================================================================
-- OT 신청서 2단계(이어 적기) + 새 질문 4개 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-06-ot-intake.sql 실행 완료.
--
--   1단계(이름 · 번호 · 요일/시간 · 동의)만으로 신청이 저장되고, 2단계 질문은 하나씩 '이어 적기'로 붙는다.
--   이어 적기는 1단계 응답에서 받은 1회용 열쇠(edit_token · 24시간)가 맞을 때만 — 남의 신청을 못 고치게.
--   새 질문: 일주일에 몇 번(weekly_freq) · 건강 체크(health_screen · 건강정보 동의했을 때만) · 알게 된 경로(lead_source)
--           · 원하는 트레이너 성별(센터 QR만 · 신청서에만 남김 · 대표 배정 참고).
-- =============================================================================

alter table user_table add column if not exists weekly_freq text;      -- '1' | '2' | '3' | '4+'
alter table user_table add column if not exists health_screen jsonb;   -- {items:[...], note} · {none:true}
alter table user_table add column if not exists lead_source text;      -- 인스타그램 · 네이버 · 지인 소개 · 지나가다 · 기타
alter table ot_application add column if not exists edit_token text;

-- 신청서 답 → 회원 칸(있는 것만 · 건강은 동의했을 때만). 신청 → 회원 만들 때와 이어 적을 때 같이 쓴다.
create or replace function _ot_apply_answers(p_member uuid, p_ans jsonb, p_health boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update user_table set
    age            = coalesce(case when p_ans->>'age' ~ '^[0-9]{1,3}$' then (p_ans->>'age')::int end, age),
    gender         = coalesce(nullif(p_ans->>'gender', ''), gender),
    job            = coalesce(nullif(p_ans->>'job', ''), job),
    goal           = coalesce(nullif(p_ans->>'goal', ''), goal),
    goal_deadline  = coalesce(nullif(p_ans->>'goal_deadline', ''), goal_deadline),
    training_pace  = coalesce(nullif(p_ans->>'training_pace', ''), training_pace),
    exercise_level = coalesce(nullif(p_ans->>'exercise_level', ''), exercise_level),
    quit_reason    = coalesce(nullif(p_ans->>'quit_reason', ''), quit_reason),
    past_exercise  = coalesce(nullif(p_ans->>'past_exercise', ''), past_exercise),
    activity_level = coalesce(nullif(p_ans->>'activity_level', ''), activity_level),
    member_note    = coalesce(nullif(p_ans->>'member_note', ''), member_note),
    weekly_freq    = coalesce(nullif(p_ans->>'weekly_freq', ''), weekly_freq),
    lead_source    = coalesce(nullif(p_ans->>'lead_source', ''), lead_source),
    pain           = case when p_health then coalesce(nullif(p_ans->>'pain', ''), pain) else pain end,
    injury_history = case when p_health then coalesce(nullif(p_ans->>'injury_history', ''), injury_history) else injury_history end,
    health_screen  = case when p_health and p_ans ? 'health_screen' then p_ans->'health_screen' else health_screen end
  where id = p_member;
end $$;
revoke all on function _ot_apply_answers(uuid, jsonb, boolean) from public, anon, authenticated;

-- 신청서 → OT 회원(또는 같은 번호 기존 회원 연결) — 새 칸까지 채우도록 다시 만든다.
create or replace function _ot_member_from_app(p_app uuid, p_trainer uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a ot_application; mid uuid; slot_txt text; hc boolean;
begin
  select * into a from ot_application where id = p_app for update;
  hc := coalesce((a.consent->>'health')::boolean, false);
  slot_txt := nullif(a.slots->>'text', '');

  if a.duplicate_of is not null and exists (select 1 from user_table where id = a.duplicate_of and not coalesce(hidden, false)) then
    mid := a.duplicate_of;
    update user_table set preferred_slots = coalesce(a.slots, preferred_slots),
                          availability = coalesce(availability, slot_txt)
     where id = mid;
  else
    insert into user_table (account_id, trainer_id, name, phone_number, availability, preferred_slots, origin, status, status_changed_at)
    values (a.account_id, p_trainer, a.name, a.phone, slot_txt, a.slots, 'ot_funnel', 'ot_active', now())
    returning id into mid;
    perform _ot_apply_answers(mid, coalesce(a.answers, '{}'::jsonb), hc);
    insert into member_consent (member_id, kind, agreed, method, version)
      values (mid, 'general', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    if hc then
      insert into member_consent (member_id, kind, agreed, method, version)
        values (mid, 'health', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    end if;
  end if;

  update ot_application set member_id = mid, trainer_id = p_trainer, status = 'assigned', assigned_at = now()
   where id = p_app;
  return mid;
end $$;
revoke all on function _ot_member_from_app(uuid, uuid) from public, anon, authenticated;

-- 제출(1단계) — 이제 {ok, kind, app, token}을 돌려준다(2단계 이어 적기용 열쇠).
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
    return jsonb_build_object('ok', true, 'repeat', true, 'app', recent.id, 'token', recent.edit_token,
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

-- 이어 적기(2단계) — 열쇠 · 24시간 확인 → 답 합치기 → 이미 회원이면 회원 칸에도. p_health=true면 건강정보 동의를 이때 받은 것.
create or replace function update_ot_application(p_app uuid, p_token text, p_answers jsonb, p_health boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a ot_application; hc boolean;
begin
  select * into a from ot_application where id = p_app for update;
  if a.id is null or a.edit_token is null or a.edit_token <> p_token or a.created_at < now() - interval '24 hours' then
    return jsonb_build_object('error', 'invalid');
  end if;
  hc := coalesce((a.consent->>'health')::boolean, false);
  if p_health and not hc then
    hc := true;
    update ot_application set consent = consent || jsonb_build_object('health', true, 'health_at', now()) where id = p_app;
    if a.member_id is not null then
      insert into member_consent (member_id, kind, agreed, method, version)
        values (a.member_id, 'health', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    end if;
  end if;
  -- 건강정보 동의가 없으면 건강 칸은 버린다(화면이 보내도 저장 안 함).
  if not hc then p_answers := coalesce(p_answers, '{}'::jsonb) - 'pain' - 'injury_history' - 'health_screen'; end if;
  update ot_application set answers = coalesce(answers, '{}'::jsonb) || coalesce(p_answers, '{}'::jsonb) where id = p_app;
  -- 이 신청으로 새로 만든 회원만 회원 칸을 채운다(같은 번호 기존 회원은 트레이너가 관리하던 값을 덮지 않음 · 답은 신청서에 남음).
  if a.member_id is not null and a.status = 'assigned' and a.duplicate_of is null then
    perform _ot_apply_answers(a.member_id, coalesce(p_answers, '{}'::jsonb), hc);
  end if;
  return jsonb_build_object('ok', true, 'health', hc);
end $$;
revoke all on function update_ot_application(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function update_ot_application(uuid, text, jsonb, boolean) to service_role;

-- =============================================================================
-- 검증: select column_name from information_schema.columns where table_name='user_table'
--         and column_name in ('weekly_freq','health_screen','lead_source');   -- 3줄
--       select proname from pg_proc where proname in ('_ot_apply_answers','update_ot_application');   -- 2줄
-- =============================================================================
