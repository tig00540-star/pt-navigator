-- =============================================================================
-- 수업일지 회원 확인·서명 — workout_log_confirmation(append-only) + member_workout_log 뷰 확장
-- 실행일: 2026-07-21 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
-- 근거: docs/v2-스펙-수업일지-회원확인서명.md (v2.1 확정본)
--
-- ★ 하는 일:
--   1) workout_log_confirmation — 회원이 자기 수업일지(daily_workout_log)를 '확인/이의'한 감사 레코드.
--      append-only(위·변조 없는 증거) · 회원 쓰기 전례 cardio_log와 결 동일. 종이 수업확인 서명 대체.
--   2) member_workout_log 뷰에 확인 상태(confirmed_at, confirm_result)를 append.
--
-- ⚠️ 실행 순서(스펙 §7):
--   ① 이 파일의 뷰 블록(§2)을 ★먼저 dry-run — create-or-replace가 라이브에서 통과하는지.
--      단, 뷰가 workout_log_confirmation을 참조하므로 테이블(§1)을 먼저 만들어야 한다.
--      → 실제 순서: 테이블+RLS(§1) 실행 → 뷰(§2) 실행 → pg_get_viewdef로 확인.
--   ② 뷰가 안 바뀌면(에러) drop view → create view → grant → revoke 4문 세트(하단 대안 참조).
--      ※ create-or-replace는 '출력 컬럼 이름·순서·타입 유지 + 뒤에만 추가'면 FROM/JOIN을 바꿔도 통과한다
--        (PG 문서 · 검증됨). 기존 5컬럼 그대로 두고 2개만 뒤에 붙이므로 통과 예상.
--
-- 전제(라이브 확인됨): auth_member_id() · auth_account_id() 헬퍼 · user_table.account_id ·
--   daily_workout_log(id·user_id·ai_summary·session_at·sets_structured·voided·source) ·
--   member_workout_log 뷰(현재 5컬럼: id·created_at·ai_summary·session_at·sets_structured).
-- 멱등: create table if not exists / create index if not exists / drop policy → create / create or replace view.
-- anon-open(using(true)) 금지 — 아래 정책은 전부 인증·스코프 한정.
-- 롤백: 파일 하단.
-- =============================================================================


-- ========== 1) workout_log_confirmation — 확인/이의 감사 레코드 =================

create table if not exists workout_log_confirmation (
  id             uuid primary key default gen_random_uuid(),
  log_id         uuid not null references daily_workout_log(id) on delete cascade,
  member_id      uuid not null,                                 -- = user_table.id (확인한 회원)
  result         text not null check (result in ('confirm','dispute')),
  method         text not null default 'tap' check (method in ('tap','drawn')),  -- drawn은 스키마만·구현 후속
  signature_path text,                                          -- drawn 전용(이번엔 항상 null)
  content_hash   text,                                          -- 확인 시점 일지 내용 동결 해시(서버 계산 · confirm/dispute 둘 다)
  dispute_note   text,                                          -- result='dispute'일 때 사유
  confirmed_at   timestamptz not null default now()             -- ★서버 시각(권위)
);
-- ★수집 안 함: IP·User-Agent 등. 증거는 confirmed_at + content_hash + member_id(JWT 검증)로 성립.
--   IP는 개인정보(처리방침·파기 부담), UA는 위조 쉬워 저장 이유 약함. 필요해지면 컬럼 추가는 쉽다.

-- 확인(confirm)은 일지당 1건만(재확인 방지). 이의(dispute)는 다건 허용 → 트레이너 정정 후 재확인 여지.
create unique index if not exists workout_log_confirm_once
  on workout_log_confirmation (log_id) where result = 'confirm';
create index if not exists workout_log_confirmation_member_idx
  on workout_log_confirmation (member_id);

alter table workout_log_confirmation enable row level security;

-- 회원: 본인 것만 SELECT(상태 표시용). ★쓰기 정책 없음 = 회원 직접 insert/update/delete 불가.
--   쓰기는 서버 라우트(/api/member-confirm)가 service_role로만 한다(§3). anon 차단(RLS-on + 정책 없음).
drop policy if exists "member_read_own_confirm" on workout_log_confirmation;
create policy "member_read_own_confirm" on workout_log_confirmation
  for select to authenticated
  using (member_id = auth_member_id());

-- 트레이너: 자기 account 회원의 확인만 SELECT(급여·분쟁 조회·해시 대조용).
drop policy if exists "trainer_read_account_confirm" on workout_log_confirmation;
create policy "trainer_read_account_confirm" on workout_log_confirmation
  for select to authenticated
  using (exists (
    select 1 from daily_workout_log d
    join user_table u on u.id = d.user_id
    where d.id = workout_log_confirmation.log_id
      and u.account_id = auth_account_id()
  ));


