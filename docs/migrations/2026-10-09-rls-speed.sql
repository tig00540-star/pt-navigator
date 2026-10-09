-- =============================================================================
-- 보안 규칙 속도(2026-10-09 · 대량 시험에서 발견) — 회원 16,000 · 운동일지 11만 건에서 트레이너 화면 조회가 8초 넘어 멈췄다.
--   ① 큰 표마다 account_id 색인이 없어 매번 전체를 훑었다 → account_id가 있는 public 표 전부에 색인
--   ② 보안 규칙의 auth_account_id() · auth_is_owner() · auth.uid() 등이 '줄마다' 다시 계산됐다
--      → (select …)로 감싸 '조회마다 한 번'만 계산(Supabase 공식 권장 · 결과는 똑같고 빠르기만 하다)
-- 규칙의 뜻은 하나도 바뀌지 않는다(같은 함수 · 같은 조건). 다시 실행해도 같은 결과(이미 감싼 것은 건너뜀).
-- 실행: Supabase SQL Editor(수동).
-- =============================================================================

-- ① account_id 색인
do $$
declare r record;
begin
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'account_id'
  loop
    execute format('create index if not exists %I on public.%I (account_id)', r.table_name || '_account_id_idx', r.table_name);
  end loop;
end $$;

-- 자주 쓰는 회원 · 담당 색인(트레이너 '내 회원' 조회 · 예약 · 확인)
create index if not exists user_table_trainer_idx on public.user_table (trainer_id);
create index if not exists appointment_user_idx on public.appointment (user_id, start_at);
create index if not exists session_log_trainer_idx on public.session_log (trainer_id);

-- ② 보안 규칙 안의 '나는 누구 · 어느 센터' 함수를 한 번만 계산하게 감싸기
do $$
declare
  p record; q text; w text; changed boolean;
  fn constant text := '(auth_account_id|auth_is_owner|auth_read_account_id|auth_read_is_owner|auth_account_plan|auth_read_account_plan|auth_member_id|auth_member_writable)';
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual; w := p.with_check; changed := false;
    if q is not null and q !~ 'SELECT (auth_|auth\.uid)' then
      q := regexp_replace(q, '\m' || fn || '\(\)', '(SELECT \1())', 'g');
      q := regexp_replace(q, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      changed := changed or q is distinct from p.qual;
    end if;
    if w is not null and w !~ 'SELECT (auth_|auth\.uid)' then
      w := regexp_replace(w, '\m' || fn || '\(\)', '(SELECT \1())', 'g');
      w := regexp_replace(w, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      changed := changed or w is distinct from p.with_check;
    end if;
    if changed then
      execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
        case when q is not null then format('using (%s)', q) else '' end,
        case when w is not null then format('with check (%s)', w) else '' end);
    end if;
  end loop;
end $$;

-- 검증: select count(*) from pg_policies where schemaname='public' and qual ~ 'auth_account_id\(\)' and qual !~ 'SELECT auth_account_id';  -- 0
-- 롤백: 규칙은 각 마이그레이션 파일을 다시 실행 · 색인은 drop index …_account_id_idx

-- ③ 결제 기록(구독료 · 환불)은 대표만(2026-10-09 · 대량 시험에서 발견: 센터 트레이너도 센터 결제 기록이 보였다)
drop policy if exists "payment_owner_select" on public.payment;
create policy "payment_owner_select" on public.payment for select to authenticated
  using (account_id = (select auth_account_id()) and (select auth_is_owner()));
drop policy if exists "payment_owner_select__ro" on public.payment;
create policy "payment_owner_select__ro" on public.payment for select to authenticated
  using (account_id = (select auth_read_account_id()) and (select auth_read_is_owner()));
