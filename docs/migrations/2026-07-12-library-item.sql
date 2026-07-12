-- 2026-07-12 library_item — 트레이너 참고자료 라이브러리(카테고리별 영상·링크)
-- pt_package 패턴(계정 RLS · 본인 것 · account_id/trainer_id DEFAULT). Supabase 실행 후 이 파일=git 기록본.
create table if not exists library_item (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth_account_id(),
  trainer_id  uuid not null default auth.uid(),
  category    text null,                     -- 거북목·라운드숄더 등(자유서술)
  title       text not null,
  url         text not null,
  source      text null,                     -- youtube/instagram/link (URL 자동 추정)
  note        text null,
  sort        integer null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table library_item enable row level security;
-- SELECT: 같은 계정(원장 전체 + 트레이너 본인). 쓰기: 본인만. (pt_package와 동일 원칙.)
create policy library_item_sel on library_item for select
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));
create policy library_item_ins on library_item for insert
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
create policy library_item_upd on library_item for update
  using (account_id = auth_account_id() and trainer_id = auth.uid())
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
create policy library_item_del on library_item for delete
  using (account_id = auth_account_id() and trainer_id = auth.uid());
-- 검증: select category, title, source from library_item;
-- 롤백: drop table if exists library_item;
