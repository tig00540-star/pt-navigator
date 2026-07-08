-- =============================================================================
-- 기능D-1a — 2차 클로징 케이스 수집 (ot_log 2컬럼 추가)
-- 실행일: 2026-07-08 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일 (2컬럼):
--   (1) closing_reason  text  — 실패/보류 사유 카테고리(money/time/schedule/consider/
--       compare/partner/personal/etc). 약점 진단 · admin 분포 집계용(=D-1b).
--   (2) closing_detail  jsonb — 성공/실패/보류 케이스 3박자
--       { approach, reaction, outcome } (다 nullable). "나중 AI 리딩 재료"로 원문 보존.
--       ⚠️ 자유서술이라 집계 안 함(closing_reason이 집계 축).
--
--   두 컬럼 다 round-2 행(ot_round=2)에서만 씀. 미시도(none)면 앱이 둘 다 미포함.
--   앱은 closing_result 옆 closing_* 컬럼만 update → report(브리핑 캐시) 보존(공존 규칙 그대로).
--
-- 전제: ot_log에 closing_result/closing_approach/closing_reapproach_at 이미 존재.
-- 멱등: add column if not exists → 재실행 무해.
-- 롤백: 파일 하단 주석(drop column 2개).
-- 범위 밖: closing_reason 분포 집계·admin 카드 = D-1b · 1차 수집 = D-2 · AI 활용 = D-3.
-- =============================================================================


alter table ot_log add column if not exists closing_reason text;
alter table ot_log add column if not exists closing_detail jsonb;


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- -----------------------------------------------------------------------------
-- (A) 컬럼 붙었나 — 기대: 2행(closing_reason text · closing_detail jsonb)
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema='public' and table_name='ot_log'
--   and column_name in ('closing_reason','closing_detail')
-- order by column_name;
-- =============================================================================


-- =============================================================================
-- ROLLBACK — 2컬럼 제거.
-- -----------------------------------------------------------------------------
-- alter table ot_log drop column if exists closing_detail;
-- alter table ot_log drop column if exists closing_reason;
-- =============================================================================
