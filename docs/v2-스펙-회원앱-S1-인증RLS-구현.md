# v2 스펙 — 회원 앱 S1 (인증 · RLS 뼈대) · 구현

> 성격: **구현 스펙**(클로드코드 실행용). 설계 근거 = `docs/v2-설계-회원앱-MVP-아키텍처.md`.
> 스코프: 화면 없음. **회원이 카톡 링크 + 휴대 끝4자리로 로그인 → 자기 데이터만 읽는 세션**까지 검증.
> 흐름: 이 스펙 → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰/Supabase 검증.
> 실행: SQL은 Supabase 대시보드(git엔 `docs/migrations` 기록본), 라우트는 파일. 커밋은 트레이너 직접(파일지정 `git add` · `npm.cmd run lint` 통과 후 · 직후 `git show --stat HEAD`).

---

## 0. 한눈에 (S1이 만드는 것)

```
[회원] /m/<member_token> 링크 열기 → 휴대 끝4자리 입력
   │
   ▼ POST /api/member-auth  { token, phoneLast4 }        ← service_role 서버전용(RLS 우회)
[서버] token으로 user_table 조회 → phone_number 끝4 대조
   │   일치 → (최초 1회) 회원용 auth 유저 생성 + user_table.member_auth_id 연결
   │        → 비번 회전 후 signInWithPassword로 세션 발급
   ▼ { access_token, refresh_token, member:{id,name} }
[회원 클라] supabase.auth.setSession(...) → 이후 회원 JWT로 직접 조회
   │
   ▼ RLS가 자동 스코프: auth_member_id() = 내 user_table.id
[Supabase] user_table / daily_workout_log / inbody_log = 내 행만 SELECT.
           트레이너 헬퍼(auth_account_id / auth_is_owner)는 회원 세션에서 NULL
           → 매출·급여·타회원·account 스코프 전 테이블 = 원천 0행.
```

핵심 보안 논리 하나만 기억: **회원 auth 유저는 `trainer` 테이블에 행이 없다.** 기존 트레이너 정책은 전부 `auth_account_id()`(= `trainer`에서 조회)에 걸려 있으므로, 회원 세션에선 그 함수가 `NULL` → `account_id = NULL` → 거짓 → **트레이너/관리자 데이터 전부 차단.** 회원은 새로 추가하는 `auth_member_id()` 기반 정책으로 **자기 행만** 열린다.

---

## 1. 전제 · 재료 확인 (읽은 것 기준)

- `user_table`: `id uuid PK`, `name`, `phone_number text`(카톡 전송용 = **끝4자리 대조 소스**), `account_id`, `trainer_id`, + 문진 9필드(`quit_reason`·`member_note` 등). RLS = `account_id = auth_account_id()` 스코프(SELECT/UPDATE/INSERT).
- `daily_workout_log`: `user_id uuid FK→user_table`, `account_id`, `ai_summary`, `raw_voice_text`. RLS = account 스코프.
- `inbody_log`: `user_id uuid FK→user_table`, `account_id`, 측정치들, `note`. RLS = account 스코프(for all).
- 헬퍼 패턴(`auth_account_id()` / `auth_is_owner()`): `language sql · stable · security definer · set search_path = public`, `grant execute ... to authenticated`. **회원 헬퍼도 같은 틀로 만든다.**
- `handle_new_signup()` 트리거: `auth.users` INSERT 시 `raw_user_meta_data->>'account_type'`가 있을 때만 account+trainer 생성. **없으면 즉시 return(no-op).** → 회원 유저는 `account_type`을 **절대 안 넣는다** → 트리거 무해(회원에겐 trainer 행 안 생김).
- 서버 라우트 패턴: `create-trainer/route.js` = `runtime="nodejs"` + `SUPABASE_SERVICE_ROLE_KEY`로 admin(`createUser`/`deleteUser`), 실패 시 롤백. member-auth도 동일 원칙.
- 환경변수(이미 존재): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. 세션 발급 메커니즘 결정 (§7 확정 반영)

**회원 세션 = 실제 Supabase auth 유저**(설계 §7 추천 그대로). 서버가 세션을 "발급"하는 구체 방법 = **비번 회전 + 서버측 `signInWithPassword`**:

