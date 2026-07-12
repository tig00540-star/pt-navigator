-- 2026-07-12 trainer_profile — 트레이너 프로필(성향·강한방향·세일즈스타일·mbti·소개)
-- ★ 별도 테이블 이유: trainer에 컬럼 추가 + 본인 UPDATE 정책 = role/active 자기수정(권한상승) 위험.
--   프로필을 격리 테이블로 두어 trainer.role/active는 SQL/원장만 건드리게 유지.
-- strong_approaches = CLOSING_APPROACH_OPTS(pain/appearance/value/health/other) → closingApproachStats(측정)와 대조.
-- sales_style = SALES_INTENSITY_OPTS(soft/standard/strong). Supabase 대시보드 실행 완료 · 이 파일=git 기록본.
create table if not exists trainer_profile (
  trainer_id        uuid primary key references trainer(id) default auth.uid(),
  account_id        uuid not null default auth_account_id(),
  strong_approaches text[] null,
  sales_style       text null,
  mbti              text null,
  bio               text null,
  updated_at        timestamptz not null default now()
);
alter table trainer_profile enable row level security;
create policy trainer_profile_sel on trainer_profile for select
  using (account_id = auth_account_id());
create policy trainer_profile_ins on trainer_profile for insert
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
create policy trainer_profile_upd on trainer_profile for update
  using (account_id = auth_account_id() and trainer_id = auth.uid())
  with check (account_id = auth_account_id() and trainer_id = auth.uid());
-- 검증: select trainer_id, strong_approaches, sales_style, mbti from trainer_profile;
-- 롤백: drop table if exists trainer_profile;
