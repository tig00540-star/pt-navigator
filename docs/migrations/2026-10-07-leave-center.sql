-- =============================================================================
-- 2026-10-07 센터 → 개인 독립 (계획서 3단계 · docs/v2-계획-해지-합류-독립.md 5장)
-- -----------------------------------------------------------------------------
-- 시작:
--   · 대표 허락: allow_trainer_leave(트레이너, 회원 함께?) — 대표 운영 탭.
--   · 센터 해지: 해지 예약 때 '트레이너들이 개인으로 이어 쓰게' 체크 → 서버 라우트가 모든 트레이너에게 허락(회원 함께).
--   · 허락 없이: 트레이너가 스스로 — 회원 없이(같은 로그인 · 본인 가격표 · 프로필만).
-- 독립 = 서버 라우트(/api/move/leave · service_role)가 _leave_center():
--   새 개인 계정(일하는 방식 · 상호 · 체험 없음 no_trial) → 트레이너를 그 계정 주인으로 → 본인 것 이동 →
--   허락이 '회원 함께'면 담당 회원마다 이동 동의 요청(kind leave). 회원에게는 새 계정이 결제를 마쳐 열린 뒤에만 보인다.
-- 회원이 동의하면 떠나는 센터에 정산용 사본(moved_out_ledger · 계약 금액 · 날짜만 · 이름 없음)을 남기고 옮긴다.
-- 실행: Supabase SQL Editor에서 한 번. 전제: 2026-10-07-cancel-readonly.sql · 2026-10-07-join-center.sql.
-- =============================================================================

-- 1) 계정 — 체험 없이 바로 첫 결제(독립 계정 · 2026-10-07 대표 결정)
alter table account add column if not exists no_trial boolean not null default false;
grant select (no_trial) on account to authenticated;

-- 2) 독립 허락
create table if not exists leave_allow (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references account(id) on delete cascade,      -- 떠나는 센터
  trainer_id   uuid not null references trainer(id) on delete cascade,
  with_members boolean not null default true,                                 -- 담당 회원도 데려갈 수 있나
  created_by   uuid references trainer(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '60 days',
  used_at      timestamptz,
  canceled_at  timestamptz
);
create index if not exists leave_allow_trainer_idx on leave_allow (trainer_id, created_at desc);
alter table leave_allow enable row level security;
drop policy if exists leave_allow_owner_select on leave_allow;
create policy leave_allow_owner_select on leave_allow for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());
drop policy if exists leave_allow_self_select on leave_allow;
create policy leave_allow_self_select on leave_allow for select to authenticated
  using (trainer_id = auth.uid());

-- 3) 떠난 회원의 정산용 사본(떠나는 센터 · 대표만 · 이름 없음)
create table if not exists moved_out_ledger (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references account(id) on delete cascade,
  contract_id     uuid,                       -- 옛 계약 번호(이제 다른 계정 것 · 참고용)
  trainer_id      uuid,
  kind            text,
  started_at      timestamptz,
  sessions_total  integer,
  service_sessions integer,
  price_per_session integer,
  amount_total    integer,
  counts_as_revenue boolean,
  refund_amount   integer,
  refunded_at     timestamptz,
  moved_at        timestamptz not null default now()
);
create index if not exists moved_out_ledger_acc_idx on moved_out_ledger (account_id, started_at);
alter table moved_out_ledger enable row level security;
drop policy if exists moved_out_ledger_owner_select on moved_out_ledger;
create policy moved_out_ledger_owner_select on moved_out_ledger for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());

-- 4) 대표 — 허락 · 끄기
create or replace function allow_trainer_leave(p_trainer uuid, p_with_members boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acc uuid := auth_account_id(); v_id uuid;
begin
  if v_acc is null or not auth_is_owner() then raise exception 'not_owner'; end if;
  if not exists (select 1 from trainer where id = p_trainer and account_id = v_acc and role = 'trainer') then raise exception 'not_my_trainer'; end if;
  update leave_allow set canceled_at = now() where trainer_id = p_trainer and account_id = v_acc and used_at is null and canceled_at is null;
  insert into leave_allow (account_id, trainer_id, with_members, created_by) values (v_acc, p_trainer, coalesce(p_with_members, true), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function allow_trainer_leave(uuid, boolean) to authenticated;

create or replace function cancel_leave_allow(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not auth_is_owner() then raise exception 'not_owner'; end if;
  update leave_allow set canceled_at = now()
   where id = p_id and account_id = auth_account_id() and used_at is null and canceled_at is null;
  return found;
end $$;
grant execute on function cancel_leave_allow(uuid) to authenticated;

-- 5) 트레이너 — 내 허락(센터가 잠겨도 보여야 해서 auth.uid() 기준)
create or replace function my_leave_allow()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', l.id, 'with_members', l.with_members, 'center_name', a.name, 'expires_at', l.expires_at,
             'members', (select count(*) from user_table u where u.account_id = l.account_id and u.trainer_id = l.trainer_id and not coalesce(u.hidden, false)))
      from leave_allow l join trainer t on t.id = l.trainer_id and t.account_id = l.account_id
      join account a on a.id = l.account_id
     where l.trainer_id = auth.uid() and l.used_at is null and l.canceled_at is null and l.expires_at > now()
     order by l.created_at desc limit 1), 'null'::jsonb)
