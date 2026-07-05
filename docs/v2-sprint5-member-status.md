# v2 스프린트5 — ② OT/PT 뷰 분리 (member_status) · 착수 스펙

> 로드맵 ②. 상위 설계 docs/MASTERPLAN.md(§4 v2 예상 테이블·§7 2순위 라이프사이클 재설계),
> 로드맵 docs/v2-roadmap-next.md ②, 직전 인수인계 docs/v2-sprint4-postscript.md.
> 이 문서는 설계 대화에서 확정된 결정 + Claude Code 착수 스펙이다. 코드는 Claude Code로 짠다.

## 0. 한 줄 목표
회원 라이프사이클 상태(`member_status`)로 **하나의 앱 안에서 OT 뷰와 PT 뷰를 가른다**.
목적은 "정리"가 아니라 **매일 쓰는 도구화** — 회원을 고르면 *지금 뭘 해야 하나*가 바로 뜨고,
관련 없는 탭은 숨겨 화면이 오히려 가벼워진다.

---

## 1. 확정된 핵심 축 2개
1. **성공 ≠ PT (결제 게이트).** `closing_result=성공`은 *의향 기록*이지 PT 등록이 아니다.
   `ot → pt` 전이는 **수동 'PT 등록 확정'**(②) 또는 **결제 이벤트**(③ payment)로만 발화. 자동 플립 금지.
   근거: MASTERPLAN의 결제 기반 PT 정의 · 진짜/가짜 분리(성공 낙관이 PT·매출 카운트 부풀림 방지) ·
   ④ 통계 무결성(성공률과 실등록률을 따로 재야 의미).
2. **보류 = 개념상 독립 서브상태**지만 **MVP에선 상태화하지 않고** `ot_log.closing_result=보류`에서
   **파생**한다(데이터는 S4부터 이미 쌓이는 중이라 안 잃음). 재접근 *스케줄링 워크플로*를 실제로
   만들 때 `ot_held` 상태로 승격.

## 1.5. 진입 문은 두 개 (OT 퍼널이 유일 입구가 아님)
`pt_active`는 OT를 거치지 않고 **등록 시점에 직행**할 수 있다:
- **인계** — 다른 트레이너 담당이던 PT 회원을 넘겨받음
- **외부 추가** — 이미 PT인 회원을 직접 등록
→ 상태를 새로 만들지 않는다. 늘어나는 건 (a) 등록→`pt_active` 직행 엣지 (b) 등록 시 시작 상태 선택
(c) `origin` 필드. §1 "성공≠PT"는 **OT→PT 전이 한정** 규칙이지 pt_active 입구가 결제뿐이란 뜻이 아님.

---

## 2. MVP 범위 (스코프 다이어트)

### 낸다
- **상태 3개:** `ot_active` / `pt_active` / `inactive`.
- **status→뷰 스위치 shell** (lazy 가능한 구조로).
- **진입 문 2개:** 등록 시 `origin`에 따라 `ot_active`(ot_funnel) 또는 `pt_active`(handover·external) 직행.
- **수동 'PT 등록 확정'** 액션 (`ot_active` → `pt_active`, 클로징 기록과 별개 행동).
- **`origin` 3값** (`ot_funnel` / `handover` / `external`) — ④ 클로징 통계 대상 게이트.
- **① 캐시** → `ot_log` round-1 `report.first_assist` (round-2 `report.brief` 패턴 대칭).
- **"오늘 재접근" 파생 리스트** — `closing_result=보류` + `reapproach_at` 도래분. (매일 열 이유의 엔진.)
- **상태 규칙 순수 모듈** `lib/memberStatus.js` (React 없는 순수 함수, 규칙의 단일 소재지).

### 미룬다 (전부 "지금 안 지어도 데이터 안 잃는" 형태)
- **`ot_held` 상태화** — 재접근 스케줄링 워크플로 만들 때 승격. 데이터는 `closing_result=보류`로 유지.
- **`ot_won`(성공·결제대기) 상태** — `ot_active`에 "확정 대기" 프롬프트로 대체.
- **`pt_expiring`(만기임박)** — ③ 소관(`session_log`·만기일 파생). ②에선 채울 데이터가 없어 만들지 않음.
- **실패의 재접근 세분** — 실패도 `closing_result` 값으로 남고, `inactive`는 **트레이너 명시 종결**만.
- **`inactive` 재활성 풀 플로우** — 필요 시 수동 경로 하나만, 아니면 백로그.
- **lazy-load 실제 적용** — 구조만 잡고 `next/dynamic` 적용은 필요할 때. (실사용 무게는 번들보다 **지연**.)
- **인계 풀 플로우**(이전 담당 추적·재배정) — ⑦ 소관. ②에선 `origin` 스탬프까지만.

