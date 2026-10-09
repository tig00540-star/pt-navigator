-- =============================================================================
-- 앱 운영(2026-10-08) — 결제 이상 · 자동 처리 기록 · 앱 오류 모음
--   ops_alert : 매일 결제 작업이 찾은 결제 이상(이중 결제 의심 · 금액 다름 · 환불 실패 · 결제 실패 계속 · 토스엔 있는데 기록 없음)
--               status open = 사람이 볼 것 · auto = 앱이 알아서 처리한 기록 · done/ignored = 처리 끝
--   app_error : 화면(브라우저) · 서버 · 예약 작업 오류. 같은 오류는 fingerprint로 묶어 센다. 회원 이름 · 번호 · 주소의 토큰은 남기지 않는다.
-- 둘 다 서버(service_role)만 읽고 쓴다 — 정책 없음. 회사 업무 사이트는 /api/ops/alerts(OPS_SECRET)로 합계 · 건 번호만 받는다.
-- 실행: Supabase SQL Editor(수동). 다시 실행해도 같은 결과(멱등).
-- =============================================================================

create table if not exists ops_alert (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  key         text not null unique,                 -- 같은 이상은 한 번만(예: dup_{결제 id})
  kind        text not null,                        -- refund_failed · refund_retried · duplicate_charge · amount_mismatch · charge_failing · card_notice · toss_missing
  severity    text not null default 'check' check (severity in ('urgent', 'check', 'info')),
  status      text not null default 'open' check (status in ('open', 'auto', 'done', 'ignored')),
  account_id  uuid references account(id) on delete set null,
  payment_id  uuid,
  amount      integer,
  title       text not null,
  detail      jsonb not null default '{}'::jsonb,
  handled_at  timestamptz,
  handled_by  text,
  note        text
);
create index if not exists ops_alert_status_idx on ops_alert(status, created_at desc);
alter table ops_alert enable row level security;
revoke all on ops_alert from anon, authenticated;

create table if not exists app_error (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  source      text not null check (source in ('client', 'server', 'cron')),
  fingerprint text not null,
  path        text,
  message     text,
  digest      text,
  role        text
);
create index if not exists app_error_fp_idx on app_error(fingerprint, created_at desc);
create index if not exists app_error_time_idx on app_error(created_at desc);
alter table app_error enable row level security;
revoke all on app_error from anon, authenticated;

-- 오래된 오류 기록은 90일 뒤 지운다(매일 결제 작업이 함께 정리 · lib/opsCheck).
-- 검증: select count(*) from ops_alert; select count(*) from app_error;
-- 롤백: drop table ops_alert; drop table app_error;
