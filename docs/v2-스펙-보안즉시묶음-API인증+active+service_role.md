# v2 스펙 — 보안 즉시묶음 (API 인증+레이트리밋 · 오프보딩 active · service_role 감사)

> 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 `docs/migrations` 기록본). 폰=Vercel 배포본 하드리프레시.
> Phase 2 트랙 결정 = **즉시묶음 먼저**(트랙 무관, 난이도 낮고 가치 큰 3개). 그다음 solo 또는 회원앱 게이트로 분기.

---

## 0. 왜 이 3개 (진단 근거)

코드·마이그레이션 실물 확인 결과:

- **`/api/voice-log`·`/api/ot-brief`에 인증·레이트리밋이 0.** 두 핸들러 다 `ANTHROPIC_API_KEY`(또는 OPENAI) 존재만 확인하고 바로 모델을 호출한다. 로그인 세션 검증 없음 → **URL만 알면 anon이 POST해서 AI 토큰을 태울 수 있다**(비용·DoS). UI가 로그인 뒤에 있어도 라우트 자체는 열려 있어 **오늘 실재하는 노출.** `app/api/create-trainer/route.js`는 이미 `Bearer 토큰 → getUser → owner 검증` 패턴을 갖고 있어 이식이 쉽다.
- **오프보딩 구멍:** RLS 헬퍼 `auth_account_id()`·`auth_is_owner()`가 `trainer.active`를 안 본다. `active=false`(비활성)로 내려도 RLS를 그대로 통과 → 접근 차단이 안 됨. 헬퍼 2개에 `and active` 한 줄이면 닫힌다(데이터 보존·삭제 아님).
- **service_role:** `app/api/create-trainer/route.js`가 `process.env.SUPABASE_SERVICE_ROLE_KEY`(NEXT_PUBLIC 접두어 아님)로 읽어 **코드상 서버전용은 맞다.** 다만 git 히스토리·클라 번들·로그 노출 여부는 실제로 훑어 확정해야 함(감사 항목).

**스코프 밖(다음 단계):** 회원별 RLS, 트레이너 내부데이터(closing_*·sales_intensity·report.brief) 회원 은폐, 로그 trainer_id RLS, 프롬프트 인젝션, 개인정보 동의, SIM teardown. 전부 회원앱 게이트에서 다룸.

---

## A. API 인증 + 레이트리밋 (voice-log · ot-brief)

**목표:** 두 AI 라우트를 로그인한 **활성 트레이너만** 호출 가능하게 잠그고(anon·비활성 차단), 정상 트레이너의 폭주도 가벼운 상한으로 막는다. **데모 모드(Supabase 키 미설정)에서는 인증을 스킵**해 기존 동작(키 없으면 데모 폴백) 보존.

### A-1. 서버 공용 헬퍼 (신설) — `lib/requireTrainer.js` (서버 전용)

라우트에서만 import. 반환은 `{ ok:true, user }` 또는 `{ ok:false, res }`(즉시 반환할 Response).

```js
// lib/requireTrainer.js — 서버 전용(라우트에서만 import). AI 라우트 인증+레이트리밋 공용.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 인메모리 스로틀(uid별 슬라이딩 윈도). ⚠️ 서버리스 = 인스턴스별·콜드스타트 리셋(best-effort).
// anon 남용은 인증이 이미 막으므로, 이건 '정상 트레이너 폭주' 2차 방어.
const HITS = new Map(); // uid -> number[] (ms 타임스탬프)
function throttle(uid, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (HITS.get(uid) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  HITS.set(uid, arr);
  return true;
}

/** 로그인 활성 트레이너 검증 + 스로틀. 데모 모드(키 없음)면 인증 스킵({ok:true, user:null}). */
export async function requireTrainer(request) {
  // 데모 모드: Supabase 미설정이면 앱도 데모라 게이트 없음 → 인증 스킵(기존 동작 보존).
  if (!url || !anon) return { ok: true, user: null };

  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { ok: false, res: Response.json({ error: "인증 필요" }, { status: 401 }) };

  // 유저 토큰을 실은 클라이언트 → getUser로 JWT 검증 + trainer 본인 행은 RLS(id=auth.uid())로 조회.
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u, error: ue } = await sb.auth.getUser();
  if (ue || !u?.user?.id) return { ok: false, res: Response.json({ error: "세션 무효" }, { status: 401 }) };

  // 활성 트레이너인지(오프보딩 방어 · B와 이중 방어). 비활성/미등록 = 403.
  const { data: t } = await sb.from("trainer").select("active").eq("id", u.user.id).maybeSingle();
  if (!t || t.active !== true) {
    return { ok: false, res: Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
    return { ok: false, res: Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 }) };
  }
  return { ok: true, user: u.user };
}
```

