-- =============================================================================
-- 보안 점검 2차(2026-10-08 · 전체 점검)
--   ① 공개 OT 신청서로 '같은 번호 기존 회원'의 건강정보 동의를 다시 '동의'로 남기던 것 막기
--   ② member_health_withdrawn: 다른 센터 회원 번호로 동의 여부를 엿보지 못하게(내 센터 회원만) · 비로그인 실행 금지
--   ③ 회원 페이지 휴대폰 뒤 4자리 로그인 실패 기록(서버 여러 대가 같이 세게 · 10분 안 8번 틀리면 잠깐 잠금)
--   ④ 로그인한 사람만 쓰는 함수들 — 비로그인(anon) 실행 권한 회수(안에서 이미 막지만 한 겹 더)
-- 실행: Supabase SQL Editor(수동). 다시 실행해도 같은 결과(멱등).
-- =============================================================================

-- ① 이어 적기(2단계) — 건강정보 동의 기록은 '이 신청으로 새로 만든 회원'에게만
create or replace function update_ot_application(p_app uuid, p_token text, p_answers jsonb, p_health boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a ot_application; hc boolean;
begin
  select * into a from ot_application where id = p_app for update;
  if a.id is null or a.edit_token is null or a.edit_token <> p_token or a.created_at < now() - interval '24 hours' then
    return jsonb_build_object('error', 'invalid');
  end if;
  hc := coalesce((a.consent->>'health')::boolean, false);
  if p_health and not hc then
    hc := true;
    update ot_application set consent = consent || jsonb_build_object('health', true, 'health_at', now()) where id = p_app;
    -- 같은 번호 기존 회원(duplicate_of)이면 회원 동의 기록은 남기지 않는다 — 번호만 알면 남이 '동의'를 만들 수 있었다.
    --   (신청서에는 동의가 남고, 기존 회원의 동의는 트레이너 · 회원 페이지에서만 바뀐다)
    if a.member_id is not null and a.duplicate_of is null then
      insert into member_consent (member_id, kind, agreed, method, version)
        values (a.member_id, 'health', true, 'intake', coalesce(a.consent->>'version', '2026-10-06'));
    end if;
  end if;
  if not hc then p_answers := coalesce(p_answers, '{}'::jsonb) - 'pain' - 'injury_history' - 'health_screen'; end if;
  update ot_application set answers = coalesce(answers, '{}'::jsonb) || coalesce(p_answers, '{}'::jsonb) where id = p_app;
  if a.member_id is not null and a.status = 'assigned' and a.duplicate_of is null then
    perform _ot_apply_answers(a.member_id, coalesce(p_answers, '{}'::jsonb), hc);
  end if;
  return jsonb_build_object('ok', true, 'health', hc);
end $$;
revoke all on function update_ot_application(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function update_ot_application(uuid, text, jsonb, boolean) to service_role;

-- ② 내 센터 회원일 때만 답한다(다른 센터 회원 번호면 false)
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
       and exists (select 1 from user_table u where u.id = p_member and u.account_id = auth_account_id())
     order by c.created_at desc
     limit 1
  ), false)
$$;
revoke all on function member_health_withdrawn(uuid) from public, anon;
grant execute on function member_health_withdrawn(uuid) to authenticated;

-- ③ 회원 로그인 실패 기록 — 서버(service_role)만 읽고 쓴다(정책 없음)
create table if not exists member_auth_fail (
  id         bigserial primary key,
  member_id  uuid,                  -- 링크가 맞았던 경우만(틀린 링크는 null)
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists member_auth_fail_member_idx on member_auth_fail(member_id, created_at);
create index if not exists member_auth_fail_ip_idx on member_auth_fail(ip, created_at);
alter table member_auth_fail enable row level security;
revoke all on member_auth_fail from anon, authenticated;

-- ④ 비로그인 실행 권한 회수(로그인한 트레이너 · 대표 · 회원, 또는 서버만 부르는 함수)
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
      raise notice '건너뜀(이름 · 인자 다름): %', f;
    end;
  end loop;
end $$;

-- 검증:
--   select has_function_privilege('anon', 'member_health_withdrawn(uuid)', 'execute');   -- false
--   select count(*) from member_auth_fail;                                              -- 0(로그인 실패가 생기면 늘어남)
-- 롤백: ①은 2026-10-06-intake-steps.sql의 update_ot_application 블록 · ②는 2026-10-06-bugfix-sweep.sql 블록을 다시 실행 · ③ drop table member_auth_fail
