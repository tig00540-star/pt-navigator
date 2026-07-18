-- 2026-07-18 center_machine.cues — 머신별 실행 큐(트레이너 정본). text[] · nullable.
-- 컬럼 추가만 · 정책 무변경(기존 center_machine RLS: 대표 쓰기/계정 열람 그대로). 멱등.
alter table center_machine add column if not exists cues text[];
-- 롤백: alter table center_machine drop column if exists cues;
