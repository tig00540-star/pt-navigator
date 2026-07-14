# v2 스펙 — solo Phase A (UI 분기 + 셀프 페이롤)

> 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(grep 없음→`Select-String`). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 `docs/migrations` 기록본). 폰=Vercel 하드리프레시.

## 결정사항(이 스펙의 전제)
- solo = **외부 판매용** 구독 SaaS의 제품 본체. 빌드는 **A(경험) → B(셀프 가입) → C(구독 결제 게이트)** 순.
- **이 문서 = A만.** solo는 owner=trainer 1인 → **관리자/트레이너 화면 이분법을 없애고 단일 화면**으로. `/admin` 숨김, 매출·급여는 '내 실적'·'설정'에 흡수.
- 급여 = **본인이 자기 급여 방식(pay_scheme)을 작성 → 자동계산**.

---

## 0. 핵심 발견 (스코프가 작은 이유)

코드 실물 확인 결과:

1. **클라이언트는 `account.type`('center'|'solo')을 아무 데서도 안 읽는다.** 메인 앱은 owner를 `members.some(m => m.trainer_id !== uid)` 간접 추론으로 판단하고, `/admin`만 `trainer.role='owner'`를 읽는다. → solo 분기는 그린필드.
2. **페이롤 백엔드는 solo가 이미 통과.** `pay_scheme`·`payroll_run`의 쓰기 정책은 `auth_is_owner()`인데 **solo 트레이너는 role='owner'** → 이미 쓰기 가능. `MyStats`가 이미 `resolveScheme(schemes, uid)`+`payForScheme`로 예상급여를 자동계산한다. **빠진 건 pay_scheme 편집 UI가 `AdminPayrollSettings`(=`/admin` 전용)에만 있다는 것뿐.**
3. **결론:** Phase A = ①`account.type`을 클라가 읽게 만들고 ②그걸로 UI를 분기(admin 숨김/바운스, 설정에 셀프 페이롤 노출, 카피 보정). **DB 마이그레이션 0**(테스트 seed 제외). 기존 파일럿 계정은 type='center'라 **전 분기가 꺼져 회귀 0**.

---

## A1. 클라 공용 훅 (신설) — `lib/useAccount.js`

로그인 트레이너의 `role` + 소속 `account.type`을 1회 조회. B(가입)·C(구독)에서도 재사용할 기반.

```js
// lib/useAccount.js — 클라이언트. 로그인 트레이너의 role + 소속 account.type 1회 조회.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useAccount() {
  const [state, setState] = useState({ loading: true, uid: null, role: null, accountType: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { if (alive) setState({ loading: false, uid: null, role: null, accountType: null }); return; }
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      if (!uid) { if (alive) setState({ loading: false, uid: null, role: null, accountType: null }); return; }
      // trainer 본인 행(RLS id=auth.uid()) + account 임베드(RLS id=auth_account_id()). FK trainer.account_id→account.id 존재.
      const { data } = await supabase
        .from("trainer")
        .select("role, account:account_id(type)")
        .eq("id", uid)
        .maybeSingle();
      if (!alive) return;
      setState({ loading: false, uid, role: data?.role ?? null, accountType: data?.account?.type ?? null });
    })();
    return () => { alive = false; };
  }, []);
  const isSolo = state.accountType === "solo";
  const isOwner = state.role === "owner";
  return { ...state, isSolo, isOwner };
}
```

주의: 데모 모드(supabase null)·미로그인·조회실패 → `accountType=null` → `isSolo=false`(center처럼 = 기존 동작). PostgREST 임베드 `account:account_id(type)`가 안 되면(관계 미노출) 2쿼리 폴백(trainer.role, account_id 먼저 → account.type). 임베드 우선.

---

## A2. `app/page.jsx` — admin 링크 숨김 + isSolo 전달

훅을 쓰고, 세 군데만 분기:

```js
import { useAccount } from "@/lib/useAccount";
// ... 컴포넌트 안:
const { isSolo } = useAccount();   // 기존 myUid(getUser) effect는 그대로 둠(다른 곳에서 씀).
```

**① 헤더 `/admin` 링크(현재 ~668–674, 항상 노출) → solo면 숨김:**

```jsx
{!isSolo && (
  <a href="/admin" className="...(기존 그대로)...">
    <ShieldCheck className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">관리자</span>
  </a>
)}
```

**② 내 실적(tab 8)·설정(tab 7)에 isSolo 전달:**

