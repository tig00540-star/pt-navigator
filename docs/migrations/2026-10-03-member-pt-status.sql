-- =============================================================================
-- 회원 전용 페이지 '내 PT' — 남은 수업 · 다음 수업 · 목표 로드맵 — 2026-10-03
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: auth_member_id() · auth_account_id() · member_in_my_account(text) · user_table · session_log · daily_workout_log · appointment.
--
-- 무엇:
--  1) member_contract   : 회원 본인 계약 — 횟수와 진행 수만(금액 · 회당 단가 없음). used = 그 계약에 붙은 수업 중 취소(voided) 아닌 것
--                          (노쇼 포함 차감 · 트레이너 앱 remainingSessions와 같은 규칙). 남은 수업 계산은 화면이 같은 규칙(FIFO · 인계 계약 제외)으로.
--  2) member_next_appt  : 회원 본인 예약 중 앞으로 잡힌 것(booked · 지금 이후) — 시각만 · 최대 3개.
--  3) member_roadmap    : 회원별 목표 로드맵(트레이너가 만들고 '회원에게 보이기'를 켰을 때만 회원에게 보임).
--                          트레이너는 센터 범위로 읽고 쓰기. 회원은 member_roadmap_view(보이기 켜진 본인 것)로만 읽기.
-- 회원 세션은 trainer에 없으니 auth_account_id()=NULL → 트레이너 정책으로는 아무것도 안 보인다(기존 틀 그대로).
-- =============================================================================

-- 1) 회원 본인 계약(횟수만)
create or replace view member_contract
  with (security_invoker = false) as
  select c.id, c.started_at, c.sessions_total, c.service_sessions, coalesce(c.handed_over, false) as handed_over,
         (select count(*) from daily_workout_log l
           where l.contract_id = c.id and not coalesce(l.voided, false))::int as used
  from session_log c
  where c.user_id = auth_member_id();

-- 2) 회원 본인 다음 예약(시각만)
create or replace view member_next_appt
  with (security_invoker = false) as
  select a.start_at
  from appointment a
  where a.user_id = auth_member_id() and a.status = 'booked' and a.start_at > now()
  order by a.start_at
  limit 3;

grant select on member_contract, member_next_appt to authenticated;
revoke select on member_contract, member_next_appt from anon;

-- 3) 목표 로드맵
create table if not exists member_roadmap (
  member_id   uuid primary key references user_table(id) on delete cascade,
  account_id  uuid not null default auth_account_id() references account(id) on delete cascade,
  trainer_id  uuid default auth.uid() references trainer(id) on delete set null,
  title       text,                                   -- 로드맵 제목(목표 한 줄)
  stages      jsonb not null default '[]'::jsonb,     -- [{ "title": "자세 잡기", "detail": "한 줄 설명" }]
  current     integer not null default 0,             -- 지금 단계(0부터)
  visible     boolean not null default false,         -- 회원에게 보이기(꺼진 채로 시작)
  ai_meta     jsonb,                                  -- AI 초안 정보(만든 시각 등)
  updated_at  timestamptz not null default now()
);
alter table member_roadmap enable row level security;

drop policy if exists "auth_all_member_roadmap" on member_roadmap;
create policy "auth_all_member_roadmap"
  on member_roadmap for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id() and member_in_my_account(member_id::text));

create or replace view member_roadmap_view
  with (security_invoker = false) as
  select r.title, r.stages, r.current, r.updated_at
  from member_roadmap r
  where r.member_id = auth_member_id() and r.visible;

grant select on member_roadmap_view to authenticated;
revoke select on member_roadmap_view from anon;

-- =============================================================================
-- 검증(에러 없으면 OK · 대표/트레이너 계정 SQL Editor에선 회원 세션이 아니라 0행이 정상):
--   select count(*) from member_contract;      -- 0
--   select count(*) from member_next_appt;     -- 0
--   select count(*) from member_roadmap_view;  -- 0
--   select count(*) from pg_policies where tablename = 'member_roadmap';  -- 1
-- 롤백:
--   drop view if exists member_roadmap_view;
--   drop table if exists member_roadmap;
--   drop view if exists member_next_appt;
--   drop view if exists member_contract;
-- =============================================================================
