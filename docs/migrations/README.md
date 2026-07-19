# docs/migrations — 스키마 증분 로그

이 폴더는 **Supabase SQL Editor에서 수동 실행한 SQL의 git 기록본**이다.
각 파일은 실행 시점의 증분(테이블 신설·컬럼 추가·RLS 변경)이며, 파일명은 `YYYY-MM-DD-<주제>.sql`.

## ⚠️ 이 폴더만으로는 "처음부터 재구축"이 안 된다
초기 베이스 테이블 일부는 **Supabase 대시보드 UI로 생성**돼 `create table` DDL이 이 폴더에 없다:

- `user_table` · `ot_log` · `daily_workout_log` · `center_machine` (베이스 4개)
- `session_log` 본체 · `appointment` (UI 생성 · 컬럼/정책은 이후 증분 파일에 일부만 기록)

이 테이블들의 **컬럼 다수·RLS 초기 정책**은 sprint 산문 문서와 라이브 DB에만 존재한다.
(RLS 잠금 자체는 `2026-07-08-step7*` 파일들에 기록돼 있다.)

## 재구축(새 Supabase 프로젝트) 절차
1. **베이스 스키마 스냅샷을 먼저 적용**한다. 권위 있는 원본은 라이브 DB 덤프:
   - `supabase db dump --schema public > base-schema-snapshot.sql` (Supabase CLI), 또는
   - 대시보드 → Database → 각 테이블 "Definition" 복사, 또는 `pg_dump --schema-only`.
   - 이 스냅샷을 `0000-base-schema-snapshot.sql`로 보관(민감정보 없음 · 스키마만).
2. 그 위에 이 폴더의 증분 파일들을 **날짜순**으로 적용한다(멱등이라 중복 무해).

> 즉 이 폴더 = **레이어(증분)**, 완전 재구축 = **베이스 스냅샷 + 이 레이어**.

## 규약
- **멱등 필수**: `create table if not exists` · `alter table ... add column if not exists` · `drop policy if exists → create policy`. 실제 존재하는 DB에 재실행해도 no-op.
- 트레이너-facing RLS 표준: `using (account_id = auth_account_id())`. 회원-facing: `auth_member_id()`.
- 각 파일 하단에 **검증 쿼리(읽기 전용)** + **ROLLBACK** 주석.
- 신설 테이블은 반드시 `alter table X enable row level security;`(anon 차단).
