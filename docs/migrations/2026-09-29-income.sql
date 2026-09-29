-- =============================================================================
-- 기타 매출(income) — FC매출·기타매출 수기 장부 (지출 expense와 대칭 구조)
-- 실행: Supabase SQL Editor(수동). 멱등.
--
-- ⚠️ 이 테이블의 매출은 트레이너 지표에 절대 들어가지 않는다.
--    · 트레이너 실적·급여      → PT 계약(session_log)만
--    · OT 전환율·재등록률      → PT 계약만
--    · 대표 순이익·정산        → PT + FC + 기타 − 지출 (전부 합산)
--    FC매출은 센터 FC부서가 파는 회원권이라 담당 트레이너가 없다.
--    합치면 트레이너 급여가 틀어진다.
--
-- 회원권 상세(회원명·기간·락커·운동복)는 넣지 않는다 — 넣는 순간 회원권 관리 시스템이 되고
-- 홀딩·환불 일할·만료 알림이 줄줄이 따라온다. 지금은 memo 자유 입력으로 충분하다.
-- 파일럿에서 실제 요구가 나오면 그때 별도 설계.
-- =============================================================================

create table if not exists income (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade default auth_account_id(),
  earned_on   date not null,                  -- 매출 발생일(KST 기준 입력)
  kind        text not null default 'fc',     -- 'fc'(FC매출) | 'etc'(기타매출) · 종류 확장은 여기에
  amount      integer not null,               -- 금액(원)
  memo        text,                            -- 자유 기입(예: "김OO 3개월 + 락커")
  created_at  timestamptz not null default now()
);
create index if not exists income_acct_idx on income(account_id, earned_on desc);

alter table income enable row level security;
-- 계정 스코프 read/write(원장 전용 화면에서만 노출되지만 정책은 account 격리로 충분 · expense와 동일).
drop policy if exists income_rw on income;
create policy income_rw on income for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id());

-- =============================================================================
-- 정산 시작일 — 센터마다 정산 주기가 다르다(1일~말일 / 15일~익월 14일 등).
-- account에 한 칸만 둔다. 1=달력월(기본), 15=15일 시작.
-- =============================================================================
alter table account add column if not exists settlement_start_day smallint not null default 1;

-- ⚠️ account 는 select 정책만 있다(내 계정 1행). update 정책을 열면 트레이너가
--    subscription_status·plan·billing_key까지 고칠 수 있어 결제 게이트가 뚫린다.
--    그래서 '이 컬럼만·원장만' 고치는 security definer 함수로 좁혀서 연다.
create or replace function set_settlement_start_day(d smallint)
returns smallint
language plpgsql security definer set search_path = public as $$
declare v smallint := greatest(1, least(coalesce(d, 1), 28));  -- 29~31은 없는 달이 있어 28로 상한
begin
  update account
     set settlement_start_day = v
   where id = auth_account_id()
     and exists (select 1 from trainer t where t.id = auth.uid() and t.role = 'owner');
  if not found then
    raise exception '정산 시작일을 바꿀 권한이 없습니다(원장 전용).';
  end if;
  return v;
end $$;
grant execute on function set_settlement_start_day(smallint) to authenticated;

-- =============================================================================
-- 검증: insert 후 select * from income;  → 본인 계정 것만.
--       select settlement_start_day from account;  → 1
-- 롤백: drop table if exists income;
--       drop function if exists set_settlement_start_day(smallint);
--       alter table account drop column if exists settlement_start_day;
-- =============================================================================
