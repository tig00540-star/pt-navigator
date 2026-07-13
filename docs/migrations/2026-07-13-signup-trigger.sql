-- =============================================================================
-- 셀프 가입 프로비저닝 — auth.users INSERT 시 account(type)+trainer(owner) 자동 생성
-- 실행일: 2026-07-13 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일: 클라 signUp 시 넘긴 메타데이터(account_type/display_name/account_name)를 읽어
--   account 1행 + 그 계정 owner trainer 1행을 SECURITY DEFINER로 생성(anon RLS 우회).
-- ★ 초대 트레이너(create-trainer, 메타 {must_change_pw})는 account_type 없음 → 트리거 스킵(비충돌).
-- 멱등: 이미 trainer 행 있으면 no-op. 롤백: 파일 하단.
-- =============================================================================

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
  new_account_id uuid;
begin
  if a_type is null then return new; end if;                 -- 초대 트레이너 등은 스킵
  if a_type not in ('solo','center') then return new; end if;
  if exists (select 1 from trainer where id = new.id) then return new; end if;  -- 멱등

  insert into account (type, name)
    values (a_type, coalesce(a_name, d_name))
    returning id into new_account_id;

  insert into trainer (id, account_id, role, name, active)
    values (new.id, new_account_id, 'owner', d_name, true);

  return new;
end
$$;

drop trigger if exists on_auth_user_created_signup on auth.users;
create trigger on_auth_user_created_signup
  after insert on auth.users
  for each row execute function handle_new_signup();

-- =============================================================================
-- 검증:
--  (1) 개인 가입 후 — account(type=solo) 1행 + trainer(role=owner) 1행 생겼나.
--  (2) 센터 가입 후 — account(type=center, name=센터명) + owner trainer.
--  (3) 기존 원장이 create-trainer로 트레이너 추가 — 여전히 정상(account 새로 안 생기고 role=trainer).
-- select a.type, a.name, t.role, t.name from account a join trainer t on t.account_id=a.id
--   order by a.created_at desc limit 5;
-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- drop trigger if exists on_auth_user_created_signup on auth.users;
-- drop function if exists handle_new_signup();
-- =============================================================================
