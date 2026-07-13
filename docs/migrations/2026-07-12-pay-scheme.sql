-- 2026-07-12 pay_scheme — 확장 가능 급여 방식 설정 (banded + manual · 스코프당 1행)
-- 스펙: docs/v2-페이롤-스펙-확장가능급여.md §1-1. Supabase 대시보드에서 실행 완료. 이 파일은 git 기록본.
-- ot_log·pt_package 등과 같은 계정/원장 RLS 패턴. 트레이너별 override = trainer_id set, 계정 기본 = trainer_id null.

create table if not exists pay_scheme (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  trainer_id  uuid null,                 -- null=계정 기본 / set=그 트레이너 개별 override
  type        text not null default 'banded',   -- 'banded' | 'manual'
  band_basis  text null,                 -- 'revenue' | 'session_count'  (type='banded'일 때만)
  bands       jsonb not null default '[]'::jsonb,
  -- bands 원소: { "min": 100, "payout_type": "flat_per_session"|"pct_of_price"|"fixed",
  --              "payout_value": 20000, "incentive_type": "pct"|"flat"|"none", "incentive_value": 0 }
  updated_at  timestamptz not null default now()
);

-- 스코프당 1행 보장: 계정 기본(null)은 계정당 하나, 트레이너별은 (account,trainer)당 하나.
create unique index if not exists pay_scheme_default_ux
  on pay_scheme(account_id) where trainer_id is null;
create unique index if not exists pay_scheme_trainer_ux
  on pay_scheme(account_id, trainer_id) where trainer_id is not null;

alter table pay_scheme enable row level security;

-- SELECT: 같은 계정이면 읽기(트레이너가 자기 급여 근거 확인). 쓰기: 원장만.
create policy pay_scheme_sel on pay_scheme for select
  using (account_id = auth_account_id());
create policy pay_scheme_ins on pay_scheme for insert
  with check (account_id = auth_account_id() and auth_is_owner());
create policy pay_scheme_upd on pay_scheme for update
  using (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());
create policy pay_scheme_del on pay_scheme for delete
  using (account_id = auth_account_id() and auth_is_owner());

-- 기존 pay_policy(매출기준·판매가%) → 계정 기본 banded 스킴으로 이관. pay_policy는 레거시로 남김.
insert into pay_scheme (account_id, trainer_id, type, band_basis, bands)
select p.account_id, null, 'banded', 'revenue',
       jsonb_agg(jsonb_build_object(
         'min', coalesce(p.min_amt,0),
         'payout_type', 'pct_of_price',
         'payout_value', coalesce(p.base_pct,0),
         'incentive_type', coalesce(p.incentive_type,'none'),
         'incentive_value', coalesce(p.incentive_value,0)
       ) order by p.min_amt)
from pay_policy p
group by p.account_id
on conflict do nothing;

-- [C 착수 시 추가] 앱이 account_id 생략하고 insert하도록 DEFAULT(pt_package 패턴). RLS with_check와 일치.
alter table pay_scheme alter column account_id set default auth_account_id();
