# v2 — 스프린트7 인계(⑦-b 종료) · 계정 소유권 RLS **완료** · 다음 = ⑦-c 권한차등·초대·QC

> ⑦-b **완전 종료.** 소유권 축 = **계정(account)**. 5개 데이터 테이블을 `account_id` 스코프 RLS로
> 잠금 → **계정 간 격리 실증 완료**(2번째 계정 만들어 양방향 차단 확인 후 청소). MASTERPLAN "다중 트레이너
> 격리" 부채 청산됨. **다음 = ⑦-c 권한차등(/admin 원장전용) + 초대 온보딩 + 센터 내 격리 + QC 실데이터.**
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ 커밋은 트레이너 직접 터미널(`git add` 파일지정) · diff 원문 통과 후 · 직후 `git show --stat HEAD`.
> ★ **SQL은 Supabase 대시보드 직접 실행 → git엔 기록본(docs/migrations/)만.** SQL 성공 ≠ 반영(실증 필수).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차)~`-6`(6차) ·
> `docs/v2-sprint7-handoff.md` · `docs/v2-sprint7-postscript-handoff.md`(⑦-a 종료) ·
> `docs/migrations/2026-07-07-step7a-rls-lock.sql` + **⑦-b 4파일(아래 §5)** · `CLAUDE.md`.

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
   ├ ⑦-a 로그인 + anon 잠금            ✅ (직전 세션)
   ├ ⑦-b account_id 소유권 RLS         ✅ ← 이번 세션
   └ ⑦-c 권한차등 + 초대 온보딩 + QC    ⏳ ← 다음
