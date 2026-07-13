# v2 스펙 — solo Phase B (셀프 가입 · 개인/센터 2갈래)

> 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(grep 없음→`Select-String`). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 `docs/migrations` 기록본). 폰=Vercel 하드리프레시.

## 결정사항
- B = 공개 `/signup` 셀프 가입. **개인(solo) / 센터(center) 2갈래** — 둘 다 자가 가입, 유형만 다르고 **가입자는 그 계정의 owner**가 됨.
- **지금은 결제 게이트 없이 연다**(실사용자 없음). C(구독 결제)가 나중에 이 위에 게이트만 얹음. 가격은 **트레이너 시트당 월정액**(숫자 미확정).
- 초대 트레이너(원장이 `create-trainer`로 추가)는 **그대로 유지** — 셀프가입과 별개 경로.

---

## 0. 핵심 발견 (설계 근거)

1. **AuthGate가 전역**(`app/layout.js`에서 `<AuthGate>{children}</AuthGate>`로 전 페이지 감쌈). → `/signup`은 로그아웃 상태에서 열려야 하므로 **AuthGate가 이 경로만 우회**하게 해야 함(안 그러면 로그인 폼에 막힘).
2. **account·trainer INSERT는 anon으로 불가**(⑦-b RLS: 두 테이블 다 insert 정책 없음). 클라가 직접 못 만든다. → **`auth.users` INSERT 트리거(SECURITY DEFINER)**가 가입자 메타데이터를 읽어 account+trainer를 대신 생성(기존 `auth_account_id()` definer 패턴과 동일 계열). 클라는 `supabase.auth.signUp()`만 호출.
3. **왜 트리거+signUp인가**(서비스키 라우트 대신): ①Supabase `signUp`이 **이메일 인증·레이트리밋·(옵션)캡차를 기본 제공** — 공개 가입의 어뷰즈 방어를 Supabase Auth에 위임. ②서비스롤 키를 **공개 미인증 엔드포인트**에 새로 노출 안 함. ③커스텀 코드 최소.

---

## B1. DB 트리거 (신규 마이그레이션) — `handle_new_signup`

`docs/migrations/2026-07-13-signup-trigger.sql` (아래). 실행은 Supabase 대시보드.

```sql
-- =============================================================================
-- 셀프 가입 프로비저닝 — auth.users INSERT 시 account(type)+trainer(owner) 자동 생성
-- 실행일: 2026-07-13 · 실행: Supabase SQL Editor(수동) · 이 파일 = git 기록본
--
-- ★ 하는 일: 클라 signUp 시 넘긴 메타데이터(account_type/display_name/account_name)를 읽어
--   account 1행 + 그 계정 owner trainer 1행을 SECURITY DEFINER로 생성(anon RLS 우회).
-- ★ 초대 트레이너(create-trainer, 메타 {must_change_pw})는 account_type 없음 → 트리거 스킵(비충돌).
-- 멱등: 이미 trainer 행 있으면 no-op. 롤백: 파일 하단.
-- =============================================================================

create or replace function handle_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type text := new.raw_user_meta_data->>'account_type';
  a_name text := new.raw_user_meta_data->>'account_name';
  d_name text := coalesce(new.raw_user_meta_data->>'display_name', new.email);
  new_account_id uuid;
begin
  if a_type is null then return new; end if;                 -- 초대 트레이너 등은 스킵
  if a_type not in ('solo','center') then return new; end if;
  if exists (select 1 from trainer where id = new.id) then return new; end if;  -- 멱등

  insert into account (type, name)
    values (a_type, coalesce(a_name, d_name))
    returning id into new_account_id;

  insert into trainer (id, account_id, role, name, active)
    values (new.id, new_account_id, 'owner', d_name, true);

  return new;
end
$$;

drop trigger if exists on_auth_user_created_signup on auth.users;
create trigger on_auth_user_created_signup
  after insert on auth.users
  for each row execute function handle_new_signup();

-- =============================================================================
-- 검증:
--  (1) 개인 가입 후 — account(type=solo) 1행 + trainer(role=owner) 1행 생겼나.
--  (2) 센터 가입 후 — account(type=center, name=센터명) + owner trainer.
--  (3) 기존 원장이 create-trainer로 트레이너 추가 — 여전히 정상(account 새로 안 생기고 role=trainer).
-- select a.type, a.name, t.role, t.name from account a join trainer t on t.account_id=a.id
--   order by a.created_at desc limit 5;
-- -----------------------------------------------------------------------------
-- ROLLBACK:
-- drop trigger if exists on_auth_user_created_signup on auth.users;
-- drop function if exists handle_new_signup();
-- =============================================================================
```

