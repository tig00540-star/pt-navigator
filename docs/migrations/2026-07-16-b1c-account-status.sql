-- =============================================================================
-- B1-C — my_account_status(): 로그인 유저의 계정 상태(잠김이어도 조회 가능) → 화면 분기용
-- 잠긴 상태에선 account 행도 못 읽음(auth_account_id()=null) → SECURITY DEFINER로 상태만 안전 반환.
-- 링크 컬럼 = trainer.id = auth.uid() (§B1-B와 동일 · 실제 스키마 확인 완료).
-- =============================================================================
create or replace function my_account_status()
returns table (has_account boolean, subscription_status text, plan text,
               current_period_end timestamptz, is_expired boolean, access boolean)
language sql stable security definer set search_path = public as $$
  select
    (t.id is not null)                                                  as has_account,
    a.subscription_status,
    a.plan,
    a.current_period_end,
    (a.current_period_end is not null and a.current_period_end <= now()) as is_expired,
    (a.subscription_status = 'active'
       and (a.current_period_end is null or a.current_period_end > now())) as access
  from trainer t
  left join account a on a.id = t.account_id
  where t.id = auth.uid()
  limit 1
$$;
grant execute on function my_account_status() to authenticated;

-- =============================================================================
-- 계정 없는 유저(향후 카카오 최초): 0행 → 클라에서 has_account=false로 처리.
-- 검증: 본인 세션에서 select * from my_account_status();  → access=true.
-- 롤백: drop function if exists my_account_status();
-- =============================================================================
