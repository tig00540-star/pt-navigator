# v2 — 스프린트8 인계 · 스케줄 보드 + 급여/매출 대시보드 완료 · 파일럿 직전

> 이번 세션 = **스케줄 보드(C1~C5)** + **급여/매출/클로징 대시보드(D1~D5, owner+트레이너)** + **시뮬 데이터** 구축.
> ⑦(멀티트레이너)까지 끝난 위에 "트레이너의 하루(스케줄)·급여·매출"을 얹어 **파일럿 기능셋 사실상 완성.**
> 남은 것 = sweep(버그) → 시뮬 teardown → 배포 준비. 고급(D-3 AI·QC 실데이터)은 파일럿 데이터 뒤.
>
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ 커밋은 트레이너 직접 터미널(파일지정 `git add`) · diff 통과 후 · 직후 `git show --stat HEAD`.
> ★ SQL은 Supabase 대시보드 직접 실행 → git엔 `docs/migrations/*.sql` 기록본만. SQL 성공 ≠ 반영(실증 필수).

---

## 0. 지금 위치 (전체 로드맵 대비)

```
v1 뼈대(삼각편대) ······································ ✅
v2 실 AI(음성일지·OT 브리핑·클로징) ···················· ✅
로드맵 ①~⑥(1차OT·뷰분리·PT관리·통계·치트키·다듬기) ···· ✅
⑦ 로그인·RLS·소유권·권한·온보딩·격리(멀티트레이너) ······ ✅
기능D 클로징케이스: D-1a·D-1b ✅ / D-2·D-3 ⏳(파일럿 뒤)
─────────────────────────────────────────────
[이번 세션 신규]
스케줄 보드 C1~C5 ······································ ✅
급여/매출/클로징 대시보드 D1~D5 ························ ✅
시뮬 데이터(트레이너3·회원36) ·························· ✅ (배포 전 teardown 대상)
─────────────────────────────────────────────
남음: 시뮬 sweep → teardown → 배포 준비 → 파일럿
      그 뒤: QC 실데이터 · D-2 · D-3 · 스케줄 반복 등
```

**커밋(origin/main):** … → `2df8577`(스케줄 C1) → `4952146`(C2) → C3 → `4f688e7`(C4+C5b) →
`c5a43b0`(admin 트레이너별 실적) → `59919b5`(급여 계산) → `c2d8568`(내 실적 뷰). *(D1 kind wiring 커밋 해시 별도 확인)*

---

## 1. 이번 세션 완료 상세

### 스케줄 보드 (`components/views/ScheduleBoard.jsx` · 첫 탭)
- **C1** 주간 그리드(요일×시간 06–24 조정) + 빈 셀→회원 배치(appointment insert) + 로그인 첫 화면.
- **C2** 예약 칩 액션: 완료(차감)/취소 + 주간·오늘 토글 + 오늘 뷰(남은 수업 N).
- **C3** 완료 시 수업내용 입력 → daily_workout_log(차감) + 카톡 복사·sent_at. 차감안함(보강)=contract_id null.
- **C4** 완료 모달에 음성입력(VoiceLogTab 재사용, source=voice·raw_voice_text).
- **C5** owner 트레이너 필터(전체/이름별) + 예약에 담당 트레이너 라벨. (선행 SQL: C5a owner가 trainer 전체 조회.)
- **모델:** 예약(계획)=appointment / 완료(차감)=daily_workout_log(기존 `remainingSessions` 재사용). 한 예약=한 로그(log_id).

### 급여/매출/클로징 대시보드
- **D1** kind wiring — `buildContract`에 kind + `confirmPtActive`='new' + PTView 재등록='reregister'.
- **D2** memberStatus 함수: `revenueByTrainer`·`closingStatsByTrainer`.
- **D3** `/admin` **트레이너별 실적** 섹션 — 이달 매출(신규/재등록·금액·건수·비율) + 클로징률.
- **D4** 급여 — `pay_policy` 테이블(구간표) + `sessionPriceSumByTrainer` + `payForMonth`.
  - ★ **급여 공식(중요):** 급여 = **이달 완료 수업의 회당단가 합 × 구간%** + 인센. 구간%는 **이달 총매출**로 결정.
    (판매액×%가 아니라 "가르친 만큼". 노쇼도 차감되면 급여 포함, 보강(계약없음) 제외.)
