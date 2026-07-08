-- =============================================================================
-- ⑦-b Part B-1 — 백필 (기존 NULL account_id → 파일럿 계정 도장)
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   5개 데이터 테이블의 account_id가 NULL인 기존 행 전부를 파일럿 계정
--   '11111111-1111-1111-1111-111111111111' 로 도장 찍는다.
--   (전 행 = 테스트 데이터임을 트레이너가 확인 → 전부 파일럿 계정으로 일괄 백필.)
--
-- ★ 아직 "잠그지 않는다": RLS는 여전히 using(true)(⑦-a 상태). 앱은 그대로 동작.
--   진짜 격리(account 스코프 RLS)는 Part B-3. 백필을 그 "앞에" 두는 이유 =
--   B-3에서 "내 계정 것만 보임"을 켜는 순간 account_id=NULL 행은 아무에게도 안 보이므로,
--   그 전에 모든 기존 행에 계정 도장을 찍어놔야 앱이 빈 껍데기가 안 된다. (백필 → 잠금 순서.)
--
-- 전제: Part A 실행 완료(account/trainer 뼈대 + account_id 컬럼 존재, 값은 NULL).
-- 멱등: where account_id is null 조건이라 재실행해도 새로 바뀌는 행 0 → 안전.
-- 롤백: 파일 하단 주석(도장 취소 = 다시 NULL). ⚠️ Part B-2(NOT NULL/FK) 실행 후엔 이 롤백 불가.
-- 범위 밖(B-2/B-3): FK · DEFAULT · NOT NULL · trainer_id 백필/default · RLS 좁힘 · 교차격리 실증.
-- =============================================================================


-- ========== 백필 · 5개 테이블 (NULL 행만) ====================================
update user_table        set account_id = '11111111-1111-1111-1111-111111111111' where account_id is null;
update center_machine    set account_id = '11111111-1111-1111-1111-111111111111' where account_id is null;
update ot_log            set account_id = '11111111-1111-1111-1111-111111111111' where account_id is null;
update session_log       set account_id = '11111111-1111-1111-1111-111111111111' where account_id is null;
update daily_workout_log set account_id = '11111111-1111-1111-1111-111111111111' where account_id is null;


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 돌려서 확인
-- 기대: 5줄 모두 null_ct = 0 (NULL 남은 행 없음) · stamped = total (전부 파일럿 계정 도장)
-- -----------------------------------------------------------------------------
-- select 'user_table' t, count(*) total,
--        count(*) filter (where account_id is null) null_ct,
--        count(*) filter (where account_id = '11111111-1111-1111-1111-111111111111') stamped
--   from user_table
-- union all select 'center_machine', count(*),
--        count(*) filter (where account_id is null),
--        count(*) filter (where account_id = '11111111-1111-1111-1111-111111111111') from center_machine
-- union all select 'ot_log', count(*),
--        count(*) filter (where account_id is null),
--        count(*) filter (where account_id = '11111111-1111-1111-1111-111111111111') from ot_log
-- union all select 'session_log', count(*),
--        count(*) filter (where account_id is null),
--        count(*) filter (where account_id = '11111111-1111-1111-1111-111111111111') from session_log
-- union all select 'daily_workout_log', count(*),
--        count(*) filter (where account_id is null),
--        count(*) filter (where account_id = '11111111-1111-1111-1111-111111111111') from daily_workout_log;
-- =============================================================================


-- =============================================================================
-- ROLLBACK — 도장 취소(다시 NULL). ⚠️ Part B-2(NOT NULL/FK/DEFAULT) 실행 전에만 유효.
--   B-2 이후엔 NOT NULL 때문에 NULL로 못 되돌림 → 먼저 B-2 롤백부터.
-- -----------------------------------------------------------------------------
-- update user_table        set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
-- update center_machine    set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
-- update ot_log            set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
-- update session_log       set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
-- update daily_workout_log set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
-- =============================================================================
