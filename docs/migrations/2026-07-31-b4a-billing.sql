-- =============================================================================
-- B4-A — 토스페이먼츠 정기결제(빌링) 컬럼 + payment 감사테이블
-- 실행: Supabase SQL Editor(수동). 멱등. ★ B1(구독 스키마) 적용 후 전제.
-- 설계: 결제 성공이 account.subscription_status/plan/current_period_end 를 채우면
--   기존 층1 게이트(auth_account_id·my_account_status)가 자동으로 열림 → 별도 게이트 없음.
--   plan 은 기능등급('premium'=회원앱 포함) 유지, 좌석등급(solo/center)은 billing_plan 에.
-- =============================================================================

alter table account add column if not exists billing_provider     text;              -- 'toss'
alter table account add column if not exists billing_key          text;              -- 토스 빌링키(정기결제 수단) · ⚠️ service_role만 접근
alter table account add column if not exists billing_customer_key text;              -- 토스 customerKey(=owner auth uid)
alter table account add column if not exists billing_plan         text;              -- 'solo' | 'center' (좌석 등급)
alter table account add column if not exists cancel_at_period_end boolean not null default false; -- 해지 예약(기간말 종료)
alter table account add column if not exists last_payment_at      timestamptz;

-- 결제 감사 로그(append-only). ★write는 service_role(서버 라우트)만. owner는 자기 계정 것 read.
create table if not exists payment (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references account(id) on delete cascade,
  order_id         text not null unique,          -- 우리 주문번호(멱등키)
  toss_payment_key text,                            -- 토스 paymentKey(실결제 회차)
  amount           integer not null,                -- 결제금액(원). 체험 시작은 0.
  status           text not null,                   -- 'TRIAL' | 'DONE' | 'FAILED' | 'CANCELED'
  plan             text,                            -- 'solo' | 'center'
  period_start     timestamptz,
  period_end       timestamptz,
  paid_at          timestamptz not null default now(),
  raw              jsonb                            -- 토스 응답 원본(감사·방어)
);
create index if not exists payment_account_idx on payment(account_id, paid_at desc);

alter table payment enable row level security;
-- owner는 자기 계정 결제내역 조회(만료 시엔 auth_account_id()=null이라 안 보임 — 의도)
drop policy if exists payment_owner_select on payment;
create policy payment_owner_select on payment for select to authenticated
  using (account_id = auth_account_id());
-- ⚠️ insert/update/delete 정책 없음 = authenticated 차단. write는 service_role 라우트만.

-- =============================================================================
-- 검증:
--   select column_name from information_schema.columns where table_name='account' and column_name like 'billing%';
--   select * from payment limit 1;   -- RLS로 본인 계정 것만
-- 롤백:
--   drop table if exists payment;
--   alter table account
--     drop column if exists billing_provider, drop column if exists billing_key,
--     drop column if exists billing_customer_key, drop column if exists billing_plan,
--     drop column if exists cancel_at_period_end, drop column if exists last_payment_at;
-- =============================================================================
