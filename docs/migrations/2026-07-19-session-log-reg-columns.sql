-- =============================================================================
-- session_log 재등록 결과 컬럼 기록본 — reg_result·reg_reason·reg_reapproach_at 백필
-- 실행일: 2026-07-19 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   PtReRegTab.saveReg가 write하는 재등록 결과 3컬럼을 멱등 기록.
--   컬럼 추가만 → session_log 기존 RLS 정책을 그대로 상속(정책 무변경).
--   기존 라이브 DB엔 이미 존재 → 재실행 시 no-op. 재구축 DB엔 추가.
--   ※ 2026-07-19 라이브 추출과 대조 확정: reg_result text · reg_reason text
--     · reg_reapproach_at date (셋 다 nullable).
--
-- 전제: session_log 본체 존재(베이스 스냅샷 또는 UI 생성).
-- 멱등: add column if not exists.
-- =============================================================================

alter table session_log add column if not exists reg_result       text;  -- 재등록 결과(성공/보류/실패 등)
alter table session_log add column if not exists reg_reason        text;  -- 보류·실패 사유(선택)
alter table session_log add column if not exists reg_reapproach_at date;  -- 보류 시 재접근 예정일

-- =============================================================================
-- 검증(읽기 전용): 3행 반환 = 존재 확인.
--   select column_name, data_type from information_schema.columns
--   where table_name='session_log' and column_name in ('reg_result','reg_reason','reg_reapproach_at');
-- 롤백(재구축 DB에서만):
--   alter table session_log drop column if exists reg_result;
--   alter table session_log drop column if exists reg_reason;
--   alter table session_log drop column if exists reg_reapproach_at;
-- =============================================================================