---

## 3. 데이터 층 (새 테이블 0)
```
user_table  (기존 행 UPDATE)
  + status              text   NOT NULL DEFAULT 'ot_active'
                               -- 'ot_active' | 'pt_active' | 'inactive'
  + origin              text   NOT NULL DEFAULT 'ot_funnel'
                               -- 'ot_funnel' | 'handover' | 'external'
  + status_changed_at   timestamptz NULL      -- 선택(전이 시점 기록)

ot_log  (round=2 행, closing_* 계열 확장)
  + closing_reapproach_at  date  NULL   -- 보류 재접근 예정일 ("오늘 재접근" 파생 필터용)
    (재접근 사유는 기존 closing/report 필드에)

ot_log  (round=1 행)
    report.first_assist  (jsonb 키)     -- ① 캐시. 관찰 데이터와 공존(각 writer 자기 필드만).
```
- **⚠️ user_table UPDATE 정책 필수** — 현장 트러블슈팅대로, RLS 켜진 채 anon **UPDATE 정책이 없으면
  PATCH가 `error:null` + `data` 0행으로 조용히 실패**한다. `status`/`origin`은 기존 행 UPDATE라 정확히
  이 함정에 걸림. **user_table에 anon/public UPDATE 정책부터 추가**하고, 저장 시 `.select()`로 돌려받아
  `data.length===0`이면 실패 처리(ObservationTab 하드닝과 동일). 이 개방은 ⑦에서 잠글 부채로 기록.
- **demo 모드:** `DEMO_MEMBER`에 `status`/`origin` 기본값 부여, 모든 신규 DB 콜은 `if (!supabase)` 가드 유지.

**실행한 SQL (v2-S5 step1, Supabase 에디터에서 실행 — 재실행 안전):**
```sql
-- 1) user_table 라이프사이클 컬럼
alter table user_table
  add column if not exists status            text not null default 'ot_active',
  add column if not exists origin            text not null default 'ot_funnel',
  add column if not exists status_changed_at timestamptz;

-- 2) ot_log 보류 재접근 예정일 (round=2 closing_* 계열)
alter table ot_log
  add column if not exists closing_reapproach_at date;

-- 3) user_table UPDATE 정책 (재실행 안전하게 drop→create). anon 개방 = ⑦에서 잠글 부채(§9).
drop policy if exists "user_table anon update (v2-② 개방, ⑦에서 잠글 부채)" on user_table;
create policy "user_table anon update (v2-② 개방, ⑦에서 잠글 부채)"
  on user_table for update to anon, authenticated
  using (true) with check (true);
```
> ⚠️ **정책 end-to-end 미검증** — SQL 에디터 UPDATE는 RLS 우회라 정책 검증이 아니다. anon 키 경로
> UPDATE 검증은 **Step 5(`toPtActive`)** 에서 `.select()` → `data.length>0`로 처음 한다. 지금은 "걸어뒀지만 미검증".
> 참고: step1 시점 코드에 `user_table` UPDATE 경로 없음(INSERT/SELECT만) → 여태 조용히 실패한 편집 없음.

## 4. 상태 규칙 모듈 — `lib/memberStatus.js` (순수)
React·supabase 의존 없음. **전이 함수는 "쓸 필드 패치"를 반환**하고, 실제 update+가드는 호출부가 한다
(모듈을 순수하게 유지 → 나중에 붙일 테스트의 유일한 지점). 함수 계약:
```
viewFor(member)            → 'ot' | 'pt' | 'inactive'        // shell 스위치
nextAction(member, rounds) → { label, ... }                 // "지금 할 일" 힌트
isClosingStatSubject(m)    → boolean  (m.origin === 'ot_funnel')   // ④ 대상 게이트
initialStatus(origin)      → origin==='ot_funnel' ? 'ot_active' : 'pt_active'
reapproachToday(r2rows, today) → [...]                       // 보류+예정일 도래 파생
toPtActive(member)         → { status:'pt_active', status_changed_at }   // 수동 확정
toInactive(member, reason) → { status:'inactive', status_changed_at }
```

## 5. 뷰 층
- **MemberViewShell** — `viewFor(member)`로 스위치:
  `ot` → OTView(1·2차 OT 탭) · `pt` → PTView(재등록·세션, 실데이터는 ③) · `inactive` → 간단 뷰.