```jsx
) : tab === 7 ? (
  <div className="tab-anim"><SettingsView isSolo={isSolo} /></div>
) : tab === 8 ? (
  <div className="tab-anim"><MyStats members={members} isSolo={isSolo} /></div>
```

> 로딩 중 `isSolo=false` → center 사용자는 변화 없음. solo는 로드 후 링크가 사라짐(경미한 깜빡임 허용). 정 싫으면 `!isSolo && !loading` 대신 그대로 둬도 됨.
> (선택 정리) `myUid`를 `useAccount().uid`로 통합 가능하나 이번 스코프 밖 — 중복 getUser 1회는 무해.

---

## A3. `components/views/SettingsView.jsx` — solo 셀프 페이롤

solo일 때만 급여 방식 편집기를 설정 탭에 노출(`/admin`이 없으니 여기가 유일 접점). `AdminPayrollSettings`를 **그대로 재사용**하되 `trainers={[]}`로 넘겨 스코프 선택이 "계정 기본"(=본인) 하나만 뜨게 한다.

```jsx
import AdminPayrollSettings from "@/components/AdminPayrollSettings";

export default function SettingsView({ isSolo = false }) {
  return (
    <div className="space-y-6">
      <TrainerGoalSetter />
      <TrainerProfileSettings />
      <TrainerLibrary />
      <PtPricingSettings />
      {isSolo && <AdminPayrollSettings trainers={[]} solo />}
      <PasswordChange />
    </div>
  );
}
```

`AdminPayrollSettings`에 **`solo` prop 추가(작은 보정)** — solo면 ①스코프 선택 UI(적용 대상: 계정 기본/트레이너)를 숨기고 ②Eyebrow 라벨을 "내 급여 방식"으로:

```jsx
export default function AdminPayrollSettings({ trainers = [], solo = false }) {
  // ...
  <Eyebrow icon={Wallet}>{solo ? "내 급여 방식" : `급여 정책 설정 · ${scope == null ? "계정 기본" : (trainers.find((t) => t.id === scope)?.name || "트레이너")}`}</Eyebrow>
  // ...
  {/* 스코프 선택 블록(‘적용 대상’)을 solo면 렌더 안 함: */}
  {!solo && (
    <div className="mb-4"> ...적용 대상 선택 기존 블록... </div>
  )}
```

solo면 `scope`는 초기값 `null`(계정 기본) 그대로 → 저장 시 `trainer_id=null`(계정 기본 스킴). solo는 트레이너가 1명이라 계정 기본 = 본인. `MyStats`의 `resolveScheme(schemes, uid)`가 override 없으면 계정 기본을 집으므로 **자동계산이 그대로 물린다.** (RLS 쓰기=owner, solo=owner라 저장 통과.)

---

## A4. `app/admin/page.jsx` — solo 직접 접근 바운스

링크를 숨겨도 solo가 URL로 `/admin`에 오면 role='owner'라 센터 대시보드가 그대로 보인다(누수·혼란). role 조회 시 `account.type`도 같이 읽어 **solo면 `/`로 돌려보낸다.**

현재(~211): `.from("trainer").select("role").eq("id", uid).maybeSingle();` → **`account` 임베드 추가**하고, owner 판정 직후 solo 바운스:

```js
const { data: t } = await supabase
  .from("trainer").select("role, account:account_id(type)").eq("id", uid).maybeSingle();
if (t?.account?.type === "solo") { router.replace("/"); return; }  // solo는 통합 화면만
if (t?.role === "owner") myRole = "owner";
```

`router`는 `useRouter`(`next/navigation`) — 이미 import 없으면 추가. 없으면 `window.location.replace("/")`로 대체 가능.

---

## A5. `components/views/MyStats.jsx` — solo 카피 보정 (+선택 셀프확정)

`MyStats`는 이미 매출·예상급여·클로징을 다 계산한다. solo에서 **틀린 문구는 "원장 확정" 계열뿐** — `isSolo` prop 받아 2곳만 보정:

```jsx
export default function MyStats({ members = [], isSolo = false }) {
```

- 급여 헤드라인의 미확정 문구(~130 "원장 확정 대기" / ~131 "자동계산 없음(수동 급여)")와 헤더 라벨(~116 "이달 {확정/예상} 급여")은 solo면 원장 개념이 없으니: 확정 여부와 무관하게 `isSolo`면 "이달 급여(자동계산)"로 통일하고, computed=null(수동 스킴)일 때는 "급여 방식을 설정하면 자동계산돼요"로.
- 하단 각주(~230 "※ … 실지급은 원장이 확정한 금액 기준"): `isSolo`면 "※ 자동계산은 이달 완료 수업 기준입니다."

