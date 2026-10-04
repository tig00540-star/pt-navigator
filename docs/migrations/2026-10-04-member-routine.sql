-- =============================================================================
-- 회원 개인운동 루틴 — 2026-10-04
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: auth_account_id() · auth_member_id() · member_in_my_account(text) · user_table · center_machine.
--
-- 무엇:
--  1) center_machine.step_kg : 장비 '한 칸'(kg · 선택 입력). 비면 PT 기록 간격 → 기구 종류 기본값 순서로 앱이 정한다.
--  2) member_routine        : 회원별 개인운동 루틴(트레이너가 확인 · 수정 · '회원에게 보이기'). 회원당 1행.
--                              days = [{ key, label, items: [{ name, group, weight, reps, sets, repMin, repMax, cap, step,
--                                        locked, light, warmup, note, source, ptRef }] }]
--                              트레이너는 센터 범위로 읽고 쓰기. 회원은 member_routine_view(보이기 켜진 본인 것)로만 읽기.
--  3) member_routine_log    : 회원이 혼자 한 기록(실제 한 무게 · 횟수 · 세트). 회원은 본인 것만 쓰기 · 읽기 · 지우기,
--                              트레이너는 센터 범위로 읽기만. 다음 루틴 숫자는 이 기록으로 앱이 계산한다(서버 저장 없음).
-- 오운완: 회원 화면이 기록 저장 때 schedule_check(kind 'personal')도 함께 남겨 기존 집계에 들어간다(이 SQL과 무관).
-- =============================================================================

-- 1) 장비 한 칸
alter table center_machine add column if not exists step_kg numeric;

-- 2) 루틴
create table if not exists member_routine (
  member_id   uuid primary key references user_table(id) on delete cascade,
  account_id  uuid not null default auth_account_id() references account(id) on delete cascade,
  trainer_id  uuid default auth.uid() references trainer(id) on delete set null,
  split       integer not null default 2 check (split between 1 and 3),   -- 혼자 주 몇 번(1 전신 · 2 상체/하체 · 3 밀기/당기기/하체)
  days        jsonb not null default '[]'::jsonb,
  visible     boolean not null default false,
  confirmed_at timestamptz,                                              -- 트레이너가 마지막으로 확정(저장)한 시각 = 진도 계산 출발점
  confirmed_by uuid references trainer(id) on delete set null,           -- 누가 확정했나(분쟁 대비 · 법무 점검 2026-10-04)
  visible_at   timestamptz,                                              -- 마지막으로 보이기를 켠 시각
  visible_by   uuid references trainer(id) on delete set null,           -- 누가 켰나
  pain_checked_at timestamptz,                                           -- 불편 부위가 있는 회원: 트레이너가 확인했다는 표시(없으면 보이기 불가 · 화면에서 강제)
  updated_at  timestamptz not null default now()
);
alter table member_routine add column if not exists confirmed_by uuid references trainer(id) on delete set null;
alter table member_routine add column if not exists visible_at timestamptz;
alter table member_routine add column if not exists visible_by uuid references trainer(id) on delete set null;
alter table member_routine add column if not exists pain_checked_at timestamptz;
alter table member_routine enable row level security;

drop policy if exists "auth_all_member_routine" on member_routine;
create policy "auth_all_member_routine"
  on member_routine for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id() and member_in_my_account(member_id::text));

-- 회원에게는 보이기 켜짐 + 최근 4주 안에 PT 수업이 있을 때만(트레이너가 지켜보는 동안만 · 법무 점검 2026-10-04).
create or replace view member_routine_view
  with (security_invoker = false) as
  select r.split, r.days, r.confirmed_at, r.updated_at
  from member_routine r
  where r.member_id = auth_member_id() and r.visible
    and exists (
      select 1 from daily_workout_log l
       where l.user_id = r.member_id and not coalesce(l.voided, false) and coalesce(l.source, '') <> 'noshow'
         and coalesce(l.session_at, l.created_at) > now() - interval '28 days'
    );

grant select on member_routine_view to authenticated;
revoke select on member_routine_view from anon;

-- 3) 회원 기록
create table if not exists member_routine_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid not null references user_table(id) on delete cascade,
  performed_on date not null default (now() at time zone 'Asia/Seoul')::date,
  day_key      text,                                   -- 어느 루틴(A/B/C)
  items        jsonb not null default '[]'::jsonb      -- [{ name, weight, reps, sets, done, pain }] · pain=true = 아파서 멈춤(그 종목 진도 멈춤 · 트레이너에게 표시)
);
create index if not exists member_routine_log_user_idx on member_routine_log (user_id, created_at desc);
alter table member_routine_log enable row level security;

drop policy if exists "member_rlog_select" on member_routine_log;
create policy "member_rlog_select" on member_routine_log for select to authenticated
  using (user_id = auth_member_id());
drop policy if exists "member_rlog_insert" on member_routine_log;
create policy "member_rlog_insert" on member_routine_log for insert to authenticated
  with check (user_id = auth_member_id());
drop policy if exists "member_rlog_delete" on member_routine_log;
create policy "member_rlog_delete" on member_routine_log for delete to authenticated
  using (user_id = auth_member_id());

drop policy if exists "trainer_rlog_select" on member_routine_log;
create policy "trainer_rlog_select" on member_routine_log for select to authenticated
  using (exists (
    select 1 from user_table u where u.id = member_routine_log.user_id and u.account_id = auth_account_id()
  ));

-- =============================================================================
-- 검증(에러 없이 아래가 나오면 OK):
--   select count(*) from information_schema.columns where table_name = 'center_machine' and column_name = 'step_kg';  -- 1
--   select count(*) from pg_policies where tablename in ('member_routine', 'member_routine_log');                      -- 5
-- 롤백:
--   drop table if exists member_routine_log;
--   drop view if exists member_routine_view;
--   drop table if exists member_routine;
--   alter table center_machine drop column if exists step_kg;
-- =============================================================================
