-- 회원 성별. nullable(기존 회원 소급 없음) · 값 도메인 고정.
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 컬럼 add만(RLS 불변).
-- ⚠️ 기존 회원 = null → 프롬프트 g(m.gender)가 "없음" 처리(자동 흡수).
alter table public.user_table
  add column if not exists gender text
  check (gender in ('male','female')); -- null 허용(미입력) · 그 외 값 거부

-- 검증(읽기 전용):
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_name='user_table' and column_name='gender';  -- 1행 · nullable=YES
-- 롤백: alter table public.user_table drop column if exists gender;
