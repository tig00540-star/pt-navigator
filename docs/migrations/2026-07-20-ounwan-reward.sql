-- =============================================================================
-- 오운완 집계 RPC + trainer_reward — 스펙 §1.2 · §1.3
-- 실행일: 2026-07-20 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
-- 근거: docs/v2-스펙-오운완-출석뱃지랭킹-구현.md (RPC 개정판)
--
-- ★ 하는 일:
--   1) 오운완 집계 RPC 4개 — 정의를 SQL 한 곳(ounwan_days)에만 두어 회원/트레이너 드리프트 차단.
--      클라 파생(Object.keys(activityMap))은 ①limit 창에 갇혀 누적이 틀리고 감소 ②kind='pt' 포함 드리프트
--      ③랭킹 무필터 조회가 max-rows 1000에 조용히 잘림 — 셋 다 서버 집계로 해결.
--   2) trainer_reward — 트레이너별 포상 정의(누적 N회 → 보상). 신규 테이블은 이것 하나뿐.
--
-- 오운완 규칙(정본 · ounwan_days에만 구현): 한 회원의 한 날짜(KST)에 아래 중 하나라도 있으면 그날 1개(날짜 distinct).
--   (1) cardio_log.performed_on = 그날
--   (2) schedule_check.on_date = 그날 AND kind='personal'
--   (3) daily_workout_log.coalesce(session_at, created_at)(KST 변환) = 그날 AND voided=false AND source<>'noshow'
--       ※ coalesce는 클라 buildActivityMap의 `session_at ?? created_at`과 규칙을 맞추기 위한 것(드리프트 방지).
--
-- 전제: auth_member_id() · auth_account_id() · auth_is_owner() 헬퍼 · user_table(account_id·hidden·trainer_id).
-- 신규 헬퍼 2개: auth_member_account_id() · auth_member_trainer_id()
--   — 회원 포상 정책이 user_table 서브쿼리로는 동작 불가(회원에 해당 SELECT 정책 없음)라 추가. §2 하단 주석 참조.
-- 인덱스: cardio_log(user_id,performed_on) · schedule_check(user_id,on_date) · daily_workout_log(user_id,…) 존재 확인됨 → 추가 안 함.
-- 멱등: create or replace function / create table if not exists / drop policy if exists → create.
-- 롤백: 파일 하단.
-- =============================================================================


-- ========== 1) 오운완 집계 RPC =================================================

-- 내부 헬퍼: 한 회원의 오운완일(distinct date · KST). 규칙의 유일한 구현체.
create or replace function ounwan_days(p_user_id uuid)
returns setof date language sql stable security definer set search_path = public as $$
  select distinct d from (
    select performed_on as d from cardio_log where user_id = p_user_id
    union
    select on_date from schedule_check where user_id = p_user_id and kind = 'personal'
    union
    -- ★coalesce 필수: session_at은 nullable이라 그냥 쓰면 null 행이 `where d is not null`로 탈락해
    --   그날이 오운완에 안 잡힌다. 반면 회원 달력(buildActivityMap)은 `session_at ?? created_at`로
    --   폴백해 '표시는 된다' → 표시/집계 드리프트. 아래 coalesce가 클라와 동일 규칙을 만들어 이를 막는다.
    --   ⚠️ 이 coalesce를 빼지 말 것(빼면 드리프트 재발).
    select (coalesce(session_at, created_at) at time zone 'Asia/Seoul')::date
      from daily_workout_log
      where user_id = p_user_id and coalesce(voided,false)=false and coalesce(source,'')<>'noshow'
  ) x where d is not null;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- ★★ 보안 경계 (anon-open 금지와 동급 · 절대 완화 금지) ★★
--   ounwan_days / ounwan_stats_for 는 SECURITY DEFINER = 밑 3테이블 RLS를 우회한다.
--   정확성이 오직 p_user_id 인자에만 달려 있음 → 이 함수에 grant execute를 붙이면
--   ★아무 회원이나 임의 user_id를 넣어 남의 운동 이력을 읽는다(회원 격리 붕괴).
--   ⛔ authenticated/anon 에 grant execute 절대 금지.
--      노출은 래퍼만: 회원=ounwan_stats()(auth_member_id 스코프) · 트레이너=ounwan_ranking()(auth_account_id 스코프).
-- ══════════════════════════════════════════════════════════════════════════
revoke all on function ounwan_days(uuid) from public, anon, authenticated;  -- 내부용 · ⛔grant 금지(RLS 우회)


