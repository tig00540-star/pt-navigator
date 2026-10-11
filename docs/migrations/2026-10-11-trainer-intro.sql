-- =============================================================================
-- 트레이너 '내 소개'(2026-10-11) — OT 신청 QR 페이지 맨 위 + 세일즈북 2번째 장
--   trainer_profile: 한 줄 소개 · 전문 분야 · 사진 · 보여 줄 사례(순서대로)
--   sales_case: 사진 · 후기 사례는 트레이너가 '회원님께 동의받았어요'를 체크해야 저장(누가 · 언제 기록)
--   회원 페이지의 '포트폴리오 활용 동의'는 없앤다(대표 결정 · 동의는 트레이너가 직접 받는다). 남은 동의 기록은 그대로 둔다.
-- 새 정책 없음(trainer_profile = 본인 upsert · sales_case = 센터 범위 그대로). 다시 실행해도 같은 결과.
-- =============================================================================
alter table trainer_profile add column if not exists intro       text;     -- 한 줄 소개(80자)
alter table trainer_profile add column if not exists tags        text[];   -- 전문 분야(최대 5개)
alter table trainer_profile add column if not exists photo_path  text;     -- sales-cases/{계정}/profile/… (선택)
alter table trainer_profile add column if not exists intro_cases uuid[];   -- 보여 줄 사례 id(순서대로 · 최대 4개)

alter table sales_case add column if not exists consent_confirmed_at timestamptz;   -- 사진 · 후기: 트레이너가 동의받았다고 체크한 때
alter table sales_case add column if not exists consent_confirmed_by uuid;          -- 체크한 트레이너

-- ── 1차 OT '내 회원님 변화 모음집'(2026-10-11 · 대표: 1차엔 회원별 세일즈북 대신 한 번 만들어 계속 쓰는 모음집) ──
--   trainer_profile.showcase = { cases: [사례 id 순서], care: [관리 모습 id 순서] }
--   sales_case kind 'care' = 관리 모습 캡처(대화 캡처 · 회원 페이지 화면 · 기타 · data.path = sales-cases 버킷 · data.sub)
alter table trainer_profile add column if not exists showcase jsonb;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.sales_case'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table sales_case drop constraint %I', c);
  end loop;
end $$;
alter table sales_case add constraint sales_case_kind_check check (kind in ('photo', 'inbody', 'lift', 'review', 'care'));

-- ── 동의 체크 기록 보호(2026-10-11 점검) — '누가 · 언제 체크했나'가 증거라 화면이 보낸 값 대신 서버가 채운다.
--   로그인한 사람이 체크를 새로 하거나 바꾸면 by = 그 사람 · at = 지금. 체크 없이 by만 바꾸는 건 무시.
--   서버 작업(service_role · auth.uid() 없음 · 다른 아이디에서 가져오기)은 원래 기록을 그대로 옮긴다.
create or replace function _sales_case_consent_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.consent_confirmed_at is not null
     and (tg_op = 'INSERT' or old.consent_confirmed_at is null or new.consent_confirmed_at is distinct from old.consent_confirmed_at) then
    new.consent_confirmed_at := now();
    new.consent_confirmed_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.consent_confirmed_by := case when new.consent_confirmed_at is null then null else old.consent_confirmed_by end;
  end if;
  return new;
end $$;
drop trigger if exists sales_case_consent_stamp on sales_case;
create trigger sales_case_consent_stamp before insert or update on sales_case
  for each row execute function _sales_case_consent_stamp();

-- 검증: select column_name from information_schema.columns where table_name in ('trainer_profile','sales_case') and column_name in ('intro','tags','photo_path','intro_cases','consent_confirmed_at','consent_confirmed_by','showcase');  -- 7행
--       select pg_get_constraintdef(oid) from pg_constraint where conname = 'sales_case_kind_check';  -- care 포함