1. 회원은 email이 없음 → **합성 이메일** `m-<user_table.id>@member.pt-navigator.app` 사용(uuid라 유일 · 실제 발송 없음 · `email_confirm:true`로 생성이라 확인 불필요).
2. token+휴대 검증 통과 시 서버가 그 회원 auth 유저의 **비밀번호를 매 로그인마다 새 랜덤값으로 회전**(`admin.updateUserById`, 최초면 `admin.createUser`).
3. 서버가 **anon 키 클라이언트로 `signInWithPassword(email, newPw)`** → `{ session.access_token, session.refresh_token }` 획득.
4. 그 토큰 2개를 클라에 반환 → 클라 `supabase.auth.setSession({access_token, refresh_token})`.

> 이 방식의 장점: (a) 비번을 **저장하지 않음**(매번 회전, 서버가 즉시 소비), (b) **이메일 발송·"Confirm email" 설정과 무관**(생성 시 `email_confirm:true`라 프로젝트 Confirm 설정에 영향 안 받음 → 미결 항목과 디커플), (c) 이후 회원 조회는 클라→Supabase 직접(RLS가 스코프) → **라우트는 로그인 1회만**, 매 조회를 프록시할 필요 없음.
> 대안(참고): `admin.generateLink({type:'magiclink'})` → `hashed_token` 반환 → 클라 `verifyOtp`. 비번 회전 레이스가 신경 쓰이면 이쪽. **MVP는 비번 회전으로 간다**(create-trainer와 멘탈모델 동일 · 로직 서버 집중).
> 레이스 주의(경미): 회원이 거의 동시에 2번 제출하면 두 번째 `signInWithPassword`가 회전된 비번과 어긋나 실패할 수 있음. 클라에서 제출 버튼 중복클릭 방지 + 실패 시 1회 재시도로 흡수(MVP 허용).

---

## 3. PART 1 — SQL 마이그레이션 (Supabase 대시보드 실행 + `docs/migrations/2026-07-16-member-auth-rls.sql` 기록본)

> 스타일: 기존 마이그레이션과 동일(멱등 · 검증쿼리 · 롤백 주석). **B-3b/⑦-c 완료 상태 전제**(account/trainer · `auth_account_id()` · account 스코프 RLS 존재).

