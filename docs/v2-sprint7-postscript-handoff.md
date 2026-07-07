# v2 — 스프린트7 인계(⑦-a 종료) · 로그인 + RLS 잠금 **완료** · 다음 = ⑦-b 소유권

> ⑦-a **완전 종료.** (1) 로그인 게이트(AuthGate + layout) (2) RLS 잠금(anon 전면개방 → authenticated 전용)
> 까지 배포·실증 완료. MASTERPLAN 최초 보안 부채(anon 개방) **청산됨.**
> **다음 = ⑦-b 소유권(trainer_id + 센터/계정 축 + role 서랍).** 무거운 국면 — 새 세션에서 문서 갖춰 시작.
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ 커밋은 트레이너가 직접 터미널(`git add` 파일지정) · diff 원문 통과 후 · 직후 `git show --stat HEAD` 반쪽 확인.
> ★ **SQL은 Supabase에서 직접 실행 → git엔 기록 파일만**(docs/migrations/). SQL 성공 ≠ 반영(실증 필수).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md`(★ 지난 세션 업로드 누락 — 꼭 챙길 것) ·
> `docs/v2-sprint5-postscript.md` · `docs/v2-sprint6-session-log-schema.md` ·
> `docs/v2-sprint6-postscript-handoff.md`(1차) · `-2`~`-6`(2~6차) · `docs/v2-sprint7-handoff.md` ·
> `docs/migrations/2026-07-07-step7a-rls-lock.sql` · `CLAUDE.md`. 코드는 착수 시 필요분만 짚어 청구(§5).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5)
③ PT 관리 뷰       ✅ (v2-S6)
④ 클로징/매출 통계  ✅ (v2-S6) + PWA 최소분 ✅
⑤ 치트키/급한불    ✅ (v2-S7)
⑥ 다듬기 + lint    ✅ (v2-S7)
──────────────────────────────
⑦ 로그인·RLS
   ├ ⑦-a 로그인 + anon 잠금   ✅ ← 이번 세션 (소유권 무관)
   ├ ⑦-b trainer_id + 센터/계정 소유권 RLS   ⏳ ← 다음 (무거움)
   └ ⑦-c 관리자 권한차등 + 초대 온보딩 + QC 실데이터   ⏳
```

**커밋 체인(origin/main · push·폰확인 완료):**
`ae4d699`(S7 ⑥ 끝) → `826e144`(⑦-a AuthGate + layout 게이트) → `ade42f4`(로그아웃 버튼 우하단 이동).
원격 HEAD = `ade42f4`. + **미커밋 신규 파일:** `docs/migrations/2026-07-07-step7a-rls-lock.sql`
(RLS 잠금 기록본 — 이 인계와 함께 커밋할 것).

> ⚠️ **RLS 잠금은 Supabase 대시보드에서 직접 실행됨**(git diff 없음). 그래서 위 .sql 파일이 유일한 기록.
> 이 세션에서 코드 커밋은 2개(AuthGate 관련)뿐, 나머지 보안 변경은 전부 SQL(대시보드).

---

## 1. 이번 세션 완료·확정

### ⑦-a Step 2 — 로그인 인프라 (826e144)
- **`components/AuthGate.jsx` 신설**(128줄) — `supabase.auth.getSession()` + `onAuthStateChange`로 세션 판정.
  미로그인=로그인 폼(이메일+비번, `signInWithPassword`), 로그인=children 렌더, 우하단 로그아웃 버튼.
  **`supabase===null`(데모 모드)이면 게이트 스킵**(CLAUDE.md null-guard 패턴 보존).
- **`app/layout.js`** — `<body>`의 `{children}`을 `<AuthGate>{children}</AuthGate>`로 감쌈.
  layout이 `/`·`/admin` 공통 최상위라 **두 라우트 한 번에 게이트**(admin/page.jsx·page.jsx 무변경).
- **접근:** 브라우저 supabase 클라이언트(session localStorage 자동 지속)라 로그인 후 기존 supabase 호출이
  자동으로 세션 토큰 첨부 → page.jsx 코드 변경 0. SSR/미들웨어/@supabase/ssr 불필요(⑦-a 경량화).

### ⑦-a Step 2후속 — 로그아웃 버튼 겹침 해소 (ade42f4)
- AuthGate 로그아웃 wrapper className `fixed top-2 right-2 z-50` → `fixed bottom-4 right-4 z-40`.
  헤더(sticky top, z-30) 우상단 '관리자/신규등록' 버튼과 겹침 해소. 모달(z-50)이 덮도록 z-40.