```

**커밋 체인(origin/main · push 완료):**
`ade42f4`(⑦-a 로그아웃버튼) → `a9cb080`(⑦-a 기록+인계) →
`cea5888`(⑦-b Part A) → `da271cc`(B-1 백필) → `e0464e8`(B-2 굳히기) → `2a331ee`(B-3 RLS 잠금).
원격 HEAD = `2a331ee`. 작업트리 clean.

> ⚠️ **코드 커밋 0 · SQL 마이그레이션 4개**: ⑦-b는 앱 코드를 한 줄도 안 고쳤다(아래 §2 "앱 무변경"의 이유).
> git에 올라간 건 전부 `docs/migrations/*.sql` **기록본**. 실제 잠금은 Supabase 대시보드에서 실행됨.

---

## 1. 이번 세션 완료·확정 (⑦-b)

**소유권 모델(확정 · sprint7-postscript §4 뼈대 그대로 구현):**
```
account (id·type[center|solo]·name)      ← 진짜 소유·청구 단위 = RLS 격리 기준. 파일럿 = center 1행.
trainer (id=auth.users.id·account_id·role[owner|trainer]·active·name)   ← 유저↔계정↔역할. 한 유저 한 계정.
5개 데이터 테이블 += account_id           ← 전부 도장. RLS = account_id = auth_account_id().
auth_account_id()  SECURITY DEFINER       ← 로그인 유저 → 소속 account_id (정책이 이걸 씀).
```

**실행한 마이그레이션 4단계(전부 잘게 · 롤백 짝 · 실증):**
- **Part A**(`cea5888`) — account/trainer 테이블 + seed(파일럿 center 1 + 기존 트레이너 owner) +
  `auth_account_id()` 헬퍼 + account/trainer 읽기 정책 + **5테이블 account_id 컬럼(nullable)**. **비파괴**(아무것도 안 잠금).
- **Part B-1**(`da271cc`) — 기존 전 행(전부 테스트행) `account_id` NULL → 파일럿 계정 백필. **잠금 전 필수**(순서: 백필→잠금).
- **Part B-2**(`e0464e8`) — `account_id` **DEFAULT auth_account_id()**(자동 도장) + **NOT NULL** + **FK→account** ·
  `user_table.trainer_id` **DEFAULT auth.uid()** + 기존 백필. → 앞으로 insert가 DB에서 자동 도장돼 **앱 코드 무변경**.
- **Part B-3**(`2a331ee`) — 5테이블 RLS `using(true)` → `using(account_id = auth_account_id())` +
  insert `with check(동일)`. **리트머스 = center_machine 먼저**(폰 머신목록 노출 = 헬퍼 end-to-end 확증) → 나머지 4개.

**실증(⑦-b 진짜 합격선):**
- 리트머스: center_machine 먼저 잠근 뒤 폰에서 머신 목록 정상 = 로그인→헬퍼→계정매칭 동작.
- 전체: 로그인 앱 회원목록·1·2차 OT·음성일지·세션·관찰기록 저장 전부 정상(내 계정 것 다 보임).
- **교차 격리**: 2번째 auth 유저(test3)+2번째 account 만들어 회원 등록 → **양방향 차단 확인**
  (test3은 내 것 못 봄 / 나는 test3 것 못 봄) → **테스트 계정·회원·계정 청소 완료**(원래 파일럿 1계정 1트레이너로 복구).

---

## 2. ⑦-b 소관 / 경계 (오버빌드 방지 · 재확인)

- **⑦-b가 한 것:** "로그인한 사람은 **자기 계정 데이터만** 본다." 계정 간 = 항상 격리(테넌트). anon 차단(⑦-a) 위에 계정 격리를 얹음.
- **왜 앱 코드 무변경인가:** ①스탬핑은 DB `DEFAULT auth_account_id()`/`auth.uid()`가 대행(insert에 컬럼 안 실어도 자동)
  ②필터는 RLS가 자동(loadMembers·admin fetch에 `.eq` 불필요 — 안 보이는 행은 DB가 이미 잘라줌). **§5 seam 주석은 그대로 두되 배선 불요.**
- **⑦-b가 **안** 한 것 (→ ⑦-c):**
  - **센터 내 격리 없음** — 같은 계정이면 트레이너끼리 서로 회원 다 봄. "내 회원만"은 파일럿 보고 뒤 결정
    (재료 = `user_table.trainer_id` 이미 도장됨 → 나중에 `.eq("trainer_id", me)` or 강한 RLS 한 줄).
  - **role 게이트 없음** — `/admin`도 로그인만 통과(원장/트레이너 구분 X). role 컬럼은 "자리만".
  - **초대 온보딩 없음** — 계정·트레이너는 대시보드 수동(Add user 비번직접 + trainer INSERT). invite→비번설정 화면 미구현.
  - **좌석 과금 없음** — `active` 컬럼 자리만. 결제·요금제·센터승인 = 상용화 국면.

---

## 3. 살아있는 부채·주의 (⑦-c/go-live에서 밟을 것)

- **★ trainer FK `on delete` 규칙 미정** — `trainer.id → auth.users(id)`가 `on delete` 없이 걸려 있어
  **유저 삭제 시 trainer 먼저 지워야** 함(이번에 밟음: "Database error deleting user"). 지금은 **안전벨트로 유효**
  (데이터 남은 채 유저 실수삭제 방지 = 삭제금지 철학과 정합). ⑦-c "유저 비활성/오프보딩" 설계 때 `on delete` 명시 결정.
- **★ 파일럿 실회원 청소(go-live 직전)** — 옛 한글 '성공' 행(교훈4 잠복) + 각 세션 테스트 회원/계약/수업로그.
  DELETE 정책 없음 = 대시보드 수동. **실회원 투입 전 마지막 한 번.** (이번 ⑦-b 교차실증 흔적은 이미 청소함.)
- **DEMO_MEMBER account_id 더미값** — `if(!supabase)` 데모 모드는 DB 밖이라 DEFAULT 무관. 뷰 로직이 `member.account_id`를
  참조하면 `DEMO_MEMBER`에 더미 account_id 얹어야 함(현재 미확인 · 데모 모드 렌더 깨지면 여기). **작은 앱 후속.**
- **초대 온보딩 = ⑦-c** — Supabase Invite는 비번설정 화면 없음 → Add user(비번직접+Auto Confirm) 우회 중.
  자체 SMTP·비번설정 UI는 ⑦-c 언저리. 기본 메일러 시간당 발송 한도 낮음.
- **DELETE 정책 없음 유지** — ⑦-b도 DELETE 정책 안 만듦(삭제금지 철학·inactive 보관). 청소는 대시보드 수동. 유지.
- **⑦-a/⑦-b 이중 방어 유지** — AuthGate(클라 UX 게이트) + RLS(진짜 잠금). 둘 다 있어야 완결.

---

## 4. ⑦-c 뼈대 (다음 세션 출발점 · 아직 미착수 · 우선순위 트레이너 판단)

**⑦-c = 계정 "안"을 채우는 국면**(⑦-b는 계정 "간" 벽을 세웠음). 3덩이:

1. **role 권한차등 (/admin 원장전용)**
   - `/admin`을 `role='owner'`만 접근. 재료 = `trainer.role` 이미 있음. AuthGate 옆에 role 체크 한 겹 or admin RLS.
   - 트레이너가 `/admin` 열면 매출·QC가 보이면 안 됨(원장만). 클라 게이트 + (선택) admin 조회 테이블 role 조건.
2. **센터 내 격리 "내 회원만" (파일럿 보고 뒤)**
   - `trainer_id` 이미 도장돼 있음. "공유 vs 내 회원만"은 센터 운영 방식 확인 후.
   - 옵션: 앱 필터(`.eq("trainer_id", me)`) = 부드러움 / 강한 RLS(account_id AND trainer_id) = 원장 열람과 상충 →
     **원장=계정전체·트레이너=본인**을 role로 가르는 게 정석(⑦-b가 "authenticated 전체"로 안 짜고 account 스코프로 짠 이유와 동형).
3. **초대 온보딩 + QC 실데이터**
   - 초대: 원장이 트레이너 추가(invite→비번설정 화면). 좌석 상한 = 요금제(상용화).
   - QC 실데이터화(조회율·리딩률·grade) = 다중 트레이너 전제라 여기 소관. 현재 데모 유지 중(handoff-6 §2 파킹).

**설계 원칙(⑦-b에서 검증된 것 상속):** 잘게 + 롤백 + 실증. role 게이트는 "권한 없는 유저로 로그인 → /admin 못 봄" 실증까지.

---

## 5. ⑦-b 마이그레이션 기록 (docs/migrations/ · 재현·감사·롤백)

| 파일 | 내용 | 롤백 |
|---|---|---|
| `2026-07-08-step7b-parta-ownership-setup.sql` | account/trainer + 헬퍼 + account_id 컬럼(nullable) | 파일 하단 주석(테이블·컬럼 drop) |
| `2026-07-08-step7b-partb1-backfill.sql` | 기존 행 account_id 백필 | 도장→NULL (B-2 전에만) |
| `2026-07-08-step7b-partb2-harden.sql` | DEFAULT/NOT NULL/FK + trainer_id | FK→NOTNULL→DEFAULT 해제 |
| `2026-07-08-step7b-partb3-rls-lock.sql` | RLS account 스코프 잠금 | ⑦-a using(true) 복원 |

- 전부 멱등(drop if exists→create · if not exists · where … is null). 재실행 안전.
- **각 파일 하단에 롤백 SQL 주석 짝.** RLS 사고 시 B-3 롤백부터(→⑦-a 수준 = 로그인 전체열람).
- 검증 쿼리도 각 파일 주석에 포함(정책 조건·컬럼 상태·격리 확인).

**고정 상수:** 파일럿 계정 id = `11111111-1111-1111-1111-111111111111`(백필·후속이 참조).

---

## 6. ⑦-c 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main)

- `components/AuthGate.jsx` — role 게이트 얹을 자리(현재 세션 유무만 판정).
- `app/admin/page.jsx` — /admin 원장전용 게이트 + fetch 소유권(RLS가 이미 account 필터 · role 추가 시 여기).
- `app/page.jsx` — MemberForm 등록(account_id/trainer_id 자동도장 확인점) · loadMembers(센터내 필터 seam).
- `lib/supabaseClient.js` · Supabase RLS 정책 · (신규) trainer INSERT 정책(초대 온보딩) · account 테이블.
- `lib/memberStatus.js` — DEMO_MEMBER account_id 더미값 얹을 자리(데모 모드 방어).

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 해시(`2a331ee`)와 어긋나면 알림.

---

## 7. 관통 철학 (유지 — MASTERPLAN ⭐⭐)

- **뼈대 먼저, 상품화 로직은 검증 뒤:** ⑦-b는 account_id·role·좌석 "자리만". 결제·승인·초대UI는 파일럿 검증 후(⑦-c/상용화).
- **거절/이탈을 데이터로:** 트레이너 좌석도 회원처럼 "끄되 안 지운다"(active=false 보존) = 통계·인계 원천.
- **되돌리기 어려운 SQL 신중:** 잘게 + 롤백 손에 쥐고 + 실증(교훈1 "SQL 성공 ≠ 반영"). ⑦-b 4단계가 그 실천.
- **오버빌드 방지:** 파일럿(한 센터·트레이너 소수)이 다중 SaaS 설계에 인질 안 잡히게. 자리만, 화면은 나중.
- **스파링 파트너 · 숫자(운동처방)금지 · 압박 아닌 공감 · 상향평준화** — 기능 국면(§8 파킹) 착수 시 유지.

---

## 8. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` + 대상파일 + `diff 작게` + `lint green` +
  ■ 목표 / ■ 변경(정확 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인 + ★"커밋 금지 — 트레이너 직접".
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설은 `--no-index /dev/null <파일>`.
- **커밋 = 트레이너 직접 터미널** · 파일지정 `git add` · 통과 후 · 직후 `git show --stat HEAD` 반쪽 확인 · **push까지 확인**.
- **★ SQL = Supabase 대시보드 직접 실행** · git엔 `docs/migrations/*.sql` 기록본만 · 멱등 · 잘게(리트머스 먼저) ·
  **롤백 SQL 짝으로** · 실행 후 실증(로그인 읽힘 / anon·타계정 차단). 여러 쿼리 한 번에 돌리면 **마지막 결과만 표시**됨 → 검증은 하나씩.
- **환경:** 터미널 = **PowerShell** (`C:\Users\tig00\pt-navigator`) — `grep` 없음(`Select-String`·파일 업로드).
  lint = `npm.cmd run lint`. 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후). `.next` stale 주의.
  Supabase SQL = 대시보드 SQL Editor. 유저 삭제는 **trainer 행 먼저**(FK).

---

## 9. 파킹 (⑦ 뒤 · 기능 국면 "OT/재등록 AI·통계 강화")

> sprint7-postscript §8 그대로 이월. ⑦(배포안전) 뒤에 묶어서.
- **(B) AI PT 패키지 제안** · **(C) 클로징/재등록 가능성 예측**(구간·왜·지렛대, 정밀% 아님) ·
  **(D) OT 클로징 실패사유 수집**(`ot_log.closing_reason` · reg_reason 대칭) · **QC 실데이터화**(⑦-c와 겹침).
- **[기존]** 스케줄표(scheduled_at 자리) · 트레이너 프로필 세일즈 개인화 · 프롬프트 다듬기(harness) ·
  회원 기본정보 수정 UI · 음성 디테일 강화 · KST 월경계 보정 · PWA 후속(서비스워커·하단탭바).

---

## 10. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 환경: 터미널 PowerShell(grep 없음). lint = npm.cmd run lint. SQL은 Supabase 대시보드 직접 실행(git엔 migrations 기록만).
> 첨부 문서 먼저 읽어줘: v2-sprint7-postscript-handoff-b.md(⑦-b 종료·직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1~6차) · v2-sprint7-handoff · v2-sprint7-postscript-handoff(⑦-a) ·
> migrations/(step7a + step7b 4파일) · CLAUDE.md.
>
> ⑦-b **완전 종료** — 계정(account) 소유권 RLS. 5테이블 account_id 스코프 잠금 + 교차 격리 실증 완료.
> HEAD 2a331ee. 앱 코드 무변경(DB DEFAULT + RLS 자동필터). migrations 4파일 push 완료.
>
> 다음 = **⑦-c**: (1) role 권한차등(/admin 원장전용) (2) 센터 내 "내 회원만"(파일럿 보고 뒤 · trainer_id 이미 도장)
> (3) 초대 온보딩 + QC 실데이터. 어디부터 갈지 먼저 정하고, trainer FK on delete 규칙(부채 §3)도 그때 짚자.
> 되돌리기 어려운 SQL은 여전히 잘게+롤백+실증. 필요 코드는 짚어서 청구. 방식은 §8.