$$;
grant execute on function my_leave_allow() to authenticated;

-- 6) 독립(서버 라우트만)
create or replace function _leave_center(p_trainer uuid, p_work_mode text, p_brand text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from uuid; v_role text; v_name text; v_from_type text; v_allow leave_allow; v_new uuid; v_n int := 0; r record;
begin
  select t.account_id, t.role, t.name, a.type into v_from, v_role, v_name, v_from_type
    from trainer t join account a on a.id = t.account_id where t.id = p_trainer and t.active;
  if v_from is null then return jsonb_build_object('error', 'no_trainer'); end if;
  if v_role <> 'trainer' or v_from_type <> 'center' then return jsonb_build_object('error', 'not_center_trainer'); end if;

  select * into v_allow from leave_allow
   where trainer_id = p_trainer and account_id = v_from and used_at is null and canceled_at is null and expires_at > now()
   order by created_at desc limit 1 for update;

  if p_work_mode not in ('employed', 'freelance') then p_work_mode := null; end if;
  insert into account (type, name, work_mode, brand_name, subscription_status, no_trial)
  values ('solo', v_name, p_work_mode, nullif(left(btrim(coalesce(p_brand, '')), 40), ''), 'inactive', true)
  returning id into v_new;

  update trainer set account_id = v_new, role = 'owner' where id = p_trainer;

  -- 본인 것 — 가격표 · 프로필 · 내 QR · 개인 일정 · 알림 설정 · 라이브러리(사례 보관함은 센터 회원 자료라 '회원 함께' 허락일 때만)
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.columns k
        on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = 'trainer_id'
     where c.table_schema = 'public' and c.column_name = 'account_id'
       and (c.table_name in ('pt_package', 'intake_link', 'trainer_event', 'trainer_profile', 'library_item', 'notify_pref')
            or (c.table_name = 'sales_case' and coalesce(v_allow.with_members, false)))
  loop
    execute format('update public.%I set account_id = $1 where trainer_id = $2 and account_id = $3', r.table_name)
      using v_new, p_trainer, v_from;
  end loop;

  if coalesce(v_allow.with_members, false) then
    insert into member_transfer (member_id, member_name, from_account, to_account, trainer_id, kind, to_name)
    select u.id, u.name, v_from, v_new, p_trainer, 'leave', v_name || ' 트레이너'
      from user_table u
     where u.account_id = v_from and u.trainer_id = p_trainer and not coalesce(u.hidden, false)
       and not exists (select 1 from member_transfer m where m.member_id = u.id and m.status = 'pending');
    get diagnostics v_n = row_count;
  end if;

  if v_allow.id is not null then update leave_allow set used_at = now() where id = v_allow.id; end if;

  return jsonb_build_object('ok', true, 'from', v_from, 'to', v_new, 'members', v_n, 'with_members', coalesce(v_allow.with_members, false));
end $$;
revoke all on function _leave_center(uuid, text, text) from public, anon, authenticated;
grant execute on function _leave_center(uuid, text, text) to service_role;

-- 7) 회원 — 받는 계정이 열려 있을 때만 요청이 보인다(독립한 트레이너가 결제를 마친 뒤)
create or replace function my_member_transfer()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'to_name', m.to_name, 'deadline', m.deadline, 'trainer_name', t.name, 'kind', m.kind)
      from member_transfer m
      left join trainer t on t.id = m.trainer_id
      join account a on a.id = m.to_account
     where m.member_id = auth_member_id() and m.status = 'pending' and m.deadline > now()
       and a.subscription_status = 'active' and (a.current_period_end is null or a.current_period_end > now())
     order by m.created_at desc limit 1), 'null'::jsonb)
$$;
grant execute on function my_member_transfer() to authenticated;

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
    update member_transfer set status = 'agreed', answered_at = now(), moved_at = now() where id = v_t.id;
    insert into member_consent (member_id, account_id, kind, agreed, method, version, trainer_id)
    values (v_me, v_t.to_account, 'transfer', true, 'member_page', 'transfer:' || v_t.from_account::text || '>' || v_t.to_account::text, v_t.trainer_id);
  else
    update member_transfer set status = 'declined', answered_at = now() where id = v_t.id;
  end if;
  return jsonb_build_object('ok', true, 'agreed', p_agree, 'to_name', v_t.to_name);
end $$;
grant execute on function answer_member_transfer(boolean) to authenticated;

select refresh_read_only_policies();

-- 롤백: drop function _leave_center(uuid,text,text), my_leave_allow(), allow_trainer_leave(uuid,boolean), cancel_leave_allow(uuid);
--       drop table leave_allow; drop table moved_out_ledger; (my_member_transfer · answer_member_transfer는 join-center 판으로 다시)
