-- =============================================================================
-- 회원 앱 S2 — 회원 열람용 안전 뷰 (§5 컬럼 누출 차단)
-- 실행일: 2026-07-16 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일:
--   1) S1의 raw 회원 SELECT 정책 3개 제거(원시 테이블에 회원 직접 접근 없앰).
--   2) 안전 컬럼만 담은 뷰 3개 생성(내부에서 auth_member_id()로 자기 행만).
--   3) authenticated에 뷰 SELECT 부여. (원시 테이블은 여전히 트레이너 스코프 → 회원=0행)
-- ★ 제외 컬럼(회원에 노출 금지): user_table.member_note·quit_reason·phone_number·member_token·member_auth_id 등,
--   daily_workout_log.raw_voice_text, inbody_log.note.
-- 전제: S1(auth_member_id() 헬퍼) 완료. 멱등: drop policy if exists / create or replace view.
-- 롤백: 파일 하단.
-- =============================================================================


-- ========== 1) S1 raw 회원 정책 제거 (뷰로 대체) ==============================
drop policy if exists "member_read_own_user"      on user_table;
drop policy if exists "member_read_own_daily_log" on daily_workout_log;
drop policy if exists "member_read_own_inbody"    on inbody_log;


-- ========== 2) 안전 뷰 3개 (security definer · 내부 auth_member_id() 스코프) ===
create or replace view member_me
  with (security_invoker = false) as
  select u.id, u.name, u.goal, u.goal_deadline, t.name as trainer_name
  from user_table u
  left join trainer t on t.id = u.trainer_id
  where u.id = auth_member_id();

create or replace view member_workout_log
  with (security_invoker = false) as
  select id, created_at, ai_summary
  from daily_workout_log
  where user_id = auth_member_id();

create or replace view member_inbody
  with (security_invoker = false) as
  select id, measured_at, weight, skeletal_muscle, body_fat_mass,
         body_fat_pct, bmr, visceral_fat_level
  from inbody_log
  where user_id = auth_member_id();


-- ========== 3) 뷰 SELECT 권한 (회원=authenticated만 · anon 차단) ==============
grant select on member_me, member_workout_log, member_inbody to authenticated;
-- anon(비로그인)엔 불필요 — 혹시 Supabase 기본권한으로 새 뷰에 anon select가 붙어도
-- auth_member_id()가 NULL이라 0행이지만, 명시적으로 회수해 표면 줄임.
revoke select on member_me, member_workout_log, member_inbody from anon;


-- =============================================================================
-- 검증
-- (A) 뷰 3개 생성 확인:
--   select table_name from information_schema.views
--     where table_schema='public' and table_name like 'member_%';
-- (B) ★회원 세션(S1 access_token)으로 (PowerShell REST):
--   - GET /rest/v1/member_me            → 1행(내 프로필, 안전컬럼만)
--   - GET /rest/v1/member_workout_log   → 내 일지(ai_summary 있고 raw_voice_text 없음)
--   - GET /rest/v1/member_inbody        → 내 인바디(note 없음)
--   - GET /rest/v1/user_table?select=member_note  → 0행 또는 컬럼 접근 불가(누출 없음 확인)
-- =============================================================================


-- =============================================================================
-- ROLLBACK (S1 raw 정책 복원 + 뷰 제거)
-- drop view if exists member_me;
-- drop view if exists member_workout_log;
-- drop view if exists member_inbody;
-- create policy "member_read_own_user"      on user_table       for select to authenticated using (id = auth_member_id());
-- create policy "member_read_own_daily_log" on daily_workout_log for select to authenticated using (user_id = auth_member_id());
-- create policy "member_read_own_inbody"    on inbody_log        for select to authenticated using (user_id = auth_member_id());
-- =============================================================================
