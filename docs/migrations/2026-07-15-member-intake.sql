-- 2026-07-15 member-intake — OT 사전 문진 항목을 user_table에 추가(nullable text). RLS 무변경.
alter table user_table add column if not exists goal_deadline   text;
alter table user_table add column if not exists training_pace    text;
alter table user_table add column if not exists injury_history   text;
alter table user_table add column if not exists exercise_level   text;
alter table user_table add column if not exists quit_reason      text;
alter table user_table add column if not exists past_exercise    text;
alter table user_table add column if not exists availability     text;
alter table user_table add column if not exists activity_level   text;
alter table user_table add column if not exists member_note      text;