### ⑦-a Step 3 — RLS 잠금 (SQL · 대시보드 실행 · 기록=migrations/*.sql)
- **대시보드 0번 스텝:** Authentication → URL Configuration → Site URL = `https://pt-navigator.vercel.app`.
  Email provider ON(확인). 테스트 트레이너 = **Add user(비번직접 + Auto Confirm)** 로 생성
  (Invite는 비번설정 화면이 없어 ⑦-c로 파킹 — §3).
- **5테이블 정책 좁힘:** `to public`(9개) → `to authenticated`, `{anon,authenticated}`(3개) → `to authenticated`.
  대상: user_table·center_machine·ot_log·session_log·daily_workout_log. (실행 SQL·롤백 전문 = .sql 파일.)
- **잠그기 전 실측:** 5테이블 relrowsecurity=true(RLS 켜짐) · 정책 두 종류(public / anon,authenticated) 확인.
- **실증(교훈1 "SQL 성공 ≠ 반영"):**
  - 리트머스 = center_machine 먼저 좁힘 → 로그인 앱에서 머신목록 정상 노출 = **로그인이 authenticated 역할로 동작 확증**.
  - 나머지 4개 좁힌 뒤 → ① 로그인 앱: 회원목록·탭 정상 · ② 시크릿창 REST 직접호출(anon key)로
    user_table SELECT = **`[]`(빈 배열) = anon 차단 실증.**

---

## 2. ⑦-a 소관 / 경계 (오버빌드 방지 · 재확인)

- **⑦-a가 한 것:** "로그인한 사람만 앱 쓴다" + "anon(주소+키)으론 아무 데이터도 못 읽는다."
- **⑦-a가 **안** 한 것 (→ ⑦-b/c):**
  - **트레이너 간 격리 없음** — 로그인하면 **전체 회원**을 봄. 파일럿 한 센터엔 무방하나 다중 트레이너면 필수(⑦-b).
  - **역할 차등 없음** — `/admin`도 "로그인만" 통과(원장/트레이너 구분 X). ⑦-c.
  - **초대 온보딩 없음** — 계정은 Add user 수동. invite→비번설정 화면 미구현(⑦-c).
  - trainer_id/account_id/role 컬럼·정책 — 선반영(trainer_id)뿐, 실사용 X.

---

## 3. 살아있는 부채·주의 (⑦-b/go-live에서 밟을 것)

