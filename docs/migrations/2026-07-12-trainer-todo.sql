-- =============================================================================
-- 기능2 할일 A — trainer_todo 테이블 신설 (트레이너 개인 수동 할일)
-- 실행일: 2026-07-12 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
-- 스펙: docs/v2-할일-스펙-통합액션.md §2.
--
-- ★ 이 파일이 하는 일:
--   trainer_todo 신설 — 트레이너가 직접 적는 자유 할일(체크박스).
--   body + done + (선택)due_date + (선택)member_id 연결. 자동 할일은 파생이라 테이블 없음(이건 수동만).
--   ⑦ 격리 + 개인 스코프: account_id DEFAULT auth_account_id()+FK, trainer_id DEFAULT auth.uid()+FK(소유자).
--   ★ RLS = trainer 스코프 for all(본인 것만 · UPDATE/DELETE 포함 = 토글·삭제). 프로젝트 최초 trainer_id 스코프 테이블.
--
-- 전제(⑦-b/c 완료): account/trainer · auth_account_id() 헬퍼 · authenticated 로그인 · trainer.id=auth.users.id.
-- 신설이라 백필 불필요 — DEFAULT+NOT NULL+FK 처음부터(기존 행 0 = 안전).
-- 멱등: create table if not exists · create index if not exists · drop policy if exists→create.
-- 롤백: 파일 하단 주석. 실증: 앱 할일 탭에서 1건 추가→체크(토글)→삭제 왕복 + 새로고침 유지.
-- 범위 밖: UI(TodoTab)·lib 순수함수·탭 배치 = 서브커밋 B~D(프론트).
-- =============================================================================


-- ========== 1) trainer_todo 테이블 ==========================================
create table if not exists trainer_todo (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth_account_id() references account(id),
  trainer_id  uuid not null default auth.uid()       references trainer(id),        -- 소유자(로그인 트레이너)
  body        text not null,
  done        boolean not null default false,
  due_date    date,                                                                 -- 선택: 마감일
  member_id   uuid references user_table(id) on delete set null,                    -- 선택: 회원 연결(삭제 시 링크만 해제)
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
alter table trainer_todo enable row level security;   -- 신설 테이블은 명시적으로 켜야 anon 차단

-- 조회 인덱스: 소유 스코프 + 미완료 부분인덱스(할일 탭 기본 = 미완료 우선)
create index if not exists trainer_todo_owner_idx on trainer_todo (account_id, trainer_id);
create index if not exists trainer_todo_open_idx  on trainer_todo (trainer_id) where done = false;


-- ========== 2) RLS — trainer 개인 스코프 (본인 것만 전권) =====================
-- 개인 메모라 읽기·쓰기 축 동일(account + 본인). UPDATE/DELETE 정책 없으면 토글·삭제가 조용히 실패(트러블슈팅).
drop policy if exists "auth_all_trainer_todo" on trainer_todo;
create policy "auth_all_trainer_todo"
  on trainer_todo for all to authenticated
  using      (account_id = auth_account_id() and trainer_id = auth.uid())
  with check (account_id = auth_account_id() and trainer_id = auth.uid());


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- (A) 컬럼 — 기대: 9컬럼
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_schema='public' and table_name='trainer_todo' order by ordinal_position;
-- (B) RLS on + 정책 — 기대: relrowsecurity=t · auth_all_trainer_todo 1행(cmd=ALL)
-- select relrowsecurity from pg_class where relname='trainer_todo';
-- select policyname, cmd, qual, with_check from pg_policies where tablename='trainer_todo';
-- (C) 왕복 실증(로그인 세션·앱에서 권장) — insert가 default로 소유필드 채우고 with_check 통과하는지:
--   insert into trainer_todo (body) values ('테스트 할일') returning id, account_id, trainer_id;
--   → 1행 반환(account_id·trainer_id 자동 채워짐)이면 정상. 확인 후:
--   delete from trainer_todo where body = '테스트 할일';
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "auth_all_trainer_todo" on trainer_todo;
-- drop index if exists trainer_todo_open_idx;
-- drop index if exists trainer_todo_owner_idx;
-- drop table if exists trainer_todo;
-- =============================================================================
