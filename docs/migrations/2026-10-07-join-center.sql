-- =============================================================================
-- 2026-10-07 개인 → 센터 합류 + 회원 이동 동의 (계획서 2단계 · docs/v2-계획-해지-합류-독립.md)
-- -----------------------------------------------------------------------------
-- 흐름:
--   ① 센터 대표가 초대 링크를 만든다(create_join_invite · 7일 · 한 번만).
--   ② 개인 계정 트레이너가 링크를 열고 [합류하기] → 서버 라우트(/api/move/join · service_role)가
--      _join_center(): 트레이너를 센터 소속(role trainer)으로 · 본인 가격표 · 사례 · QR · 개인 일정 등은 바로 옮김 ·
--      회원마다 '이동 동의 요청'(member_transfer · 14일) · 개인 계정은 닫음(볼 수만 30일 · 다음 결제 없음).
--      남은 개인 구독 기간은 라우트가 토스 부분 취소로 일할 환불(A안).
--   ③ 회원 전용 페이지에 "앞으로 ○○ 센터가 기록을 관리해요. 함께 옮길까요?" → answer_member_transfer()
--      동의하면 그 회원의 모든 기록(account_id가 있는 표 전부)이 센터로 옮겨진다. 14일 안 답 없으면 안 옮김.
--   · 옮겨 온 계약 = imported_from · imported_at · counts_as_revenue=false → 센터 매출 · 급여 숫자에 안 섞임
--     (회원 화면 · 남은 수업 · 재등록 흐름엔 그대로 쓰임).
--   · 저장소: 서명 그림 · 사례 이미지는 파일을 옮기지 않고 읽기 규칙을 넓힌다(회원 · 사례가 내 센터 것이면 읽기).
-- 실행: Supabase SQL Editor에서 한 번. 전제: 2026-10-07-cancel-readonly.sql 실행 완료.
-- =============================================================================

-- 1) 칸
alter table account add column if not exists merged_into   uuid references account(id) on delete set null;
alter table account add column if not exists closed_at     timestamptz;
alter table account add column if not exists closed_reason text;
alter table session_log add column if not exists imported_from uuid;
alter table session_log add column if not exists imported_at   timestamptz;

-- 2) 초대 링크
create table if not exists account_invite (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  account_id  uuid not null references account(id) on delete cascade,     -- 초대하는 센터
  created_by  uuid references trainer(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references trainer(id) on delete set null,
  used_at     timestamptz,
  canceled_at timestamptz
);
alter table account_invite enable row level security;
drop policy if exists account_invite_owner_select on account_invite;
create policy account_invite_owner_select on account_invite for select to authenticated
  using (account_id = auth_account_id() and auth_is_owner());
-- 쓰기 정책 없음 = 함수 · 서버 라우트만

-- 3) 회원 이동 동의
create table if not exists member_transfer (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references user_table(id) on delete cascade,
  member_name  text,                                            -- 받는 쪽은 동의 전 회원 행을 못 읽어서 이름만 남김
  from_account uuid not null references account(id) on delete cascade,
  to_account   uuid not null references account(id) on delete cascade,
  trainer_id   uuid references trainer(id) on delete set null,
  kind         text not null default 'join' check (kind in ('join', 'leave')),
  to_name      text,                                            -- 회원에게 보여 줄 새 운영자 이름
  status       text not null default 'pending' check (status in ('pending', 'agreed', 'declined', 'expired')),
  created_at   timestamptz not null default now(),
  deadline     timestamptz not null default now() + interval '14 days',
  answered_at  timestamptz,
  moved_at     timestamptz
);
create index if not exists member_transfer_member_idx on member_transfer (member_id, status);
create index if not exists member_transfer_to_idx on member_transfer (to_account, status);
alter table member_transfer enable row level security;
drop policy if exists member_transfer_member_select on member_transfer;
create policy member_transfer_member_select on member_transfer for select to authenticated
  using (member_id = auth_member_id());
drop policy if exists member_transfer_trainer_select on member_transfer;
create policy member_transfer_trainer_select on member_transfer for select to authenticated
  using (to_account = auth_account_id() or from_account = auth_account_id());

