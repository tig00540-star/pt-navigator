-- =============================================================================
-- 오프보딩 하드닝 — RLS 헬퍼 2개에 active 반영 (비활성 트레이너 접근 차단)
-- 실행일: 2026-07-13 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일: auth_account_id()·auth_is_owner()가 active=true인 trainer만 인정.
--   비활성 트레이너 → auth_account_id()=NULL → account 스코프 정책 전부 거짓 → 접근 0(데이터 보존).
-- 전제: ⑦-b(auth_account_id)·⑦-c2a(auth_is_owner) 존재. 멱등: create or replace.
-- 사전확인: select id,role,active from trainer; (활성 필요한 사람이 active=false면 중단)
-- 롤백: 파일 하단 주석(and active 제거본으로 복원).
-- =============================================================================

create or replace function auth_account_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select account_id from trainer where id = auth.uid() and active
$$;

create or replace function auth_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from trainer where id = auth.uid() and role = 'owner' and active)
$$;

-- =============================================================================
-- 검증: 활성 트레이너 로그인 → 회원목록·탭 정상(회귀 없음).
--       (실증) 2번째 트레이너 active=false로 내리고 그 계정 로그인 → 회원목록 빈칸/접근 불가.
-- -----------------------------------------------------------------------------
-- ROLLBACK (and active 제거):
-- create or replace function auth_account_id() returns uuid language sql stable security definer
--   set search_path = public as $$ select account_id from trainer where id = auth.uid() $$;
-- create or replace function auth_is_owner() returns boolean language sql stable security definer
--   set search_path = public as $$ select exists (select 1 from trainer where id = auth.uid() and role='owner') $$;
-- =============================================================================
