-- =============================================================================
-- 월간 결산(매월 1일 아침 · 지난달) — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
--
-- 대표 결정(2026-10-06):
--   · 대표 결산(kind owner · trainer_id null) — 센터 숫자 · 트레이너별 카드(잘한 점 · 보완할 점 · 해 볼 것 · AI) · 추천 목표
--     → '보완할 점'은 대표만 본다(트레이너 면담용).
--   · 트레이너 성적표(kind trainer · 본인) — 규칙 기반(AI 없음) · 이벤트 · 할 일 · 추천 목표
--   · 개인 계정 '내 결산'(kind solo · 본인) — 성적표 + 장부/받은 금액 + AI 총평
--   · 만드는 곳 = 서버 예약 작업(service_role)만 · 클라 쓰기 없음 · 열어 본 시각(seen_at)으로 실제로 쓰이는지 잰다.
--   · 추천 목표 [목표로 정하기]: 트레이너 본인 + 대표(자기 센터 트레이너) → trainer_goal 쓰기 정책을 대표까지 넓힌다.
-- =============================================================================

create table if not exists monthly_report (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references account(id) on delete cascade,
  trainer_id   uuid references trainer(id) on delete cascade,          -- null = 대표(센터) 결산
  kind         text not null check (kind in ('owner', 'trainer', 'solo')),
  ym           text not null check (ym ~ '^\d{4}-\d{2}$'),            -- 결산하는 달(지난달)
  data         jsonb not null,
  ai           jsonb,
  generated_at timestamptz not null default now(),
  seen_at      timestamptz,
  check ((kind = 'owner') = (trainer_id is null))
);
create unique index if not exists monthly_report_owner_uq on monthly_report (account_id, ym) where kind = 'owner';
create unique index if not exists monthly_report_person_uq on monthly_report (account_id, trainer_id, kind, ym) where kind <> 'owner';
create index if not exists monthly_report_trainer_idx on monthly_report (trainer_id, ym desc);
alter table monthly_report enable row level security;

drop policy if exists "monthly_report_select" on monthly_report;
create policy "monthly_report_select" on monthly_report for select to authenticated
  using (account_id = auth_account_id()
         and ((kind = 'owner' and auth_is_owner()) or trainer_id = auth.uid()));
-- 쓰기 정책 없음 = 서버(service_role)만. 대표는 트레이너 성적표를 따로 열지 않는다(대표 결산 안에 트레이너별 카드).

-- 열어 봤어요(본인 것 · 대표는 대표 결산)
create or replace function mark_monthly_report_seen(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update monthly_report set seen_at = coalesce(seen_at, now())
   where id = p_id and account_id = auth_account_id()
     and ((kind = 'owner' and auth_is_owner()) or trainer_id = auth.uid());
$$;
revoke all on function mark_monthly_report_seen(uuid) from public, anon;
grant execute on function mark_monthly_report_seen(uuid) to authenticated;

-- 트레이너 목표: 대표도 자기 센터 트레이너 것을 정할 수 있게(결산의 [목표로 정하기])
drop policy if exists trainer_goal_ins on trainer_goal;
create policy trainer_goal_ins on trainer_goal for insert
  with check (account_id = auth_account_id()
              and (trainer_id = auth.uid()
                   or (auth_is_owner() and exists (select 1 from trainer t where t.id = trainer_id and t.account_id = auth_account_id()))));
drop policy if exists trainer_goal_upd on trainer_goal;
create policy trainer_goal_upd on trainer_goal for update
  using (account_id = auth_account_id() and (trainer_id = auth.uid() or auth_is_owner()))
  with check (account_id = auth_account_id()
              and (trainer_id = auth.uid()
                   or (auth_is_owner() and exists (select 1 from trainer t where t.id = trainer_id and t.account_id = auth_account_id()))));

-- =============================================================================
-- 검증: select tablename from pg_tables where tablename = 'monthly_report';
-- 롤백: drop table if exists monthly_report; drop function if exists mark_monthly_report_seen(uuid);
--       trainer_goal 정책은 2026-07-12-trainer-goal.sql 정의로 다시.
-- =============================================================================
