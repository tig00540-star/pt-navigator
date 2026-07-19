-- =============================================================================
-- appointment 기록본 — UI로 생성됐던 예약 테이블의 실제 DDL·RLS를 git에 백필
-- 실행일: 2026-07-19 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 이 파일이 하는 일:
--   appointment(주간 예약 · 스케줄 탭) 테이블/인덱스/RLS를 멱등 기록.
--   기존 라이브 DB엔 이미 존재 → 재실행 시 no-op. 재구축 DB엔 생성.
--   ※ 2026-07-19 라이브 스키마 추출(컬럼·제약·인덱스·pg_policy)과 1:1 대조해 확정. 추정 아님.
--
-- 전제 헬퍼(라이브에 존재): account 테이블 · auth_account_id() · auth_is_owner() · auth.uid().
-- ⚠️ user_id·log_id는 실제로 FK가 없다 — 코드는 user_table·daily_workout_log를 참조하지만
--    DB 레벨 FK 제약은 걸려 있지 않다(라이브 그대로 재현). 제약은 PK·account FK·status CHECK 3개뿐.
-- 멱등: create table if not exists · create index if not exists · drop policy if exists→create.
-- =============================================================================

create table if not exists appointment (
  id          uuid        not null default gen_random_uuid(),
  account_id  uuid        not null default auth_account_id() references account(id),  -- appointment_account_id_fkey
  trainer_id  uuid        not null default auth.uid(),        -- 예약 담당 트레이너 (FK 없음)
  user_id     uuid        not null,                           -- 회원(user_table.id) (FK 없음)
  start_at    timestamptz not null,                           -- 예약 시각
  status      text        not null default 'booked'
              constraint appointment_status_check check (status in ('booked', 'done', 'canceled')),
  log_id      uuid,                                           -- 완료 시 연결 수업일지(daily_workout_log.id) (FK 없음)
  created_at  timestamptz not null default now(),
  constraint appointment_pkey primary key (id)
);
alter table appointment enable row level security;

-- 주간 조회 인덱스 — (trainer_id, start_at). 스케줄 탭 로드 경로와 일치.
create index if not exists idx_appointment_trainer_start on appointment (trainer_id, start_at);

-- =============================================================================
-- RLS — 커맨드별 4개 정책(라이브 정책명·조건 그대로).
--   격리: account_id = auth_account_id()  (계정 경계)
--   가시성: auth_is_owner() OR trainer_id = auth.uid()  (원장은 계정 전체 · 트레이너는 본인 담당만)
--   ⚠️ 단일 for-all 정책 아님 — read/update/delete만 위 가시성 게이트, insert/update의 with_check는
--      account_id 일치만. 이 커맨드별 분리가 트레이너 간 예약 격리의 핵심(재구축 시 반드시 재현).
--   roles: authenticated(앱 하우스 표준 · inbody_log 등과 동일).
-- =============================================================================
drop policy if exists "auth_read_appointment" on appointment;
create policy "auth_read_appointment" on appointment for select to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

drop policy if exists "auth_write_appointment" on appointment;
create policy "auth_write_appointment" on appointment for insert to authenticated
  with check (account_id = auth_account_id());

drop policy if exists "auth_update_appointment" on appointment;
create policy "auth_update_appointment" on appointment for update to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()))
  with check (account_id = auth_account_id());

drop policy if exists "auth_delete_appointment" on appointment;
create policy "auth_delete_appointment" on appointment for delete to authenticated
  using (account_id = auth_account_id() and (auth_is_owner() or trainer_id = auth.uid()));

-- =============================================================================
-- 검증(읽기 전용 · 라이브 재실행 시 no-op이어야 정합):
--   select relrowsecurity from pg_class where relname='appointment';                    -- 기대 t
--   select polname, polcmd from pg_policy where polrelid='appointment'::regclass order by polname; -- 4행(r/a/w/d)
--   select indexname from pg_indexes where tablename='appointment';                     -- pkey + idx_appointment_trainer_start
-- 롤백(신설 재구축 DB에서만): drop table if exists appointment cascade;
-- =============================================================================