**(선택·권장) solo 셀프 확정:** solo가 이달 급여를 스스로 확정(payroll_run 기록)하고 싶으면 `PayrollConfirm`을 그대로 재사용 가능(`trainerId=uid, ym, pay, run`). RLS 쓰기=owner라 solo가 자기 run을 insert/update 가능. 이번 A에서는 **자동계산 표시까지가 코어**, 셀프 확정은 원하면 추가.

---

## A6. 테스트 seed (검증용 · git엔 기록 안 해도 됨)

기존 파일럿은 type='center'라 solo 화면이 안 보인다. 검증하려면 solo 계정/로그인이 하나 필요:

1. **대시보드 → Authentication → Add user**: solo 테스트용 이메일/비번 생성 → 그 **uid 복사**.
2. **SQL Editor**:
```sql
-- solo 계정 + 그 계정 owner 트레이너(= 방금 만든 로그인)
with a as (
  insert into account (type, name) values ('solo', 'Solo 테스트') returning id
)
insert into trainer (id, account_id, role, name, active)
select '<위에서 복사한 uid>', a.id, 'owner', 'Solo 트레이너', true from a;
```
3. **그 계정으로 로그인** → 검증:
   - 헤더에 **'관리자' 링크 없음**.
   - **설정 탭에 '내 급여 방식'** 편집기(적용 대상 선택 없이) 노출 → 밴드 저장.
   - **내 실적**에서 예상급여가 저장한 스킴대로 자동계산.
   - 주소창에 `/admin` 직접 입력 → **`/`로 바운스**.
   - (대조) 기존 파일럿(center) 로그인 → 아무 변화 없음(관리자 링크·admin 정상).

> 검증 후 이 테스트 계정은 남겨서 B(가입)·C(구독) 개발에 계속 써도 됨.

---

## 검토 체크리스트 (git diff 검토 시)

- [ ] `lib/useAccount.js`: 데모/미로그인/실패에 `isSolo=false` 폴백. 임베드 실패 시 2쿼리 폴백 여부.
- [ ] `app/page.jsx`: admin 링크가 `!isSolo`로만 감싸짐(center 무변). MyStats·SettingsView에 isSolo 전달.
- [ ] `SettingsView`: `isSolo`일 때만 셀프 페이롤. center엔 안 뜸(원장은 /admin에서 편집).
- [ ] `AdminPayrollSettings` `solo` prop: 스코프 선택 숨김 + 라벨만 바뀌고, 저장 로직(trainer_id=null·account_id DEFAULT)은 불변. center(=solo 미전달) 동작 회귀 0.
- [ ] `app/admin/page.jsx`: solo면 owner여도 `/`로 바운스. center owner는 정상 진입.
- [ ] `MyStats`: isSolo 카피만 바뀌고 계산 로직 불변.
- [ ] lint green. center 파일럿 폰 확인 시 회귀 0(관리자 링크·admin·급여 그대로).

## 커밋 순서 (제안)

한 덩어리로 가도 무방(전부 UI·마이그레이션 0):
```
git add lib/useAccount.js app/page.jsx app/admin/page.jsx components/views/SettingsView.jsx components/views/MyStats.jsx components/AdminPayrollSettings.jsx
git commit -m "feat(solo): account.type 분기 — /admin 숨김·바운스 + 설정 셀프 페이롤"
git show --stat HEAD
```
- 스펙 문서 커밋은 별도(`docs: solo Phase A 스펙`).
- 테스트 seed SQL은 대시보드에서만(원하면 `docs/migrations/2026-07-13-solo-test-seed.sql`로 기록본 남겨도 됨 — 실계정 데이터라 안 남겨도 무방).

---

## 다음 (A 검증 후)

- **B — 셀프 가입:** 공개 `/signup` → auth 유저 + `account(type='solo')` + `trainer(role='owner')` 자동 생성 + 이메일 인증. invite-only를 여는 새 공개표면. `create-trainer`의 service_role 패턴을 signup 라우트로 변형.
- **C — 구독 결제 게이트:** 결제사(추천=토스페이먼츠 정기결제, C 착수 시 현재 스펙 재확인) + `account`에 구독상태 컬럼 + `SubscriptionGate`(미결제=결제 화면). 네가 결제사 계정·키 발급 필요.