-- 코어: 한 회원의 {total, month_count, streak}. ounwan_days 단일 소스.
create or replace function ounwan_stats_for(p_user_id uuid)
returns table(total int, month_count int, streak int)
language plpgsql stable security definer set search_path = public as $$
declare v_days date[]; v_today date := (now() at time zone 'Asia/Seoul')::date; v_cur date;
begin
  select coalesce(array_agg(d order by d), '{}'::date[]) into v_days from ounwan_days(p_user_id) d;
  total := coalesce(array_length(v_days,1), 0);
  select count(*) into month_count from unnest(v_days) d
    where to_char(d,'YYYY-MM') = to_char(v_today,'YYYY-MM');
  -- 연속일: 오늘 없으면 어제부터(오늘 아직이어도 어제까지 연속 유지). 없으면 0.
  streak := 0; v_cur := v_today;
  if not (v_cur = any(v_days)) then v_cur := v_today - 1; end if;
  while v_cur = any(v_days) loop streak := streak + 1; v_cur := v_cur - 1; end loop;
  return next;
end $$;
revoke all on function ounwan_stats_for(uuid) from public, anon, authenticated;  -- 내부용 · ⛔grant 금지(위 보안경계 — RLS 우회)


-- 회원 self: auth_member_id() 기준(본인만). ★회원에게 노출되는 유일한 통로.
create or replace function ounwan_stats()
returns table(total int, month_count int, streak int)
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth_member_id();
begin
  if v is null then return; end if;
  return query select * from ounwan_stats_for(v);
end $$;
grant execute on function ounwan_stats() to authenticated;


-- 트레이너 랭킹: auth_account_id() 회원 전체(서버 집계 → max-rows 무관 · 코어 재사용).
-- 회원 세션은 auth_account_id()가 null(트레이너 테이블 조회라) → 0행 = 회원 격리.
create or replace function ounwan_ranking()
returns table(user_id uuid, total int, month_count int, streak int)
language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid := auth_account_id(); r record; s record;
begin
  if v_acc is null then return; end if;
  for r in select u.id from user_table u where u.account_id = v_acc and coalesce(u.hidden,false)=false loop
    select * into s from ounwan_stats_for(r.id);
    user_id := r.id; total := s.total; month_count := s.month_count; streak := s.streak;
    return next;
  end loop;
end $$;
grant execute on function ounwan_ranking() to authenticated;


-- ========== 2) trainer_reward — 트레이너별 포상 정의 ============================

create table if not exists trainer_reward (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth_account_id() references account(id),
  trainer_id  uuid not null default auth.uid(),   -- FK 없음(appointment·trainer_goal 관례)
  milestone   int  not null,                      -- 오운완 누적 N회 달성 시
  reward_text text not null,
  active      boolean not null default true,
  created_at  timestamptz default now(),
  constraint trainer_reward_milestone_chk check (milestone > 0)
);
create index if not exists trainer_reward_acc_idx on trainer_reward (account_id, trainer_id);
alter table trainer_reward enable row level security;

-- 트레이너: account 격리 + 원장 전체 / 트레이너 본인 담당(appointment 결).
drop policy if exists "tr_reward_read" on trainer_reward;
create policy "tr_reward_read" on trainer_reward for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

drop policy if exists "tr_reward_insert" on trainer_reward;
create policy "tr_reward_insert" on trainer_reward for insert to authenticated
  with check (account_id = auth_account_id());

drop policy if exists "tr_reward_update" on trainer_reward;
create policy "tr_reward_update" on trainer_reward for update to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()))
  with check (account_id = auth_account_id());

drop policy if exists "tr_reward_delete" on trainer_reward;
create policy "tr_reward_delete" on trainer_reward for delete to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

-- ── 회원 스코프 헬퍼 (auth_member_id() 패턴 동일 · RLS 우회해 '내 행'의 값만 반환) ──
-- ★왜 필요한가: 정책 안 서브쿼리는 '호출자 권한'으로 실행돼 대상 테이블 RLS를 그대로 탄다.
--   그런데 회원은 user_table에 SELECT 정책이 없다 — 2026-07-16-member-auth-rls.sql이 만든
--   "member_read_own_user"를 2026-07-16-member-views.sql이 뷰로 대체하며 drop했다.
--   → `exists (select 1 from user_table ...)` 형태는 회원 세션에서 항상 0행 = 정책 영구 false
--     (회원앱 포상 블록이 절대 안 뜬다). 그래서 SECURITY DEFINER 헬퍼로 값을 꺼내 직접 비교한다.
-- 안전성: 반환은 '호출자 본인 행'의 컬럼 하나뿐(임의 조회 불가). 트레이너 세션은 member_auth_id가
--   안 잡혀 null → 아래 정책의 account_id 비교가 null이 되어 거짓 = 트레이너 접근을 넓히지 않음.
create or replace function auth_member_account_id()
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from user_table where member_auth_id = auth.uid()
$$;
grant execute on function auth_member_account_id() to authenticated;

