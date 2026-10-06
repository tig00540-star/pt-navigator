-- =============================================================================
-- 운동일지 회원 서명(일지마다 · 자동 확인 뒤에도) + 월별 수업 확인서 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-06-auto-confirm.sql 실행 완료.
--
-- 규칙(대표 결정 2026-10-06):
--   · 회원이 운동일지를 확인할 때 손가락으로 서명한다(일지마다 · 밀린 여러 건은 서명 한 번에 같이).
--     날짜는 손으로 쓰지 않는다 — 서버가 수업 날짜 · 서명 시각을 남긴다.
--   · 24시간 자동 확인된 일지에도 나중에 서명할 수 있다('자동 확인 · 서명' · 강요 없음).
--   · 서명 = 별도 기록 workout_log_signature(확인 기록과 섞지 않음 · 덧붙이기만) + 비공개 저장소 log-signatures.
--     쓰기는 서버 라우트(/api/member-confirm · service_role)만. 서명 그림은 '그 순간 내용'(content_hash)과 함께 남는다.
--   · 회원 기록을 지울 때 서명 그림도 같이 지운다(운영 절차 · 저장소는 cascade가 안 되므로).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('log-signatures', 'log-signatures', false)
on conflict (id) do nothing;
-- 경로: {account_id}/{member_id}/{시각}-{난수}.png · 트레이너 · 대표 = 자기 센터 읽기 · 회원 = 본인 것 읽기 · 쓰기는 서버만.
drop policy if exists "log_sig_obj_select" on storage.objects;
create policy "log_sig_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'log-signatures' and (
    (storage.foldername(name))[1] = auth_account_id()::text
    or (storage.foldername(name))[2] = auth_member_id()::text));

create table if not exists workout_log_signature (
  id            uuid primary key default gen_random_uuid(),
  log_id        uuid not null references daily_workout_log(id) on delete cascade,
  member_id     uuid not null references user_table(id) on delete cascade,
  account_id    uuid not null references account(id) on delete cascade,
  path          text not null,
  content_hash  text,                                     -- 서명한 순간의 일지 내용(앱 해시)
  after_auto    boolean not null default false,           -- 자동 확인 뒤에 한 서명
  signed_at     timestamptz not null default now()
);
create index if not exists workout_log_signature_log_idx on workout_log_signature (log_id, signed_at desc);
create index if not exists workout_log_signature_member_idx on workout_log_signature (member_id);
alter table workout_log_signature enable row level security;
drop policy if exists "log_sig_member_select" on workout_log_signature;
create policy "log_sig_member_select" on workout_log_signature for select to authenticated using (member_id = auth_member_id());
drop policy if exists "log_sig_trainer_select" on workout_log_signature;
create policy "log_sig_trainer_select" on workout_log_signature for select to authenticated using (account_id = auth_account_id());
-- 쓰기 정책 없음 = 서버 라우트만.

-- 회원 열람 뷰 — 서명 시각만 뒤에 덧붙임(열 이름 · 순서 그대로)
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
         max(c.method) filter (where c.result = 'confirm') as confirm_method,
         max(c.confirmed_at) filter (where c.result = 'dispute') as dispute_at,
         (array_agg(c.dispute_note order by c.confirmed_at desc) filter (where c.result = 'dispute'))[1] as dispute_note,
         (select max(s.signed_at) from workout_log_signature s where s.log_id = d.id) as signed_at
  from daily_workout_log d
  left join workout_log_confirmation c on c.log_id = d.id
  where d.user_id = auth_member_id()
    and coalesce(d.voided, false) = false
    and coalesce(d.source, '') <> 'noshow'
  group by d.id, d.created_at, d.ai_summary, d.session_at, d.sets_structured, d.edited_at;
grant select on member_workout_log to authenticated;
revoke select on member_workout_log from anon;

-- =============================================================================
-- 검증: select id, public from storage.buckets where id = 'log-signatures';   -- public = false
--       select tablename from pg_tables where tablename = 'workout_log_signature';
-- =============================================================================