```sql
-- =============================================================================
-- 회원 앱 S1 — 회원 인증·RLS 뼈대
--   member_token · member_auth_id 컬럼 + auth_member_id() 헬퍼 + 회원 SELECT 정책(가산)
-- 실행일: 2026-07-16 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일:
--   1) user_table에 member_token(초대 토큰)·member_auth_id(회원 auth 연결) 추가.
--   2) auth_member_id() = 회원 세션 → 내 user_table.id (trainer 세션엔 NULL).
--   3) 회원 SELECT 정책을 user_table/daily_workout_log/inbody_log에 '가산'(기존 트레이너 정책과 OR).
-- ★ 안 하는 일: 회원 INSERT/UPDATE/DELETE 없음(v1=열람 전용). 트레이너 정책 무변경.
-- ★ 격리 원리: 회원 auth 유저는 trainer 행이 없어 auth_account_id()/auth_is_owner()=NULL
--   → 트레이너·account 스코프 정책 전부 거짓 → 매출·급여·타회원·session_log·ot_log 원천 0행.
-- 멱등: add column if not exists / create or replace / drop policy if exists→create.
-- 롤백: 파일 하단 주석.
-- =============================================================================


-- ========== 1) user_table 컬럼 추가 (nullable · 트레이너가 S3에서 토큰 발급) =====
alter table user_table add column if not exists member_token   uuid;
alter table user_table add column if not exists member_auth_id uuid references auth.users(id) on delete set null;
--   ↑ on delete set null = 테스트계정 teardown(회원 auth 유저 삭제) 시 링크 자동 해제 → 재로그인 때 라우트가 재생성·재연결(정합성).

-- 토큰 조회·auth 매핑 인덱스(부분 유니크 = NULL 다수 허용, 값은 유일)
create unique index if not exists user_table_member_token_uidx
  on user_table (member_token) where member_token is not null;
create unique index if not exists user_table_member_auth_uidx
  on user_table (member_auth_id) where member_auth_id is not null;


-- ========== 2) auth_member_id() 헬퍼 (회원 세션 → 내 user_table.id) ============
-- SECURITY DEFINER = user_table RLS 우회해 안전 매핑(정책 재귀 방지). 트레이너 세션엔 매핑 없어 NULL.
create or replace function auth_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from user_table where member_auth_id = auth.uid()
$$;
grant execute on function auth_member_id() to authenticated;


-- ========== 3) 회원 SELECT 정책 (가산 · 기존 트레이너 정책과 OR로 공존) =========
-- Postgres 정책은 permissive라 같은 테이블/cmd/role에 여러 개면 OR.
--  · 트레이너 세션: 트레이너 정책 참 / 회원 정책 거짓(auth_member_id()=NULL → id=NULL).
--  · 회원 세션:     트레이너 정책 거짓(auth_account_id()=NULL) / 회원 정책은 내 행만 참.
-- → 서로의 접근을 넓히지 않음(각 세션은 자기 정책만 만족).

drop policy if exists "member_read_own_user" on user_table;
create policy "member_read_own_user"
  on user_table for select to authenticated
  using (id = auth_member_id());

drop policy if exists "member_read_own_daily_log" on daily_workout_log;
create policy "member_read_own_daily_log"
  on daily_workout_log for select to authenticated
  using (user_id = auth_member_id());

drop policy if exists "member_read_own_inbody" on inbody_log;
create policy "member_read_own_inbody"
  on inbody_log for select to authenticated
  using (user_id = auth_member_id());


-- =============================================================================
-- 검증 쿼리 (읽기 전용)
-- (A) 컬럼·인덱스 — 기대: member_token·member_auth_id 존재, 부분유니크 인덱스 2개.
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='user_table'
--     and column_name in ('member_token','member_auth_id');
--
-- (B) 정책 — 기대: 각 테이블에 member_read_* SELECT 정책 1개씩, qual에 auth_member_id().
-- select tablename, policyname, cmd, qual from pg_policies
--   where policyname like 'member\_%' order by tablename;
--
-- (C) ★격리 실증(라우트 완성 후, 회원 세션 JWT로) — 기대: 내 것만 / 트레이너것 0.
--     아래는 회원 access_token으로 로그인한 supabase 클라에서 실행(폰 콘솔 or 임시 스크립트):
--     - select count(*) from user_table;        -- 기대 1 (내 행)
--     - select count(*) from daily_workout_log;  -- 기대 = 내 일지 수
--     - select count(*) from inbody_log;         -- 기대 = 내 인바디 수
--     - select count(*) from session_log;        -- 기대 0 (트레이너 스코프)
--     - select count(*) from ot_log;             -- 기대 0
--     - select count(*) from trainer;            -- 기대 0
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- drop policy if exists "member_read_own_user"      on user_table;
-- drop policy if exists "member_read_own_daily_log" on daily_workout_log;
-- drop policy if exists "member_read_own_inbody"    on inbody_log;
-- drop function if exists auth_member_id();
-- drop index if exists user_table_member_token_uidx;
-- drop index if exists user_table_member_auth_uidx;
-- alter table user_table drop column if exists member_auth_id;
-- alter table user_table drop column if exists member_token;
-- =============================================================================
```

---

## 4. PART 2 — `app/api/member-auth/route.js` (신규 · service_role 서버전용)

> `create-trainer/route.js` 패턴 재사용(runtime nodejs · service 키 · admin API · 실패 롤백). **인증 헤더 불필요**(회원은 아직 로그인 전) — 대신 token(불가추측 uuid) + 휴대 끝4(2차) + 스로틀로 방어. 에러는 **일반화**(어느 쪽이 틀렸는지 노출 금지).

