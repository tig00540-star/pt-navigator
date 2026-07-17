-- =============================================================================
-- 트레이너 비포애프터 사진 업로드(상호) — member_photo.uploaded_by + 트레이너 INSERT/DELETE 정책
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: 2026-07-16-member-photo.sql(버킷·member 정책·member_in_my_account·auth_account_id) 선행.
-- 결정: 삭제 = 회원 전부 가능(기존 유지) / 트레이너는 uploaded_by='trainer'만.
-- =============================================================================

-- 1) 업로더 구분 컬럼 (기존 행은 회원)
alter table member_photo add column if not exists uploaded_by text not null default 'member';

-- 2) member_photo — 트레이너 INSERT(자기 account 회원)
drop policy if exists "trainer_photo_insert" on member_photo;
create policy "trainer_photo_insert" on member_photo for insert to authenticated
  with check (exists (
    select 1 from user_table u where u.id = member_photo.user_id and u.account_id = auth_account_id()
  ));

-- 3) member_photo — 트레이너 DELETE(자기 account 회원 · 트레이너 업로드분만)
drop policy if exists "trainer_photo_delete" on member_photo;
create policy "trainer_photo_delete" on member_photo for delete to authenticated
  using (uploaded_by = 'trainer' and exists (
    select 1 from user_table u where u.id = member_photo.user_id and u.account_id = auth_account_id()
  ));

-- 4) storage — 트레이너 INSERT(자기 account 회원 폴더). member_in_my_account 재사용.
drop policy if exists "trainer_photo_obj_insert" on storage.objects;
create policy "trainer_photo_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and member_in_my_account((storage.foldername(name))[1]));

-- 5) storage — 트레이너 DELETE(트레이너 업로드분만). 앱은 storage 먼저→row 삭제(조인 유지).
create or replace function trainer_uploaded_photo(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from member_photo p join user_table u on u.id = p.user_id
    where p.storage_path = p_path and p.uploaded_by = 'trainer' and u.account_id = auth_account_id()
  )
$$;
grant execute on function trainer_uploaded_photo(text) to authenticated;

drop policy if exists "trainer_photo_obj_delete" on storage.objects;
create policy "trainer_photo_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and trainer_uploaded_photo(name));

-- 검증:
--   select column_name from information_schema.columns where table_name='member_photo' and column_name='uploaded_by';
--   select policyname from pg_policies where tablename in ('objects','member_photo') and policyname like '%trainer_photo%';
-- 롤백: 위 정책 4개 drop + drop function trainer_uploaded_photo(text) + alter table member_photo drop column uploaded_by;
-- =============================================================================
