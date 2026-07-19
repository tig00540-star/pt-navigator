# v2 스펙 — 큐5 correctness · ChurnRiskToday 잔여 차감 복구

> 근거: `v2-스펙-큐5-성능-안전배치.md` §관찰, 리포트 §5. 클로드코드·대수 확인(자작 컴포넌트 버그).
> 성격: **correctness 수정**(의미 변경 O — 그래서 5-B-1 perf 커밋과 **별도 커밋**). 파일 1개.
> 전제: 5-B-1(ChurnRiskToday useMemo+session_log 컬럼축소)이 **먼저** 적용된 상태 위에 얹음. 커밋 규약 동일(라인번호 말고 코드내용 매칭).

---

## 문제 (1줄 진단)
`ChurnRiskToday`의 `daily_workout_log` 조회에 **`contract_id`가 없다.** `remainingSessions`는 `l.contract_id === contract.id`로 소진분(`used`)을 세는데, 넘어온 로그에 `contract_id`가 undefined라 **항상 `used = 0`** → 잔여가 **구매 총량 그대로**(차감 없음)로 계산된다.

**두 가지 잘못된 결과:**
1. **잔여 숫자 과대표시** — "잔여 N회"가 실제보다 큼(=구매 총량).
2. **이탈 목록 오혼입(더 심각)** — `if (rem.total <= 0) return null;`(잔여 0 = 재등록 대상이라 제외) 게이트가 **사실상 죽는다**(rem.total이 0이 될 수 없으니). 결과로 **수업을 다 쓴 재등록 대상 회원이 이탈 위험 목록에 섞인다.** 트레이너가 매일 여는 '오늘' 탭이라 잘못된 명단으로 연락 → 신뢰 손상.

## 수정 (한 곳)
`components/views/ChurnRiskToday.jsx`의 조회 `Promise.all` — `daily_workout_log` select에 **`contract_id` 추가.**

**현재**(5-B-1 적용 후 상태):
```js
const [{ data: cs }, { data: ls }] = await Promise.all([
  supabase.from("session_log").select("id, user_id, started_at, created_at, sessions_total, service_sessions"),
  supabase.from("daily_workout_log").select("user_id, session_at, created_at, voided, source"),
]);
```
**수정:**
```js
const [{ data: cs }, { data: ls }] = await Promise.all([
  supabase.from("session_log").select("id, user_id, started_at, created_at, sessions_total, service_sessions"),
  supabase.from("daily_workout_log").select("user_id, contract_id, session_at, created_at, voided, source"),
]);
```
- **그게 전부.** `contract_id` 한 컬럼 추가로 `remainingSessions`의 `used`가 정상 계산된다.
- `risky` useMemo·집계 로직은 **한 글자도 안 바꾼다**(입력 데이터만 정확해짐 → 올바른 결과).

## 파생되는 정상화 (의도된 개선 · 검증 시 참고)
`used`가 실제로 세지면서 아래가 함께 바로잡힌다 — 전부 **의도된 정상화**다:
1. **소진 회원 제외:** 잔여 0인 계약만 있는 회원 → `activeContract`가 null 반환(잔여>0 후보 없음) → `if (!active) return null` 또는 `rem.total<=0` 게이트로 **이탈 목록에서 빠진다**(재등록 대상이므로 정상).
2. **다중 계약 회원의 active 선택 정상화:** 옛 계약 소진·새 계약 잔여인 회원 → `activeContract`(FIFO 중 잔여>0)가 이제 **잔여 있는 계약**을 고른다(전엔 소진 계약도 후보라 최고참 소진분을 잡을 수 있었음). `gap`은 마지막 실제 수업(`session_at`) 우선이라 대부분 동일하나, 한 번도 안 온 회원의 fallback(`active.started_at`)은 선택 계약이 바뀌면 달라질 수 있음.
3. **잔여 표시 정확화:** "잔여 N회"가 실제 남은 수업으로 표시.

⚠️ **이탈 '판정' 자체(14일+ 무수업)는 불변** — `gap`은 `session_at` 기반이고 이 수정은 잔여 계산만 정상화한다. 판정 임계값·로직은 그대로.

## 커밋 (5-B-1 커밋 이후 별도 1커밋)
```
git commit -m "fix(ChurnRiskToday): daily_workout_log에 contract_id 추가 — 잔여 차감 복구(소진 회원 이탈목록 오혼입 제거)" -- components/views/ChurnRiskToday.jsx
```

## 검증 (대조 항목)
- **빌드/린트:** `npm.cmd run build` exit 0 · `npm.cmd run lint` green.
- **목록 구성 변화(핵심):** 수정 전 이탈 목록에 있던 회원 중 **실제로 수업을 다 쓴(잔여 0) 회원이 빠지는지** 확인. 이게 이번 수정의 본질.
- **잔여 숫자:** 남아 있는 회원의 "잔여 N회"가 **실제 남은 수업 수**(구매 총량 아님)로 줄어드는지.
- **무수업 판정 불변:** 잔여가 남고 14일+ 발길 끊긴 회원은 **그대로** 목록에 유지되는지(판정 로직 불변 확인).
- **엣지:** `contract_id`가 null인 로그(계약 무관 보강 수업 등)는 `remainingSessions`에서 어느 계약과도 매칭 안 돼 자연 제외 — 오작동 없는지.

## 스코프 밖 (건드리지 않음)
- `daily_workout_log`를 조회하는 **다른 컴포넌트**(PTView 등)는 이 수정과 무관 — ChurnRiskToday 한 파일만.
- 잔여 계산 로직(`lib/memberStatus.js`) 자체는 정상 — **입력 데이터 누락이 원인**이라 lib는 불변.
