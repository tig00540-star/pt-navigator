-- =============================================================================
-- 2026-10-11 식단 관리 1단계(대표 결정 · 설계 아티팩트 '식단 관리 1단계 설계')
--   트레이너가 PT 회원마다 식단 관리를 켠다(건강정보 동의한 PT 회원만 · DB가 막음).
--   하루 = 오전 6시 ~ 다음 날 오전 6시(KST · diet_today()).
--   회원: 끼니 사진 · 글 → [오늘 식단 끝] · '식단 짜 주세요' 하루 3번(request_diet).
--   트레이너: 직접 · AI 초안 → 보내기. 안 보내면 서버가 AI로 대신(요청 1 · 2번째는 1시간 뒤 · 하루 피드백은 오전 6시 뒤).
--   AI라는 표시는 회원 화면에 없다 — 회원용 화면(뷰)엔 ai 칸을 안 넣는다.
--   사진 = 비공개 버킷 diet-photos/{회원 id}/… · 회원 페이지가 닫히면(PT 종료 6개월) 서버 작업이 지운다.
--   AI 한도 = 'diet' 묶음(베이직 3 · 프로 300 · 센터 900 + 자리마다 300).
-- 실행: Supabase SQL Editor. 다시 실행해도 같은 결과.
-- =============================================================================

-- 0) 식단 하루(오전 6시 기준 KST 날짜)
create or replace function diet_today() returns date language sql stable as $$
  select ((now() at time zone 'Asia/Seoul') - interval '6 hours')::date
$$;
create or replace function diet_day_of(p_at timestamptz) returns date language sql immutable as $$
  select ((p_at at time zone 'Asia/Seoul') - interval '6 hours')::date
$$;

-- 1) 식단 설정(회원당 하나)
create table if not exists diet_plan (
  member_id      uuid primary key references user_table(id) on delete cascade,
  account_id     uuid not null default auth_account_id() references account(id) on delete cascade,
  enabled        boolean not null default true,
  purpose        text not null check (purpose in ('diet', 'bulk', 'bodyprofile', 'contest', 'health')),
  months         numeric,                 -- 기간(개월)
  goal_kg        numeric,                 -- 체중 변화 목표(−6 · +3 · 건강관리 · 대회는 비움)
  started_on     date not null default kst_today(),
  ends_on        date,
  base_weight    numeric,                 -- 켤 때 인바디
  base_bmr       numeric,
  base_inbody_at date,
  kcal_rest      integer,                 -- 운동 없는 날
  kcal_pt        integer,                 -- 운동하는 날
  carb_g         integer,
  protein_g      integer,
  fat_g          integer,
  manual         boolean not null default false,   -- 트레이너가 숫자를 직접(대회 준비 등)
  no_numbers     boolean not null default false,   -- 질환이 적힌 회원 = 숫자 대신 기록 관리만
  examples       jsonb,                   -- 예시 식단 3가지(AI · 회원에게 보임)
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
create index if not exists diet_plan_account_idx on diet_plan(account_id);
alter table diet_plan enable row level security;
drop policy if exists "auth_all_diet_plan" on diet_plan;
create policy "auth_all_diet_plan" on diet_plan for all to authenticated
  using (account_id = (select auth_account_id()))
  with check (account_id = (select auth_account_id()) and member_in_my_account(member_id::text));

-- 켜려면: PT 회원 + 건강정보 동의(가장 최근 기록이 동의)
create or replace function _diet_plan_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text; v_ok boolean;
begin
  if new.enabled then
    select status into v_status from user_table where id = new.member_id;
    if v_status is distinct from 'pt_active' then raise exception 'diet_pt_only'; end if;
    select agreed into v_ok from member_consent where member_id = new.member_id and kind = 'health'
      order by created_at desc limit 1;
    if not coalesce(v_ok, false) then raise exception 'diet_health_consent'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists diet_plan_guard on diet_plan;
create trigger diet_plan_guard before insert or update on diet_plan for each row execute function _diet_plan_guard();

-- 건강정보 동의를 철회하면 식단 관리 끔
create or replace function _diet_off_on_withdraw() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'health' and not new.agreed then
    update diet_plan set enabled = false where member_id = new.member_id and enabled;
  end if;
  return new;
end $$;
drop trigger if exists diet_off_on_withdraw on member_consent;
create trigger diet_off_on_withdraw after insert on member_consent for each row execute function _diet_off_on_withdraw();

-- 3) 하루(끝 누름 · 피드백)
create table if not exists diet_day (
  user_id        uuid not null references user_table(id) on delete cascade,
  day            date not null,
  account_id     uuid references account(id) on delete cascade,
  closed_at      timestamptz,             -- 회원이 [오늘 식단 끝]
  feedback       jsonb,                   -- { totals:{kcal,carb,protein,fat}, good, next, timing, note }
  feedback_at    timestamptz,
  feedback_by    uuid,                    -- 보낸 트레이너(AI가 대신 보냈으면 null)
  ai             boolean not null default false,   -- 트레이너 화면에만
  draft          jsonb,                   -- 트레이너가 열어 본 AI 초안(오전 6시에 재사용)
  draft_at       timestamptz,
  auto_claim_at  timestamptz,             -- 자동 처리 중(두 번 안 만들게)
  member_seen_at timestamptz,
  primary key (user_id, day)
);
create index if not exists diet_day_account_idx on diet_day(account_id);
create or replace function _diet_day_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is null then select account_id into new.account_id from user_table where id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists diet_day_fill on diet_day;
create trigger diet_day_fill before insert on diet_day for each row execute function _diet_day_fill();
alter table diet_day enable row level security;
drop policy if exists "auth_all_diet_day" on diet_day;
create policy "auth_all_diet_day" on diet_day for all to authenticated
  using (account_id = (select auth_account_id()))
  with check (account_id = (select auth_account_id()));
