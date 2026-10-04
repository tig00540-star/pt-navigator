-- =============================================================================
-- PT 종료 → 회원 전용 페이지 읽기 전용(6개월) + 'PT 종료 처리할까요?' 미루기 + 개인정보 · 건강정보 동의 기록 — 2026-10-05
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등(여러 번 실행해도 같음).
-- 전제: auth_member_id() · auth_account_id() · member_in_my_account(text) · 회원 자가입력 표(cardio_log · member_photo · schedule_check
--       · member_routine_log · member_routine_request) · storage 버킷 member-photos.
--
-- 무엇:
--  1) user_table.pt_end_snooze_until : '오늘' 탭 'PT 종료 처리할까요?' 카드의 [7일 뒤 다시 알림].
--  2) auth_member_id() 다시 정의 : 지난 회원(status='inactive')이 된 지 6개월이 지나면 NULL → 회원 화면이 아무것도 못 읽는다.
--     (status_changed_at이 비어 있으면 만료로 보지 않는다 · 트레이너가 '다시 PT 시작'하면 status가 바뀌어 바로 풀린다)
--  3) auth_member_writable() : 지난 회원이 아니어야 쓰기 가능. 회원 자가입력 정책(insert · update · delete)에 전부 덧붙인다.
--     → PT가 끝나면 기록은 볼 수만 있고(읽기 정책은 그대로) 새로 적거나 지울 수 없다. 화면이 숨기기 전에 DB가 막는다.
--  4) member_me 뷰에 열 덧붙이기(뒤에만 · create or replace 규칙): status · status_changed_at · center_name(하단 운영 주체 표시).
--  5) member_consent : 동의 기록(덧붙이기만 · 고치거나 지우지 않음 · 철회도 agreed=false 새 행).
--     kind general(개인정보 수집 · 이용) / health(건강정보 · 민감정보) · method member_page(회원이 직접) / trainer_check(트레이너가 받음 확인).
--     account_id는 트리거가 회원 행에서 채운다(회원 세션은 auth_account_id()가 NULL이라).
-- =============================================================================

-- 1) 미루기 칸
alter table user_table add column if not exists pt_end_snooze_until timestamptz;

-- 2) 회원 id — 지난 회원 6개월 지나면 닫힘
create or replace function auth_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from user_table
   where member_auth_id = auth.uid()
     and not (coalesce(status, '') = 'inactive'
              and status_changed_at is not null
              and status_changed_at < now() - interval '6 months')
$$;
grant execute on function auth_member_id() to authenticated;

-- 3) 쓰기 가능 여부 — 지난 회원이면 false
create or replace function auth_member_writable()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_table
     where member_auth_id = auth.uid() and coalesce(status, '') <> 'inactive'
  )
$$;
grant execute on function auth_member_writable() to authenticated;

