-- =============================================================================
-- 오류 점검 수정(2026-10-06) — 회원 페이지 접근 · 쓰기 조건 · 장부 권한 · 건강정보 철회 보호
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등. 전제: 2026-10-05-pt-end-consent.sql 실행 완료.
--
-- 무엇:
--  1) auth_member_id() — 회원 페이지는 아래 셋을 다 만족할 때만 열린다(로그인 뒤에도 매 요청 판정 · 예전엔 로그인 때만 봤다):
--       · 숨김(환불 · 삭제) 회원이 아님   · 센터 구독이 프리미엄 · 활성 · 기간 안   · 지난 회원 6개월 안(기존)
--  2) auth_member_writable() — 쓰기는 위 + 지난 회원 아님 + **남은 수업 1회 이상**(대표 결정 2026-10-05).
--       남은 수업 = 인계로 닫히지 않은 계약들의 (유료+서비스 − 취소 아닌 수업) 합. 노쇼도 차감(앱 remainingSessions와 같음).
--       ⚠️ 운동일지 '확인'은 서버 라우트(member-confirm)라 이 조건과 무관 — 마지막 수업 확인은 0회여도 된다.
--  3) member_me 뷰에 열 덧붙이기: member_token(공용 기기에서 다른 회원 링크를 열면 로그아웃시키려고) · writable.
--  4) 장부(income · expense) — 대표만 읽고 쓴다(예전엔 같은 센터 트레이너도 됐다).
--  5) 건강정보: 회원이 회원 페이지에서 철회했으면 트레이너 '받았어요' 기록을 DB가 거절한다(화면만 막던 것).
-- =============================================================================

-- 1) 회원 id
create or replace function auth_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from user_table u
    join account a on a.id = u.account_id
   where u.member_auth_id = auth.uid()
     and not coalesce(u.hidden, false)
     and a.plan = 'premium'
     and a.subscription_status = 'active'
     and (a.current_period_end is null or a.current_period_end > now())
     and not (coalesce(u.status, '') = 'inactive'
              and u.status_changed_at is not null
              and u.status_changed_at < now() - interval '6 months')
$$;
grant execute on function auth_member_id() to authenticated;

-- 2) 쓰기 가능 — 지난 회원 아님 + 남은 수업 1회 이상
create or replace function member_remaining_sessions(p_member uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(greatest(0,
           c.sessions_total + coalesce(c.service_sessions, 0)
           - (select count(*) from daily_workout_log l where l.contract_id = c.id and not coalesce(l.voided, false))
         )), 0)::int
    from session_log c
   where c.user_id = p_member and not coalesce(c.handed_over, false)
$$;
revoke all on function member_remaining_sessions(uuid) from public, anon, authenticated; -- 내부용(아래 함수가 씀)

create or replace function auth_member_writable()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_table u
     where u.id = auth_member_id()
       and coalesce(u.status, '') <> 'inactive'
       and member_remaining_sessions(u.id) > 0
  )
$$;
grant execute on function auth_member_writable() to authenticated;

-- 3) member_me — 열은 뒤에만 덧붙인다
create or replace view member_me
  with (security_invoker = false) as
  select u.id, u.name, u.goal, u.goal_deadline, t.name as trainer_name,
         u.status, u.status_changed_at, a.name as center_name,
         u.member_token, auth_member_writable() as writable
  from user_table u
  left join trainer t on t.id = u.trainer_id
  left join account a on a.id = u.account_id
  where u.id = auth_member_id();
grant select on member_me to authenticated;
revoke select on member_me from anon;

-- 4) 장부 — 대표만
drop policy if exists expense_rw on expense;
create policy expense_rw on expense for all to authenticated
  using (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());
drop policy if exists income_rw on income;
create policy income_rw on income for all to authenticated
  using (account_id = auth_account_id() and auth_is_owner())
  with check (account_id = auth_account_id() and auth_is_owner());

-- 5) 건강정보 철회 보호
create or replace function member_health_withdrawn(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (not c.agreed) and c.method = 'member_page'
      from member_consent c
     where c.member_id = p_member and c.kind = 'health'
     order by c.created_at desc
     limit 1
  ), false)
$$;
grant execute on function member_health_withdrawn(uuid) to authenticated;

drop policy if exists "trainer_consent_insert" on member_consent;
create policy "trainer_consent_insert" on member_consent for insert to authenticated
  with check (method = 'trainer_check' and trainer_id = auth.uid() and member_in_my_account(member_id::text)
              and not member_health_withdrawn(member_id));

-- =============================================================================
-- 검증(에러 없으면 OK):
--   select count(*) from pg_policies where policyname in ('expense_rw','income_rw') and qual like '%auth_is_owner%';  -- 2
--   select column_name from information_schema.columns where table_name = 'member_me' order by ordinal_position;  -- … member_token, writable
-- 롤백: 이 파일의 1)~5)를 2026-10-05-pt-end-consent.sql · 2026-09-17-expense.sql · 2026-09-29-income.sql 정의로 다시 실행.
--       (member_me는 열을 뺄 수 없으니 drop view 후 다시 만들기)
-- =============================================================================
