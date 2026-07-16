-- =============================================================================
-- 회원 자가입력 M2 — 비포애프터 사진: 비공개 버킷 + storage RLS + member_photo 테이블 + RLS
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: auth_member_id() · auth_account_id(). storage.objects는 Supabase 기본 RLS on.
-- =============================================================================

-- 1) 비공개 버킷
insert into storage.buckets (id, name, public)
  values ('member-photos', 'member-photos', false)
  on conflict (id) do nothing;

-- 2) 스토리지 객체 RLS (경로 첫 폴더 = user_id)
--   회원: 본인 폴더 업로드/열람/삭제
drop policy if exists "member_photo_obj_insert" on storage.objects;
create policy "member_photo_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth_member_id()::text);
drop policy if exists "member_photo_obj_select" on storage.objects;
create policy "member_photo_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth_member_id()::text);
drop policy if exists "member_photo_obj_delete" on storage.objects;
create policy "member_photo_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = auth_member_id()::text);
--   트레이너: 폴더(user_id)가 자기 account 회원이면 열람(읽기만)
--   ★ storage.objects 정책 안에서 user_table을 직접 조인하면 RLS 재귀/권한 이슈가 있어,
--     SECURITY DEFINER 헬퍼(member_in_my_account)로 감싸 폴더 소유 회원의 account만 확인.
create or replace function member_in_my_account(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_table u where u.id::text = p_folder and u.account_id = auth_account_id())
$$;
grant execute on function member_in_my_account(text) to authenticated;

drop policy if exists "trainer_photo_obj_select" on storage.objects;
create policy "trainer_photo_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and member_in_my_account((storage.foldername(name))[1]));

-- 3) member_photo 테이블 + RLS (M1 cardio_log와 동일 틀)
create table if not exists member_photo (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references user_table(id) on delete cascade,
  storage_path text not null,
  label        text,
  taken_on     date not null default current_date,
  note         text,
  created_at   timestamptz default now()
);
create index if not exists member_photo_user_idx on member_photo (user_id, taken_on desc);
alter table member_photo enable row level security;

drop policy if exists "member_photo_select" on member_photo;
create policy "member_photo_select" on member_photo for select to authenticated
  using (user_id = auth_member_id());
drop policy if exists "member_photo_insert" on member_photo;
create policy "member_photo_insert" on member_photo for insert to authenticated
  with check (user_id = auth_member_id());
drop policy if exists "member_photo_delete" on member_photo;
create policy "member_photo_delete" on member_photo for delete to authenticated
  using (user_id = auth_member_id());
-- 트레이너: 자기 account 회원 것 조회(읽기만)
drop policy if exists "trainer_photo_select" on member_photo;
create policy "trainer_photo_select" on member_photo for select to authenticated
  using (exists (
    select 1 from user_table u where u.id = member_photo.user_id and u.account_id = auth_account_id()
  ));

-- 검증:
--   select id, public from storage.buckets where id='member-photos';  -- public=false 1행
--   select policyname from pg_policies where tablename in ('objects','member_photo') and policyname like '%photo%';
-- 롤백: drop table if exists member_photo cascade;
--        delete from storage.objects where bucket_id='member-photos'; delete from storage.buckets where id='member-photos';
--        (+ 위 storage 정책 4개 drop)
-- UPDATE 정책 없음(의도): 사진은 추가·삭제만. member_photo·storage 둘 다 insert/select/delete만.
-- =============================================================================
