-- =============================================================================
-- 회원 앱 S1 — 회원 인증·RLS 뼈대
--   member_token · member_auth_id 컬럼 + auth_member_id() 헬퍼 + 회원 SELECT 정책(가산)
-- 실행일: 2026-07-16 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일:
--   1) user_table에 member_token(초대 토큰)·member_auth_id(회원 auth 연결) 추가.
--   2) auth_member_id() = 회원 세션 → 내 user_table.id (trainer 세션엔 NULL).
--   3) 회원 SELECT 정책을 user_table/daily_workout_log/inbody_log에 '가산'(기존 트레이너 정책과 OR).
-- ★ 안 하는 일: 회원 INSERT/UPDATE/DELETE 없음(v1=열람 전용). 트레이너 정책 무변경.
-- ★ 격리 원리: 회원 auth 유저는 trainer 행이 없어 auth_account_id()/auth_is_owner()=NULL
--   → 트레이너·account 스코프 정책 전부 거짓 → 매출·급여·타회원·session_log·ot_log 원천 0행.
-- 멱등: add column if not exists / create or replace / drop policy if exists→create.
-- 롤백: 파일 하단 주석.
-- =============================================================================


-- ========== 1) user_table 컬럼 추가 (nullable · 트레이너가 S3에서 토큰 발급) =====
alter table user_table add column if not exists member_token   uuid;
alter table user_table add column if not exists member_auth_id uuid references auth.users(id) on delete set null;
--   ↑ on delete set null = 테스트계정 teardown(회원 auth 유저 삭제) 시 링크 자동 해제 → 재로그인 때 라우트가 재생성·재연결(정합성).

-- 토큰 조회·auth 매핑 인덱스(부분 유니크 = NULL 다수 허용, 값은 유일)
create unique index if not exists user_table_member_token_uidx
  on user_table (member_token) where member_token is not null;
create unique index if not exists user_table_member_auth_uidx
  on user_table (member_auth_id) where member_auth_id is not null;


-- ========== 2) auth_member_id() 헬퍼 (회원 세션 → 내 user_table.id) ============
-- SECURITY DEFINER = user_table RLS 우회해 안전 매핑(정책 재귀 방지). 트레이너 세션엔 매핑 없어 NULL.
create or replace function auth_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from user_table where member_auth_id = auth.uid()
$$;
grant execute on function auth_member_id() to authenticated;


-- ========== 3) 회원 SELECT 정책 (가산 · 기존 트레이너 정책과 OR로 공존) =========
-- Postgres 정책은 permissive라 같은 테이블/cmd/role에 여러 개면 OR.
--  · 트레이너 세션: 트레이너 정책 참 / 회원 정책 거짓(auth_member_id()=NULL → id=NULL).
--  · 회원 세션:     트레이너 정책 거짓(auth_account_id()=NULL) / 회원 정책은 내 행만 참.
-- → 서로의 접근을 넓히지 않음(각 세션은 자기 정책만 만족).

drop policy if exists "member_read_own_user" on user_table;
create policy "member_read_own_user"
  on user_table for select to authenticated
  using (id = auth_member_id());

drop policy if exists "member_read_own_daily_log" on daily_workout_log;
create policy "member_read_own_daily_log"
  on daily_workout_log for select to authenticated
  using (user_id = auth_member_id());

drop policy if exists "member_read_own_inbody" on inbody_log;
create policy "member_read_own_inbody"
  on inbody_log for select to authenticated
  using (user_id = auth_member_id());


-- =============================================================================
-- 검증 쿼리 (읽기 전용)
-- (A) 컬럼·인덱스 — 기대: member_token·member_auth_id 존재, 부분유니크 인덱스 2개.
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='user_table'
--     and column_name in ('member_token','member_auth_id');
--
-- (B) 정책 — 기대: 각 테이블에 member_read_* SELECT 정책 1개씩, qual에 auth_member_id().
-- select tablename, policyname, cmd, qual from pg_policies
--   where policyname like 'member\_%' order by tablename;
--
-- (C) ★격리 실증(라우트 완성 후, 회원 세션 JWT로) — 기대: 내 것만 / 트레이너것 0.
--     아래는 회원 access_token으로 로그인한 supabase 클라에서 실행(폰 콘솔 or 임시 스크립트):
--     - select count(*) from user_table;        -- 기대 1 (내 행)
--     - select count(*) from daily_workout_log;  -- 기대 = 내 일지 수
--     - select count(*) from inbody_log;         -- 기대 = 내 인바디 수
--     - select count(*) from session_log;        -- 기대 0 (트레이너 스코프)
--     - select count(*) from ot_log;             -- 기대 0
--     - select count(*) from trainer;            -- 기대 0
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "member_read_own_user"      on user_table;
-- drop policy if exists "member_read_own_daily_log" on daily_workout_log;
-- drop policy if exists "member_read_own_inbody"    on inbody_log;
-- drop function if exists auth_member_id();
-- drop index if exists user_table_member_token_uidx;
-- drop index if exists user_table_member_auth_uidx;
-- alter table user_table drop column if exists member_auth_id;
-- alter table user_table drop column if exists member_token;
-- =============================================================================