-- 회원 쓰기는 함수로만(끝 누르기)

create or replace function diet_close_day() returns date language plpgsql security definer set search_path = public as $$
declare m uuid := auth_member_id(); d date := diet_today();
begin
  if m is null or not auth_member_writable() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from diet_plan where member_id = m and enabled) then raise exception 'diet_off'; end if;
  insert into diet_day(user_id, day, closed_at) values (m, d, now())
    on conflict (user_id, day) do update set closed_at = coalesce(diet_day.closed_at, now());
  return d;
end $$;
grant execute on function diet_close_day() to authenticated;

create or replace function diet_mark_seen() returns void language plpgsql security definer set search_path = public as $$
declare m uuid := auth_member_id();
begin
  if m is null then return; end if;
  update diet_day set member_seen_at = now() where user_id = m and feedback is not null and member_seen_at is null;
  update diet_request set member_seen_at = now() where user_id = m and status = 'answered' and member_seen_at is null;
end $$;

-- 식단이 켜져 있나(회원 세션은 diet_plan을 못 읽어서 규칙 안에서 쓰는 도우미 · 2026-10-11 시험에서 발견)
create or replace function diet_enabled_for(p_member uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from diet_plan where member_id = p_member and enabled)
$$;
grant execute on function diet_enabled_for(uuid) to authenticated;
create or replace function diet_day_fed(p_member uuid, p_day date) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from diet_day where user_id = p_member and day = p_day and feedback is not null)
$$;
grant execute on function diet_day_fed(uuid, date) to authenticated;

-- 2) 끼니(사진 · 글)
create table if not exists diet_meal (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid references account(id) on delete cascade,
  user_id         uuid not null references user_table(id) on delete cascade,
  day             date not null default diet_today(),
  eaten_at        timestamptz not null default now(),
  photo_path      text,
  memo            text check (memo is null or char_length(memo) <= 200),
  analysis        jsonb,                  -- AI 끼니 분석(처음 필요할 때 한 번 · 재사용)
  after_feedback  boolean not null default false,
  created_at      timestamptz not null default now(),
  check (photo_path is not null or memo is not null)
);
create index if not exists diet_meal_user_day_idx on diet_meal(user_id, day);
create index if not exists diet_meal_account_idx on diet_meal(account_id);
create or replace function _diet_meal_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select account_id into new.account_id from user_table where id = new.user_id;
  new.day := diet_day_of(new.eaten_at);
  -- 그날 피드백이 이미 나갔으면 '피드백 뒤 추가'(다시 분석하지 않음)
  if tg_op = 'INSERT' then
    new.after_feedback := exists (select 1 from diet_day d where d.user_id = new.user_id and d.day = new.day and d.feedback is not null);
  end if;
  return new;
end $$;
drop trigger if exists diet_meal_fill on diet_meal;
create trigger diet_meal_fill before insert or update of eaten_at, user_id on diet_meal for each row execute function _diet_meal_fill();