-- 3-1) 유산소
drop policy if exists "member_cardio_insert" on cardio_log;
create policy "member_cardio_insert" on cardio_log for insert to authenticated
  with check (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_cardio_update" on cardio_log;
create policy "member_cardio_update" on cardio_log for update to authenticated
  using (user_id = auth_member_id() and auth_member_writable())
  with check (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_cardio_delete" on cardio_log;
create policy "member_cardio_delete" on cardio_log for delete to authenticated
  using (user_id = auth_member_id() and auth_member_writable());

-- 3-2) 사진(표 + 저장소)
drop policy if exists "member_photo_insert" on member_photo;
create policy "member_photo_insert" on member_photo for insert to authenticated
  with check (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_photo_delete" on member_photo;
create policy "member_photo_delete" on member_photo for delete to authenticated
  using (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_photo_obj_insert" on storage.objects;
create policy "member_photo_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth_member_id()::text and auth_member_writable());
drop policy if exists "member_photo_obj_delete" on storage.objects;
create policy "member_photo_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth_member_id()::text and auth_member_writable());

-- 3-3) 개인운동 체크
drop policy if exists "member_sched_insert" on schedule_check;
create policy "member_sched_insert" on schedule_check for insert to authenticated
  with check (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_sched_delete" on schedule_check;
create policy "member_sched_delete" on schedule_check for delete to authenticated
  using (user_id = auth_member_id() and auth_member_writable());

-- 3-4) 루틴 기록 · 루틴 요청
drop policy if exists "member_rlog_insert" on member_routine_log;
create policy "member_rlog_insert" on member_routine_log for insert to authenticated
  with check (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_rlog_delete" on member_routine_log;
create policy "member_rlog_delete" on member_routine_log for delete to authenticated
  using (user_id = auth_member_id() and auth_member_writable());
drop policy if exists "member_rreq_insert" on member_routine_request;
create policy "member_rreq_insert" on member_routine_request for insert to authenticated
  with check (user_id = auth_member_id() and status = 'open' and auth_member_writable());
drop policy if exists "member_rreq_delete" on member_routine_request;
create policy "member_rreq_delete" on member_routine_request for delete to authenticated
  using (user_id = auth_member_id() and status = 'open' and auth_member_writable());

-- 4) member_me — 열은 뒤에만 덧붙인다
create or replace view member_me
  with (security_invoker = false) as
  select u.id, u.name, u.goal, u.goal_deadline, t.name as trainer_name,
         u.status, u.status_changed_at, a.name as center_name
  from user_table u
  left join trainer t on t.id = u.trainer_id
  left join account a on a.id = u.account_id
  where u.id = auth_member_id();
grant select on member_me to authenticated;
revoke select on member_me from anon;

-- 5) 동의 기록
create table if not exists member_consent (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  member_id   uuid not null references user_table(id) on delete cascade,
  account_id  uuid references account(id) on delete cascade,
  kind        text not null check (kind in ('general', 'health')),
  agreed      boolean not null,
  method      text not null check (method in ('member_page', 'trainer_check')),
  version     text not null,
  trainer_id  uuid references trainer(id) on delete set null
);
create index if not exists member_consent_member_idx on member_consent (member_id, kind, created_at desc);
alter table member_consent enable row level security;

create or replace function member_consent_fill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.account_id := (select account_id from user_table where id = new.member_id);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists member_consent_fill on member_consent;
create trigger member_consent_fill before insert on member_consent
  for each row execute function member_consent_fill();

-- 회원: 본인 것 읽기 · 직접 동의(member_page)만 쓰기. 지난 회원도 동의는 남길 수 있다(읽기에 필요한 절차라서).
drop policy if exists "member_consent_select" on member_consent;
create policy "member_consent_select" on member_consent for select to authenticated
  using (member_id = auth_member_id());
drop policy if exists "member_consent_insert" on member_consent;
create policy "member_consent_insert" on member_consent for insert to authenticated
  with check (member_id = auth_member_id() and method = 'member_page' and trainer_id is null);

-- 트레이너: 센터 범위 읽기 · '받았어요' 확인(trainer_check)만 쓰기. 고치기 · 지우기 정책은 두지 않는다(덧붙이기만).
drop policy if exists "trainer_consent_select" on member_consent;
create policy "trainer_consent_select" on member_consent for select to authenticated
  using (account_id = auth_account_id());
drop policy if exists "trainer_consent_insert" on member_consent;
create policy "trainer_consent_insert" on member_consent for insert to authenticated
  with check (method = 'trainer_check' and trainer_id = auth.uid() and member_in_my_account(member_id::text));

-- =============================================================================
-- 검증(에러 없으면 OK):
--   select count(*) from pg_policies where tablename = 'member_consent';   -- 4
--   select count(*) from pg_policies where policyname in ('member_cardio_insert','member_cardio_update','member_cardio_delete',
--     'member_photo_insert','member_photo_delete','member_photo_obj_insert','member_photo_obj_delete','member_sched_insert',
--     'member_sched_delete','member_rlog_insert','member_rlog_delete','member_rreq_insert','member_rreq_delete')
--     and coalesce(qual, '') || coalesce(with_check, '') like '%auth_member_writable%';  -- 13
-- 롤백:
--   drop table if exists member_consent; drop function if exists member_consent_fill();
--   auth_member_id()는 2026-07-16-member-auth-rls.sql 정의로, 정책들은 각 원본 마이그레이션 정의로 다시 실행.
--   member_me는 열을 뺄 수 없으니 drop view member_me 후 2026-07-16-member-views.sql 정의로.
--   alter table user_table drop column if exists pt_end_snooze_until; drop function if exists auth_member_writable();
-- =============================================================================
