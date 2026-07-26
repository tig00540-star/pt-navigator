-- 2026-07-26 pay_scheme SELECT 스코프 축소 — 동료 급여 스킴 노출 차단(보안)
-- 문제: pay_scheme_sel 이 `account_id = auth_account_id()` 하나뿐이라, 같은 계정의
--       트레이너 누구나 다른 트레이너의 개별 급여 스킴(band 구조·payout·incentive)까지 SELECT 가능.
--       (payroll_run 은 이미 owner-or-self 로 스코프됨 · 이 파일은 pay_scheme 을 같은 패턴으로 맞춤.)
-- 수정: 원장은 전체 / 트레이너는 "계정 기본(trainer_id null) + 본인 override(trainer_id = auth.uid())"만.
--       → 트레이너의 '내 급여 근거 확인'은 유지, 동료 override 열람만 차단.
-- INSERT/UPDATE/DELETE 정책은 무변(이미 원장 전용). SELECT 만 교체.
-- Supabase 대시보드 SQL 에디터에서 실행. 이 파일은 git 기록본.

drop policy if exists pay_scheme_sel on pay_scheme;

create policy pay_scheme_sel on pay_scheme for select
  using (
    account_id = auth_account_id()
    and (auth_is_owner() or trainer_id is null or trainer_id = auth.uid())
  );

-- 검증(대시보드에서):
--  ① 원장 세션: select * from pay_scheme;  → 계정 전체 행 보임(변화 없음).
--  ② 트레이너 세션: 본인 override + 계정 기본만 보이고, 다른 trainer_id override 행은 0건.
--  ③ 앱: admin TrainerScorecard 급여계산은 owner라 무변 · 트레이너 '내 실적' 급여 근거도 정상.
