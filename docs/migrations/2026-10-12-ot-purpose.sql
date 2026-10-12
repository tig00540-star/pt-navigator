-- =============================================================================
-- OT 신청서 '오늘 OT에서 가장 알고 싶은 것'(방문 목적) — 2026-10-12
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-06-intake-steps.sql 실행 완료.
--
--   신청서 2단계 첫 화면에서 6개 중 하나(선택) → ot_application.answers.ot_purpose(이건 SQL 없이도 저장됨)
--   → 이 파일을 실행하면 회원 칸 user_table.ot_purpose에도 채워져 1차 OT 대본 AI가 읽는다.
--   값 = machine | form | self | plan | pt | trial (lib/memberOptions OT_PURPOSE_OPTS · 서버 라우트가 이 값만 통과시킴)
--   ⚠️ _ot_apply_answers는 2026-10-06-intake-steps.sql 것과 같고 ot_purpose 한 줄만 더했다.
--   예전 회원 · 안 고른 회원 = null(대본은 예전 방식 그대로).
-- =============================================================================

alter table user_table add column if not exists ot_purpose text;   -- 1차 OT 방문 목적(운동 목표 goal과 별개)

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
    ot_purpose     = coalesce(case when p_ans->>'ot_purpose' in ('machine','form','self','plan','pt','trial') then p_ans->>'ot_purpose' end, ot_purpose),
    pain           = case when p_health then coalesce(nullif(p_ans->>'pain', ''), pain) else pain end,
    injury_history = case when p_health then coalesce(nullif(p_ans->>'injury_history', ''), injury_history) else injury_history end,
    health_screen  = case when p_health and p_ans ? 'health_screen' then p_ans->'health_screen' else health_screen end
  where id = p_member;
end $$;
revoke all on function _ot_apply_answers(uuid, jsonb, boolean) from public, anon, authenticated;

-- (선택) 이 파일 실행 전에 신청서에서 목적을 고른 회원 — 신청서 답에서 회원 칸으로 옮겨 둔다.
--   이 신청으로 새로 만든 회원만(같은 번호 기존 회원은 트레이너가 관리하던 값을 덮지 않는 규칙 그대로).
update user_table u set ot_purpose = a.answers->>'ot_purpose'
  from ot_application a
 where a.member_id = u.id and a.duplicate_of is null and a.status = 'assigned'
   and u.ot_purpose is null
   and a.answers->>'ot_purpose' in ('machine','form','self','plan','pt','trial');

-- =============================================================================
-- 검증:
--   select column_name from information_schema.columns where table_name = 'user_table' and column_name = 'ot_purpose';   -- 1줄
--   select pg_get_functiondef('_ot_apply_answers(uuid, jsonb, boolean)'::regprocedure) like '%ot_purpose%';               -- true
-- =============================================================================