alter table diet_meal enable row level security;
drop policy if exists "member_diet_meal_select" on diet_meal;
create policy "member_diet_meal_select" on diet_meal for select to authenticated
  using (user_id = (select auth_member_id()));
drop policy if exists "member_diet_meal_insert" on diet_meal;
create policy "member_diet_meal_insert" on diet_meal for insert to authenticated
  with check (user_id = (select auth_member_id()) and (select auth_member_writable())
    and diet_enabled_for(diet_meal.user_id)
    and day >= diet_today() - 1 and day <= diet_today()
    and analysis is null);
drop policy if exists "member_diet_meal_update" on diet_meal;
create policy "member_diet_meal_update" on diet_meal for update to authenticated
  using (user_id = (select auth_member_id()) and (select auth_member_writable()) and day >= diet_today() - 1)
  with check (user_id = (select auth_member_id()) and day >= diet_today() - 1 and day <= diet_today());
drop policy if exists "member_diet_meal_delete" on diet_meal;
create policy "member_diet_meal_delete" on diet_meal for delete to authenticated
  using (user_id = (select auth_member_id()) and (select auth_member_writable()) and day >= diet_today() - 1
    and not diet_day_fed(diet_meal.user_id, diet_meal.day));
-- 회원은 메모 · 먹은 시각만 고칠 수 있다(분석 · 피드백 표시는 서버만)
revoke update on diet_meal from authenticated;
grant update (memo, eaten_at) on diet_meal to authenticated;
drop policy if exists "trainer_diet_meal_select" on diet_meal;
create policy "trainer_diet_meal_select" on diet_meal for select to authenticated
  using (account_id = (select auth_account_id()));

-- 4) 식단 요청(하루 3번)
create table if not exists diet_request (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid references account(id) on delete cascade,
  user_id        uuid not null references user_table(id) on delete cascade,
  day            date not null default diet_today(),
  seq            smallint not null check (seq between 1 and 3),
  scope          text not null check (scope in ('today', 'week')),
  situations     text[],
  note           text check (note is null or char_length(note) <= 200),
  status         text not null default 'open' check (status in ('open', 'answered', 'withdrawn', 'skipped')),
  answer         jsonb,                   -- { intro, meals:[{when, menu, tip}], closing } 또는 { text }
  answered_at    timestamptz,
  answered_by    uuid,                    -- AI가 대신 답했으면 null
  ai             boolean not null default false,   -- 트레이너 화면에만
  auto_claim_at  timestamptz,
  member_seen_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists diet_request_user_day_idx on diet_request(user_id, day);
create index if not exists diet_request_account_idx on diet_request(account_id, status);
alter table diet_request enable row level security;
drop policy if exists "auth_all_diet_request" on diet_request;
create policy "auth_all_diet_request" on diet_request for all to authenticated
  using (account_id = (select auth_account_id()))
  with check (account_id = (select auth_account_id()));

create or replace function request_diet(p_scope text, p_situations text[] default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m uuid := auth_member_id(); d date := diet_today(); n integer; rid uuid; acc uuid;
begin
  if m is null or not auth_member_writable() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from diet_plan where member_id = m and enabled) then raise exception 'diet_off'; end if;
  if p_scope not in ('today', 'week') then raise exception 'bad_scope'; end if;
  perform pg_advisory_xact_lock(hashtext('diet_req' || m::text || d::text));
  select count(*) into n from diet_request where user_id = m and day = d and status <> 'withdrawn';
  if n >= 3 then return jsonb_build_object('ok', false, 'code', 'limit'); end if;
  select account_id into acc from user_table where id = m;
  insert into diet_request(account_id, user_id, day, seq, scope, situations, note)
    values (acc, m, d, n + 1, p_scope, p_situations, nullif(left(coalesce(p_note, ''), 200), ''))
    returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'seq', n + 1);
end $$;
grant execute on function request_diet(text, text[], text) to authenticated;

create or replace function withdraw_diet_request(p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare m uuid := auth_member_id();
begin
  update diet_request set status = 'withdrawn' where id = p_id and user_id = m and status = 'open' and auto_claim_at is null;
  return found;
end $$;
grant execute on function withdraw_diet_request(uuid) to authenticated;
grant execute on function diet_mark_seen() to authenticated;

-- 5) 회원용 화면(ai · 초안 칸 없음)
create or replace view member_diet_plan
  with (security_invoker = false) as
  select p.purpose, p.months, p.goal_kg, p.started_on, p.ends_on, p.base_weight, p.kcal_rest, p.kcal_pt,
         p.carb_g, p.protein_g, p.fat_g, p.no_numbers, p.manual, p.examples
  from diet_plan p
  where p.member_id = auth_member_id() and p.enabled;
