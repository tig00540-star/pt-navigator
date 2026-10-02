-- 2026-10-02 세일즈북 '신규 등록 혜택' 장 — 트레이너별 설정(켜기 여부 + 혜택 문구 목록).
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. additive · nullable.
-- ⚠️ 새 RLS 정책 불필요 — trainer_profile의 기존 account-스코프 + 본인(trainer_id = auth.uid()) 정책이 컬럼까지 커버.
alter table trainer_profile
  add column if not exists salesbook_benefits jsonb;  -- { "enabled": bool, "items": [text] }

-- 검증(읽기 전용):
--   select column_name, data_type from information_schema.columns
--     where table_name = 'trainer_profile' and column_name = 'salesbook_benefits';  -- 1행 · jsonb
-- 롤백: alter table trainer_profile drop column if exists salesbook_benefits;
