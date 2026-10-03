-- =============================================================================
-- 대표 아침 보고서(매일 9시) + 대표 피드백 — 2026-10-03
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등(여러 번 실행해도 같음).
-- 전제: auth_account_id() · auth_is_owner() · account · trainer · user_table · ot_log · session_log.
--
-- 무엇:
--  1) '결과를 남긴 시각' 칸 — 어제 결과(OT 피드백 · 재등록 결과)를 날짜로 고르기 위해.
--     ot_log.closing_recorded_at : 결과(closing_result)나 OT 피드백 저장 시각(report.feedbackAt)이 바뀔 때 서버 시각으로.
--     session_log.reg_recorded_at : 재등록 결과(reg_result)가 바뀔 때 서버 시각으로.
--     → 트리거가 채운다(클라 시계 · 저장 경로와 무관). 이전 기록은 비어 있다(앞으로 저장분부터 보고서에 잡힘).
--  2) owner_daily_report : 매일 9시(KST) 서버 예약 작업이 계정별로 만든 보고서(숫자 묶음 + AI 총평)를 날짜별로 보관.
--     대표만 읽기. 쓰기는 서버(service_role)만 — 정책 없음 = 클라 쓰기 불가.
--  3) owner_feedback : 대표가 어제 결과(실패 · 보류 건)에 남기는 피드백 → 받는 트레이너가 '오늘'에서 보고,
--     그 회원의 다음 OT · 재등록 리포트 AI가 반영. 대표만 쓰기 · 대표와 받는 트레이너만 읽기.
--     트레이너는 수정 불가 — '확인했어요'만 RPC(mark_owner_feedback_seen)로.
-- =============================================================================

-- 1) 결과 저장 시각 ---------------------------------------------------------------
alter table ot_log      add column if not exists closing_recorded_at timestamptz;
alter table session_log add column if not exists reg_recorded_at     timestamptz;

create or replace function set_closing_recorded_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (new.closing_result is not null and new.closing_result <> 'none') or (new.report ? 'feedbackAt') then
      new.closing_recorded_at := now();
    end if;
  elsif new.closing_result is distinct from old.closing_result
     or (new.report->>'feedbackAt') is distinct from (old.report->>'feedbackAt') then
    new.closing_recorded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_ot_log_closing_recorded_at on ot_log;
create trigger trg_ot_log_closing_recorded_at
  before insert or update on ot_log
  for each row execute function set_closing_recorded_at();

create or replace function set_reg_recorded_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.reg_result is not null and new.reg_result <> 'none' then new.reg_recorded_at := now(); end if;
  elsif new.reg_result is distinct from old.reg_result then
    new.reg_recorded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_session_log_reg_recorded_at on session_log;
create trigger trg_session_log_reg_recorded_at
  before insert or update on session_log
  for each row execute function set_reg_recorded_at();

create index if not exists ot_log_closing_recorded_idx      on ot_log (account_id, closing_recorded_at);
create index if not exists session_log_reg_recorded_idx     on session_log (account_id, reg_recorded_at);

-- 2) 대표 아침 보고서 -----------------------------------------------------------------
create table if not exists owner_daily_report (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references account(id) on delete cascade,
  ymd          date not null,                       -- 보고서 날짜(KST · 이 날 아침 9시 기준)
  data         jsonb not null,                      -- 숫자 묶음(어제 결과 · 오늘 예정 · 이달 · 주의 · 코칭 재료)
  ai           jsonb,                               -- AI 총평 · 코칭(프리미엄만 · 없으면 null)
  generated_at timestamptz not null default now(),
  unique (account_id, ymd)
);
alter table owner_daily_report enable row level security;

drop policy if exists "owner_read_daily_report" on owner_daily_report;
create policy "owner_read_daily_report"
  on owner_daily_report for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());
-- insert/update/delete 정책 없음 = 서버 예약 작업(service_role)만 쓴다.

-- 3) 대표 피드백 ---------------------------------------------------------------------
create table if not exists owner_feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  account_id  uuid not null default auth_account_id() references account(id) on delete cascade,
  author_id   uuid not null default auth.uid() references trainer(id),
  trainer_id  uuid references trainer(id) on delete set null,            -- 받는 트레이너
  member_id   uuid references user_table(id) on delete cascade,          -- 어느 회원 건인지
  kind        text not null check (kind in ('ot', 'rereg', 'new', 'other')),
  ref_id      uuid,                                                      -- ot_log.id 또는 session_log.id
  ref_ymd     date,                                                      -- 어느 날 결과에 대한 피드백인지
  body        text not null check (char_length(body) between 1 and 1000),
  seen_at     timestamptz                                                -- 트레이너가 확인한 시각
);
alter table owner_feedback enable row level security;
create index if not exists owner_feedback_trainer_idx on owner_feedback (trainer_id, seen_at);
create index if not exists owner_feedback_member_idx  on owner_feedback (member_id, created_at desc);

drop policy if exists "feedback_select" on owner_feedback;
create policy "feedback_select"
  on owner_feedback for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

drop policy if exists "feedback_insert_owner" on owner_feedback;
create policy "feedback_insert_owner"
  on owner_feedback for insert to authenticated
  with check (account_id = auth_account_id() and auth_is_owner() and author_id = auth.uid());

drop policy if exists "feedback_delete_owner" on owner_feedback;
create policy "feedback_delete_owner"
  on owner_feedback for delete to authenticated
  using (account_id = auth_account_id() and auth_is_owner() and author_id = auth.uid());
-- update 정책 없음 — 본문은 못 고친다(지우고 다시 쓰기). 트레이너의 '확인'은 아래 함수로만.

create or replace function mark_owner_feedback_seen(fid uuid) returns void
language sql security definer set search_path = public as $$
  update owner_feedback
     set seen_at = coalesce(seen_at, now())
   where id = fid and trainer_id = auth.uid() and account_id = auth_account_id();
$$;
revoke all on function mark_owner_feedback_seen(uuid) from public;
grant execute on function mark_owner_feedback_seen(uuid) to authenticated;

-- =============================================================================
-- 검증(에러 없이 아래 숫자가 나오면 OK):
--   select count(*) from information_schema.columns
--    where (table_name = 'ot_log' and column_name = 'closing_recorded_at')
--       or (table_name = 'session_log' and column_name = 'reg_recorded_at');            -- 2
--   select count(*) from pg_trigger where tgname in ('trg_ot_log_closing_recorded_at','trg_session_log_reg_recorded_at');  -- 2
--   select count(*) from pg_policies where tablename in ('owner_daily_report','owner_feedback');  -- 4
-- 롤백:
--   drop function if exists mark_owner_feedback_seen(uuid);
--   drop table if exists owner_feedback;
--   drop table if exists owner_daily_report;
--   drop trigger if exists trg_session_log_reg_recorded_at on session_log;
--   drop trigger if exists trg_ot_log_closing_recorded_at on ot_log;
--   drop function if exists set_reg_recorded_at();
--   drop function if exists set_closing_recorded_at();
--   alter table session_log drop column if exists reg_recorded_at;
--   alter table ot_log drop column if exists closing_recorded_at;
-- =============================================================================
