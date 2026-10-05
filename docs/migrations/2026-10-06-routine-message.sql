-- =============================================================================
-- 개인운동 루틴 — 트레이너 한마디(루틴 전체 메모 · 선택) — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-04-routine-request.sql 실행 완료.
--   member_routine.message(최대 200자 · 비우면 회원 화면에 안 나옴) + 회원용 뷰에 message 덧붙이기(열은 뒤에만).
--   ⚠️ 루틴 밖 운동 · 오늘 못 함 · 세트별 기록은 기존 member_routine_log.items(jsonb) 안에 담겨 DB 변경 없음.
-- =============================================================================

alter table member_routine add column if not exists message text;
alter table member_routine drop constraint if exists member_routine_message_len;
alter table member_routine add constraint member_routine_message_len check (message is null or char_length(message) <= 200);

create or replace view member_routine_view
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
  select layout, ready, case when ready then days else '[]'::jsonb end as days, confirmed_at, updated_at,
         message
  from base;

grant select on member_routine_view to authenticated;
revoke select on member_routine_view from anon;

-- =============================================================================
-- 검증: select column_name from information_schema.columns where table_name = 'member_routine_view';  -- … message
-- 롤백: 뷰는 2026-10-04-routine-request.sql 정의로(열을 빼려면 drop view 후) · alter table member_routine drop column message;
-- =============================================================================
