-- 2026-07-12 payroll_run — 월별 급여 확정 레코드 (final_total = 진실)
-- 스펙: docs/v2-페이롤-스펙-확장가능급여.md §1-2. Supabase 대시보드에서 실행 완료. 이 파일은 git 기록본.
-- 자동계산(computed)은 참고 스냅샷, 원장이 확정한 final_total이 급여의 source of truth.

create table if not exists payroll_run (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null,
  trainer_id     uuid not null,
  ym             text not null,             -- 'YYYY-MM' (KST)
  computed_total integer null,              -- 확정 시점 자동제안 스냅샷(참고)
  final_total    integer null,              -- 원장 확정값 = 진실
  scheme_snapshot jsonb null,               -- 확정에 쓴 scheme 스냅샷(감사·재현, 선택)
  note           text null,
  locked_at      timestamptz null,
  updated_at     timestamptz not null default now(),
  unique (account_id, trainer_id, ym)
);

alter table payroll_run enable row level security;

-- SELECT: 원장은 전체, 트레이너는 본인 것만. 쓰기: 원장만.
create policy payroll_run_sel on payroll_run for select
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
create policy payroll_run_ins on payroll_run for insert
  with check (account_id = auth_account_id() and auth_is_owner());
create policy payroll_run_upd on payroll_run for update
  using (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());