주의점:
- `getUser()`(인자 없음)는 `global.headers`의 Authorization을 써서 **인증 서버로 JWT를 실검증**한다(anon 키로 만든 클라이언트여도 OK — service_role 불필요).
- `trainer` 조회는 기존 RLS 정책 `auth_read_own_trainer`(`id = auth.uid()`)로 본인 행이 읽힌다. 이 정책은 헬퍼를 안 쓰므로 B(active 헬퍼 변경) 이후에도 비활성 트레이너가 **자기 행을 읽어 active=false를 확인**할 수 있어 403 분기가 정상 동작한다.
- 스로틀은 `Date.now()` 사용(앱 코드라 문제없음). 상한 20/60s는 자연스러운 사용(수업당 1~2회 생성)엔 여유. 필요시 조정.

### A-2. 라우트 2곳에 게이트 삽입

**`app/api/ot-brief/route.js`** — `POST` 최상단(키 체크보다 먼저):

```js
import { requireTrainer } from "@/lib/requireTrainer";
// ...
export async function POST(request) {
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { /* 기존 503 데모 폴백 그대로 */ }
  // ...이하 기존 로직 불변
}
```

**`app/api/voice-log/route.js`** — 동일하게 `POST` 최상단에 삽입:

```js
import { requireTrainer } from "@/lib/requireTrainer";
// ...
export async function POST(request) {
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  // ...이하 기존 로직 불변
}
```

> 배치 이유: 인증을 **키 체크보다 먼저** 둔다 → 미인증 요청은 키 유무와 무관하게 401로 즉시 거절. 데모 모드면 requireTrainer가 ok:true라 통과 후 키 미설정 503 → 클라 데모 폴백(기존 흐름 보존).

### A-3. 클라이언트 공용 헬퍼 (신설) — `lib/authHeader.js`