-- 4) 회원 한 명 옮기기(내부용) — account_id가 있는 표 전부를 같은 회원 기준으로 바꾼다
create or replace function _move_member(p_member uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from uuid; r record;
begin
  select account_id into v_from from user_table where id = p_member for update;
  if v_from is null or v_from = p_to then return; end if;

  -- 옛 센터 이벤트 참여 기록은 끊는다(이벤트는 옛 센터 것)
  delete from member_event_join where member_id = p_member;
  -- 계약 = '이동 전 기록'(센터 매출 · 급여에 안 섞이게 · 회원 화면 · 남은 수업엔 그대로)
  update session_log set imported_from = v_from, imported_at = now(), counts_as_revenue = false
   where user_id = p_member and account_id = v_from;

  for r in
    select c.table_name, m.column_name as mcol
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      join information_schema.columns m
        on m.table_schema = c.table_schema and m.table_name = c.table_name and m.column_name in ('user_id', 'member_id')
     where c.table_schema = 'public' and c.column_name = 'account_id'
       and c.table_name not in ('user_table', 'member_transfer', 'member_event_join', 'owner_feedback', 'monthly_report', 'owner_daily_report')
  loop
    execute format('update public.%I set account_id = $1 where %I = $2 and account_id = $3', r.table_name, r.mcol)
      using p_to, p_member, v_from;
  end loop;

  update user_table set account_id = p_to where id = p_member;
end $$;
revoke all on function _move_member(uuid, uuid) from public, anon, authenticated;

-- 5) 초대 링크 만들기 · 끄기(센터 대표)
create or replace function create_join_invite()
returns text language plpgsql security definer set search_path = public as $$
declare v_acc uuid := auth_account_id(); v_code text;
begin
  if v_acc is null or not auth_is_owner() then raise exception 'not_owner'; end if;
  if (select type from account where id = v_acc) <> 'center' then raise exception 'not_center'; end if;
  v_code := left(replace(gen_random_uuid()::text, '-', ''), 16);   -- 16자(pgcrypto 없이)
  insert into account_invite (code, account_id, created_by) values (v_code, v_acc, auth.uid());
  return v_code;
end $$;
grant execute on function create_join_invite() to authenticated;

create or replace function cancel_join_invite(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not auth_is_owner() then raise exception 'not_owner'; end if;
  update account_invite set canceled_at = now()
   where id = p_id and account_id = auth_account_id() and used_at is null and canceled_at is null;
  return found;
end $$;
grant execute on function cancel_join_invite(uuid) to authenticated;

-- 초대 링크 정보(합류 화면 · 로그인한 트레이너) — 센터 이름 · 쓸 수 있는지
create or replace function join_invite_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when i.id is null then jsonb_build_object('error', 'invalid')
    when i.used_at is not null then jsonb_build_object('error', 'used')
    when i.canceled_at is not null then jsonb_build_object('error', 'canceled')
    when i.expires_at < now() then jsonb_build_object('error', 'expired')
    else jsonb_build_object('center_name', a.name, 'expires_at', i.expires_at)
  end
  from (select 1) x
  left join account_invite i on i.code = p_code
  left join account a on a.id = i.account_id
$$;
grant execute on function join_invite_info(text) to authenticated;

-- 6) 합류(서버 라우트만 · service_role) — 트레이너 이동 · 트레이너 것 옮기기 · 회원 동의 요청 · 개인 계정 닫기
create or replace function _join_center(p_trainer uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv account_invite; v_from uuid; v_role text; v_from_type text; v_to_name text; v_used int; v_n int := 0; r record;
begin
  select * into v_inv from account_invite where code = p_code for update;
  if v_inv.id is null then return jsonb_build_object('error', 'invalid'); end if;
  if v_inv.used_at is not null or v_inv.canceled_at is not null or v_inv.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;

  select t.account_id, t.role, a.type into v_from, v_role, v_from_type
    from trainer t join account a on a.id = t.account_id where t.id = p_trainer and t.active;
  if v_from is null then return jsonb_build_object('error', 'no_trainer'); end if;
  if v_from = v_inv.account_id then return jsonb_build_object('error', 'same'); end if;
  if v_role <> 'owner' or v_from_type <> 'solo' then return jsonb_build_object('error', 'not_solo'); end if;

  -- 좌석(센터 3인 · 대표 제외 · create-trainer와 같은 규칙)
  select count(*) into v_used from trainer where account_id = v_inv.account_id and role = 'trainer' and active;
  if v_used >= 3 then return jsonb_build_object('error', 'seat_limit'); end if;

  select name into v_to_name from account where id = v_inv.account_id;

  -- 트레이너 → 센터 소속
  update trainer set account_id = v_inv.account_id, role = 'trainer' where id = p_trainer;

  -- 트레이너 본인 것(가격표 · 사례 · QR · 개인 일정 · 예약 받기 설정 · 프로필) — 있으면 옮김
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.columns k
        on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = 'trainer_id'
     where c.table_schema = 'public' and c.column_name = 'account_id'
       and c.table_name in ('pt_package', 'sales_case', 'intake_link', 'trainer_event', 'trainer_booking_pref', 'trainer_profile', 'library_item', 'notify_pref')
  loop
    execute format('update public.%I set account_id = $1 where trainer_id = $2 and account_id = $3', r.table_name)
      using v_inv.account_id, p_trainer, v_from;
  end loop;

  -- 회원마다 이동 동의 요청(숨김 회원 제외 · 이미 요청 중이면 그대로)
  insert into member_transfer (member_id, member_name, from_account, to_account, trainer_id, kind, to_name)
  select u.id, u.name, v_from, v_inv.account_id, p_trainer, 'join', v_to_name
    from user_table u
   where u.account_id = v_from and not coalesce(u.hidden, false)
     and not exists (select 1 from member_transfer m where m.member_id = u.id and m.status = 'pending');
  get diagnostics v_n = row_count;

  -- 개인 계정 닫기 — 다음 결제 없음 · 지금부터 30일 볼 수만(회원이 동의할 시간) · 결제 수단 지움
  update account set
    subscription_status = 'inactive',
    current_period_end  = least(coalesce(current_period_end, now()), now()),
    cancel_at_period_end = true,
    billing_key = null,
    merged_into = v_inv.account_id,
    closed_at = now(),
    closed_reason = 'join'
   where id = v_from;

  update account_invite set used_by = p_trainer, used_at = now() where id = v_inv.id;

  return jsonb_build_object('ok', true, 'from', v_from, 'to', v_inv.account_id, 'center_name', v_to_name, 'members', v_n);
end $$;
revoke all on function _join_center(uuid, text) from public, anon, authenticated;
grant execute on function _join_center(uuid, text) to service_role;

-- 7) 회원 — 내 이동 요청 · 답하기
create or replace function my_member_transfer()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'to_name', m.to_name, 'deadline', m.deadline, 'trainer_name', t.name, 'kind', m.kind)
      from member_transfer m
      left join trainer t on t.id = m.trainer_id
     where m.member_id = auth_member_id() and m.status = 'pending' and m.deadline > now()
     order by m.created_at desc limit 1), 'null'::jsonb)
