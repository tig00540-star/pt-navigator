-- =============================================================================
-- 지출(expense) — 센터별 인앱 지출 장부 (Phase B · 노션 대체)
-- 실행: Supabase SQL Editor(수동). 멱등.
-- 계정별 격리(RLS) · owner/트레이너 공용 authenticated write는 account 스코프로만.
-- 대시보드 순이익 = 매출(session_log) − 지출(expense), 둘 다 Supabase 단일 소스.
-- =============================================================================

create table if not exists expense (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade default auth_account_id(),
  spent_on    date not null,                 -- 지출 일자(KST 기준 입력)
  category    text,                           -- 임대료·인건비·공과금·마케팅·기타
  amount      integer not null,               -- 금액(원)
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists expense_acct_idx on expense(account_id, spent_on desc);

alter table expense enable row level security;
-- 계정 스코프 read/write(원장 전용 화면에서만 노출되지만 정책은 account 격리로 충분).
drop policy if exists expense_rw on expense;
create policy expense_rw on expense for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id());

-- =============================================================================
-- 검증: insert 후 select * from expense; → 본인 계정 것만.
-- 롤백: drop table if exists expense;
-- =============================================================================