```js
// lib/authHeader.js — 클라이언트. AI 라우트 fetch에 Bearer 토큰을 실어준다.
import { supabase } from "@/lib/supabaseClient";

/** 현재 세션의 Authorization 헤더. 데모 모드(supabase null)면 빈 객체(라우트도 인증 스킵). */
export async function authHeader() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

### A-4. 호출부 4곳에 헤더 부착 (⚠️ 빠지면 401로 앱이 깨짐)

`Select-String -Path app,components -Pattern "/api/voice-log|/api/ot-brief"` 로 **전체 호출부를 먼저 확정**할 것(아래는 확인된 4곳 — acute 등 누락분 있으면 같은 패턴으로 추가).

확인된 호출부:

| 파일 | 라인(대략) | phase | 현재 헤더 |
|---|---|---|---|
| `components/tabs/FirstOTAssist.jsx` | ~121 | ot-brief first | `{"Content-Type":"application/json"}` |
| `components/tabs/SecondOTTab.jsx` | ~171 | ot-brief second | `{"Content-Type":"application/json"}` |
| `components/views/PtReRegTab.jsx` | ~101 | ot-brief reregister | `{"Content-Type":"application/json"}` |
| `components/tabs/VoiceLogTab.jsx` | ~238 | voice-log | 헤더 객체 없음(FormData) |

**JSON 라우트(ot-brief 3곳)** — 헤더에 스프레드로 병합:

```js
import { authHeader } from "@/lib/authHeader";
// ...
const res = await fetch("/api/ot-brief", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(await authHeader()) },
  body: JSON.stringify({ /* 기존 그대로 */ }),
});
```

**FormData 라우트(voice-log)** — Content-Type은 브라우저가 자동 지정하므로 **Authorization만** 추가:

```js
import { authHeader } from "@/lib/authHeader";
// ...
const res = await fetch("/api/voice-log", {
  method: "POST",
  headers: { ...(await authHeader()) },   // ← FormData엔 Content-Type 넣지 말 것(boundary 깨짐)
  body: fd,
});
```

> **커밋 단위 규칙:** A는 **서버(A-1·A-2) + 클라이언트(A-3·A-4)를 한 커밋·한 푸시로.** 서버만 먼저 배포되면 그 사이 앱이 401로 깨진다(Vercel 자동배포). 반대로 클라만 먼저면 무해(헤더는 붙지만 라우트가 아직 안 봄).

### A-5. 429/403 클라 처리(선택·가벼움)

기존 non-ok 처리(voice-log=데모 폴백, ot-brief=에러 표시)에 그대로 흘러가도 무방. 단 429/403은 **데모로 폴백하지 말고** 짧은 안내가 자연스럽다(선택): "요청이 많아요, 잠시 후" / "권한이 없어요". 최소 구현은 기존 에러 경로 재사용.

---

## B. 오프보딩 — RLS 헬퍼에 `active` 반영 (SQL)

**목표:** 비활성 트레이너(`active=false`)를 RLS 레벨에서 잠근다. `auth_account_id()`가 NULL을 돌려주면 account 스코프 정책이 전부 거짓이 되어 읽기·쓰기 0(데이터는 보존).

**실행 전 사전 확인**(대시보드 SQL) — 지금 잠글 대상이 아닌 트레이너가 잘못 막히지 않게:

```sql
-- 기대: 파일럿 owner 1행 active=true. active=false가 '지금 로그인 필요한 사람'이면 멈추고 재검토.
select id, role, active, name from trainer order by active, role;
```

**기록본 파일:** `docs/migrations/2026-07-13-offboarding-active.sql` (아래 내용). 실행은 Supabase 대시보드.

```sql
-- =============================================================================
-- 오프보딩 하드닝 — RLS 헬퍼 2개에 active 반영 (비활성 트레이너 접근 차단)
-- 실행일: 2026-07-13 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일: auth_account_id()·auth_is_owner()가 active=true인 trainer만 인정.
--   비활성 트레이너 → auth_account_id()=NULL → account 스코프 정책 전부 거짓 → 접근 0(데이터 보존).
-- 전제: ⑦-b(auth_account_id)·⑦-c2a(auth_is_owner) 존재. 멱등: create or replace.
-- 사전확인: select id,role,active from trainer; (활성 필요한 사람이 active=false면 중단)
-- 롤백: 파일 하단 주석(and active 제거본으로 복원).
-- =============================================================================

create or replace function auth_account_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select account_id from trainer where id = auth.uid() and active
$$;

create or replace function auth_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from trainer where id = auth.uid() and role = 'owner' and active)
$$;

-- =============================================================================
-- 검증: 활성 트레이너 로그인 → 회원목록·탭 정상(회귀 없음).
--       (실증) 2번째 트레이너 active=false로 내리고 그 계정 로그인 → 회원목록 빈칸/접근 불가.
-- -----------------------------------------------------------------------------
-- ROLLBACK (and active 제거):
-- create or replace function auth_account_id() returns uuid language sql stable security definer
--   set search_path = public as $$ select account_id from trainer where id = auth.uid() $$;
-- create or replace function auth_is_owner() returns boolean language sql stable security definer
--   set search_path = public as $$ select exists (select 1 from trainer where id = auth.uid() and role='owner') $$;
-- =============================================================================
```

주의:
- 이 함수들은 여러 정책이 공유하므로 변경 즉시 **모든 데이터 테이블 접근에 active가 반영**된다(원하는 효과).
- `create-trainer` 라우트는 service_role로 RLS 우회 + trainer 직접 조회라 이 변경에 영향 없음.
- 코드 변경 아님 → git엔 기록본만. **B는 A와 독립**이라 먼저 적용해도 안전(활성 트레이너엔 무변화).

---

## C. service_role 감사 (코드 변경 아님 · 확인 후 보고)

`SUPABASE_SERVICE_ROLE_KEY`가 서버 밖으로 새지 않는지 실확인. PowerShell에서:

```powershell
# 1) 키 이름이 create-trainer 라우트 밖에서 쓰이나 (기대: app\api\create-trainer\route.js 만)
Select-String -Path app,components,lib,scripts,hooks -Pattern "SERVICE_ROLE" -List

