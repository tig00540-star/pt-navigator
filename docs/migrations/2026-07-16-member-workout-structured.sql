-- =============================================================================
-- ③ Phase 2 — 회원앱 종목별 무게 그래프: member_workout_log 뷰에 구조화 컬럼 노출
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 멱등(create or replace view).
--
-- ★ 하는 일:
--   1) member_workout_log 뷰 재생성 — 기존 컬럼 뒤에 session_at·sets_structured append.
--   2) WHERE에 voided 제외 추가(무른 세션 = 회원 타임라인·그래프 양쪽에서 사라짐 · 의도).
-- ★ 안전: 노출은 시각·숫자(종목명/무게/횟수)뿐. raw_voice_text·note 등 민감컬럼은 계속 미노출.
-- 전제: S2(member_workout_log 뷰) 존재 · S1 auth_member_id() 헬퍼.
-- 주의: create or replace view는 기존 출력 컬럼을 삭제/재정렬/재타입 불가 → 새 컬럼은 목록 끝.
-- =============================================================================
create or replace view member_workout_log
  with (security_invoker = false) as
  select id, created_at, ai_summary, session_at, sets_structured
  from daily_workout_log
  where user_id = auth_member_id()
    and coalesce(voided, false) = false;

grant select on member_workout_log to authenticated;
revoke select on member_workout_log from anon;

-- =============================================================================
-- 검증
--   (A) 컬럼 확인:
--     select column_name from information_schema.columns
--       where table_name='member_workout_log';   -- id·created_at·ai_summary·session_at·sets_structured
--   (B) ★회원 세션(S1 access_token)으로 REST:
--     GET /rest/v1/member_workout_log?select=*   → sets_structured 포함, raw_voice_text 없음, voided 세션 미포함.
-- ROLLBACK (컬럼·필터 원복):
--   create or replace view member_workout_log with (security_invoker=false) as
--     select id, created_at, ai_summary from daily_workout_log where user_id = auth_member_id();
-- =============================================================================
