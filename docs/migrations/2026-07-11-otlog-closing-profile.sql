-- =============================================================================
-- C (기능D-2) — 1차 클로징 캡처 확장: ot_log closing_profile 컬럼 추가
-- 실행일: 2026-07-11 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일 (1컬럼):
--   closing_profile jsonb — 클로징 기록 시점의 '회원 프로파일 스냅샷'
--   { age, job, residence, mbti, pain, goal, goal_type } (다 nullable).
--   D-3(강점 활용)에서 "비슷한 회원엔 과거 이 접근이 통했다" 매칭 재료.
--   ⚠️ 스냅샷 이유 = 회원 프로파일이 나중에 바뀌어도 '그때 그 케이스'를 자기완결로 보존.
--   round1(관찰 탭 ㉠)·round2(2차 탭 ㉠) 클로징 성공/실패/보류 시 앱이 채운다.
--
-- 전제: ot_log에 closing_result/closing_approach/closing_reapproach_at(기존) +
--       closing_reason/closing_detail(2026-07-08-otlog-closing-case.sql) 이미 존재.
--       → C는 프로파일 스냅샷 1컬럼만 신설. 사유·3박자 컬럼은 재사용(round1로 대칭 확장).
-- 멱등: add column if not exists → 재실행 무해.
-- RLS: ot_log 기존 정책(계정 스코프) 그대로 상속 — 새 컬럼 정책 불필요.
-- 롤백: 파일 하단 주석(drop column).
-- 범위 밖: 캡처 UI·저장(관찰 탭 ㉠ 확장 + 2차 저장에 스냅샷) = 프론트 · AI 활용 = D-3.
-- =============================================================================


alter table ot_log add column if not exists closing_profile jsonb;


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- (A) 컬럼 붙었나 — 기대: 1행(closing_profile · jsonb)
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='ot_log' and column_name='closing_profile';
-- (B) 클로징 3종 컬럼 다 있나(대칭 확장 전제 확인) — 기대: 6행
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='ot_log'
--   and column_name in ('closing_result','closing_approach','closing_reason',
--                        'closing_reapproach_at','closing_detail','closing_profile')
-- order by column_name;
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- alter table ot_log drop column if exists closing_profile;
-- =============================================================================
