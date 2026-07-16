-- =============================================================================
-- B1-A — account에 구독 딱지 + 기존행 active 백필 (헬퍼 미변경 = 이 단계선 잠금 안 켜짐)
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 멱등.
-- ★ not null default 'inactive'는 기존 행을 전부 inactive로 채우므로, 같은 파일에서 즉시 백필.
--   (이 단계는 auth_account_id()/auth_is_owner()를 안 건드림 → 잠금 미가동 = 무해 윈도우.)
-- 전제: account 테이블(⑦-b) 존재. 신규 계정은 이 마이그레이션 이후 default(inactive/basic)로 태어남.
-- =============================================================================
alter table account add column if not exists subscription_status text not null default 'inactive';
alter table account add column if not exists plan               text not null default 'basic';
alter table account add column if not exists current_period_end timestamptz;  -- 접근 유효기한(체험/결제; null=무기한)

-- ★기존 계정(너 포함) grandfather — 안 하면 본인부터 잠김.
update account
  set subscription_status = 'active',
      plan = 'premium',
      current_period_end = null
  where true;   -- 이 시점 기존 행 전체(신규는 이 마이그레이션 이후 default로 태어남)

-- =============================================================================
-- 검증: select id, subscription_status, plan, current_period_end from account;  -- 전부 active/premium/null
--       본인 앱 로그인 정상(안 잠김 — 헬퍼 미변경).
-- 롤백: alter table account
--         drop column if exists subscription_status,
--         drop column if exists plan,
--         drop column if exists current_period_end;
-- =============================================================================
