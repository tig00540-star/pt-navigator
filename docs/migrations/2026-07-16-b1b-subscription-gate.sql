-- =============================================================================
-- B1-B — auth_account_id()·auth_is_owner()에 구독 활성+만료 조건 AND (층1 잠금 켜짐)
-- ★ 반드시 B1-A 백필 확인 후. 광범위(전 RLS 좌우) → 적용 후 center_machine 리트머스.
-- 기존 정의(2026-07-13-offboarding-active.sql): trainer.id=auth.uid() and active 만 봤음.
--   → 여기에 account 조인 + subscription 조건만 AND로 얹음(로직 재작성 아님, 확장).
-- 실제 스키마 확인 완료:
--   · trainer↔auth 링크 = trainer.id = auth.uid() (별도 auth_user_id 컬럼 없음)
--   · account 링크 = trainer.account_id → account.id
-- =============================================================================

-- 층1 잠금 — 계정 스코프 헬퍼(전 데이터 테이블 RLS가 이걸 씀).
create or replace function auth_account_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select t.account_id
  from trainer t
  join account a on a.id = t.account_id
  where t.id = auth.uid()
    and t.active
    and a.subscription_status = 'active'
    and (a.current_period_end is null or a.current_period_end > now())
$$;

-- owner 권한도 미활성/만료 시 잠기게 — auth_is_owner()는 auth_account_id()와 독립 계산이므로 동일 조건 AND.
create or replace function auth_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from trainer t
    join account a on a.id = t.account_id
    where t.id = auth.uid()
      and t.role = 'owner'
      and t.active
      and a.subscription_status = 'active'
      and (a.current_period_end is null or a.current_period_end > now())
  )
$$;

-- =============================================================================
-- 리트머스(적용 직후, 본인=active 세션): GET /rest/v1/center_machine → 행 반환되면 OK.
--   0행이면 백필 누락/조인 오류 → 즉시 아래 롤백.
-- 회원목록·탭 정상 확인(회귀 없음).
-- -----------------------------------------------------------------------------
-- ROLLBACK (subscription 조건 제거 → offboarding-active.sql 정의로 복원):
-- create or replace function auth_account_id() returns uuid language sql stable security definer
--   set search_path = public as $$ select account_id from trainer where id = auth.uid() and active $$;
-- create or replace function auth_is_owner() returns boolean language sql stable security definer
--   set search_path = public as $$
--     select exists (select 1 from trainer where id = auth.uid() and role = 'owner' and active) $$;
-- =============================================================================
