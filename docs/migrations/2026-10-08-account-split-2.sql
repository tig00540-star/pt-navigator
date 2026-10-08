-- 2026-10-08 보충: 개인 → 센터 회원 이동 때 같은 사례가 2개 되던 것(복사본 + 회원과 함께 따라온 원래 사례) 정리. 멱등.
create or replace function answer_member_transfer(p_agree boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_member_id(); v_t member_transfer;
begin
  if v_me is null then return jsonb_build_object('error', 'no_member'); end if;
  select m.* into v_t from member_transfer m join account a on a.id = m.to_account
   where m.member_id = v_me and m.status = 'pending' and m.deadline > now()
     and a.subscription_status = 'active' and (a.current_period_end is null or a.current_period_end > now())
   order by m.created_at desc limit 1 for update of m;
  if v_t.id is null then return jsonb_build_object('error', 'none'); end if;
  if p_agree then
    -- 떠나는 센터에 정산용 사본(독립일 때 · 금액 · 날짜만)
    if v_t.kind = 'leave' then
      insert into moved_out_ledger (account_id, contract_id, trainer_id, kind, started_at, sessions_total, service_sessions,
                                    price_per_session, amount_total, counts_as_revenue, refund_amount, refunded_at)
      select c.account_id, c.id, c.trainer_id, c.kind, c.started_at, c.sessions_total, c.service_sessions,
             c.price_per_session, c.amount_total, c.counts_as_revenue, c.refund_amount, c.refunded_at
        from session_log c where c.user_id = v_me and c.account_id = v_t.from_account;
    end if;
    perform _move_member(v_me, v_t.to_account);
    if v_t.kind = 'import' then
      perform _remap_member_trainer(v_me, v_t.from_trainer, v_t.trainer_id);
      -- 이미 '내 자료 가져오기'로 복사해 온 사례가 있으면, 회원과 함께 따라온 원래 사례는 지운다(같은 사례 2개 방지 · 2026-10-08 시험에서 발견)
      delete from sales_case s
       where s.member_id = v_me and s.account_id = v_t.to_account
         and exists (select 1 from sales_case c where c.account_id = v_t.to_account and c.data->'portfolio'->>'src_case' = s.id::text);
    end if;
    update member_transfer set status = 'agreed', answered_at = now(), moved_at = now() where id = v_t.id;
    insert into member_consent (member_id, account_id, kind, agreed, method, version, trainer_id)
    values (v_me, v_t.to_account, 'transfer', true, 'member_page', 'transfer:' || v_t.from_account::text || '>' || v_t.to_account::text, v_t.trainer_id);
  else
    update member_transfer set status = 'declined', answered_at = now() where id = v_t.id;
  end if;
  return jsonb_build_object('ok', true, 'agreed', p_agree, 'to_name', v_t.to_name);
end $$;
grant execute on function answer_member_transfer(boolean) to authenticated;

-- 2026-10-08 보충 ②: 2026-10-08-security.sql ④는 anon에서만 뺐는데, 함수는 기본으로 PUBLIC(모두)에게도 실행 권한이 있어 그대로 열려 있었다.
--   PUBLIC · anon에서 빼고 로그인한 사람(authenticated)에게만 다시 준다.
do $$
declare f text;
begin
  foreach f in array array[
    'join_invite_info(text)', 'issue_member_token(uuid)', 'set_settlement_start_day(smallint)',
    'allow_trainer_leave(uuid, boolean)', 'cancel_leave_allow(uuid)', 'create_join_invite()'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    exception when undefined_function then
      raise notice '건너뜀: %', f;
    end;
  end loop;
end $$;

-- 2026-10-08 보충 ③: 끈 트레이너 아이디는 한 달만 보관(대표 결정) — 끈 날 · 정리한 날 · 정리 7일 전 알림
alter table trainer add column if not exists deactivated_at timestamptz;
alter table trainer add column if not exists closed_at timestamptz;
alter table trainer add column if not exists close_notified_at timestamptz;
-- 이미 꺼져 있던 아이디는 오늘부터 한 달
update trainer set deactivated_at = now() where active = false and deactivated_at is null and closed_at is null;
