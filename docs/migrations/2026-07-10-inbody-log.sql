-- =============================================================================
-- ③-a 인바디 수기기록 — inbody_log 테이블 신설 (2주마다·선택적·추이)
-- 실행일: 2026-07-10 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   inbody_log 신설 — 회원 인바디 측정치 수기 기록(추이용).
--   측정일 + 체중·골격근량·체지방량·체지방률·기초대사량·내장지방레벨 + 메모.
--   ⑦ 격리 그대로: account_id DEFAULT auth_account_id()+FK, trainer_id DEFAULT auth.uid()(측정자).
--   RLS = 계정 스코프 for all(daily_workout_log 수준 · UPDATE/DELETE 포함 = 오기입 수정·삭제).
--
-- 전제(⑦-b/c 완료): account/trainer · auth_account_id() 헬퍼 · authenticated 로그인.
-- 신설이라 백필 불필요 — DEFAULT+NOT NULL+FK 처음부터(기존 행 0 = 안전).
-- 멱등: create table if not exists · create index if not exists · drop policy if exists→create.
-- 롤백: 파일 하단 주석. 실증: 앱 인바디 탭 1건 저장→목록/추이 노출 확인.
-- 범위 밖: UI(PtInbodyTab)·추이 그래프 = 다음 블록(프론트). 인바디 자동연동 = v3.
-- =============================================================================


-- ========== 1) inbody_log 테이블 ============================================
create table if not exists inbody_log (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  account_id         uuid not null default auth_account_id() references account(id),
  trainer_id         uuid default auth.uid() references trainer(id),                -- 측정 입력자(프로비넌스)
  user_id            uuid not null references user_table(id) on delete cascade,
  measured_at        date not null default (now() at time zone 'Asia/Seoul')::date, -- 측정일(KST)
  weight             numeric(5,1),   -- 체중(kg)
  skeletal_muscle    numeric(5,1),   -- 골격근량(kg · SMM)
  body_fat_mass      numeric(5,1),   -- 체지방량(kg)
  body_fat_pct       numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 100)), -- 체지방률(%)
  bmr                integer      check (bmr is null or bmr >= 0),                  -- 기초대사량(kcal)
  visceral_fat_level integer      check (visceral_fat_level is null or visceral_fat_level >= 0), -- 내장지방레벨
  note               text            -- 메모(선택)
);
alter table inbody_log enable row level security;   -- 신설 테이블은 명시적으로 켜야 anon 차단

-- 추이 조회 인덱스 (회원별·측정일순)
create index if not exists inbody_log_user_measured_idx on inbody_log (user_id, measured_at);


-- ========== 2) RLS — 계정 스코프 (daily_workout_log 동일 수준) ===============
drop policy if exists "auth_all_inbody_log" on inbody_log;
create policy "auth_all_inbody_log"
  on inbody_log for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id());


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- (A) 컬럼 — 기대: 13컬럼
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='inbody_log' order by ordinal_position;
-- (B) RLS on + 정책 — 기대: relrowsecurity=t · auth_all_inbody_log 1행(cmd=ALL)
-- select relrowsecurity from pg_class where relname='inbody_log';
-- select policyname, cmd, qual, with_check from pg_policies where tablename='inbody_log';
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "auth_all_inbody_log" on inbody_log;
-- drop index if exists inbody_log_user_measured_idx;
-- drop table if exists inbody_log;
-- =============================================================================