create or replace function auth_member_trainer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select trainer_id from user_table where member_auth_id = auth.uid()
$$;
grant execute on function auth_member_trainer_id() to authenticated;

-- 회원: 자기 트레이너의 활성 포상만 read(쓰기 없음).
-- solo(user_table.trainer_id null)면 계정 내 포상 전체 허용 — 트레이너 1인이라 포상이 안 보이는 문제 방지.
drop policy if exists "tr_reward_member_read" on trainer_reward;
create policy "tr_reward_member_read" on trainer_reward for select to authenticated
  using (
    active
    and account_id = auth_member_account_id()
    and (trainer_id = auth_member_trainer_id() or auth_member_trainer_id() is null)
  );


-- =============================================================================
-- 검증 (읽기 전용)
--
--   (A) ★보안 경계 — 내부 함수가 authenticated에 노출 안 됐는지(가장 중요):
--       select p.proname,
--              has_function_privilege('authenticated', p.oid, 'execute') as authenticated_실행가능
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname='public' and p.proname like 'ounwan%'
--        order by 1;
--       → 기대: ounwan_days = false · ounwan_stats_for = false
--               ounwan_stats = true  · ounwan_ranking  = true
--       ⛔ 앞 둘이 true면 즉시 revoke — 타 회원 이력 유출 경로다.
--
--   (B) session_at null 행이 오운완에 포함되는지(coalesce 동작 확인):
--       select count(*) filter (where session_at is null) as session_at_null, count(*) as 전체
--         from daily_workout_log;
--       → null이 있어도 coalesce(session_at, created_at)로 created_at 날짜에 잡히므로
--         달력(buildActivityMap의 `session_at ?? created_at`)과 값이 일치해야 한다. (E)에서 대조.
--
--   (C) 트레이너 세션: select * from ounwan_ranking();
--       → 내 account 회원 전체(hidden 제외) 각 1행. 타 account 회원 미포함.
--
--   (D) ★회원 세션(access_token · REST): POST /rest/v1/rpc/ounwan_stats
--       → 1행 {total, month_count, streak}. POST /rest/v1/rpc/ounwan_ranking → 0행(회원 격리).
--
--   (E) 정의 일치: 같은 회원의 (D) total == (C) 해당 행 total. 다르면 드리프트.
--
--   (F) trainer_reward 정책 5개:
--       select polname, polcmd from pg_policy where polrelid='trainer_reward'::regclass order by polname;
--       → tr_reward_read/insert/update/delete/member_read = 5행.
--
--   (G) ★회원 포상 read가 실제로 되는지(정책 서브쿼리 버그 회귀 확인):
--       트레이너 세션에서 포상 1건 추가 후, 회원 세션(access_token)으로
--       GET /rest/v1/trainer_reward?select=*   → 1행(내 트레이너의 active 포상).
--       0행이면 정책이 다시 영구 false — 헬퍼(auth_member_account_id/trainer_id) grant를 확인할 것.
--       ※ exists(select from user_table) 형태로 되돌리면 회원은 user_table SELECT 정책이 없어
--         (member-views가 drop) 항상 0행이 된다. ⚠️ 서브쿼리 형태로 되돌리지 말 것.
--
-- 롤백:
--   drop policy if exists "tr_reward_member_read" on trainer_reward;
--   drop policy if exists "tr_reward_delete" on trainer_reward;
--   drop policy if exists "tr_reward_update" on trainer_reward;
--   drop policy if exists "tr_reward_insert" on trainer_reward;
--   drop policy if exists "tr_reward_read" on trainer_reward;
--   drop table if exists trainer_reward;
--   drop function if exists auth_member_trainer_id();
--   drop function if exists auth_member_account_id();
--   drop function if exists ounwan_ranking();
--   drop function if exists ounwan_stats();
--   drop function if exists ounwan_stats_for(uuid);
--   drop function if exists ounwan_days(uuid);
-- =============================================================================
