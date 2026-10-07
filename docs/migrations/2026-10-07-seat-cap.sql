-- 센터 트레이너 추가 자리 최대 20 → 7(2026-10-07 대표 · 트레이너 최대 10명)
-- 이유: 토스 빌링 심사에 '한 번 결제 최고가'를 신고해야 함 → 149,000 + 7 × 39,900 = 428,300원.
-- 앱 쪽 같은 숫자: lib/plans.js MAX_EXTRA_SEATS · /api/billing/plan(자리 더하기 409).

-- 0) 먼저 확인 — 8개 이상인 센터가 있으면 아래 제약이 실패한다(지금은 0이어야 정상)
select id, name, extra_seats, next_extra_seats from account where extra_seats > 7 or next_extra_seats > 7;

-- 1) 제약 바꾸기
alter table account drop constraint if exists account_extra_seats_chk;
alter table account add constraint account_extra_seats_chk
  check (extra_seats between 0 and 7 and (next_extra_seats is null or next_extra_seats between 0 and 7));

-- 확인: select pg_get_constraintdef(oid) from pg_constraint where conname = 'account_extra_seats_chk';
