-- =============================================================================
-- 기능1 공지 A — announcement + announcement_read 테이블 신설 (원장→트레이너 앱내 공지)
-- 실행일: 2026-07-12 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
-- 스펙: docs/v2-공지-스펙-필수확인.md §2.
--
-- ★ 이 파일이 하는 일:
--   announcement 신설 — 원장이 쓰는 공지(제목·본문·대상·강도·핀). 원장→트레이너 단방향.
--     must_ack=true 필수확인(앱 열 때 게이트 모달) · false 일반(헤더 벨 배지만). 기본 일반.
--     target_trainer_ids uuid[] — null/빈배열=계정 전체 트레이너, 값 있으면 그 트레이너만(조인 테이블 없이 = any()).
--   announcement_read 신설 — 공지×트레이너 1행(읽음 기록). 게이트 판정·안읽음 배지·원장 "N/M 읽음"의 단일 근거.
--     localStorage 안 씀 — 기기 넘어 정확해야 하므로 서버 기록. unique(announcement_id, trainer_id)로 중복 무해.
--   ⑦ 격리 + 스코프: account_id DEFAULT auth_account_id()+FK. announcement.author_id / announcement_read.trainer_id
--     DEFAULT auth.uid()+FK. 쓰기=원장만(auth_is_owner()) · 읽음기록=본인만 · 열람=대상자+원장.
--
-- ⚠️ 실행 전 확인(스펙 §2-3):
--   · auth_is_owner() 헬퍼가 실재하는지(총정리 §1.3 · ⑦-c 추가분) — 로그인 세션에서 `select auth_is_owner();` 로 확인.
--     없으면 이 SQL 멈추고 문의(ann_write·ann_select·annread_select가 이 함수에 의존).
--   · auth_account_id() 헬퍼·account/trainer 테이블·authenticated 로그인·trainer.id=auth.users.id 전제(⑦-b/c 완료).
--
-- 신설이라 백필 불필요 — DEFAULT+NOT NULL+FK 처음부터(기존 행 0 = 안전). 기존 테이블·컬럼 무변경 = 회귀 격리.
-- 멱등: create table if not exists · create index if not exists · drop policy if exists→create.
-- 롤백: 파일 하단 주석. 실증: 원장 insert→.select() 1행 + 다른 트레이너로 '지정' 공지 select 0행(타겟 필터).
-- 범위 밖: lib 순수함수(announce.js)·원장 작성 UI·트레이너 게이트/벨 = 서브커밋 B~D(프론트).
-- =============================================================================


-- ========== 1) announcement 테이블 — 공지(원장 작성) =========================
create table if not exists announcement (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null default auth_account_id() references account(id),
  author_id          uuid not null default auth.uid()       references trainer(id),   -- 작성자(원장)
  title              text not null,
  body               text not null,
  target_trainer_ids uuid[],                                                          -- null/빈배열=계정 전체, 값 있으면 그 트레이너만
  must_ack           boolean not null default false,                                  -- ★ true=필수확인(게이트) · false=일반(벨만). 기본 일반.
  pinned             boolean not null default false,                                  -- 고정(목록·벨·게이트 상단)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table announcement enable row level security;   -- 신설 테이블은 명시적으로 켜야 anon 차단

-- 조회 인덱스: 계정 스코프 + 최신순(목록·벨 기본 정렬)
create index if not exists announcement_account_idx on announcement (account_id, created_at desc);


-- ========== 2) announcement_read 테이블 — 읽음(트레이너별 확인) ==============
create table if not exists announcement_read (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcement(id) on delete cascade,        -- 공지 삭제 시 읽음도 정리
  account_id      uuid not null default auth_account_id() references account(id),
  trainer_id      uuid not null default auth.uid()       references trainer(id),
  read_at         timestamptz not null default now(),
  unique (announcement_id, trainer_id)                                                -- 한 트레이너 한 공지 1행(중복 확인 무해)
);
alter table announcement_read enable row level security;

-- 조회 인덱스: 공지별 집계(N/M 읽음) + 트레이너별 내 읽음
create index if not exists announcement_read_by_ann     on announcement_read (announcement_id);
create index if not exists announcement_read_by_trainer on announcement_read (trainer_id);


-- ========== 3) RLS — 쓰기는 원장, 읽음은 본인, 열람은 대상자+원장 ============
-- announcement 조회: 같은 계정 AND (전체공지 OR 내가 대상 OR 원장).
--   원장은 관리 위해 전체 열람(게이트는 클라 순수함수가 '내 대상'만 다시 거른다 = 스펙 §3).
drop policy if exists "ann_select" on announcement;
create policy "ann_select"
  on announcement for select to authenticated
  using (
    account_id = auth_account_id()
    and (target_trainer_ids is null or auth.uid() = any(target_trainer_ids) or auth_is_owner())
  );

-- announcement 쓰기(insert/update/delete): 원장만.
--   ⚠️ for all은 select도 포함 → ann_select와 OR로 평가(원장은 어차피 전체 열람 · 트레이너는 using false라 select엔 ann_select만).
drop policy if exists "ann_write" on announcement;
create policy "ann_write"
  on announcement for all to authenticated
  using      (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());

-- announcement_read 기록(insert): 본인 것만(남 대신 읽음 처리 불가).
drop policy if exists "annread_insert" on announcement_read;
create policy "annread_insert"
  on announcement_read for insert to authenticated
  with check (account_id = auth_account_id() and trainer_id = auth.uid());

-- announcement_read 조회: 본인 읽음 OR 원장(누가 읽었나 현황).
drop policy if exists "annread_select" on announcement_read;
create policy "annread_select"
  on announcement_read for select to authenticated
  using (account_id = auth_account_id() and (trainer_id = auth.uid() or auth_is_owner()));
-- update/delete 정책 없음 = 읽음은 append-only(되돌릴 일 없음). '안읽음으로' 필요해지면 그때 추가.


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- (A) 테이블·RLS on — 기대: 두 테이블 relrowsecurity=t
-- select relname, relrowsecurity from pg_class where relname in ('announcement','announcement_read');
-- (B) 정책 — 기대: ann_select(SELECT)·ann_write(ALL)·annread_insert(INSERT)·annread_select(SELECT) 총 4행
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('announcement','announcement_read') order by tablename, policyname;
-- (C) 원장 왕복(로그인 세션·앱 권장) — insert가 default로 소유필드 채우고 with_check 통과하는지:
--   insert into announcement (title, body) values ('테스트','본문') returning id, account_id, author_id;  -- 1행이면 default·check 정상
--   insert into announcement_read (announcement_id) values ('<위 id>') returning id, trainer_id;         -- 본인 읽음 1행
--   delete from announcement where title='테스트';  -- cascade로 읽음도 삭제
-- (D) 타겟 필터: 다른 트레이너 계정으로 '특정 지정' 공지 select → 0행(대상 아니면 안 보임).
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "annread_select" on announcement_read;
-- drop policy if exists "annread_insert" on announcement_read;
-- drop policy if exists "ann_write" on announcement;
-- drop policy if exists "ann_select" on announcement;
-- drop index if exists announcement_read_by_trainer;
-- drop index if exists announcement_read_by_ann;
-- drop index if exists announcement_account_idx;
-- drop table if exists announcement_read;   -- 먼저(announcement FK 참조)
-- drop table if exists announcement;
-- =============================================================================