create or replace view member_diet_day
  with (security_invoker = false) as
  select d.day, d.closed_at, d.feedback, d.feedback_at, d.member_seen_at,
         t.name as trainer_name
  from diet_day d
  left join user_table u on u.id = d.user_id
  left join trainer t on t.id = u.trainer_id
  where d.user_id = auth_member_id() and d.day >= diet_today() - 14;
create or replace view member_diet_request
  with (security_invoker = false) as
  select r.id, r.day, r.seq, r.scope, r.situations, r.note, r.status, r.answer, r.answered_at, r.member_seen_at, r.created_at
  from diet_request r
  where r.user_id = auth_member_id() and r.day >= diet_today() - 7;
grant select on member_diet_plan, member_diet_day, member_diet_request to authenticated;
revoke select on member_diet_plan, member_diet_day, member_diet_request from anon;

-- 6) 사진 버킷(비공개 · 경로 첫 폴더 = 회원 id)
insert into storage.buckets (id, name, public) values ('diet-photos', 'diet-photos', false) on conflict (id) do nothing;
drop policy if exists "diet_obj_member_insert" on storage.objects;
create policy "diet_obj_member_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'diet-photos' and (storage.foldername(name))[1] = auth_member_id()::text and auth_member_writable());
drop policy if exists "diet_obj_member_select" on storage.objects;
create policy "diet_obj_member_select" on storage.objects for select to authenticated
  using (bucket_id = 'diet-photos' and (storage.foldername(name))[1] = auth_member_id()::text);
drop policy if exists "diet_obj_member_delete" on storage.objects;
create policy "diet_obj_member_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'diet-photos' and (storage.foldername(name))[1] = auth_member_id()::text and auth_member_writable());
drop policy if exists "diet_obj_trainer_select" on storage.objects;
create policy "diet_obj_trainer_select" on storage.objects for select to authenticated
  using (bucket_id = 'diet-photos' and member_in_my_account((storage.foldername(name))[1]));

-- 7) AI 한도 'diet' 묶음(베이직 3 · 프로 300 · 센터 900 + 자리마다 300 · 팩 칸도 미리)
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.ai_usage'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table ai_usage drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.ai_credit'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table ai_credit drop constraint %I', c);
  end loop;
end $$;
alter table ai_usage add constraint ai_usage_kind_check
  check (kind in ('voice', 'ot', 'rereg', 'inbody', 'roadmap', 'salesbook', 'owner', 'monthly', 'cues', 'diet'));
alter table ai_credit add constraint ai_credit_kind_check check (kind in ('voice', 'prep', 'diet'));

create or replace function ai_group_of(p_tier text, p_kind text) returns text language sql immutable as $$
  select case
    when p_kind in ('ot', 'rereg') and p_tier <> 'basic' then 'prep'
    when p_kind in ('voice', 'ot', 'rereg', 'inbody', 'roadmap', 'diet') then p_kind
    else null end
$$;

-- ai_quota_for('diet' 한도 포함)는 여기서 다시 만들지 않는다(2026-10-12 점검).
--   예전엔 매달 1일 기준 옛 판을 여기서 다시 만들어, 이 파일을 다시 실행하면 결제일 기준 한도가 깨졌다.
--   정본 = docs/migrations/2026-10-12-billing-period-quota.sql(결제일 ~ 다음 결제일 전날 · 'diet' 묶음 포함).
--   새 DB라면 이 파일 → 2026-10-11-pack-carryover.sql → 2026-10-11-pack-1month.sql → 2026-10-12-billing-period-quota.sql 순서로 실행.

-- 8) 새 표 · 화면 규칙 정리(읽기 전용 30일 규칙 다시 만들기 · 화면 쓰기 권한 회수)
select refresh_read_only_policies();
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', v.viewname);
  end loop;
end $$;

-- 확인: select * from member_diet_plan;  -- 회원 세션 아니면 0행
--       select ai_quota_for('<계정 id>') -> 'groups' -> 'diet';
