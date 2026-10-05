-- =============================================================================
-- OT 신청 QR(트레이너 QR · 센터 QR) + 신청 · 배정 · 알림 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등(여러 번 실행해도 같은 결과).
-- 전제: 2026-10-05-pt-end-consent.sql(member_consent) · 2026-10-06-auto-confirm.sql 실행 완료.
--
-- 흐름(대표 결정 2026-10-06):
--   · 트레이너 QR(링크) → 회원이 사전 문진 · 원하는 요일/시간 · 동의 제출 → 그 트레이너의 OT 회원으로 바로 등록 + 트레이너 알림.
--   · 센터 QR → 대표에게 '배정 대기' → 대표가 트레이너를 고르면 그때 OT 회원으로 등록 + 그 트레이너 알림.
--   · 제출은 로그인 없는 공개 페이지 → 서버 라우트(/api/ot-intake · service_role)만 submit_ot_application을 부른다.
--     ★anon 정책 없음(using(true) 금지 규칙 그대로). 표 쓰기는 전부 함수로만.
--   · 같은 번호의 기존 회원이 있으면 새로 만들지 않고 그 회원에 연결(원하는 시간만 갱신).
-- =============================================================================

-- ── 1) 회원의 원하는 요일 · 시간 ─────────────────────────────────────────────
--   {days:[1..7](월=1), hours:[6..23](그 시각부터 1시간), note:'...'} · availability(글)도 같이 채워 AI가 그대로 읽는다.
alter table user_table add column if not exists preferred_slots jsonb;

-- ── 2) 동의 방법에 'intake'(신청서에서 회원이 직접) 추가 ─────────────────────────
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'member_consent'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table member_consent drop constraint %I', c.conname);
  end loop;
end $$;
alter table member_consent add constraint member_consent_method_check
  check (method in ('member_page', 'trainer_check', 'intake'));

-- ── 3) QR 링크(코드) ─────────────────────────────────────────────────────────
create table if not exists intake_link (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  trainer_id  uuid references trainer(id) on delete cascade,     -- null = 센터 QR
  code        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists intake_link_one_active
  on intake_link (account_id, coalesce(trainer_id, '00000000-0000-0000-0000-000000000000'::uuid)) where active;
alter table intake_link enable row level security;
drop policy if exists "intake_link_select" on intake_link;
create policy "intake_link_select" on intake_link for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
-- 쓰기 정책 없음 = 아래 함수로만.

-- ── 4) 신청서 ───────────────────────────────────────────────────────────────
create table if not exists ot_application (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account(id) on delete cascade,
  link_id       uuid references intake_link(id) on delete set null,
  source        text not null check (source in ('trainer', 'center')),
  trainer_id    uuid references trainer(id) on delete set null,    -- 담당(트레이너 QR = 처음부터 · 센터 QR = 배정 뒤)
  member_id     uuid references user_table(id) on delete set null, -- 만들어진(또는 연결된) 회원
  duplicate_of  uuid references user_table(id) on delete set null, -- 같은 번호 기존 회원
  status        text not null default 'pending' check (status in ('pending', 'assigned', 'dismissed')),
  name          text not null check (char_length(name) between 1 and 40),
  phone         text not null check (phone ~ '^[0-9]{9,11}$'),
  answers       jsonb not null default '{}'::jsonb,   -- 사전 문진(배정 전 보관 · 건강정보는 동의했을 때만)
  slots         jsonb,                                 -- 원하는 요일 · 시간
  consent       jsonb not null,                        -- {general, log_rule, health, version, at}
  created_at    timestamptz not null default now(),
  assigned_at   timestamptz,
  assigned_by   uuid,
  seen_at       timestamptz                            -- 담당 트레이너가 알림을 확인한 시각
);
create index if not exists ot_application_account_idx on ot_application (account_id, status, created_at desc);
create index if not exists ot_application_trainer_idx on ot_application (trainer_id, seen_at);
alter table ot_application enable row level security;
drop policy if exists "ot_application_select" on ot_application;
create policy "ot_application_select" on ot_application for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
-- 쓰기 정책 없음 = 아래 함수로만.