-- ========== 2) member_workout_log 뷰 확장 (확인 상태 append) ===================
-- ⚠️ 기존 5컬럼(id·created_at·ai_summary·session_at·sets_structured)의 이름·순서·타입 불변.
--    confirmed_at·confirm_result만 뒤에 추가 → create-or-replace 통과 + 권한 보존.
--    기존 소비처(운동달력·종목별 그래프·수업일지)는 추가 컬럼을 무시하므로 영향 없음.
--
-- ★집계(agg) 방식 — order by confirmed_at desc limit 1 을 쓰지 않는 이유:
--   확인/이의는 append-only라 한 일지에 여러 레코드가 쌓인다(예: 이의 → 트레이너 정정 → 확인).
--   'desc limit 1'(최신 1건)이면 확정(confirm) 후에 들어온 이의(dispute)가 최신이 되어
--   ★이미 확정된 일지를 '이의'로 뒤집는다(증거 훼손). 그래서 상태별로 집계한다:
--     - confirmed_at   = max(confirmed_at) filter (result='confirm')  → 확정 시각(있으면 확정)
--     - confirm_result = confirm이 하나라도 있으면 'confirm'(우선) · 없고 dispute 있으면 'dispute' · 둘 다 없으면 null
--   즉 한 번 confirm되면 이후 dispute가 와도 'confirm'을 유지(확정 우선). 게이트/트레이너 표시가 이 값을 본다.

create or replace view member_workout_log
  with (security_invoker = false) as
  select d.id, d.created_at, d.ai_summary, d.session_at, d.sets_structured,
         max(c.confirmed_at) filter (where c.result = 'confirm') as confirmed_at,
         case
           when bool_or(c.result = 'confirm') then 'confirm'
           when bool_or(c.result = 'dispute') then 'dispute'
           else null
         end as confirm_result                                        -- 'confirm'(우선) | 'dispute' | null
  from daily_workout_log d
  left join workout_log_confirmation c on c.log_id = d.id
  where d.user_id = auth_member_id()
    and coalesce(d.voided, false) = false
    and coalesce(d.source, '') <> 'noshow'
  group by d.id, d.created_at, d.ai_summary, d.session_at, d.sets_structured;

grant select on member_workout_log to authenticated;
revoke select on member_workout_log from anon;


-- =============================================================================
-- 검증 (읽기 전용)
--
--   (A) ★뷰 dry-run — 5컬럼 유지 + 2컬럼 추가 확인(첫 관문):
--       select pg_get_viewdef('member_workout_log'::regclass, true);
--       → id·created_at·ai_summary·session_at·sets_structured 순서 그대로 +
--         confirmed_at·confirm_result 가 뒤에. lateral join·voided·noshow 필터 보임.
--
--   (B) 정책 3개:
--       select polname, polcmd from pg_policy where polrelid='workout_log_confirmation'::regclass;
--       → member_read_own_confirm(r) · trainer_read_account_confirm(r). (2행 · 쓰기 정책 없음이 정상)
--       ※ 회원 직접 insert 차단 확인: 회원 세션 REST POST /rest/v1/workout_log_confirmation → 0행/거부.
--
--   (C) 회원 세션(access_token): GET /rest/v1/member_workout_log?select=id,confirmed_at,confirm_result
--       → 미확인=(null, null) · 확정=(시각, 'confirm') · 이의만=(null, 'dispute'). sets_structured 보존.
--       ★확정 후 이의가 와도 confirm_result는 'confirm' 유지(확정 우선 · desc-limit-1 뒤집힘 방지).
--
--   (D) 기존 화면 회귀: 회원앱 운동 달력·종목별 무게 그래프가 그대로 뜨는지(뷰 확장이 기존 소비 안 깼는지).
--
-- 롤백:
--   -- 뷰를 확인 append 전(2026-07-20-member-log-view-fix)으로 원복 — 컬럼 축소라 drop 필요:
--   drop view if exists member_workout_log;
--   create view member_workout_log with (security_invoker = false) as
--     select id, created_at, ai_summary, session_at, sets_structured
--     from daily_workout_log
--     where user_id = auth_member_id()
--       and coalesce(voided, false) = false
--       and coalesce(source, '') <> 'noshow';
--   grant select on member_workout_log to authenticated;
--   revoke select on member_workout_log from anon;   -- drop 시 권한 소멸 → 재부여 필수
--   -- 테이블:
--   drop policy if exists "trainer_read_account_confirm" on workout_log_confirmation;
--   drop policy if exists "member_read_own_confirm" on workout_log_confirmation;
--   drop table if exists workout_log_confirmation;
-- =============================================================================
