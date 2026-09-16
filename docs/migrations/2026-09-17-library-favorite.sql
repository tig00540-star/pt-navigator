-- =============================================================================
-- 트레이너 자료 즐겨찾기(favorite) — 1차 OT 운동 추천에 '내 자료' 우선 반영용.
-- 실행: Supabase SQL Editor(수동). 멱등. RLS 무변(기존 library_item 정책 그대로).
-- 미실행이어도 앱은 안전: 즐겨찾기 조회 실패 시 []로 폴백(비차단).
-- =============================================================================

alter table library_item add column if not exists favorite boolean not null default false;
-- 즐겨찾기만 빠르게 뽑는 부분 인덱스(트레이너별).
create index if not exists library_item_fav_idx on library_item(trainer_id) where favorite;

-- =============================================================================
-- 검증: select id, title, favorite from library_item where favorite;
-- 롤백: alter table library_item drop column if exists favorite;
-- =============================================================================
