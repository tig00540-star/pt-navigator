-- =============================================================================
-- 운동일지 자동 확인(48시간) + '내용이 달라요' — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등(여러 번 실행해도 같은 결과).
-- 전제: 2026-07-21-workout-confirmation.sql · 2026-10-05-pt-end-consent.sql 실행 완료.
--
-- 규칙(대표 결정 2026-10-06):
--   · 트레이너가 운동일지를 쓰면 회원이 확인한다. 수업 시각(또는 트레이너가 마지막으로 고친 시각)에서
--     48시간 안에 '확인'도 '내용이 달라요'도 없으면 → 자동 확인(method='auto').
--     ★폰 푸시 알림을 붙이면 24시간으로 줄인다(아래 cron 줄의 48 → 24 · 앱 lib/workoutHash AUTO_CONFIRM_HOURS도 같이).
--   · 회원이 자동 확인 문구(동의서 버전 2026-10-06 이상)에 동의한 뒤의 수업에만 적용(약관규제법 제12조 · 미리 알림).
--   · '내용이 달라요'(result='dispute' · dispute_note)가 열려 있는 일지는 자동 확인하지 않는다.
--     트레이너가 일지를 고치면(edited_at) 그 이의는 닫히고, 회원에게 다시 확인을 받는다(시계도 고친 시각부터 다시).
--   · 급여 · 차감은 지금처럼 확인 여부와 상관없다.
-- =============================================================================

-- ── 1) 일지를 마지막으로 고친 시각(내용 · 수업 시각 · 세트가 바뀔 때만) ─────────────
alter table daily_workout_log add column if not exists edited_at timestamptz;

create or replace function trg_workout_log_edited_at() returns trigger
language plpgsql as $$
begin
  if new.ai_summary is distinct from old.ai_summary
     or new.session_at is distinct from old.session_at
     or new.sets_structured is distinct from old.sets_structured then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists workout_log_edited_at on daily_workout_log;
create trigger workout_log_edited_at before update on daily_workout_log
  for each row execute function trg_workout_log_edited_at();

-- ── 2) 확인 방법에 'auto' 추가 ───────────────────────────────────────────────
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'workout_log_confirmation'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table workout_log_confirmation drop constraint %I', c.conname);
  end loop;
end $$;
alter table workout_log_confirmation add constraint workout_log_confirmation_method_check
  check (method in ('tap', 'drawn', 'auto'));
alter table workout_log_confirmation drop constraint if exists workout_log_confirmation_note_len;
alter table workout_log_confirmation add constraint workout_log_confirmation_note_len
  check (dispute_note is null or char_length(dispute_note) <= 200);
create index if not exists workout_log_confirmation_log_idx on workout_log_confirmation (log_id);

-- ── 3) 자동 확인 함수(cron이 10분마다) ────────────────────────────────────────
--   content_hash = 'sql1:' + SHA-256(ai_summary|session_at|sets) — 앱(JS) 해시와 만드는 방식이 달라 접두어로 구분.
--   트레이너 화면의 '확인 후 변경됨'은 auto 행이면 해시 대신 edited_at > confirmed_at 으로 본다.
create or replace function auto_confirm_workout_logs(p_hours int default 48)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with consent as (
    select member_id, min(created_at) as at
      from member_consent
     where kind = 'general' and agreed and version >= '2026-10-06'
     group by member_id
  ), cand as (
    select d.id, d.user_id,
           'sql1:' || encode(sha256(convert_to(
             coalesce(d.ai_summary, '') || '|' || coalesce(d.session_at::text, '') || '|' || coalesce(d.sets_structured::text, ''),
             'UTF8')), 'hex') as h
      from daily_workout_log d
      join consent k on k.member_id = d.user_id
     where coalesce(d.voided, false) = false
       and coalesce(d.source, '') <> 'noshow'
       and coalesce(d.session_at, d.created_at) >= k.at                       -- 동의한 뒤의 수업만
       and greatest(coalesce(d.session_at, d.created_at), coalesce(d.edited_at, d.created_at))
           + make_interval(hours => p_hours) <= now()
       and not exists (select 1 from workout_log_confirmation c
                        where c.log_id = d.id and c.result = 'confirm')
       and not exists (select 1 from workout_log_confirmation c                -- 열린 '내용이 달라요'
                        where c.log_id = d.id and c.result = 'dispute'
                          and c.confirmed_at > coalesce(d.edited_at, d.created_at))
     limit 2000
  )
  insert into workout_log_confirmation (log_id, member_id, result, method, content_hash)
  select id, user_id, 'confirm', 'auto', h from cand
  on conflict (log_id) where result = 'confirm' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function auto_confirm_workout_logs(int) from public, anon, authenticated;

-- ── 4) 회원 열람 뷰 — 열은 뒤에만 덧붙임(기존 7열 이름 · 순서 그대로) ─────────────
create or replace view member_workout_log
  with (security_invoker = false) as
  select d.id, d.created_at, d.ai_summary, d.session_at, d.sets_structured,
         max(c.confirmed_at) filter (where c.result = 'confirm') as confirmed_at,
         case
           when bool_or(c.result = 'confirm') then 'confirm'
           when bool_or(c.result = 'dispute') then 'dispute'
           else null
         end as confirm_result,
         d.edited_at,
         max(c.method) filter (where c.result = 'confirm') as confirm_method,       -- 'tap' | 'auto' | null
         max(c.confirmed_at) filter (where c.result = 'dispute') as dispute_at,
         (array_agg(c.dispute_note order by c.confirmed_at desc) filter (where c.result = 'dispute'))[1] as dispute_note
  from daily_workout_log d
  left join workout_log_confirmation c on c.log_id = d.id
  where d.user_id = auth_member_id()
    and coalesce(d.voided, false) = false
    and coalesce(d.source, '') <> 'noshow'
  group by d.id, d.created_at, d.ai_summary, d.session_at, d.sets_structured, d.edited_at;

grant select on member_workout_log to authenticated;
revoke select on member_workout_log from anon;

-- ── 5) 10분마다 실행(pg_cron) ─────────────────────────────────────────────────
--   pg_cron이 없다고 나오면: Supabase 대시보드 → Database → Extensions → pg_cron 켜고 이 파일을 다시 실행.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.unschedule(jobid) from cron.job where jobname = 'auto-confirm-workout-logs';
select cron.schedule('auto-confirm-workout-logs', '*/10 * * * *', $$select public.auto_confirm_workout_logs(48)$$);

-- =============================================================================
-- 검증(읽기 전용):
--   select jobname, schedule, command from cron.job where jobname = 'auto-confirm-workout-logs';
--   select public.auto_confirm_workout_logs(48);   -- 지금 바로 한 번(처리한 개수) · 동의 전이라 처음엔 0
--   select method, count(*) from workout_log_confirmation group by 1;
-- 24시간으로 바꾸기(푸시 알림 뒤):
--   select cron.unschedule(jobid) from cron.job where jobname = 'auto-confirm-workout-logs';
--   select cron.schedule('auto-confirm-workout-logs', '*/10 * * * *', $$select public.auto_confirm_workout_logs(24)$$);
-- 롤백: 위 unschedule · drop function auto_confirm_workout_logs(int) ·
--       뷰는 2026-10-05 이전 정의(2026-07-21 파일)로 되돌리려면 drop view 후 다시 만들기(열을 빼야 해서).
-- =============================================================================
