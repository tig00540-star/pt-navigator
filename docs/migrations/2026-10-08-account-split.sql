-- =============================================================================
-- 아이디는 처음 만든 곳 것(2026-10-08 · 대표 결정 '분리 방식')
--   · 센터 트레이너 아이디 = 센터 것. 나가면 대표가 끈다(아이디를 들고 나가는 '독립'은 화면에서 뺌).
--   · 다른 아이디의 '내 자료'(가격표 · 라이브러리 · 프로필 · 포트폴리오 동의 사례)는 복사해 온다(/api/import-id).
--   · 개인 아이디 → 센터 아이디: 개인 회원은 회원이 동의하면 센터로 이동(kind 'import' · 담당 트레이너를 새 아이디로 바꿈).
--   · 회원 '포트폴리오 활용 동의'(member_consent kind 'portfolio') — 동의한 회원의 사례만 다른 아이디로 복사된다.
-- 실행: Supabase SQL Editor(수동). 다시 실행해도 같은 결과(멱등).
-- =============================================================================

-- 1) 동의 종류에 'portfolio'
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'member_consent_kind_check') then
    alter table member_consent drop constraint member_consent_kind_check;
  end if;
  alter table member_consent add constraint member_consent_kind_check
    check (kind in ('general', 'health', 'transfer', 'portfolio'));
end $$;

-- 트레이너 '종이로 받았어요' — 건강정보 철회 확인은 건강정보 동의에만(포트폴리오 종이 동의는 막지 않음)
drop policy if exists "trainer_consent_insert" on member_consent;
create policy "trainer_consent_insert" on member_consent for insert to authenticated
  with check (method = 'trainer_check' and trainer_id = auth.uid() and member_in_my_account(member_id::text)
              and (kind <> 'health' or not member_health_withdrawn(member_id)));

-- 2) 회원 이동 요청 — 새 종류 'import'(개인 아이디 → 센터 아이디) · 옛 담당 아이디
alter table member_transfer add column if not exists from_trainer uuid references trainer(id) on delete set null;
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.member_transfer'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop execute format('alter table member_transfer drop constraint %I', c.conname); end loop;
end $$;
alter table member_transfer add constraint member_transfer_kind_check check (kind in ('join', 'leave', 'import'));

-- 3) 옮긴 회원의 기록에서 담당 트레이너를 새 아이디로 바꾸기(같은 사람 · 다른 아이디)
create or replace function _remap_member_trainer(p_member uuid, p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_from is null or p_to is null or p_from = p_to then return; end if;
  for r in
    select c.table_name, m.column_name as mcol
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      join information_schema.columns m
        on m.table_schema = c.table_schema and m.table_name = c.table_name and m.column_name in ('user_id', 'member_id')
     where c.table_schema = 'public' and c.column_name = 'trainer_id'
       and c.table_name not in ('user_table', 'member_transfer', 'member_consent', 'owner_feedback', 'monthly_report', 'owner_daily_report')
  loop
    execute format('update public.%I set trainer_id = $1 where %I = $2 and trainer_id = $3', r.table_name, r.mcol)
      using p_to, p_member, p_from;
  end loop;
  update user_table set trainer_id = p_to where id = p_member and trainer_id = p_from;
end $$;
revoke all on function _remap_member_trainer(uuid, uuid, uuid) from public, anon, authenticated;

-- 4) 회원 답하기 — 2026-10-07 판 + 'import'면 담당 아이디 바꾸기
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

-- 5) '다른 아이디에서 가져오기' 비밀번호 틀림 기록(서버만 · 정책 없음 · 10분 5번이면 잠깐 막음)
create table if not exists import_fail (
  id         bigserial primary key,
  trainer_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists import_fail_trainer_idx on import_fail(trainer_id, created_at);
alter table import_fail enable row level security;
revoke all on import_fail from anon, authenticated;

-- 검증:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'member_consent_kind_check';   -- portfolio 포함
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'member_transfer_kind_check';  -- import 포함
-- 롤백: answer_member_transfer는 2026-10-07-leave-center.sql 블록을 다시 실행 · drop function _remap_member_trainer(uuid,uuid,uuid) · drop table import_fail
