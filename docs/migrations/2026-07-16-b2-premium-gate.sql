-- =============================================================================
-- B2 — 프리미엄 게이트(층2): auth_account_plan() + issue_member_token()
-- 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본. 멱등.
-- 전제: B1(account.plan/subscription_status/current_period_end · auth_account_id) 완료.
-- 실제 스키마: trainer.id = auth.uid() · trainer.account_id → account.id (B1과 동일).
-- =============================================================================

-- 1) 계정 등급 헬퍼 — auth_account_id()와 동일 틀(active+구독활성+만료 통과일 때만 plan, 아니면 NULL).
create or replace function auth_account_plan()
returns text language sql stable security definer set search_path = public as $$
  select a.plan
  from trainer t
  join account a on a.id = t.account_id
  where t.id = auth.uid()
    and t.active
    and a.subscription_status = 'active'
    and (a.current_period_end is null or a.current_period_end > now())
$$;
grant execute on function auth_account_plan() to authenticated;

-- 2) 회원 링크 발급 RPC — premium 아니면 거절(UI 우회 차단). 대상 회원이 내 account 소속인지도 확인.
create or replace function issue_member_token(p_member_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_account uuid := auth_account_id();
  v_token   uuid;
begin
  if v_account is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth_account_plan() is distinct from 'premium' then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  if not exists (select 1 from user_table where id = p_member_id and account_id = v_account) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  v_token := gen_random_uuid();                       -- 소문자 v4 → member-auth UUID_RE 정합
  update user_table set member_token = v_token where id = p_member_id;
  return v_token;
end;
$$;
grant execute on function issue_member_token(uuid) to authenticated;

-- =============================================================================
-- 검증:
--   select proname from pg_proc where proname in ('auth_account_plan','issue_member_token');  -- 2행
--   (앱) premium 계정에서 [링크 생성] → 토큰 반환. basic로 내리면 premium_required 토스트.
-- 롤백:
--   drop function if exists issue_member_token(uuid);
--   drop function if exists auth_account_plan();
-- =============================================================================
