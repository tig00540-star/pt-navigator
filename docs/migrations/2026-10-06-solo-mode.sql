-- =============================================================================
-- 개인 트레이너 계정: 일하는 방식 · 상호 — 2026-10-06
-- 실행: Supabase SQL Editor(수동) · git 기록본. 멱등.
--
-- 왜(대표 결정 2026-10-06): '개인 트레이너'로 가입하는 사람은 두 부류다.
--   ① 센터 소속(센터는 앱을 안 쓰고 트레이너 혼자 씀 · 급여 · 수수료를 받음) → 내 실적 맨 위 = 예상 급여
--   ② 프리랜서(대관 · 개인 스튜디오 · 출장 · 회원비를 직접 받음) → 맨 위 = 매출 · 지출 · 순이익(장부)
--   그리고 개인 계정은 센터 이름 칸이 없어 account.name = 본인 이름 → 회원 페이지에 "홍길동에서…"처럼 어색하게 나왔다.
-- 하는 일:
--   1) account.work_mode('employed' | 'freelance' · 비면 employed로 봄) · account.brand_name(소속 센터 또는 상호 · 선택)
--   2) 읽기 열 권한(account는 열 단위 grant · 2026-10-01-account-hide-billing-key.sql)
--   3) set_solo_profile(mode, brand) — 개인 계정 주인만 이 두 칸만(account UPDATE 정책은 열지 않는다)
--   4) 가입 트리거 — 가입 화면이 보낸 work_mode · brand_name 저장
--   5) member_me · intake_link_info — 개인 계정은 '센터 이름' 자리에 상호(없으면 비움) + is_solo
-- =============================================================================

alter table account add column if not exists work_mode text;
alter table account add column if not exists brand_name text;
alter table account drop constraint if exists account_work_mode_check;
alter table account add constraint account_work_mode_check check (work_mode is null or work_mode in ('employed', 'freelance'));
alter table account drop constraint if exists account_brand_name_len;
alter table account add constraint account_brand_name_len check (brand_name is null or char_length(brand_name) <= 40);

grant select (work_mode, brand_name) on account to authenticated;

create or replace function set_solo_profile(p_mode text, p_brand text)
returns void language plpgsql security definer set search_path = public as $$
declare acct uuid := auth_account_id();
begin
  if acct is null or not auth_is_owner() or (select type from account where id = acct) is distinct from 'solo' then
    raise exception 'forbidden';
  end if;
  if p_mode is not null and p_mode not in ('employed', 'freelance') then raise exception 'bad mode'; end if;
  update account
     set work_mode = coalesce(p_mode, work_mode),
         brand_name = nullif(left(btrim(coalesce(p_brand, '')), 40), '')
   where id = acct;
end $$;
revoke all on function set_solo_profile(text, text) from public, anon;
grant execute on function set_solo_profile(text, text) to authenticated;

create or replace function handle_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type text := new.raw_user_meta_data->>'account_type';
  a_name text := new.raw_user_meta_data->>'account_name';
  d_name text := coalesce(new.raw_user_meta_data->>'display_name', new.email);
  w_mode text := new.raw_user_meta_data->>'work_mode';
  b_name text := nullif(left(btrim(coalesce(new.raw_user_meta_data->>'brand_name', '')), 40), '');
  new_account_id uuid;
begin
  if a_type is null then return new; end if;                 -- 초대 트레이너 등은 스킵
  if a_type not in ('solo','center') then return new; end if;
  if exists (select 1 from trainer where id = new.id) then return new; end if;  -- 멱등
  if w_mode not in ('employed', 'freelance') then w_mode := null; end if;

  insert into account (type, name, work_mode, brand_name)
    values (a_type, coalesce(a_name, d_name),
            case when a_type = 'solo' then w_mode end,
            case when a_type = 'solo' then b_name end)
    returning id into new_account_id;

  insert into trainer (id, account_id, role, name, active)
    values (new.id, new_account_id, 'owner', d_name, true);

  return new;
end
$$;

-- 회원 페이지 '나' — 열 순서 그대로 + is_solo 뒤에 덧붙임. 개인 계정은 center_name = 상호(없으면 null).
create or replace view member_me
  with (security_invoker = false) as
  select u.id, u.name, u.goal, u.goal_deadline, t.name as trainer_name,
         u.status, u.status_changed_at,
         case when a.type = 'solo' then a.brand_name else a.name end as center_name,
         u.member_token, auth_member_writable() as writable,
         (a.type = 'solo') as is_solo
  from user_table u
  left join trainer t on t.id = u.trainer_id
  left join account a on a.id = u.account_id
  where u.id = auth_member_id();

-- OT 신청서 머리 — 개인 계정은 상호(없으면 null · 화면이 트레이너 이름만 씀)
create or replace function intake_link_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when l.id is null then jsonb_build_object('error', 'invalid')
              when a.subscription_status is distinct from 'active'
                   or (a.current_period_end is not null and a.current_period_end <= now()) then jsonb_build_object('error', 'closed')
              else jsonb_build_object('ok', true,
                                      'center', case when a.type = 'solo' then a.brand_name else a.name end,
                                      'trainer', t.name,
                                      'solo', a.type = 'solo',
                                      'kind', case when l.trainer_id is null then 'center' else 'trainer' end) end
    from (select 1) x
    left join intake_link l on l.code = p_code and l.active
    left join account a on a.id = l.account_id
    left join trainer t on t.id = l.trainer_id;
$$;
revoke all on function intake_link_info(text) from public, anon, authenticated;
grant execute on function intake_link_info(text) to service_role;

-- =============================================================================
-- 검증: select has_column_privilege('authenticated', 'account', 'work_mode', 'select');   -- true
--       select column_name from information_schema.columns where table_name = 'member_me' order by ordinal_position;  -- 끝이 is_solo
-- 롤백: member_me · intake_link_info는 2026-10-06-bugfix-sweep.sql · 2026-10-06-ot-intake.sql 정의로 다시 실행.
-- =============================================================================