-- ── 5) 내부: 신청서 → OT 회원(또는 같은 번호 기존 회원에 연결) ─────────────────────
create or replace function _ot_member_from_app(p_app uuid, p_trainer uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a ot_application; mid uuid; ans jsonb; slot_txt text;
begin
  select * into a from ot_application where id = p_app for update;
  ans := coalesce(a.answers, '{}'::jsonb);
  slot_txt := coalesce(nullif(a.slots->>'text', ''), nullif(trim(both ' ·' from concat_ws(' · ',
    (select string_agg((array['월','화','수','목','금','토','일'])[d::int], '·' order by d::int) from jsonb_array_elements_text(a.slots->'days') d),
    (select string_agg(h || '시', '·' order by h::int) from jsonb_array_elements_text(a.slots->'hours') h),
    nullif(a.slots->>'note', ''))), ''));   -- text = 앱이 만든 한 줄("월·수 · 19~22시")

  if a.duplicate_of is not null and exists (select 1 from user_table where id = a.duplicate_of and not coalesce(hidden, false)) then
    mid := a.duplicate_of;
    update user_table set preferred_slots = coalesce(a.slots, preferred_slots),
                          availability = coalesce(availability, slot_txt)
     where id = mid;
  else
    insert into user_table (account_id, trainer_id, name, phone_number, age, gender, job, residence, goal, goal_deadline,
                            training_pace, exercise_level, quit_reason, past_exercise, activity_level, member_note,
                            pain, injury_history, availability, preferred_slots, origin, status, status_changed_at)
    values (a.account_id, p_trainer, a.name, a.phone,
            case when ans->>'age' ~ '^[0-9]{1,3}$' then (ans->>'age')::int end,
            nullif(ans->>'gender', ''), nullif(ans->>'job', ''), nullif(ans->>'residence', ''), nullif(ans->>'goal', ''),
            nullif(ans->>'goal_deadline', ''), nullif(ans->>'training_pace', ''), nullif(ans->>'exercise_level', ''),
            nullif(ans->>'quit_reason', ''), nullif(ans->>'past_exercise', ''), nullif(ans->>'activity_level', ''),
            nullif(ans->>'member_note', ''),
            case when (a.consent->>'health')::boolean then nullif(ans->>'pain', '') end,
            case when (a.consent->>'health')::boolean then nullif(ans->>'injury_history', '') end,
            slot_txt, a.slots, 'ot_funnel', 'ot_active', now())
    returning id into mid;
    insert into member_consent (member_id, kind, agreed, method, version)
      values (mid, 'general', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    if (a.consent->>'health')::boolean then
      insert into member_consent (member_id, kind, agreed, method, version)
        values (mid, 'health', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    end if;
  end if;

  update ot_application set member_id = mid, trainer_id = p_trainer, status = 'assigned', assigned_at = now()
   where id = p_app;
  return mid;
end $$;
revoke all on function _ot_member_from_app(uuid, uuid) from public, anon, authenticated;

-- ── 6) 제출(서버 라우트 전용 · service_role) ─────────────────────────────────────
--   반환: {ok, kind:'trainer'|'center', center, trainer} 또는 {error:'invalid'|'closed'|'busy'}
create or replace function submit_ot_application(p_code text, p_name text, p_phone text,
                                                 p_answers jsonb, p_slots jsonb, p_consent jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l intake_link; acc account; app_id uuid; dup uuid; recent uuid;
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
  -- 장난 신청 막기: 한 링크에 1시간 30건까지 · 같은 번호 10분 안 다시 제출은 그대로 성공 처리(두 번 안 만듦).
  if (select count(*) from ot_application where link_id = l.id and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'busy');
  end if;
  select id into recent from ot_application
   where link_id = l.id and phone = p_phone and created_at > now() - interval '10 minutes' limit 1;
  if recent is not null then return jsonb_build_object('ok', true, 'repeat', true); end if;

  select id into dup from user_table
   where account_id = l.account_id and not coalesce(hidden, false)
     and regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g') = p_phone
   order by created_at desc limit 1;

  insert into ot_application (account_id, link_id, source, trainer_id, duplicate_of, name, phone, answers, slots, consent)
  values (l.account_id, l.id, case when l.trainer_id is null then 'center' else 'trainer' end,
          l.trainer_id, dup, p_name, p_phone, coalesce(p_answers, '{}'::jsonb), p_slots, p_consent)
  returning id into app_id;

  if l.trainer_id is not null then
    perform _ot_member_from_app(app_id, l.trainer_id);
  end if;
  return jsonb_build_object('ok', true, 'kind', case when l.trainer_id is null then 'center' else 'trainer' end);
end $$;
revoke all on function submit_ot_application(text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function submit_ot_application(text, text, text, jsonb, jsonb, jsonb) to service_role;

-- 신청서 화면 머리(센터 이름 · 트레이너 이름)만 — 서버 라우트 전용.
create or replace function intake_link_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when l.id is null then jsonb_build_object('error', 'invalid')
              when a.subscription_status is distinct from 'active'
                   or (a.current_period_end is not null and a.current_period_end <= now()) then jsonb_build_object('error', 'closed')
              else jsonb_build_object('ok', true, 'center', a.name, 'trainer', t.name,
                                      'kind', case when l.trainer_id is null then 'center' else 'trainer' end) end
    from (select 1) x
    left join intake_link l on l.code = p_code and l.active
    left join account a on a.id = l.account_id
    left join trainer t on t.id = l.trainer_id;
$$;
revoke all on function intake_link_info(text) from public, anon, authenticated;
grant execute on function intake_link_info(text) to service_role;

-- ── 7) 앱에서 부르는 함수(로그인한 트레이너 · 대표) ───────────────────────────────
-- QR 코드 받기(없으면 만듦) · p_rotate=true면 옛 코드를 끄고 새로(옛 QR은 '닫힌 신청서'가 된다).
--   p_trainer null = 센터 QR(대표 · 센터 계정만) · 트레이너 QR = 본인 또는 대표.
create or replace function intake_link_get(p_trainer uuid default null, p_rotate boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare acct uuid := auth_account_id(); c text; t_ok boolean;
begin
  if acct is null then raise exception 'forbidden'; end if;
  if p_trainer is null then
    if not auth_is_owner() or (select type from account where id = acct) is distinct from 'center' then raise exception 'forbidden'; end if;
  else
    select exists (select 1 from trainer where id = p_trainer and account_id = acct and coalesce(active, true)) into t_ok;
    if not t_ok or (p_trainer <> auth.uid() and not auth_is_owner()) then raise exception 'forbidden'; end if;
  end if;
  if p_rotate then
    update intake_link set active = false
     where account_id = acct and active and trainer_id is not distinct from p_trainer;
  end if;
  select code into c from intake_link where account_id = acct and active and trainer_id is not distinct from p_trainer;
  if c is null then
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    insert into intake_link (account_id, trainer_id, code) values (acct, p_trainer, c);
  end if;
  return c;
end $$;
revoke all on function intake_link_get(uuid, boolean) from public, anon;
grant execute on function intake_link_get(uuid, boolean) to authenticated;

-- 대표: 배정(→ OT 회원 등록 + 트레이너 알림) · 넘기기(장난 · 중복)
create or replace function assign_ot_application(p_app uuid, p_trainer uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a ot_application; mid uuid;
begin
  if not auth_is_owner() then raise exception 'forbidden'; end if;
  select * into a from ot_application where id = p_app and account_id = auth_account_id();
  if a.id is null or a.status <> 'pending' then raise exception 'not_pending'; end if;
  if not exists (select 1 from trainer where id = p_trainer and account_id = a.account_id and coalesce(active, true)) then
    raise exception 'bad_trainer';
  end if;
  mid := _ot_member_from_app(p_app, p_trainer);
  update ot_application set assigned_by = auth.uid() where id = p_app;
  return mid;
end $$;
revoke all on function assign_ot_application(uuid, uuid) from public, anon;
grant execute on function assign_ot_application(uuid, uuid) to authenticated;

create or replace function dismiss_ot_application(p_app uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not auth_is_owner() then raise exception 'forbidden'; end if;
  update ot_application set status = 'dismissed', assigned_by = auth.uid(), assigned_at = now()
   where id = p_app and account_id = auth_account_id() and status = 'pending';
end $$;
revoke all on function dismiss_ot_application(uuid) from public, anon;
grant execute on function dismiss_ot_application(uuid) to authenticated;

-- 트레이너: 알림 확인
create or replace function mark_ot_application_seen(p_app uuid)
returns void language sql security definer set search_path = public as $$
  update ot_application set seen_at = now() where id = p_app and trainer_id = auth.uid() and seen_at is null;
$$;
revoke all on function mark_ot_application_seen(uuid) from public, anon;
grant execute on function mark_ot_application_seen(uuid) to authenticated;

-- =============================================================================
-- 검증(읽기 전용):
--   select column_name from information_schema.columns where table_name = 'user_table' and column_name = 'preferred_slots';
--   select tablename from pg_tables where tablename in ('intake_link', 'ot_application');   -- 2줄
--   select proname from pg_proc where proname in ('submit_ot_application','intake_link_info','intake_link_get',
--     'assign_ot_application','dismiss_ot_application','mark_ot_application_seen','_ot_member_from_app');  -- 7줄
-- 롤백: drop function ... 7개 · drop table ot_application, intake_link · alter table user_table drop column preferred_slots
--       · member_consent method 제약을 ('member_page','trainer_check')로 되돌리기(intake 행이 있으면 먼저 정리).
-- =============================================================================
