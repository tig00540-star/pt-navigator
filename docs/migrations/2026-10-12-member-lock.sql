-- =============================================================================
-- 2026-10-12 · 남은 수업 0회 회원은 회원 전용 페이지에서 어떤 요청도 못 한다(대표 결정)
--   예약 요청 · 식단 · 루틴 요청 · 기록은 이미 auth_member_writable()로 막혀 있었고, 이벤트 참여만 빠져 있었다.
--   (운동일지 '확인'과 동의 철회는 그대로 된다 · 요청 취소도 그대로)
-- 실행: Supabase SQL Editor에 통째로. 여러 번 실행해도 됨.
-- =============================================================================
create or replace function join_member_event(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m user_table; e member_event; today date := (now() at time zone 'Asia/Seoul')::date; n int;
begin
  select * into m from user_table where id = auth_member_id();
  if m.id is null or m.status = 'inactive' or not auth_member_writable() then raise exception 'not_allowed'; end if;
  select * into e from member_event where id = p_event and active for update;
  if e.id is null or not _event_for_member(e, m) then raise exception 'not_found'; end if;
  if coalesce(e.join_from, e.starts_on) > today then raise exception 'not_yet'; end if;
  if coalesce(e.join_until, e.ends_on) < today then raise exception 'closed'; end if;
  if exists (select 1 from member_event_join where event_id = e.id and member_id = m.id) then return; end if;
  if e.capacity is not null then
    select count(*) into n from member_event_join where event_id = e.id;
    if n >= e.capacity then raise exception 'full'; end if;
  end if;
  insert into member_event_join (event_id, member_id) values (e.id, m.id);
end $$;

-- 확인: t 가 나오면 끝
select pg_get_functiondef('join_member_event'::regproc) like '%auth_member_writable%' as locked;