```js
// app/api/member-auth/route.js — 회원 로그인(카톡 토큰 + 휴대 끝4 → 세션). 서버전용.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 토큰별 인메모리 스로틀(끝4 브루트포스 방어). 서버리스 = best-effort(인스턴스별·콜드리셋).
const HITS = new Map(); // token -> number[] (ms)
function throttle(token, limit = 6, windowMs = 600000) {
  const now = Date.now();
  const arr = (HITS.get(token) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  HITS.set(token, arr);
  return true;
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = crypto.randomBytes(16);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAIL = () =>
  Response.json({ error: "링크가 유효하지 않거나 정보가 일치하지 않습니다." }, { status: 401 });

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !svcKey || !anon) return Response.json({ error: "서버 키 미설정" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim().toLowerCase();
  const last4 = String(body.phoneLast4 || "").trim();
  if (!UUID_RE.test(token) || !/^\d{4}$/.test(last4)) return FAIL();

  if (!throttle(token))
    return Response.json({ error: "시도가 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });

  const svc = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) 토큰으로 회원 조회(service_role = RLS 우회)
  const { data: member } = await svc
    .from("user_table")
    .select("id, name, phone_number, member_auth_id")
    .eq("member_token", token)
    .maybeSingle();
  if (!member) return FAIL();

  // 2) 휴대 끝4 대조(숫자만 추출)
  const digits = String(member.phone_number || "").replace(/\D/g, "");
  if (digits.length < 4 || digits.slice(-4) !== last4) return FAIL();

  // 3) 회원 auth 유저 확보(최초=생성·연결 / 재방문=비번 회전). account_type 미설정 → 가입트리거 no-op.
  const email = `m-${member.id}@member.pt-navigator.app`;
  const password = genPassword();
  let authId = member.member_auth_id;

  if (authId) {
    const { error: ue } = await svc.auth.admin.updateUserById(authId, { password });
    if (ue) authId = null; // 유저 삭제됨(teardown 등) → 아래서 재생성·재연결
  }
  if (!authId) {
    const { data: created, error: ce } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "member", member_id: member.id }, // account_type 없음(중요)
    });
    if (ce || !created?.user?.id) {
      return Response.json({ error: "회원 세션 생성 실패." }, { status: 500 });
    }
    authId = created.user.id;
    const { error: le } = await svc.from("user_table").update({ member_auth_id: authId }).eq("id", member.id);
    if (le) {
      await svc.auth.admin.deleteUser(authId); // 정합성: 연결 실패 시 방금 만든 유저 롤백
      return Response.json({ error: "회원 연결 실패." }, { status: 500 });
    }
  }

  // 4) 세션 발급 = anon 클라로 서버측 로그인 → 토큰 반환
  const pub = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: se } = await pub.auth.signInWithPassword({ email, password });
  if (se || !sess?.session) return Response.json({ error: "세션 발급 실패." }, { status: 500 });

  return Response.json({
    ok: true,
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    member: { id: member.id, name: member.name },
  });
}
```

클라(참고 · S2에서 실제 화면과 함께 구현): `/m/<token>` 페이지에서 끝4 입력 → `fetch("/api/member-auth", {method:"POST", body: JSON.stringify({token, phoneLast4})})` → 성공 시 `supabase.auth.setSession({access_token, refresh_token})` → 회원 홈 이동. **S1은 라우트까지만.**

---

## 5. ★ 보안 주의 — 컬럼 노출 (S2 회원 화면 붙이기 전 반드시 해소)

RLS는 **행(row) 단위**라, 회원 SELECT 정책은 "내 행"은 열어주되 **그 행의 모든 컬럼**을 준다. 그런데:

- `user_table.member_note` · `quit_reason` = **트레이너용 세일즈 메모**(회원이 보면 안 됨).
- `daily_workout_log.raw_voice_text` = **STT 원본**(트레이너 혼잣말·솔직 코멘트 섞일 수 있음). 회원엔 `ai_summary`만.

즉 S1의 RLS만으로는, 회원이 마음먹고 `select member_note from user_table` 하면 **읽힌다.** **S1은 화면이 없어 실사용 누출은 없지만**, S2에서 화면 붙이는 순간 노출된다. **S2 진입 전 아래 중 하나로 닫을 것**(내 권장 = ①):

1. **(권장) 회원 읽기를 안전 컬럼만 반환하는 통로로 국한.** 회원에겐 원시 테이블 SELECT 정책을 **주지 않고**, `security definer` **리더 함수/뷰**만 노출:
   - `member_profile()` → `id,name,goal, (담당 트레이너 이름)` 등 안전 필드만,
   - `member_workout_logs()` → `created_at, ai_summary`만,
   - `member_inbody()` → 측정일·수치만.
   각 함수가 내부에서 `auth_member_id()`로 필터 → 컬럼 자체를 물리적으로 못 가져옴 = **구조적으로 안전.** (이 경우 PART1의 회원 SELECT 정책 3개는 빼거나 유지하되, S2 클라는 함수만 호출.)
2. **민감 컬럼 분리.** `member_note`·`quit_reason`·`raw_voice_text`를 트레이너 전용 별도 테이블로 이전(회원 정책이 닿지 않게).

