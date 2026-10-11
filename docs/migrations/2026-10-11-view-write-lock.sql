-- =============================================================================
-- 2026-10-11 점검: 회원용 화면(뷰)의 쓰기 권한 막기
--   member_contract · member_inbody · member_upcoming_appt · member_roadmap_view · member_goal_view 같은 회원용 화면은
--   security_invoker=false(만든 사람 권한)라 원래 표의 보안 규칙을 건너뛴다. 읽기 전용이어야 하는데
--   Supabase 기본 권한으로 anon · authenticated에 INSERT · UPDATE · DELETE가 붙어 있었다 →
--   회원이 자기 계약(수업 횟수) · 인바디 · 예약을 고치거나 지울 수 있었다(시험 DB에서 확인 · 되돌림).
--   public의 모든 화면(뷰)에서 쓰기 권한을 뺀다. 읽기(SELECT)는 그대로. 다시 실행해도 같은 결과.
--   ⚠️ 앞으로 화면(뷰)을 새로 만들면 이 파일을 한 번 더 실행할 것(기본 권한이 다시 붙는다).
-- =============================================================================
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', v.viewname);
  end loop;
end $$;

-- 확인(0줄이면 OK):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
--     and table_name in (select viewname from pg_views where schemaname = 'public');