- 각 뷰는 별도 컴포넌트로 분리(`components/views/` 또는 기존 `components/tabs/` 축 연장).
  **기존 탭을 OTView로 감싸는 것부터** = 회귀 최소. 제로 리팩터링 아님, `components/tabs/` 추출 축 연장.
- **lazy 가능한 구조로 짜되** `next/dynamic` 실제 적용은 optional(지연 ≫ 번들). 구조만 통짜가 아니면 됨.
- **홈 "오늘 할 일"** — `reapproachToday()` + (③)만기임박. 앱 열면 회원 사냥 없이 오늘 연락 대상이 뜸.
- **규칙:** 새 기능은 `page.jsx`에 슬래브로 쌓지 말고 각자 (lazy) 컴포넌트로 진입. ③·⑤도 이 규칙으로.

## 6. 전이 규칙
```
등록(origin=ot_funnel)        → ot_active
등록(origin=handover|external) → pt_active            [직접 문 · §1.5]
ot_active --(closing=성공 → 수동 'PT 등록 확정')--> pt_active   ⚠️ 성공만으론 전이 안 함(§1)
ot_active --(closing=보류)--> 상태 유지 + "오늘 재접근" 파생 노출 (MVP: ot_held 상태화 X)
ot_active --(트레이너 명시 종결)--> inactive
pt_active --(만기임박)--> pt_expiring                  [③ 파생 · ②에선 미구현]
inactive  --(재활성)--> ot_active | pt_active          [백로그 · 수동]
```

## 7. 편의성 원칙 (현장 daily — 매일 쓰는 트레이너, 폰, 수업 중/사이)
- 회원 선택 즉시 **"지금 할 일" 노출**, 탭 6개 사냥 0.
- `status`/`origin`은 **손 장부질 금지** — 클로징 기록·결제 확정의 부산물로 전이. origin은 등록 드롭다운 하나.
- 입력은 **사고를 유발하는 핵심만**(MASTERPLAN ⭐⭐) — 회원이 종이에 미리 써오고 트레이너는 옮겨적기,
  나머지는 드롭다운·직전값·기본값. 현장 캡처는 타이핑보다 **음성 우선**(음성일지 재사용).
- **빈 화면 지연 금지** — ① 캐시로 재방문 즉시, 첫 생성은 스켈레톤/부분 렌더, 실패해도 **입력 절대 보존**.
- AI는 계속 **'가설·방향' 표기 + override 쉽게**(스파링 파트너 철학 = 일상 신뢰).
- **네트워크 나빠도 안 죽음** — 데모 폴백(기존) + 재시도 + 입력 보존.
- ②로 관련 없는 탭이 숨어 **트레이너 화면 자체가 가벼워진다**(안 그래지면 설계가 틀린 것).

## 8. 착수 순서 (Claude Code · 각 단계 diff 작게, 테스트 프레임 없으니 큰 재작성 금지)
1. 컬럼 선반영 SQL + `DEMO_MEMBER` 기본값 + `if(!supabase)` 가드 + **user_table UPDATE 정책**(§3 ⚠️).
2. `lib/memberStatus.js` 순수 모듈(§4 계약대로) — 규칙을 먼저 한 곳에.
3. `MemberViewShell` + `viewFor` 스위치 — 기존 탭을 OTView로 감싸(회귀 최소).
4. 등록 폼에 `origin` 드롭다운 + `initialStatus`.
5. 수동 'PT 등록 확정' 액션(`toPtActive`, 클로징과 별개).
6. ① 캐시 `report.first_assist`(round-2 brief 패턴 대칭 + 스테일 훅).
7. 홈 "오늘 재접근" 파생 리스트(`reapproachToday`).

## 9. 넘어가는 부채·백로그
- **보안:** user_table anon UPDATE 개방분 + 기존 anon 전면 개방 → ⑦(로그인/RLS)에서 일괄 잠금.
- **미룬 상태/기능:** `ot_held` 상태화 · `ot_won` · `pt_expiring`(③) · inactive 재활성 · 인계 풀 플로우(⑦).
- **다음(③) 선행:** `payment`·`session_log`가 붙으면 `pt_expiring` 파생 + `ot→pt` 자동 트리거로 승격.
- `origin` 값 사용처가 늘면 그때 리포트/통계에서 분기(데이터는 등록부터 3값으로 쌓아둠).
