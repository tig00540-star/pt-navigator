-- =============================================================================
-- 개인운동 루틴 — 회원 '루틴 요청' + 루틴 구성(layout) + 회원 화면 '준비 중' 표시 — 2026-10-04 (2)
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-04-member-routine.sql 실행 완료.
--
-- 무엇:
--  1) member_routine.layout : 루틴 구성(full 전신 · ul 상체/하체 · ppl 밀기/당기기/하체 · part 부위별). split(횟수)은 더 안 씀(남겨 둠).
--  2) member_routine_request : 회원이 회원 전용 페이지에서 '루틴 요청'(open) → 트레이너가 루틴을 보이게 하면 done.
--     회원은 본인 것만 쓰기 · 읽기 · 지우기(취소). 트레이너는 센터 범위로 읽기 · 처리(update).
--  3) member_routine_view 다시 만들기: 보이기가 켜져 있으면 행은 돌려주되, 지켜보는 조건(최근 28일 안 PT · 확정 뒤 28일 넘게 끊긴 적 없음)을
--     못 맞추면 days는 비우고 ready=false — 회원 화면이 "트레이너님이 다시 확인하고 있어요"를 보여 줄 수 있게(숫자는 안 보임).
-- =============================================================================

alter table member_routine add column if not exists layout text not null default 'full';

create table if not exists member_routine_request (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references user_table(id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'done')),
  handled_at  timestamptz,
  handled_by  uuid references trainer(id) on delete set null
);
create index if not exists member_routine_request_user_idx on member_routine_request (user_id, created_at desc);
alter table member_routine_request enable row level security;

drop policy if exists "member_rreq_select" on member_routine_request;
create policy "member_rreq_select" on member_routine_request for select to authenticated
  using (user_id = auth_member_id());
drop policy if exists "member_rreq_insert" on member_routine_request;
create policy "member_rreq_insert" on member_routine_request for insert to authenticated
  with check (user_id = auth_member_id() and status = 'open');
drop policy if exists "member_rreq_delete" on member_routine_request;
create policy "member_rreq_delete" on member_routine_request for delete to authenticated
  using (user_id = auth_member_id() and status = 'open');

drop policy if exists "trainer_rreq_select" on member_routine_request;
create policy "trainer_rreq_select" on member_routine_request for select to authenticated
  using (exists (select 1 from user_table u where u.id = member_routine_request.user_id and u.account_id = auth_account_id()));
drop policy if exists "trainer_rreq_update" on member_routine_request;
create policy "trainer_rreq_update" on member_routine_request for update to authenticated
  using (exists (select 1 from user_table u where u.id = member_routine_request.user_id and u.account_id = auth_account_id()))
  with check (exists (select 1 from user_table u where u.id = member_routine_request.user_id and u.account_id = auth_account_id()));

-- 회원 화면용 뷰 — 열 구성이 바뀌어 지우고 다시 만든다.
drop view if exists member_routine_view;
create view member_routine_view
  with (security_invoker = false) as
  with base as (
    select r.*,
      exists (
        select 1 from daily_workout_log l
         where l.user_id = r.member_id and not coalesce(l.voided, false) and coalesce(l.source, '') <> 'noshow'
           and coalesce(l.session_at, l.created_at) > now() - interval '28 days'
      )
      and not exists (
        select 1 from (
          select coalesce(session_at, created_at) as d,
                 lag(coalesce(session_at, created_at)) over (order by coalesce(session_at, created_at)) as p
            from daily_workout_log
           where user_id = r.member_id and not coalesce(voided, false) and coalesce(source, '') <> 'noshow'
        ) g
        where g.d > r.confirmed_at
          and greatest(coalesce(g.p, r.confirmed_at), r.confirmed_at) < g.d - interval '28 days'
      ) as ready
    from member_routine r
    where r.member_id = auth_member_id() and r.visible
  )
  select layout, ready, case when ready then days else '[]'::jsonb end as days, confirmed_at, updated_at
  from base;

grant select on member_routine_view to authenticated;
revoke select on member_routine_view from anon;

-- =============================================================================
-- 검증: select count(*) from pg_policies where tablename = 'member_routine_request';  -- 5
-- 롤백: drop table if exists member_routine_request; alter table member_routine drop column if exists layout;
--       (뷰는 2026-10-04-member-routine.sql의 정의로 다시 만들기)
-- =============================================================================
