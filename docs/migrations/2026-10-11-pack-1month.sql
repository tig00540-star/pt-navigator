-- =============================================================================
-- 2026-10-11 · AI 추가 팩 기간 = 산 날부터 1개월(대표 결정 · 토스 '다음 달 이월 불가' 답 때문)
--   2026-10-11-pack-carryover.sql을 3개월로 먼저 실행했다 → 기본값만 1개월로 바꾼다.
--   예: 10월 11일 산 팩 = 11월 10일까지(11월 11일 0시 · 한국 시간에 끝남).
--   이미 들어간 팩(2026-10-11 기준 0건)도 같은 규칙으로 맞춘다. 여러 번 실행해도 됨.
-- =============================================================================
alter table ai_credit alter column expires_at
  set default ((((now() at time zone 'Asia/Seoul')::date + interval '1 month')::date)::timestamp at time zone 'Asia/Seoul');
update ai_credit
   set expires_at = ((((created_at at time zone 'Asia/Seoul')::date + interval '1 month')::date)::timestamp at time zone 'Asia/Seoul')
 where expires_at > ((((created_at at time zone 'Asia/Seoul')::date + interval '1 month')::date)::timestamp at time zone 'Asia/Seoul');

select column_default from information_schema.columns where table_name = 'ai_credit' and column_name = 'expires_at';
