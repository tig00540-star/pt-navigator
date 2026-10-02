-- =============================================================================
-- 세일즈북 1단계 — 사례 보관함(sales_case) + 후기 캡처 비공개 버킷(sales-cases)
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
-- 전제: auth_account_id() · account · trainer · user_table.
--
-- 무엇: 트레이너가 다른 회원의 변화(비포·애프터 사진, 인바디 변화, 운동 무게 변화)와 회원 후기 캡처를
--       모아 두고, 세일즈북(2단계)에 넣어 새 회원에게 보여준다.
-- 결정(2026-10-02 대표): 회원 동의·개인정보 보호는 트레이너 책임. 앱은 동의 기록을 강제하지 않는다.
--       화면은 익명 라벨("30대 여성 · 12주")을 기본으로 쓴다(실명이 다른 회원 앞에 뜨지 않게).
-- 숫자는 담는 순간의 기록을 data(jsonb)에 스냅샷 — 손으로 고칠 수 없다(진짜 숫자만 보여주기).
-- 사진 사례는 member_photo 경로를 참조만 한다(복사 안 함) → 회원이 사진을 지우면 사례에서도 빠진다.
-- =============================================================================

-- 1) 사례 테이블
create table if not exists sales_case (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  account_id  uuid not null default auth_account_id() references account(id),
  trainer_id  uuid not null default auth.uid() references trainer(id),
  kind        text not null check (kind in ('photo', 'inbody', 'lift', 'review')),
  member_id   uuid references user_table(id) on delete set null,   -- 어느 회원 사례인지(후기는 없어도 됨)
  label       text,                                                -- 화면에 보일 익명 라벨
  data        jsonb not null default '{}'::jsonb,                  -- 스냅샷(사진 경로·전후 숫자·후기 이미지 경로)
  note        text,                                                -- 트레이너 메모(한 줄)
  sort        integer not null default 0
);
alter table sales_case enable row level security;
create index if not exists sales_case_trainer_idx on sales_case (trainer_id, created_at desc);

drop policy if exists "auth_all_sales_case" on sales_case;
create policy "auth_all_sales_case"
  on sales_case for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id());

-- 2) 후기 캡처 비공개 버킷 — 경로 첫 폴더 = account_id (같은 센터 트레이너만 열람·업로드·삭제)
insert into storage.buckets (id, name, public)
  values ('sales-cases', 'sales-cases', false)
  on conflict (id) do nothing;

drop policy if exists "sales_case_obj_select" on storage.objects;
create policy "sales_case_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'sales-cases' and (storage.foldername(name))[1] = auth_account_id()::text);
drop policy if exists "sales_case_obj_insert" on storage.objects;
create policy "sales_case_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'sales-cases' and (storage.foldername(name))[1] = auth_account_id()::text);
drop policy if exists "sales_case_obj_delete" on storage.objects;
create policy "sales_case_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sales-cases' and (storage.foldername(name))[1] = auth_account_id()::text);

-- =============================================================================
-- 검증:
--   select count(*) from sales_case;                                  -- 0 (에러 없으면 OK)
--   select id, public from storage.buckets where id = 'sales-cases';  -- public = false
--   select policyname from pg_policies where policyname like 'sales_case%' or policyname = 'auth_all_sales_case';  -- 4행
-- 롤백:
--   drop policy if exists "sales_case_obj_select" on storage.objects;
--   drop policy if exists "sales_case_obj_insert" on storage.objects;
--   drop policy if exists "sales_case_obj_delete" on storage.objects;
--   drop policy if exists "auth_all_sales_case" on sales_case;
--   drop table if exists sales_case;
--   (버킷은 비운 뒤) delete from storage.buckets where id = 'sales-cases';
-- =============================================================================
