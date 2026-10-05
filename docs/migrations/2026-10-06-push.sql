-- =============================================================================
-- 폰 푸시 알림 — 구독(기기) · 트레이너 알림 설정 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
--
--   push_subscription : 기기 하나 = 한 줄(endpoint 고유). 트레이너 또는 회원 중 하나에 묶인다.
--                       ★클라 정책 없음 — 서버 라우트(/api/push/subscribe · service_role)만 쓰고 읽는다(키를 남이 못 보게).
--                       같은 폰에서 다른 사람이 로그인해 알림을 켜면 그 사람에게 다시 묶인다(endpoint upsert).
--   notify_pref       : 트레이너가 받을 알림 종류 on/off({ot_new:false, ...}) · 없는 키 = 켜짐.
--                       본인만 읽고 쓴다.
-- =============================================================================

create table if not exists push_subscription (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references account(id) on delete cascade,
  trainer_id  uuid references trainer(id) on delete cascade,
  member_id   uuid references user_table(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now(),
  constraint push_subscription_one_owner check ((trainer_id is null) <> (member_id is null))
);
create index if not exists push_subscription_trainer_idx on push_subscription (trainer_id);
create index if not exists push_subscription_member_idx on push_subscription (member_id);
alter table push_subscription enable row level security;
-- 정책 없음 = authenticated · anon 모두 못 읽고 못 씀(서버 service_role만).

create table if not exists notify_pref (
  trainer_id  uuid primary key references trainer(id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table notify_pref enable row level security;
drop policy if exists "notify_pref_select" on notify_pref;
create policy "notify_pref_select" on notify_pref for select to authenticated using (trainer_id = auth.uid());
drop policy if exists "notify_pref_insert" on notify_pref;
create policy "notify_pref_insert" on notify_pref for insert to authenticated with check (trainer_id = auth.uid());
drop policy if exists "notify_pref_update" on notify_pref;
create policy "notify_pref_update" on notify_pref for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- =============================================================================
-- 검증: select tablename from pg_tables where tablename in ('push_subscription','notify_pref');   -- 2줄
-- 롤백: drop table push_subscription, notify_pref;
-- =============================================================================
