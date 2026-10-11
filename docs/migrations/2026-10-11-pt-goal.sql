-- =============================================================================
-- 2026-10-11 숫자 목표(대표 결정)
--   트레이너는 '현재 방향 · 목표'를 글로 적고 → 앱이 읽은 지표 · 숫자 · 기간을 [맞아요]로 확인하면 숫자 목표가 된다.
--   저장 = user_table.pt_goal(jsonb · 회원당 하나 · 모양은 lib/ptGoal.js 맨 위 주석).
--   회원 전용 페이지엔 트레이너가 '회원에게 보이기'를 켰을 때만 보인다(member_goal_view · 본인 것만).
--   다음 목표(재등록 탭)는 계약 행 report.next_goal / report.goal_result(jsonb 안 · 새 칸 없음).
--
--   새 표 · 새 SELECT 규칙은 없다(user_table 칸 하나 + 뷰) → refresh_read_only_policies() 다시 실행할 필요 없음.
--   트레이너 쓰기는 기존 user_table 규칙 그대로(pt_direction과 같은 경로).
-- =============================================================================

alter table user_table add column if not exists pt_goal jsonb;

create or replace view member_goal_view
  with (security_invoker = false) as
  select u.pt_goal
  from user_table u
  where u.id = auth_member_id()
    and u.pt_goal is not null
    and coalesce((u.pt_goal->>'visible')::boolean, false)
    and u.pt_goal ? 'confirmed_at';

grant select on member_goal_view to authenticated;
revoke select on member_goal_view from anon;

-- 검증(에러 없으면 OK · 트레이너/대표 세션에선 회원 세션이 아니라 0행이 정상):
--   select column_name from information_schema.columns where table_name = 'user_table' and column_name = 'pt_goal';
--   select * from member_goal_view;
--
-- 롤백:
--   drop view if exists member_goal_view;
--   alter table user_table drop column if exists pt_goal;
