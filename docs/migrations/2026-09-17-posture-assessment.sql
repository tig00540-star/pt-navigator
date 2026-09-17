-- =============================================================================
-- ④ 체형평가 — posture_assessment 테이블 신설 (OT 신규 회원 세일즈 도구 · inbody_log 미러)
-- 실행: Supabase SQL Editor(수동). 멱등. RLS = 계정 스코프 for all(inbody_log 동일 수준).
-- 소견은 jsonb(findings)로 유연 저장: {forward_head:"mild", round_shoulder:"moderate", ...}.
-- 미실행이어도 앱 안전: 조회/저장 실패 시 안내(비차단).
-- =============================================================================

create table if not exists posture_assessment (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  account_id   uuid not null default auth_account_id() references account(id),
  trainer_id   uuid default auth.uid() references trainer(id),                 -- 평가자(프로비넌스)
  user_id      uuid not null references user_table(id) on delete cascade,
  assessed_at  date not null default (now() at time zone 'Asia/Seoul')::date,  -- 평가일(KST)
  findings     jsonb not null default '{}'::jsonb,   -- 항목별 상태(normal/mild/moderate/severe)
  photos       jsonb not null default '{}'::jsonb,   -- {front,side,back} 스토리지 경로(member-photos 버킷 · 그리드 오버레이용)
  note         text                                   -- 메모(선택)
);
alter table posture_assessment enable row level security;
create index if not exists posture_assessment_user_idx on posture_assessment (user_id, assessed_at desc);

drop policy if exists "auth_all_posture_assessment" on posture_assessment;
create policy "auth_all_posture_assessment"
  on posture_assessment for all to authenticated
  using (account_id = auth_account_id())
  with check (account_id = auth_account_id());

-- =============================================================================
-- 검증: insert 후 select * from posture_assessment; → 본인 계정 것만.
-- 롤백:
--   drop policy if exists "auth_all_posture_assessment" on posture_assessment;
--   drop index if exists posture_assessment_user_idx;
--   drop table if exists posture_assessment;
-- =============================================================================