> S1은 **뼈대 검증이 목적**이라 PART1의 행 RLS로 충분히 테스트되지만(§3 검증 C), **화면(S2)에 들어가기 전 이 항목을 결정·반영**해야 한다. 방향 정하면 S1에 리더함수를 얹거나 S2 앞단에 넣는 스펙을 이어서 잡아줄게.

(참고 — 왜 컬럼 GRANT로 못 막나: 회원·트레이너 모두 Supabase `authenticated` 롤을 공유한다. 컬럼 GRANT는 롤 단위라 회원만 좁힐 수 없음 → 함수/뷰 통로 또는 컬럼 분리가 정답. 회원 전용 롤을 JWT 클레임으로 파는 건 오버.)

---

## 6. 검증 절차 (배포·수동)

1. **PART 1 SQL** Supabase 실행 → 검증쿼리 (A)(B) 확인.
2. **PART 2 라우트** 커밋·배포(Vercel Ready) 후, **테스트 회원 1명**에 토큰 심기(S3 UI 전이라 수동):
   ```sql
   update user_table set member_token = gen_random_uuid()
     where id = '<테스트회원 id>' returning member_token, phone_number;
   ```
3. **로그인 성공** — `curl -X POST https://pt-navigator.vercel.app/api/member-auth -H "Content-Type: application/json" -d '{"token":"<위 토큰>","phoneLast4":"<phone_number 끝4>"}'` → `{ok:true, access_token, refresh_token, member}` 확인. `user_table.member_auth_id` 채워졌나 확인.
4. **실패 케이스** — 틀린 끝4 / 없는 토큰 / 4자리 아님 → 전부 401 일반 메시지. 6회 초과 → 429.
5. **★격리 실증** — 3번 access_token으로 supabase 클라 세션 세팅 후 §3 검증쿼리 (C) 실행: 내 것만 나오고 `session_log`/`ot_log`/`trainer` = **0행**이면 합격.
6. **회귀** — 트레이너로 평소처럼 로그인 → 회원목록·탭·음성일지·인바디 **정상**(가산 정책이 트레이너 접근 안 건드림).

---

## 7. 클로드코드 넘길 때 (실행 지시 요약)

- **PART 1** = Supabase SQL Editor에 붙여 실행 + 동일 내용을 `docs/migrations/2026-07-16-member-auth-rls.sql`로 저장(기록본).
- **PART 2** = `app/api/member-auth/route.js` 신규 생성(위 코드 그대로).
- `npm.cmd run lint` 통과 확인 → 파일지정 `git add app/api/member-auth/route.js docs/migrations/2026-07-16-member-auth-rls.sql docs/v2-스펙-회원앱-S1-인증RLS-구현.md` → 커밋 → `git show --stat HEAD`.
- **주의:** 회원 유저 생성 시 `user_metadata`에 **`account_type`을 절대 넣지 말 것**(넣으면 가입 트리거가 account+trainer를 만들어 격리가 깨짐). 위 코드는 `role:"member"`만 넣음 — 유지.

---

## 8. 이후 (S2·S3 · 이 스펙 범위 밖)

- **S2 — 회원 홈(열람):** `app/m/<token>` 라우트 + 끝4 입력 UI → setSession → 홈(수업일지 타임라인 `ai_summary` · 인바디 추이). **§5 컬럼 안전 통로 확정 후 착수.**
- **S3 — 트레이너 링크 발급 UI:** 회원 카드 '링크 생성(`member_token = gen_random_uuid()`)·복사(`/m/<token>`)·재발급'. 기존 카톡 복사 패턴 재사용. UPDATE 정책 이미 있음(추가 SQL 불필요).
- 토큰 강화(선택): uuid 대신 더 긴 토큰(`encode(gen_random_bytes(24),'hex')`)·문자 OTP 승급은 후속. MVP는 uuid + 끝4 + 스로틀로 충분.

---

## 9. 미결(핸드오프 유지)

- Anthropic 크레딧 Auto-reload · Confirm email ON · 테스트계정 teardown. (S1은 `email_confirm:true`로 생성해 **Confirm email 설정과 무관** — 회원 로그인은 이 미결에 안 막힘.)
- `2026-07-15-member-intake.sql` Supabase 실행 확인(안 했으면 회원 등록 insert 실패).