# 2) NEXT_PUBLIC 접두어로 service 키가 노출됐나 (기대: 결과 없음)
Select-String -Path . -Pattern "NEXT_PUBLIC.*SERVICE" -List

# 3) 라우트가 키를 로그로 흘리나 (기대: process.env로 '읽는' 줄만, console 출력 없음)
Select-String -Path app\api\create-trainer\route.js -Pattern "SERVICE_ROLE_KEY|console\."

# 4) .env.local이 git 추적 제외인가 (기대: .env.local 경로 출력 = ignore됨)
git check-ignore .env.local

# 5) 비밀키 파일이 커밋 이력에 있었나 (기대: 결과 없음)
git log --all --oneline -- .env.local .env
```

추가 수동 확인:
- **Vercel 대시보드** → 프로젝트 Environment Variables에서 `SUPABASE_SERVICE_ROLE_KEY`가 **NEXT_PUBLIC 아님** + 스코프가 서버(Production/Preview)인지.
- 클라이언트 번들 유출: `NEXT_PUBLIC_`이 아닌 env는 Next.js가 클라 번들에 넣지 않는다(구조상 안전). 위 1~2로 접두어 오용만 없으면 OK.

**보고:** 1은 create-trainer 1곳만, 2·3·5는 결과 없음, 4는 ignore, Vercel 서버 스코프 — 이 상태면 통과. 하나라도 어긋나면 그 항목만 후속 처리.

---

## 검토 체크리스트 (트레이너 git diff → 웹Claude 검토 시 확인)

- [ ] `lib/requireTrainer.js` 서버 전용 — 클라 컴포넌트에서 import 안 됨(라우트 2곳만). `"use client"` 파일에서 참조 없나 `Select-String -Path components,app -Pattern "requireTrainer"`.
- [ ] 두 라우트 `POST` **최상단**에 게이트 삽입, 기존 키체크·로직 순서 보존.
- [ ] `lib/authHeader.js`는 데모 모드(supabase null)에서 `{}` 반환.
- [ ] 호출부 **전체**(Select-String로 확정) 헤더 부착 — 특히 voice-log는 **Content-Type 미포함**(FormData boundary 보호), ot-brief는 기존 Content-Type 유지 + 스프레드.
- [ ] A 서버+클라 **한 커밋**(부분 배포 방지). lint(`npm.cmd run lint`) 통과.
- [ ] B SQL: 사전확인 쿼리로 active=false 오탈락 없음 확인 후 실행. 활성 트레이너 회귀 없음(회원목록·탭 정상).
- [ ] C 감사 5개 명령 결과 보고.

## 커밋 순서 (제안)

1. **B**(SQL): 대시보드 실행 → `docs/migrations/2026-07-13-offboarding-active.sql` 추가 → `docs: 오프보딩 active 헬퍼` (또는 A와 함께 문서 커밋). *독립·먼저 안전.*
2. **A**(서버+클라 한 커밋): `lib/requireTrainer.js`·`lib/authHeader.js` 신설 + 라우트 2곳 + 호출부 N곳 → `feat(security): AI 라우트 인증+레이트리밋`. 파일지정 `git add` 후 lint → 푸시.
3. **C**: 감사 실행·보고(커밋 없음). 이상 시에만 후속.
4. 폰 확인: 로그인 상태에서 음성일지 생성·1차/2차/재등록 브리핑 정상(200). (선택) 시크릿창에서 `/api/ot-brief`에 토큰 없이 POST → 401 확인.

---

## 다음 (즉시묶음 후)

트랙 분기 재확인: **solo 먼저**(게이트 없이 새 기능) vs **회원앱 게이트**(회원 RLS + 내부데이터 view 은폐 + 로그 trainer_id RLS + 동의 + teardown). 즉시묶음 커밋·검토 끝나면 이어서 스펙.