$$;
grant execute on function my_member_transfer() to authenticated;

create or replace function answer_member_transfer(p_agree boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_member_id(); v_t member_transfer;
begin
  if v_me is null then return jsonb_build_object('error', 'no_member'); end if;
  select * into v_t from member_transfer
   where member_id = v_me and status = 'pending' and deadline > now()
   order by created_at desc limit 1 for update;
  if v_t.id is null then return jsonb_build_object('error', 'none'); end if;
  if p_agree then
    perform _move_member(v_me, v_t.to_account);
    update member_transfer set status = 'agreed', answered_at = now(), moved_at = now() where id = v_t.id;
    -- 동의 기록(누가 · 어디서 → 어디로) — member_consent에 덧붙이기만
    insert into member_consent (member_id, account_id, kind, agreed, method, version, trainer_id)
    values (v_me, v_t.to_account, 'transfer', true, 'member_page', 'transfer:' || v_t.from_account::text || '>' || v_t.to_account::text, v_t.trainer_id);
  else
    update member_transfer set status = 'declined', answered_at = now() where id = v_t.id;
  end if;
  return jsonb_build_object('ok', true, 'agreed', p_agree, 'to_name', v_t.to_name);
end $$;
grant execute on function answer_member_transfer(boolean) to authenticated;

-- 8) 저장소 — 파일은 그대로, 읽기 규칙만 넓힘
--    서명 그림: 경로 {옛 계정}/{회원}/… → 회원이 내 센터 소속이면 읽기
drop policy if exists "log_sig_obj_select" on storage.objects;
create policy "log_sig_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'log-signatures' and (
    (storage.foldername(name))[1] = auth_account_id()::text
    or (storage.foldername(name))[2] = auth_member_id()::text
    or member_in_my_account((storage.foldername(name))[2])));
--    사례 이미지: 내 센터의 사례가 가리키는 파일이면 읽기
create or replace function sales_case_file_in_my_account(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sales_case s
                  where s.account_id = auth_account_id()
                    and (s.data->>'path' = p_name or s.data->'before'->>'path' = p_name or s.data->'after'->>'path' = p_name))
$$;
grant execute on function sales_case_file_in_my_account(text) to authenticated;
drop policy if exists "sales_case_obj_moved_select" on storage.objects;
create policy "sales_case_obj_moved_select" on storage.objects for select to authenticated
  using (bucket_id in ('sales-cases', 'member-photos') and sales_case_file_in_my_account(name));

-- 9) member_consent kind에 'transfer'가 들어갈 수 있게(제약이 있으면 넓힘)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'member_consent_kind_check') then
    alter table member_consent drop constraint member_consent_kind_check;
    alter table member_consent add constraint member_consent_kind_check check (kind in ('general', 'health', 'transfer'));
  end if;
end $$;

-- 10) 새 표(account_invite · member_transfer)에도 '볼 수만' 30일 읽기 규칙
select refresh_read_only_policies();

-- 검증: select create_join_invite();  (대표 세션) → 16자 코드
-- 롤백(기록이 옮겨지기 전에만 의미 있음):
--   drop function if exists answer_member_transfer(boolean); drop function if exists my_member_transfer();
--   drop function if exists _join_center(uuid, text); drop function if exists _move_member(uuid, uuid);
--   drop function if exists join_invite_info(text); drop function if exists create_join_invite(); drop function if exists cancel_join_invite(uuid);
--   drop table if exists member_transfer; drop table if exists account_invite;