- **D5** `components/views/MyStats.jsx` — 트레이너 본인 "내 실적" 탭(이달 매출·예상 급여·클로징률, 본인 것만).

---

## 2. 신규 스키마·마이그레이션 (★ 기록본 커밋 확인)

이번 세션 SQL(대시보드 실행 완료). `docs/migrations/`에 기록본 저장·커밋됐는지 확인:
- **session_log 확장(①-a)** — `trainer_id`(default auth.uid) + `kind` text + check. (2026-07-09)
- **session_log RLS(①-b)** — owner=전체 / 트레이너=본인 계약 (auth_is_owner 재사용).
- **appointment 신설(SCHED-1)** — `{account_id,trainer_id,user_id,start_at,status,log_id}` + 트레이너 스코프 RLS + 인덱스.
- **C5a** — trainer 테이블에 owner 전체읽기 정책(`auth_read_account_trainers`).
- **pay_policy 신설** — 구간표(min_amt·max_amt·base_pct·incentive_type/value) + account read 정책 + 파일럿 seed 5행.

**기존 헬퍼:** `auth_account_id()`(⑦-b), `auth_is_owner()`(⑦-c-2a). 파일럿 account id = `11111111-1111-1111-1111-111111111111`.

---

## 3. 앱 건강·무게 점검

**결론: 위험한 수준 아님. 의존성 가볍고(Next16/React19/lucide-react·Supabase) 성능 문제 없음.** 단 아래는 다듬을 대상.

**큰 파일(분리 권장):**
- `components/views/PTView.jsx` ~810줄 — 계약·수업로그·재등록·급한불·타임라인 한 파일. 분리 예약.
- `components/tabs/SecondOTTab.jsx` ~860줄 — D-3 착수 때 renderBrief 분리 예약.
- `app/page.jsx` ~770줄 — MemberForm·MemberListTab 내장. 여유되면 분리.

**데이터 로딩(파일럿 규모 OK · 대규모 시 개선):**
- `/admin`·`MyStats`가 `session_log`/`daily_workout_log`/`ot_log`를 **`select *` 전체 로딩** 후 클라 집계.
  한 센터·회원 수십~수백이면 무방. 수천 로그로 커지면 **서버 집계(RPC/뷰)·월 필터 쿼리**로 전환 필요.
- `MyStats`가 daily_workout_log를 계정 전체로 받아 본인 것만 계산 — 페이로드·프라이버시 경미(파일럿 신뢰 무방). 필요 시 `.in(회원ids)` 필터 or trainer 스코프 RLS.

**스케줄 그리드:** 셀마다 appts 필터(O(셀×예약)). 예약 적으면 무방. 많아지면 슬롯 맵으로 메모.

**한 줄:** 지금은 "무겁지 않음". 파일 분리 2건 + 대규모 대비 서버집계가 나중 숙제.

---

## 4. ★ 부분 수정·보안·추가 목록 (새 채팅에서 짚을 것)

**보안·격리:**
- `daily_workout_log`·`ot_log` = account 스코프만(트레이너 스코프 아님). 정상 UI 동선엔 안 새지만 직접 REST 방어 없음. 파일럿 신뢰 무방, 필요 시 trainer_id RLS.
- `service_role` 키(create-trainer) — 서버 전용 유지. 브라우저/깃 금지.
- **trainer FK on delete** = restrict 유지 + 오프보딩=active=false. **구멍:** active=false는 접근차단 아님(RLS 헬퍼가 active 안 봄) → 오프보딩 시 auth ban 또는 헬퍼에 `and active` 필요.

**코드 정리:**
- PTView·SecondOTTab 분리. page.jsx 슬림.