- **★ migrations/*.sql 커밋** — 이 인계와 함께 `docs/migrations/2026-07-07-step7a-rls-lock.sql` 커밋할 것.
  되돌리기 어려운 보안 마이그레이션의 유일한 git 기록. 롤백 SQL도 그 안에 주석으로 포함.
- **★ 테스트 계정·테스트행 정리(go-live 직전):**
  - Add user 테스트 트레이너 계정 → 실운영 트레이너로 승격 or 삭제.
  - ④ 테스트행 청소(Supabase 대시보드 수동 · DELETE 정책 없음) — 각 세션 테스트 회원/계약/수업로그 +
    옛 한글 '성공' 행(교훈4 잠복). **실회원 투입 전 마지막 한 번.**
- **초대 온보딩(invite→비번설정 화면) = ⑦-c 파킹.** Supabase 기본 메일러 시간당 발송 한도 낮음(자체 SMTP는 ⑦-c 언저리).
- **DELETE 정책 없음 유지** — 이번 잠금에도 DELETE 정책은 안 만듦(삭제 금지 철학 · inactive 보관). 유지.
- **④ admin fetch도 이제 authenticated** — /admin이 anon SELECT하던 3테이블(ot_log·session_log·daily_workout_log)도
  잠김 → admin은 로그인 상태라 정상. ⑦-b에서 `.eq("trainer_id"/"account_id", me)` seam(주석표시됨)에 소유권 필터.
- **⑦-a 화면게이트 한계:** AuthGate는 클라 게이트(UX)고, 진짜 잠금은 RLS다(이번에 채움). 둘 다 있어야 완결 — 유지.

---

## 4. ⑦-b 확정 설계 뼈대 (이번 세션 6턴 토론으로 수렴 — ⭐ 다음 세션 출발점)

> 트레이너 신호들(센터 점점 늘어남 · 구독 상품화 · 본사가 센터 승인 · 개인 무소속 트레이너 · 좌석당 과금)이
> **하나의 소유권 모델로 수렴.** ⑦-b는 이걸 "자리만" 박는다(값·UI·과금 로직은 상용화 국면).

**소유권 축 = 센터가 아니라 "계정(account/workspace)".** 계정이 센터형이거나 개인형.

```
[계정 account]  ← 진짜 소유·청구 단위 (RLS 격리 기준)
   ├ 유형 center → 트레이너 여러 명, 원장(owner) 있음
   └ 유형 solo   → 트레이너 1명(본인)=owner 겸직, 소속 없음  ← "N=1 계정"으로 흡수(특례 아님)
회원·수업·매출 → 전부 account_id 도장
트레이너       → account_id + role(owner|trainer)
```

**역할 계층(3층 · 상용화까지 확장):**
```
슈퍼관리자(본사=트레이너 본인) → 센터/개인 계정 승인·구독
   └ 계정 owner(센터 원장 | 개인 트레이너 본인) → 자기 계정만
        └ 트레이너 → 자기 회원만 (solo면 owner와 동일인)
```

**⑦-b에서 "자리만" 박을 것(값·UI는 나중):**
1. `account` 테이블(id·type[center|solo]·name) — 파일럿엔 center 계정 **seed 1행**.
2. `trainer`(또는 user↔account 매핑) 테이블 — auth.users ↔ account_id ↔ **role(owner|trainer)**.
3. 각 데이터 테이블에 **account_id 컬럼**(user_table엔 trainer_id 선반영 있음 — account_id로 일반화 검토).
4. **RLS를 account_id 스코프로** — 처음부터 "내 계정만". 센터 1개일 때도 자명하게 돌고 2개째부터 자동 격리.
   ★ 원장 열람도 `account_id = 내 계정`으로 스코프(지금 "authenticated 전체열람"으로 짜면 2번째 센터에서 재작성).

**결정(이번 세션 확정된 방향 · 실운영서 미세조정):**
- 배정: **등록 트레이너 자동 소유**(회원 등록 시 그 트레이너의 account_id 상속).
- 트레이너 발급: **센터장이 위임**(본사는 계정 단위만 승인 · 트레이너 1명씩 승인 안 함 = 병목 방지).
- 통제 지렛대: **요금제 좌석 상한**(스탠다드=N명 등) — 넘으면 상위 플랜 결제 → 본사 승인.
- 격리: 센터 **간**은 항상 격리(테넌트) · 센터 **내** 격리(내 회원만 vs 공유)는 파일럿 보고.

**과금 모델(상용화 국면 · 자리만 지금):**
- **seat 기반** = 활성 트레이너 수 × 단가. 개인=좌석1 계정(같은 로직).
- 좌석 비활성(해고·퇴사) = **과금중단 + 데이터보존**(삭제 금지 = ④ 통계·인계 원천 · inactive 보관 철학 동일).
- 결제연동(Stripe seat 등)·요금제·인보이스·센터승인 화면 = **상용화 국면**(⑦ 훨씬 뒤). 지금 손 안 댐.

**마이그레이션 주의:** 기존 회원 account_id/trainer_id = NULL. 잠그는 순간 아무도 못 볼 수 있음 →
백필(파일럿 계정으로) or 관리자 NULL-가시 정책 필요. 실회원 전이라 대부분 테스트행(§3 청소로 방어).

---

## 5. ⑦-b 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main)

- `app/page.jsx` — MemberForm 등록(회원 insert 자리 = account_id/trainer_id 배선점) · loadMembers fetch(소유권 필터 seam) · confirmPtActive(session_log insert).
- `lib/memberStatus.js` — buildContract·전이 함수(소유권 필드 얹을 자리).
- `app/admin/page.jsx` — fetch 3~4곳(소유권 필터 seam · ⑦-b/c 주석 표시됨).
- `lib/supabaseClient.js` · 각 write 경로 · Supabase RLS 정책 · (신규) account/trainer 테이블 SQL.
- `docs/v2-sprint5-member-status.md`(★ 지난 세션 누락) — status 전이·trainer_id seam 물림이라 ⑦-b 필수.

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 해시(`ade42f4`)와 어긋나면 알림.

---

## 6. 관통 철학 (유지 — MASTERPLAN ⭐⭐)

- **뼈대 먼저, 상품화 로직은 검증 뒤:** ⑦-b는 account_id·role·좌석 "자리만". 결제·승인·초대UI는 파일럿 검증 후.
- **거절/이탈을 데이터로:** 트레이너 좌석도 회원처럼 "끄되 안 지운다"(inactive 보존) = 통계·인계 원천.
- **오버빌드 방지:** 파일럿(한 센터·트레이너 최대 10명)이 다중 SaaS 설계에 인질 잡히지 않게. 자리만, 화면은 나중.
- **되돌리기 어려운 SQL 신중:** RLS는 잘못하면 앱이 빈 껍데기 → 잘게 + 롤백 손에 쥐고 + 실증(교훈1).
- **스파링 파트너 · 숫자(운동처방)금지 · 압박 아닌 공감 · 상향평준화** — 기능 국면(§7 파킹) 착수 시 유지.

---

## 7. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` + 대상파일 + `diff 작게` + `lint green` +
  ■ 목표 / ■ 변경(정확 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인 + ★"커밋 금지 — 트레이너 직접".
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설은 `--no-index /dev/null <파일>`.
- **커밋 = 트레이너 직접 터미널** · 파일지정 `git add` · 통과 후 · 직후 `git show --stat HEAD` 반쪽 확인.
- **★ SQL은 Supabase 대시보드 직접 실행** · git엔 `docs/migrations/*.sql` 기록본만 · 멱등(drop if exists→create) ·
  잘게(리트머스 테이블 먼저) · **롤백 SQL 짝으로** · 실행 후 실증(로그인 읽힘 / anon 차단).
- **선택지 = 실사용 수업 장면으로 설명**, 권고 분명히(결정 지연 방지).
- **환경:** 터미널 = **PowerShell** (`C:\Users\tig00\pt-navigator`) — `grep`·`sed` 없음(`Select-String`·파일 업로드).
  lint = `npm.cmd run lint`. 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후). `.next` stale 주의.
  배포 Ready = Vercel 대시보드 수동(토큰 상시 부여 금지). Supabase SQL = 대시보드 SQL Editor.

---

## 8. 파킹 (⑦ 뒤 · 기능 국면 "OT/재등록 AI·통계 강화" 한 국면)

> sprint7-handoff §4 그대로 이월. ⑦(배포안전) 뒤에 묶어서.
- **(B) AI PT 패키지 제안** — 세일즈 패키지 숫자(주차·세션·금액)는 OK(본질역량 아님) · 압박 문구 X · 금액은 가격표 선행.
- **(C) 클로징/재등록 가능성 예측** — 구간(높/중/낮)+왜+지렛대, 정밀% 아님 · ④ 데이터 축적 뒤 강화.
- **(D) OT 클로징 실패사유 수집** — `ot_log.closing_reason`(reg_reason 대칭) + 입력 UI + ④ 집계(상향평준화).
- **[기존]** ⑤ ①판 급한불 · 스케줄표(scheduled_at 자리) · 트레이너 프로필 세일즈 개인화(⑦ 선행) ·
  프롬프트 문구 다듬기(harness) · 회원 기본정보 수정 UI · 음성 디테일 강화 · 초대 온보딩 화면(⑦-c).

---

## 9. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 환경: 터미널 PowerShell(grep 없음 — Select-String이나 파일 업로드). lint = npm.cmd run lint.
> SQL은 Supabase 대시보드에서 내가 직접 실행(git엔 migrations 기록만).
> 첨부 문서 먼저 읽어줘: v2-sprint7-postscript-handoff.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1~6차) · v2-sprint7-handoff · migrations/2026-07-07-step7a-rls-lock.sql · CLAUDE.md.
>
> ⑦-a **완전 종료** — 로그인 게이트(AuthGate + layout) + RLS 잠금(anon 전면개방 → authenticated 전용)
> 배포·실증 완료(로그인 읽힘 / 시크릿창 anon = []). HEAD ade42f4. + migrations .sql 커밋함.
>
> 다음 = **⑦-b 소유권**(trainer_id + 센터/계정 축 + role). 설계 뼈대는 인계 §4에 수렴돼 있음
> (계정[center|solo] + role 3계층 + seat 과금, "자리만" 박고 상품화는 나중). 여기서부터 세부 스키마 설계 가자.
> ★ 이건 되돌리기 어려운 SQL·RLS 대공사라 잘게 + 롤백 + 실증. 마이그레이션 NULL 처리(기존 회원 account_id)부터 짚자.
> 필요 코드는 짚어서 청구(§5). 방식은 §7.