> ⚠️ 이메일 인증이 **ON**이고 가입자가 확인 안 하면 account/trainer 행이 남을 수 있음(고아). 지금은 인증 OFF 권장(아래)이라 무의미. 나중에 정리 필요하면 트리거를 `email_confirmed_at` 세팅 시점으로 옮기는 후속 가능.

---

## B2. `components/AuthGate.jsx` — `/signup` 우회 + 로그인 화면에 가입 링크

**① `/signup`은 로그아웃 상태에서도 통과.** `usePathname`으로 공개경로 판정, 렌더 분기 최상단에 추가:

```jsx
import { usePathname } from "next/navigation";
// ...
const pathname = usePathname();
// ready 판정 이후, 로그인 폼 return 앞에:
const isPublicRoute = pathname === "/signup";
if (isPublicRoute && !session) return <>{children}</>;   // 가입 페이지는 게이트 우회
// 이하 기존: if (!supabase || session) { ...앱 렌더... }  /  return <로그인 폼>;
```

**② 로그인 폼 하단 안내에 가입 링크 추가**(현재 "계정은 관리자 초대로 발급됩니다."):

```jsx
<div className="mt-4 text-center text-[11px] text-muted">
  트레이너는 원장 초대로 참여합니다 ·{" "}
  <a href="/signup" className="font-semibold text-primary-strong hover:underline">새 계정 만들기</a>
</div>
```

> 로그인된 사용자가 `/signup`에 오면 `session` 존재 → 기존 `if (session)` 분기로 children(가입 페이지)이 뜨는데, 가입 페이지 자체가 성공/세션 시 `/`로 보내므로 무해(아래 B3). 원하면 가입 페이지 상단에서 `if(session) router.replace("/")` 추가 가능(선택).

---

## B3. `app/signup/page.jsx` (신규) — 개인/센터 선택 가입 폼

```jsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";

export default function SignupPage() {
  const router = useRouter();
  const [type, setType] = useState("solo");     // 'solo' | 'center'
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [displayName, setDisplayName] = useState("");   // 내 이름(트레이너/원장 실명)
  const [accountName, setAccountName] = useState("");   // 센터명(center만)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);              // 이메일 인증 대기 화면

  const inputCls = "w-full rounded-lg bg-elevate border border-line px-3 py-2.5 text-sm text-ink placeholder-muted outline-none focus:border-primary";

  const submit = async () => {
    if (busy) return;
    if (!supabase) { setErr("Supabase 미설정 — 가입은 키 설정 후 가능합니다."); return; }
    if (!email.trim() || !pw || !displayName.trim()) { setErr("이메일·비밀번호·이름은 필수입니다."); return; }
    if (type === "center" && !accountName.trim()) { setErr("센터명을 입력하세요."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: {
        data: {
          account_type: type,                                  // 트리거가 읽어 account 생성
          display_name: displayName.trim(),
          account_name: type === "center" ? accountName.trim() : displayName.trim(),
        },
      },
    });
    setBusy(false);
    if (error) { setErr("가입 실패 — " + (error.message || "다시 시도하세요")); return; }
    if (data?.session) { router.replace("/"); return; }        // 이메일 인증 OFF → 즉시 로그인 → 앱으로
    setSent(true);                                             // 인증 ON → 메일 확인 안내
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-ink">메일함을 확인하세요</div>
          <p className="mt-2 text-sm text-muted">{email}로 보낸 확인 링크를 누르면 가입이 완료됩니다.</p>
          <a href="/" className="mt-4 inline-block text-xs font-semibold text-primary-strong hover:underline">로그인으로</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-5 text-center">
          <div className="text-lg font-semibold text-ink">새 계정 만들기</div>
          <div className="mt-1 text-sm text-muted">개인 트레이너 또는 센터 원장으로 시작</div>
        </div>

        {/* 유형 선택 */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[{ k: "solo", l: "개인 트레이너" }, { k: "center", l: "센터 원장" }].map((o) => (
            <button key={o.k} onClick={() => setType(o.k)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                type === o.k ? "border border-primary/30 bg-primary-soft text-primary-strong" : "border border-line bg-elevate text-muted hover:text-ink"}`}>
              {o.l}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input type="email" inputMode="email" autoComplete="email" placeholder="이메일"
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" autoComplete="new-password" placeholder="비밀번호"
            value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
          <input type="text" placeholder="이름(실명)"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
          {type === "center" && (
            <input type="text" placeholder="센터명"
              value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
          <Button variant="primary" size="md" fullWidth onClick={submit} disabled={busy}>
            {busy ? "가입 중…" : "가입하기"}
          </Button>
        </div>

        <div className="mt-4 text-center text-[11px] text-muted">
          이미 계정이 있으신가요? <a href="/" className="font-semibold text-primary-strong hover:underline">로그인</a>
        </div>
      </div>
    </div>
  );
}
```

동작: `signUp` → 트리거가 account+trainer(owner) 생성. 이메일 인증 OFF면 `data.session` 즉시 발급 → `/`로. ON이면 인증대기 화면. center면 account.name=센터명, solo면 account.name=내이름.

---

## 이메일 인증 토글 (대시보드 · 코드 아님)

Supabase → **Authentication → Sign In / Providers → Email → "Confirm email"**.
- **지금 = OFF 권장**(실사용자 없어 마찰 제거 · 가입 즉시 앱 진입 → 테스트 빠름). 트리거 고아행도 무의미.
- **실런칭 전(C 즈음) = ON**(공개 가입엔 이메일 소유 증명 필요). 이땐 confirm redirect URL·발신 도메인(SMTP or Supabase 기본) 점검.

---

## 검토 체크리스트

- [ ] 트리거: `account_type` 없으면 no-op(초대 트레이너 비충돌). solo/center만 허용. 멱등(기존 trainer 있으면 skip).
- [ ] AuthGate: `/signup`이 **로그아웃 상태에서 통과**(usePathname). 그 외 경로·로그인 동작 회귀 0. 로그인 폼에 가입 링크.
- [ ] `/signup`: 필수값 검증(center면 센터명), signUp options.data 3키 전달, 세션 있으면 `/`로·없으면 인증대기.
- [ ] 데모 모드(supabase null): 가입 폼이 "키 설정 후 가능" 안내(크래시 없음).
- [ ] 기존 로그인/앱/`/admin`·solo 분기(Phase A) 회귀 0. lint green.

## 커밋 순서

1. **B1 SQL**: 대시보드 실행 → `docs/migrations/2026-07-13-signup-trigger.sql` 추가.
2. **B2·B3 코드 한 커밋**:
```
git add app/signup/page.jsx components/AuthGate.jsx
git commit -m "feat(signup): 공개 셀프 가입(개인/센터) — signUp + 프로비저닝 트리거"
git show --stat HEAD
```
3. (대시보드) 이메일 인증 OFF 확인.

## 검증 (폰/브라우저)

1. 로그아웃 상태 → `/signup` 접속(로그인 폼에 안 막히는지).
2. **개인 가입** → 즉시 앱 진입 → **Phase A solo 화면**(관리자 링크 없음·설정 셀프페이롤). 대시보드에서 account(type=solo)+owner trainer 확인.
3. **센터 가입**(다른 이메일) → 앱 진입 → center 화면(관리자 링크 있음). account(type=center, name=센터명) 확인.
4. **기존 원장 초대 트레이너 추가**(create-trainer) 여전히 정상 — 새 account 안 생기고 role=trainer.
5. 기존 파일럿·solo 테스트 계정 회귀 0.

---

## 다음 (B 검증 후) — C: 구독 결제 게이트

`account`에 `plan`·`subscription_status`·`seats`(활성 트레이너 자동집계)·`current_period_end` → 토스페이먼츠 정기결제(월 시트수×단가) → 웹훅으로 상태 갱신 → `SubscriptionGate`(미결제=결제 화면). 결제사 계정·키는 트레이너가 발급. C 착수 시 결제사 현행 스펙 재확인.
