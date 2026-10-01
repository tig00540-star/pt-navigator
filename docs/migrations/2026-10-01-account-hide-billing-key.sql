-- =============================================================================
-- account 결제키 열 숨기기 — 같은 센터 트레이너가 빌링키를 읽을 수 있던 구멍
-- 실행: Supabase SQL Editor(수동). 멱등.
--
-- ── 문제 ──
-- account 읽기 정책(auth_read_account)은 "내 계정 1행"을 **모든 열**로 연다.
-- 그래서 센터 소속 트레이너도 select billing_key from account 로 토스 빌링키와
-- billing_customer_key를 읽을 수 있었다. b4a-billing.sql 주석은 "service_role만 접근"이라고
-- 적었지만 그걸 강제하는 장치가 없었다.
-- (빌링키만으로는 결제가 안 된다 — 토스 시크릿키가 서버에만 있다. 그래도 결제 수단
--  식별값이 트레이너 화면 쪽으로 열려 있는 건 의도와 다르다.)
--
-- ── 해결 ──
-- 행 정책은 그대로 두고, 열 권한으로 좁힌다: 테이블 단위 select를 거두고
-- 앱이 실제로 읽는 열만 다시 준다. 결제키 두 열은 빠진다.
--
-- ── 안전 확인(2026-10-01) ──
-- · 클라가 account에서 읽는 열: type · name · billing_plan · settlement_start_day (+ 조인용 id)
--   → 전부 아래 grant 목록 안에 있다. select("*")로 account를 읽는 클라 코드는 없다.
-- · my_account_status · auth_account_id · auth_is_owner · auth_account_plan ·
--   set_settlement_start_day 는 전부 SECURITY DEFINER — 열 권한과 무관하게 동작한다.
-- · 서버 라우트(결제·크론·트레이너 추가)는 service_role — 영향 없음.
--
-- ⚠️ 앞으로 account에 새 열을 추가하고 클라에서 읽어야 하면, 아래 grant에 그 열을 더해야 한다
--    (안 더하면 그 열 select가 permission denied로 실패한다).
-- =============================================================================

revoke select on account from authenticated;
revoke select on account from anon;

grant select (
  id, type, name, plan,
  billing_plan, billing_provider,
  subscription_status, current_period_end, cancel_at_period_end, last_payment_at,
  settlement_start_day, created_at
) on account to authenticated;

-- =============================================================================
-- 검증(SQL 에디터에서 그대로 실행):
--   select has_column_privilege('authenticated', 'account', 'billing_key', 'select');          -- false 여야 함
--   select has_column_privilege('authenticated', 'account', 'billing_customer_key', 'select'); -- false 여야 함
--   select has_column_privilege('authenticated', 'account', 'name', 'select');                 -- true 여야 함
-- 실행 후 앱 확인: 대표 화면 상단 센터명이 뜨고, 정산 탭이 열리면 정상.
--
-- 롤백: grant select on account to authenticated;
-- =============================================================================
