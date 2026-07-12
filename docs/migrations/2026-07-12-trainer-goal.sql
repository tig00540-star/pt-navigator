-- 2026-07-12 trainer_goal — 트레이너 월별 개인 목표매출 (달성률 원천)
-- 스펙: docs/v2-트레이너-스펙-목표매출+프로필.md. Supabase 대시보드 실행 후 이 파일=git 기록본.
-- pay_scheme/payroll_run 계정 RLS 패턴. 단 쓰기 주체 = 트레이너 본인(자기 목표 자기 설정).

create table if not exists trainer_goal (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null default auth_account_id(),
  trainer_id     uuid not null default auth.uid(),
  ym             text not null,                 -- 'YYYY-MM' (KST)
  target_revenue integer null,                  -- 목표 순매출(원). null=미설정
  updated_at     timestamptz not null default now(),
  unique (trainer_id, ym)
);

alter table trainer_goal enable row level security;

-- SELECT: 같은 계정(원장 전체 + 트레이너 본인). 쓰기: 트레이너 본인만.
create policy trainer_goal_sel on trainer_goal for select
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
create policy trainer_goal_ins on trainer_goal for insert
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
create policy trainer_goal_upd on trainer_goal for update
  using (account_id = auth_account_id() and trainer_id = auth.uid())
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
-- delete 정책 없음(목표는 값 수정으로 관리). 필요 시 추가.

-- 검증: select trainer_id, ym, target_revenue from trainer_goal;
-- 롤백: drop table if exists trainer_goal;
