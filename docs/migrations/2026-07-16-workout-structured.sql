-- =============================================================================
-- ③ 수업일지 구조화 — daily_workout_log에 sets_structured jsonb 추가(Phase 1)
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 멱등. 데이터 무변경(컬럼만).
-- 정책 변경 없음: INSERT는 기존 정책으로 허용, 보정은 '저장 전'이라 UPDATE 정책 불필요.
-- 기존 행은 null → 그래프 원천에서 자동 제외(백필 불필요).
-- =============================================================================
alter table daily_workout_log add column if not exists sets_structured jsonb;

-- 검증: select column_name, data_type from information_schema.columns
--         where table_name='daily_workout_log' and column_name='sets_structured';  -- jsonb 1행
-- 롤백: alter table daily_workout_log drop column if exists sets_structured;
