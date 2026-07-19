# v2 수정 스펙 — 묶음 A (P0-1 구독게이트 + P0-2 fail-open 차단) · 2026-07-19
> 근거: `v2-종합점검-리포트-2차-2026-07-19.md` §2 P0-1·P0-2 (§7 1단계 "묶음 A")
> 성격: **인증/인가 하드닝.** 로직 재작성 아님 — 문지기 판정에 조건 2개 **추가(additive)**. RLS·payload·데이터 스키마 불변.
> 대상 파일: **`lib/requireTrainer.js` 단 하나** → **1커밋**(revert 단위 = 이 묶음 전체).
> 협업: 이 스펙대로 클로드코드가 수정 → 대수가 `git diff` 확인 후 커밋. 매칭은 라인번호 말고 **코드 내용**으로.

---

## 0. 왜 한 묶음인가
두 P0가 **같은 파일**(`requireTrainer.js`)에 있고, 둘 다 "AI 라우트(`ot-brief`·`voice-log`·`machine-cues`) 실행 전 문지기"의 구멍이다.
- **P0-1** = 문지기가 구독을 안 봄 → **미결제 계정이 AI 무제한**(크레딧 소진).
- **P0-2** = 문지기가 키 부재를 "데모"로 오해해 **인증 전면 스킵**(fail-open).
한 파일·한 커밋으로 처리한다.

## 1. 검증 전제 (이번에 코드로 확인함)
- `requireTrainer.js:38-41` — 현재 `trainer.active !== true`만 검사. 구독 검사 **없음**. → 미결제도 통과. **[확인]**
- `2026-07-13-signup-trigger.sql:31-32` — 가입 시 `active:true` owner 트레이너 자동 생성. `2026-07-16-b1a:8` — 신규 account는 `subscription_status` **default 'inactive'**. → **가입만으로 active 트레이너 + inactive 계정** 성립. **[확인]**
- `2026-07-16-b1c-account-status.sql:6-23` — `my_account_status()` 리턴 `table(has_account, subscription_status, plan, current_period_end, is_expired, access)`, `access = (subscription_status='active' AND (current_period_end IS NULL OR current_period_end > now()))`. **`grant execute ... to authenticated`(:23)** → 유저 토큰 `.rpc()` 호출 가능. **[확인]**
- `AuthGate.jsx:53,56` — 클라 결제벽이 쓰는 게 바로 이 `my_account_status().access`. → **서버 게이트가 같은 걸 쓰면 UI와 100% 일치**. **[확인]**
- ⚠️ **`my_account_status().access`는 `trainer.active`를 포함하지 않음**(구독만 봄). 반면 `auth_account_id()`(B1-B, 전 RLS 사용)는 active+구독을 묶음. → **requireTrainer는 기존 active 검사 유지 + access 검사 추가 = 둘 다 필요.** **[확인]**
- 현재 배포는 Supabase 키가 있어 앱이 정상 동작(로그인·RLS) → **P0-2의 키부재 분기를 지금은 안 탄다** → fail-closed로 바꿔도 **정상 배포엔 무영향**. **[확인]**

---

## 2. P0-1 — 구독 활성 계정만 AI 라우트 통과

### 2-1. 현재 코드 (매칭 기준)
```js
  // 활성 트레이너인지(오프보딩 방어 · B와 이중 방어). 비활성/미등록 = 403.
  const { data: t } = await sb.from("trainer").select("active").eq("id", u.user.id).maybeSingle();
  if (!t || t.active !== true) {
    return { ok: false, res: Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
```

### 2-2. 변경 후 (active 블록 **바로 뒤**, throttle **앞**에 삽입)
```js
  // 활성 트레이너인지(오프보딩 방어 · B와 이중 방어). 비활성/미등록 = 403.
  const { data: t } = await sb.from("trainer").select("active").eq("id", u.user.id).maybeSingle();
  if (!t || t.active !== true) {
    return { ok: false, res: Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 }) };
  }

  // 구독 활성 계정인지(층1 결제벽의 API 쪽 · UI AuthGate와 동일 출처 my_account_status).
  // access = subscription_status='active' AND (current_period_end IS NULL OR > now()).
  // ⚠️ access는 trainer.active를 포함하지 않으므로 위 active 검사와 별개로 둘 다 필요.
  const { data: st, error: se } = await sb.rpc("my_account_status");
  if (se || st?.[0]?.access !== true) {
    return { ok: false, res: Response.json({ error: "구독이 필요합니다." }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
```

