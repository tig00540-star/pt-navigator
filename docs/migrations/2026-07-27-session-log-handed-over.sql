-- 2026-07-27 session_log.handed_over — 트레이너 인계로 '닫힌' 계약 표식(잔여 0 취급).
-- 배경: 회원 재배정(A→B) 시 A 원계약을 삭제/수정하지 않고(과거 수업·매출 보존) '닫기'만 한다.
--       lib/memberStatus.js `remainingSessions`가 handed_over=true면 잔여 {0,0,0} 반환 →
--       activeContract(FIFO 잔여>0 위임)도 자동으로 이 계약을 후보에서 제외.
-- 안전: not null default false → 기존 행 전부 false = 잔여/활성/급여/매출 계산 무영향(멱등 add).
-- RLS: 무변 — auth_all_session_log(for all · account 스코프)가 UPDATE 이미 허용.
-- Supabase 대시보드 SQL 에디터에서 실행. 이 파일은 git 기록본.

alter table session_log add column if not exists handed_over boolean not null default false;

-- (선택·후속) 인계 시각 감사용 — 이번 배치엔 미사용(핸들러가 안 씀). 필요 시 주석 해제.
-- alter table session_log add column if not exists handed_over_at timestamptz;

-- 검증(대시보드에서):
--  ① 기존 행: select count(*) from session_log where handed_over;  → 0(전부 false).
--  ② 재배정 후: 인계된 원계약 1건만 handed_over=true · 잔여 파생이 그 계약을 0으로 봄.
--  ③ 롤백: alter table session_log drop column if exists handed_over;
