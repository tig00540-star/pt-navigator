# v2 수정 스펙 — 묶음 D (maxDuration 조정) · 2026-07-19
> 근거: `v2-종합점검-리포트-2차-2026-07-19.md` §2 P0-4 잔여 + 대수 전제 정정(2026-07-19, fluid compute=enabled 확인)
> 성격: **함수 타임아웃 상한 조정.** 로직·payload·RLS·응답 불변. 선언값 1줄씩만.
> ⚠️ **전제(확인됨):** Vercel=Hobby · **fluid compute enabled** → default/max **300s**. 그래서 현재 `= 60`은 상향이 아니라 **천장을 낮추는 선언**이고, 코드 주석("기본 10~15s면 중도 종료")도 **낡음**(fluid compute 이전 기준).

---

## 1. Part 1 — AI 라우트 3개: 60 → 180 (권장 · 실행)
**왜 180:** 실측 45s(`ot-brief` 2차)의 **4배 마진** + 업스트림(모델) 무응답 시 **폭주 상한**(Hobby fair-use·provisioned memory 잠식 방지). **선언 제거(=300s)는 비권장** — 명시 상한을 둬서 hung 호출이 300s를 다 먹지 않게. 주석도 fluid compute 기준으로 정정.

### 1-1. `app/api/ot-brief/route.js` (현재)
```js
export const runtime = "nodejs";
export const maxDuration = 60; // ③ Sonnet 생성이 최대 ~1분 → Vercel 함수 타임아웃 상향
```
### 변경 후
```js
export const runtime = "nodejs";
export const maxDuration = 180; // Hobby+fluid compute 기본 300s. 실측 ~45s의 4배 마진 + 업스트림 무응답 폭주 상한(선언제거=300s는 비권장).
```

### 1-2. `app/api/voice-log/route.js` (현재)
```js
export const runtime = "nodejs"; // SDK는 Node 런타임 필요 (Edge 불가)
export const maxDuration = 60;  // STT + Claude 2연속 호출 → Vercel 함수 타임아웃 상향(기본 10~15s면 중도 종료)
```
### 변경 후
```js
export const runtime = "nodejs"; // SDK는 Node 런타임 필요 (Edge 불가)
export const maxDuration = 180;  // STT+Sonnet 2연속(최장 라우트). Hobby+fluid compute 300s 내 여유 + 폭주 상한.
```

### 1-3. `app/api/machine-cues/route.js` (현재)
```js
export const runtime = "nodejs";
export const maxDuration = 60; // Sonnet 호출 → Vercel 함수 타임아웃 상향(기본값이면 여유 없음)
```
### 변경 후
```js
export const runtime = "nodejs";
export const maxDuration = 180; // Sonnet 호출. Hobby+fluid compute 300s 내 여유 + 업스트림 무응답 폭주 상한.
```

---

## 2. Part 2 — service_role 3개(create-trainer·member-auth·member-revoke): **내 추천은 skip**
> 전제 정정 반영: 이 3개는 선언 없음 = **이미 300s**(fluid compute 기본). 그래서 **타임아웃 위험은 소멸** — 특히 member-auth 순차 6회 왕복 중단 → auth 유저 고아 시나리오는 300s에선 사실상 불가능.

**왜 skip을 추천하나(정직한 계산):**
- 남은 명분은 "폭주 시 자원 점유 상한"뿐인데, **fluid compute는 active CPU 과금**이라 hung Supabase 호출(I/O 대기)은 **점유 비용이 낮다** → 캡의 실익이 작다.
- 반대로 캡을 낮추면 member-auth의 createUser→연결→롤백 사이가 잘릴 **고아 리스크 안전마진만 줄어든다**(300s일 때 사실상 0).
- 즉 **이득은 marginal, 트레이드오프는 실재** → **300s 유지(선언 안 함)**가 합리적.

**그래도 "명시적 의도"를 남기고 싶으면(선택):** 고아 안전을 지키는 넉넉한 값 **120s**로. (60s로 더 조이면 자원상한은 세지지만 고아 안전마진이 더 줄어 — 비권장.)
각 파일 `export const runtime = "nodejs";` **바로 뒤**에 추가:
```js
export const maxDuration = 120; // 자원점유 상한(타임아웃 방지 아님 — fluid compute로 이미 300s). 정상 ~1-3s의 넉넉한 배수·고아 안전마진 보존.
```
(create-trainer / member-auth / member-revoke 동일. 넣을 거면 3개 다.)

---

## 3. 커밋
- **Part 1만(권장):** `app/api/ot-brief/route.js` + `app/api/voice-log/route.js` + `app/api/machine-cues/route.js`
  `perf(ai-routes): maxDuration 60→180 — fluid compute 300s 내 여유 확보 + 폭주 상한(낡은 주석 정정)`
  `git commit -m "<위>" -- app/api/ot-brief/route.js app/api/voice-log/route.js app/api/machine-cues/route.js`
- Part 2를 넣으면 같은 커밋에 3파일 추가 + 메시지에 `+ service_role 자원상한 120s` 부기.

## 4. 회귀 검증목록
- `npm.cmd run build` exit 0 · `npm.cmd run lint` green (`export const maxDuration` 값 변경뿐 — 빌드가 값 인식).
- **배포 후:** 유일한 동작 변화는 "AI 라우트가 60s에서 잘리지 않고 최대 180s까지 실행". 정상 생성(음성일지·OT브리핑)은 그대로 완료. 긴 생성이 60s 근처에서 끊기던 게 있었다면 이제 통과.
- **불변:** 라우트 로직·프롬프트·응답·requireTrainer 게이트 전부 불변. `runtime="nodejs"` 유지.

## 5. 롤백
파일별 revert(값 3줄). 인프라·DB 변경 없음.

## 6. 남은 로드맵
- **P1-9+P1-10**(성능): `RegisterDueToday` deps 루프(형제 `memberKey` 패턴) + `select("*")`→컬럼축소 · `MyStats` useMemo 0개.
- **§8 정리:** `lib/date.js` 통합(kstYm·ymd·daysSince·fmtDay·todayStr·fmtDate) · 중복 `fmtDay`(4벌)·`Sparkline` 자기복사본·`public/` CRA 잔재 svg 제거.
- **P0-6(시한폭탄):** `daily_workout_log` 700행 도달 시 max-rows 대응(월별 집계/잔여 계산 분리 · 서버 RPC).
