-- =============================================================================
-- A. 가격 프리셋 뼈대 — pt_package 테이블 신설 (트레이너 본인 PT 가격 설정)
-- 실행일: 2026-07-10 · 실행: Supabase SQL Editor (수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   pt_package 신설 — 트레이너가 본인 PT 패키지(세션·기간·금액)를 프리셋으로 등록.
--   용도 = (1) 내 실적 탭 "내 PT 가격 설정" CRUD, (2) 1차 OT 개편(B)에서 AI에
--   "내 실제 패키지"를 주입 → AI 환각 가격 방지 · 구체 추천 프로그램 근거.
--   ⑦ 격리: account_id DEFAULT auth_account_id()+FK, trainer_id DEFAULT auth.uid()(소유자)+FK.
--   RLS = 7c2a 패턴(계정 스코프 + owner 전체 / trainer 본인만) · for all(편집·삭제 포함).
--
-- 결정 반영(핸드오프 §2 "확정 대기" 2건):
--   · 회당단가 = 컬럼 없음. sessions·price만 저장, 표시 때 price/sessions 계산(정합성 위험 0).
--   · 할인가 = list_price(정가) nullable 추가. NULL이면 단일가, 값 있으면 정가 취소선+할인율 표기.
--
-- 전제(⑦-b/c 완료): account/trainer · auth_account_id()·auth_is_owner() 헬퍼 · authenticated 로그인.
-- 신설이라 백필 불필요 — DEFAULT+NOT NULL+FK 처음부터(기존 행 0 = 안전).
-- 멱등: create table if not exists · create index if not exists · drop policy if exists→create.
-- 롤백: 파일 하단 주석. 실증: 앱 "내 PT 가격 설정" 1건 저장→목록 노출·회당단가 계산 확인.
-- 범위 밖: UI(가격설정 CRUD)·B(AI 주입) = 다음 블록(프론트/프롬프트).
-- =============================================================================


-- ========== 1) pt_package 테이블 ===========================================
create table if not exists pt_package (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  account_id     uuid not null default auth_account_id() references account(id),
  trainer_id     uuid not null default auth.uid()        references trainer(id), -- 이 가격표 소유 트레이너
  name           text not null,                                                 -- 패키지명 (예: "3개월 집중")
  sessions       integer check (sessions is null or sessions > 0),              -- 세션 수 (NULL=기간제/무제한 허용)
  duration_label text,                                                          -- 기간 표기(자유텍스트: "3개월·주2회")
  price          integer not null check (price >= 0),                           -- 실판매가(원)
  list_price     integer check (list_price is null or list_price >= 0),         -- 정가(원·선택) — 있으면 취소선+할인율
  note           text,                                                          -- 대상·설명(선택)
  sort           integer not null default 0,                                    -- 표시 순서(오름차순)
  active         boolean not null default true                                  -- 노출 여부
);
alter table pt_package enable row level security;   -- 신설 테이블은 명시적으로 켜야 anon 차단

-- 트레이너별·노출·순서 로딩 인덱스 ("내 활성 패키지 순서대로")
create index if not exists pt_package_trainer_sort_idx on pt_package (trainer_id, active, sort);


-- ========== 2) RLS — 7c2a 패턴(계정 스코프 + owner 전체 / trainer 본인) =======
-- for all = SELECT/INSERT/UPDATE/DELETE 한 정책으로. INSERT는 with_check만 적용.
-- trainer_id DEFAULT auth.uid() → 트레이너 insert 시 본인 소유로 도장, with_check 통과.
-- owner는 계정 내 트레이너 것 전체 조회·편집 가능(센터공통 관리 확장 여지).
drop policy if exists "auth_all_pt_package" on pt_package;
create policy "auth_all_pt_package"
  on pt_package for all to authenticated
  using      (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()))
  with check (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));


-- =============================================================================
-- 검증 쿼리 (읽기 전용) — 실행 후 확인
-- (A) 컬럼 — 기대: 11컬럼
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_schema='public' and table_name='pt_package' order by ordinal_position;
-- (B) RLS on + 정책 — 기대: relrowsecurity=t · auth_all_pt_package 1행(cmd=ALL)
-- select relrowsecurity from pg_class where relname='pt_package';
-- select policyname, cmd, qual, with_check from pg_policies where tablename='pt_package';
-- (C) 회당단가는 저장 안 함 확인 — per_session/price_per 컬럼 없어야 정상(계산 표시).
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "auth_all_pt_package" on pt_package;
-- drop index  if exists pt_package_trainer_sort_idx;
-- drop table  if exists pt_package;
-- =============================================================================
