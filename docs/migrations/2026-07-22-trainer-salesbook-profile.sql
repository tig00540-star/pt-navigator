-- 트레이너 프로필 확장 — 세일즈북 표지·서명 재료(S4). 전부 nullable · additive.
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본.
-- ⚠️ 새 RLS 정책 불필요 — trainer_profile의 기존 account-스코프 row 정책이 컬럼까지 커버.
--    새로 open하는 것 없음(anon-open 금지 규율 위반 아님). 컬럼만 추가.
alter table trainer_profile
  add column if not exists signature_data_url text,  -- 서명 PNG data URL(작게 · SalesbookView 마무리 슬라이드)
  add column if not exists display_name text,         -- 표지 표시 이름(예: "김도현 트레이너")
  add column if not exists credentials text;           -- 표지 자격/경력 한 줄(예: "생활체육지도사 · 교정운동 전문 · 8년차")

-- 검증(읽기 전용):
--   select column_name, is_nullable from information_schema.columns
--     where table_name='trainer_profile' and column_name in ('signature_data_url','display_name','credentials');  -- 3행 · 전부 YES
--   select polname, polcmd from pg_policy where polrelid='trainer_profile'::regclass;  -- 기존 정책 그대로(신규 0)
-- 롤백: alter table trainer_profile drop column if exists signature_data_url, drop column if exists display_name, drop column if exists credentials;