**미완 UI/기능:**
- **pay_policy 편집 UI**(원장이 구간표 %·인센 수정) — 지금 DB 직접 수정.
- **오프보딩 UI**(트레이너 비활성 + 접근차단).
- **비번 변경 UI** · **초대 메일(SMTP)** — 지금 임시비번 수동.
- **회원 기본정보 수정 UI.**
- **스케줄:** 반복 예약 · 시간변경 · 완료 취소 · 시간범위 저장(지금 세션 전용).
- **QC 실데이터화** — `/admin` TRAINERS 하드코딩 + 카피봇 데모(행동 계측 선행).
- admin 헤더 "강남 1호점" 하드코딩 등 카피 정리.

**데이터 정리(배포 전):**
- **시뮬 teardown** — `residence='SIM-데이터'` 회원·계약·수업·예약·클로징 삭제(seed 파일 하단 블록).
- 테스트 트레이너(김/이/박) 정리 or 유지 결정.
- 옛 테스트 클로징 행 등.

**파일럿 뒤(고급):**
- **D-2**(1차 클로징 케이스) · **D-3**(케이스 AI 활용 — 설계=`v2-closing-cases-D3-design-note.md`).
- 결정권자 키트·가격표 테이블 등(D-3 노트).

---

## 5. 파일럿 준비 체크리스트

- [ ] 시뮬 전체 sweep(격리·스케줄→급여 연결·매출 검산·엣지) — 아래 §7.
- [ ] 시뮬 데이터 teardown.
- [ ] 실회원 개인정보 수집·활용 동의 절차.
- [ ] 배포: `git push` → Vercel Ready 확인(대시보드) → 폰 하드리프레시.
- [ ] 트레이너 배포: Vercel URL + 로그인(이메일·임시비번) + **QR + "홈 화면에 추가" 안내**(아이폰=사파리 공유→추가, 프로그램 설치 불가).
- [ ] 마케팅 카피 의료·과장 표현 검토.
- [ ] 아직 데모인 것(QC 등) "데모" 라벨 확인.

---

## 6. 작업 규약 (유지)

- 착수 스펙 = 붙여넣기 블록(대상파일·정확위치·절대무변경·범위밖·lint·확인 + ★"커밋 금지").
- 검토 = `git --no-pager diff <파일>` 원문 / 신설은 전체.
- 커밋 = 트레이너 직접 · 파일지정 add · 통과 후 · `git show --stat HEAD`.
- SQL = 대시보드 · 기록본만 git · 멱등 · 잘게 · 롤백 짝 · 실증.
- 환경: PowerShell(`C:\Users\tig00\pt-navigator`) · grep 없음 · lint `npm.cmd run lint` · 폰=Vercel · `.next` stale 주의 · 키는 서버환경만.
- 철학(MASTERPLAN ⭐⭐): 뼈대 먼저·상품화 뒤 · 되돌리기 어려운 SQL 신중 · 오버빌드 방지 · 스파링 파트너 · 운동처방 숫자금지(세일즈·급여 숫자는 별개) · 상향평준화.

---

## 7. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접.
> 환경: PowerShell(grep 없음). lint = npm.cmd run lint. SQL은 Supabase 대시보드 직접 실행(git엔 migrations 기록만).
> 첨부 먼저 읽어줘: v2-sprint8-handoff.md(이 문서·제일 중요) + MASTERPLAN · v2-closing-cases-D3-design-note ·
> memberStatus.js · ScheduleBoard.jsx · MyStats.jsx · app/admin/page.jsx · app/page.jsx · PTView.jsx (필요 시 짚어 청구).
>
> 지금 상태: ⑦ 멀티트레이너 + 스케줄 보드 + 급여/매출/클로징 대시보드까지 완성. 시뮬 데이터로 실증 중.
> 다음: 시뮬 sweep → teardown → 파일럿 배포. 그 뒤 QC 실데이터·D-3 등.
> 먼저 §4(부분 수정·보안·추가)에서 뭘 먼저 할지랑 §7 sweep부터 같이 정하자.
