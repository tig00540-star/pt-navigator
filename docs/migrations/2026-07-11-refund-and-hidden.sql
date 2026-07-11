-- =============================================================================
-- P3a — 환불 처리 backbone: session_log 환불 2컬럼 + user_table 소프트삭제 1컬럼
-- 실행일: 2026-07-11 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일 (3컬럼):
--   (1) session_log.refund_amount  integer  — 환불 금액(원). 부분·전액 자유(트레이너 입력).
--   (2) session_log.refunded_at    date     — 환불 처리일(KST). 매출 차감은 '처리월' 기준
--        (원 계약이 6월이어도 7월에 환불하면 7월 매출에서 차감).
--   (3) user_table.hidden          boolean not null default false — 소프트 삭제(목록 숨김).
--        환불난 PT 회원을 목록에서 감추되 매출·수업·클로징 기록은 DB에 보존(회계 정합·되돌림 가능).
--
-- 매출 반영(코드): revenueInMonth·revenueByTrainer가 refunded_at 해당월에 refund_amount를 차감
--   (내 실적·admin 둘 다 같은 헬퍼라 자동 일관). 회원 목록은 loadMembers가 hidden=false만 로드.
-- 전제: session_log(계약)·user_table(회원) 존재 · ⑦ RLS(본인 계약 update · 본인 회원 update=7c2a).
-- 멱등: add column if not exists → 재실행 무해. 기존 행: refund_*=NULL(환불 없음), hidden=false(백필).
-- 롤백: 파일 하단 주석(drop column 3개).
-- 범위 밖: 환불 입력 UI·삭제 게이트(환불난 PT만) = P3b(프론트).
-- =============================================================================


alter table session_log add column if not exists refund_amount integer;
alter table session_log add column if not exists refunded_at    date;
alter table user_table  add column if not exists hidden boolean not null default false;


-- =============================================================================
-- 검증 쿼리 (읽기 전용)
-- (A) 컬럼 붙었나 — 기대: 3행
-- select table_name, column_name, data_type, is_nullable from information_schema.columns
-- where table_schema='public'
--   and ((table_name='session_log' and column_name in ('refund_amount','refunded_at'))
--        or (table_name='user_table' and column_name='hidden'))
-- order by table_name, column_name;
-- (B) 기존 회원 전부 hidden=false 백필됐나 — 기대: hidden_true = 0
-- select count(*) filter (where hidden) as hidden_true, count(*) as total from user_table;
--
-- 실동작 수동 검증(P3b 전에 backbone만 확인):
--   임의 계약 1건에 refund_amount=1000000, refunded_at='2026-07-11' 넣고 →
--   내 실적/admin 이달 매출이 100만 줄었는지. 그 회원 hidden=true 넣고 → 목록에서 사라지는지.
--   (검증 후 값 원복.)
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- alter table user_table  drop column if exists hidden;
-- alter table session_log drop column if exists refunded_at;
-- alter table session_log drop column if exists refund_amount;
-- =============================================================================