### 2-3. 로직 근거
- `sb`는 이미 유저 JWT를 실은 클라이언트(`:29-32`). `my_account_status()`는 SECURITY DEFINER + `auth.uid()` 기반이라 이 토큰으로 정확히 본인 계정 상태를 반환.
- set-returning 함수라 supabase-js는 **배열** 반환 → `st?.[0]?.access`(AuthGate `data?.[0]`와 동일 관례).
- `access !== true`(만료·inactive·조회실패 전부) → 403. **fail-closed**(모호하면 막는다).
- **비용 차단 지점:** requireTrainer는 라우트 본문(=Sonnet 호출) **이전**에 돈다 → 데이터가 비어도 LLM 호출 자체를 막아 크레딧 소진을 차단.
- **베타 트레이너 무영향 조건:** 그들의 account가 `subscription_status='active'`이면 `access=true` → 정상 통과(§6 선결 참조).

---

## 3. P0-2 — 키 부재 fail-open → 명시 옵트인 + fail-closed

### 3-1. 현재 코드 (매칭 기준)
```js
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
…
```js
export async function requireTrainer(request) {
  // 데모 모드: Supabase 미설정이면 앱도 데모라 게이트 없음 → 인증 스킵(기존 동작 보존).
  if (!url || !anon) return { ok: true, user: null };
```

### 3-2. 변경 후
모듈 스코프에 플래그 추가:
```js
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEMO = process.env.DEMO_MODE === "1"; // 명시적 데모 옵트인(키 부재만으로는 인증 스킵 안 함)
```
함수 진입부 분기 교체:
```js
export async function requireTrainer(request) {
  // 데모 모드: 키 부재 + 명시 옵트인(DEMO_MODE=1)일 때만 인증 스킵.
  // 그 외 키 부재 = 설정 오류로 보고 fail-closed(503) + 서버 로그(무음 방지).
  if (!url || !anon) {
    if (DEMO) return { ok: true, user: null };
    console.error("[requireTrainer] Supabase 환경변수 누락 + DEMO_MODE 미설정 → 503 (fail-closed)");
    return { ok: false, res: Response.json({ error: "서버 설정 오류" }, { status: 503 }) };
  }
```

### 3-3. 로직 근거
- **왜 `DEMO_MODE=1` 명시 옵트인인가:** env 실수(오타·누락)는 "값이 사라지는" 방향이지 "양성 플래그가 켜지는" 방향이 아니다. 그래서 `DEMO_MODE=1`은 실수로 켜질 수 없다 → 설정 실수와 설정 의도가 분리된다.
- **왜 `NODE_ENV`가 아닌가(리포트 P0-2 제안 보정):** Vercel은 **Preview·Production 둘 다 `NODE_ENV=production`으로 빌드**한다. 그래서 `NODE_ENV !== "production"` 가드는 원래 우려한 "Preview에 env 누락" 시나리오를 **구분하지 못한다.** 두 환경을 나누는 변수는 `NODE_ENV`가 아니라 `VERCEL_ENV`(`production`/`preview`/`development`)다. → env 기반 분기 대신 **명시 플래그**가 정답.
- **키가 있는 정상 배포는 이 분기를 아예 안 탄다** → DEMO_MODE 유무와 무관하게 정상 인증. 즉 **정상 배포엔 완전 무영향**, 이 변경은 "키가 사라졌을 때"만 작동.
- `console.error`는 잘못된 배포에서만 찍혀 Vercel 함수 로그에 흔적을 남긴다(P0-2 "탐지 불가" 해소, §6-1 관측성 정신).
- **P0-2가 P0-1의 스로틀 무력화도 동시 해결:** 기존 fail-open은 `user:null` 반환으로 uid 스로틀(`:43`)까지 무력화했는데, 이제 그 경로가 사라진다.

---

## 4. 통합 후 `requireTrainer.js` 전체 (참고용 · 정본은 위 매칭 스펙)
```js
// lib/requireTrainer.js — 서버 전용(라우트에서만 import). AI 라우트 인증+레이트리밋 공용.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEMO = process.env.DEMO_MODE === "1"; // 명시적 데모 옵트인(키 부재만으로는 인증 스킵 안 함)

// 인메모리 스로틀(uid별 슬라이딩 윈도). ⚠️ 서버리스 = 인스턴스별·콜드스타트 리셋(best-effort).
const HITS = new Map();
function throttle(uid, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (HITS.get(uid) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  HITS.set(uid, arr);
  return true;
}

/** 로그인 활성+구독 트레이너 검증 + 스로틀. 키부재+DEMO_MODE=1이면 인증 스킵. */
export async function requireTrainer(request) {
  // 데모 모드: 키 부재 + 명시 옵트인(DEMO_MODE=1)일 때만 인증 스킵. 그 외 키 부재 = 설정 오류 → 503.
  if (!url || !anon) {
    if (DEMO) return { ok: true, user: null };
    console.error("[requireTrainer] Supabase 환경변수 누락 + DEMO_MODE 미설정 → 503 (fail-closed)");
    return { ok: false, res: Response.json({ error: "서버 설정 오류" }, { status: 503 }) };
  }

  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { ok: false, res: Response.json({ error: "인증 필요" }, { status: 401 }) };

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return { ok: false, res: Response.json({ error: "세션 무효" }, { status: 401 }) };

  // 활성 트레이너인지(오프보딩 방어). 비활성/미등록 = 403.
  const { data: t } = await sb.from("trainer").select("active").eq("id", u.user.id).maybeSingle();
  if (!t || t.active !== true) {
    return { ok: false, res: Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 }) };
  }

  // 구독 활성 계정인지(층1 결제벽 API 쪽 · UI AuthGate와 동일 출처). access는 active 미포함 → 별개 검사.
  const { data: st, error: se } = await sb.rpc("my_account_status");
  if (se || st?.[0]?.access !== true) {
    return { ok: false, res: Response.json({ error: "구독이 필요합니다." }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
    return { ok: false, res: Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 }) };
  }
  return { ok: true, user: u.user };
}
```

---

## 5. 커밋
- **범위:** `lib/requireTrainer.js` 1파일.
- **메시지 제안:**
  `fix(security): AI라우트 인증 하드닝 — 미결제 계정 구독게이트(my_account_status) + 키부재 fail-open→DEMO_MODE 옵트인·503`
- PowerShell 범위 커밋: `git commit -m "<위 메시지>" -- lib/requireTrainer.js`

---

## 6. ⚠️ 배포 전 선결(운영/경영 — 코드 아님)
1. **베타 트레이너 계정 활성화 확인 (P0-1 직접 영향).**
   B1-A가 *기존* account는 grandfather(active/premium)했지만, **신규 베타 가입자는 default `inactive`** → 이 스펙 적용 후 그들은 AI가 **403**이 된다.
   → 베타 오픈 전 각 베타 트레이너 account를 `subscription_status='active'`(+ 필요시 `current_period_end`=체험 종료일)로 세팅. (원장/관리자 경로 또는 SQL. UI 결제벽도 동일하게 열림 = 정합.)
2. **Vercel env 확인.** Production/Preview에 `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY` 존재(현재 있음 — 앱 동작 중). **정상 배포는 DEMO_MODE 불필요**(키 있으면 분기 안 탐).
3. **키 없는 데모 배포가 필요할 때만** 해당 환경에 `DEMO_MODE=1` 추가. 로컬은 `.env.local`에 키가 이미 있어 데모 분기 자체를 안 타므로 보통 불필요.

## 7. 회귀 검증목록
**로컬(클로드코드):**
- `npm.cmd run build` exit 0 · `npm.cmd run lint` green.
- 본인 계정(grandfather=active/premium) 로그인 → **음성일지 생성/OT브리핑 정상**(active + access=true).

**배포 후(폰/curl):**
- 구독 `active` 계정(본인/베타) → AI 라우트 3개 정상.
- 구독 `inactive` 테스트 계정의 JWT로 `curl -H "Authorization: Bearer <jwt>" -X POST .../api/ot-brief` → **403 "구독이 필요합니다"**(무제한 소진 차단 확인).
- 정상 배포(키 있음)에서 로그인·AI 회귀 없음 → P0-2가 정상 경로에 무영향임을 확인.

**불변 확인(안 바뀌어야 하는 것):**
- AI 라우트 3개의 `requireTrainer` **호출부·`!ok` 처리 불변**(이 스펙은 라우트 파일 미변경).
- RLS·payload·데이터 스키마 불변. `throttle`·`getUser`·`active` 로직 불변(추가만).

## 8. 롤백
`lib/requireTrainer.js`를 직전 커밋으로 revert(1커밋 단위). DB·마이그레이션 변경 없음 → 스키마 롤백 불필요.

## 9. 다음 (이 묶음 뒤)
리포트 §7 순서대로 **묶음 B(P0-3 음성 크기 가드)** → **묶음 D(maxDuration 상향 + service_role 라우트 3개 부여)** → P1 관측성(P1-5·6).
