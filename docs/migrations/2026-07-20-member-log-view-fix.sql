-- =============================================================================
-- member_workout_log 뷰 보정 — 노쇼(source='noshow') 누출 차단
-- 실행일: 2026-07-20 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일 (오운완 기능과 무관한 독립 버그 수정 — 그래서 단독 커밋):
--   라이브 뷰는 이미 5컬럼(id, created_at, ai_summary, session_at, sets_structured) +
--   `coalesce(voided,false) = false` 필터를 갖고 있다(2026-07-16-member-workout-structured.sql).
--   그런데 source='noshow' 는 안 걸러서 ★노쇼 차감 로그가 회원 달력·수업일지에 새고 있다.
--   트레이너 화면은 `!voided && source!=='noshow'` 둘 다 거르는데 회원 뷰만 한쪽이 빠졌다(불일치).
--   → 이번 변경 = `and coalesce(source, '') <> 'noshow'` 한 줄 추가. 그게 전부.
--
-- ⚠️ 컬럼은 5개 그대로 유지할 것(줄이지 말 것):
--   - create or replace view는 기존 출력 컬럼을 삭제/재정렬/재타입 불가 → 줄이면 실행 자체가 실패.
--   - sets_structured 는 회원앱 '종목별 무게 변화' 그래프가 쓰는 필수 컬럼이다. 드롭 시 기능 정지.
--   ※ 이 파일 초안은 옛 정의(2026-07-16-member-views.sql의 3컬럼)를 보고 작성돼 sets_structured가
--     빠져 있었다. 뷰가 여러 마이그레이션에 걸쳐 재정의된 경우 '가장 마지막 정의'를 봐야 한다.
--
-- ⚠️ 회원 화면 소급 변경(트레이너 사전 인지 · 문의 대비):
--   노쇼 기록이 달력·수업일지에서 사라진다 → 회원 눈에 "기록이 줄어" 보일 수 있다.
--   (날짜 표시는 안 바뀐다 — session_at은 이미 노출 중이었다.)
--
-- ⚠️ security_invoker = false 유지(원본과 동일) — 회원은 daily_workout_log 원본에
--   접근 권한이 없고 이 뷰가 유일 통로다. true로 바꾸면 회원이 0행을 받는다(기능 정지).
-- 전제: 2026-07-16-member-views.sql · 2026-07-16-member-workout-structured.sql · auth_member_id().
-- 멱등: create or replace view — 재실행 무해.
-- 롤백: 파일 하단.
-- =============================================================================

create or replace view member_workout_log
  with (security_invoker = false) as
  select id, created_at, ai_summary, session_at, sets_structured
  from daily_workout_log
  where user_id = auth_member_id()
    and coalesce(voided, false) = false
    and coalesce(source, '') <> 'noshow';          -- ★이번 변경은 이 한 줄뿐

-- 권한은 이전 마이그레이션에서 부여됨(authenticated select · anon revoke).
-- create or replace view는 권한을 보존하므로 재부여 불필요하나, 명시적으로 한 번 더(멱등).
grant select on member_workout_log to authenticated;
revoke select on member_workout_log from anon;


-- =============================================================================
-- 검증 (읽기 전용)
--   (A) 뷰 정의 확인 — 5컬럼 유지 + noshow 조건 추가:
--       select pg_get_viewdef('member_workout_log'::regclass, true);
--       → sets_structured 가 그대로 있고, WHERE에 voided / noshow 둘 다 보여야 함.
--
--   (B) 영향 규모(트레이너 세션 · 실행 전후 대조):
--       select count(*) filter (where coalesce(source,'')='noshow') as 노쇼,
--              count(*) filter (where coalesce(voided,false))       as 보이드,
--              count(*)                                             as 전체
--         from daily_workout_log;
--       → '노쇼' 수만큼 회원 뷰에서 줄어야 정상('보이드'는 이미 걸러지고 있었음).
--
--   (C) ★회원 세션(access_token)으로 REST:
--       GET /rest/v1/member_workout_log?select=*
--       → 노쇼 행 없음 · sets_structured 포함 · raw_voice_text 없음(제외 컬럼 유지).
--
--   (D) 회원 앱 화면: 운동 달력에서 노쇼였던 날의 점이 사라지고,
--       ★'종목별 무게 변화' 그래프가 그대로 뜨는지(sets_structured 보존 확인 — 가장 중요).
--
-- 롤백(원복 — 노쇼가 다시 새므로 권장하지 않음):
--   컬럼 수 변화 없이 noshow 조건만 제거하므로 create or replace 로 충분(drop view 불필요).
--   create or replace view member_workout_log with (security_invoker = false) as
--     select id, created_at, ai_summary, session_at, sets_structured
--     from daily_workout_log
--     where user_id = auth_member_id()
--       and coalesce(voided, false) = false;
-- =============================================================================
