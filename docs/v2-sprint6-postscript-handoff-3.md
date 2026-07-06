# v2 — 스프린트6 중간 인수인계 ③차 · 작업2(계약생성) 종료 → 작업3 진입

> ③ PT 관리 뷰 진행 중. **작업2 = session_log 계약생성 3진입점 배선 완료.**
> **다음 = 작업3 = PTView 실채우기 (운동일지 타임라인 → 현재 방향 필드 → 홈카드).**
> 역할: 트레이너=클로드 코드 코딩+다리 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너→웹Claude(검토·git diff 원문)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만. 클로드 코드에 커밋 위임 금지.
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차) ·
> `docs/v2-sprint6-postscript-handoff-2.md`(2차) · `CLAUDE.md`.
> 코드는 작업3 착수 시 필요분만 짚어 청구(아래 §6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편) ✅
──────────────────────────────
③ PT 관리 뷰       🔄 진행 중
   ├ 1a 공통 저장 + 차감 + 잔여렌더            ✅ 196d720
   ├ 1b 음성 PT전용화 + 프롬프트 + 카톡문구      ✅ ced7cba
   ├ 작업2 계약생성 3진입점                    ✅ (아래 커밋 체인)
   │   ├ 2a 계약빌더 + OT→PT 확정 금액모달       ✅ 2fc36e5
   │   ├ 2필터 회원탭 세그먼트+인원수+배지        ✅ 4b44b65
   │   ├ 2b-1 PT/inactive 목록복귀 진입로        ✅ e7a0cc9
   │   ├ 2b-2 ContractAmountFields 추출         ✅ 2ba32d0
   │   └ 2b-3 3진입점 완성                      ✅ (PTView계약등록+MemberForm이월+InactiveView)
   ├ 작업3 PTView 실채우기                     ⏳ ← 다음 (타임라인→현재방향→홈카드)
   └ 작업4 재등록 흐름(OT 클로징의 PT 대칭)       ⏳
④ 통계 / ⑤ 치트키 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳
```

**커밋 체인(origin/main 반영 · push 완료 · 작업트리 clean):**
`2fc36e5`(2a) → `4b44b65`(2필터) → `e7a0cc9`(2b-1) → `2ba32d0`(2b-2) → `01f1056`(chore: gitignore) → `<2b-3 해시>`(2b-3).
원격 HEAD = 2b-3 커밋. 폰 실사용 확인 완료(3진입점 다 OK).

> ⚠️ 2b-3 커밋 해시는 트레이너가 `git log --oneline -1`로 확인해 이 자리에 채워 넣을 것.

---

## 1. 작업2에서 완료·확정된 것 (계약생성 = session_log 3진입점)

### 관통 결정 — 계약은 3진입점에서만 생기고, 규칙은 순수함수 한 곳
- **순수 빌더 `buildContract({userId, sessions_total, price_per_session, amount_total, service_sessions, origin})`** (`lib/memberStatus.js`).
  `counts_as_revenue = origin!=='handover' && origin!=='external'` **자동판정**(트레이너 손 안 감). `started_at=now`. `amount_total` NULL 허용.
  INSERT+가드(`.select()`→`data.length>0`)는 호출부. 3진입점이 이 빌더 하나를 공유.
- **공유 금액 UI `ContractAmountFields`** (`components/views/`) — 세션수·회당단가·총액(자동·수정허용)·서비스 4칸. **controlled**(값은 부모 state, 자식은 렌더+onChange만). 배너·PTView가 재사용, step4 재등록도 재사용 예정.

### 2a — OT→PT 확정에 금액모달 (진입점 ①)
- `PtConfirmBanner` 확인모달에 금액 4칸 얹음. `onConfirm(contractInput)` **boolean 반환** seam — 실패 시 모달 유지·입력 보존, 성공 시 부모가 flip→언마운트.
- `confirmPtActive(contractInput)` (page.jsx) — **① 멱등 가드**(session_log 존재 체크 → 있으면 INSERT 스킵) → **② 계약 INSERT**(.select() 하드닝, 실패 시 status 안 건드림) → **③ status UPDATE**(toPtActive, .select() 하드닝) → **성공 후에만 flip**(낙관적 pre-flip 제거 = 깜빡임·롤백 방지).
- ★교훈1 값 실증 착지: ot_funnel 확정 시 session_log 첫 write raw(금액 3종·counts_as_revenue=true·started_at) 앱 경로로 실제 찍힘 확인.

### 2b-1 — PT/inactive 뷰 목록 복귀 (사용성 마찰)
- PT 뷰 진입 시 하단 OT 탭이 숨겨(경량화) 목록 복귀가 상단 드롭뿐이던 마찰 해소.
- `MemberViewShell`에 `onGoList`(=`setTab(0)`) 관통 + **`showList={tab===0}` 우선분기**(tab 0을 view보다 앞에 둠 = PT 회원 선택 상태로 회원탭 눌러도 목록 뜸). PTView·InactiveView에 "← 회원 목록" 버튼.

### 2필터 — 회원탭 세그먼트 (사용성)
- MemberListTab에 `viewFor` 기반 [전체/OT/PT/보관] 세그먼트 + 버튼별 인원수. 전체=inactive 제외. 검색은 세그먼트에 AND. 카드에 OT(sky)/PT(emerald)/보관(zinc) 배지(정적 클래스). 새 데이터 0.

### 2b-3 — 나머지 2진입점 + InactiveView
- **PTView 계약등록 회복버튼** (진입점 ① 실패 회복 + step4 재등록 씨앗): "활성 계약 없음"에 버튼 → 배너와 같은 모달(ContractAmountFields) → buildContract INSERT(.select() 하드닝, 이미 pt_active라 status 변경 없음) → `setContracts` 낙관적 추가로 잔여 즉시 반영.
- **MemberForm 이월계약** (진입점 ②): origin handover/external일 때만 남은세션수·회당단가 필드. save에서 **user INSERT에 `.select()` 추가 → `u[0].id`** 받아 계약 INSERT(`amount_total=null`·`counts_as_revenue=false`). **두 write 원자성:** user 성공/계약 실패 시 = pt_active·계약없음 → 명시 안내("PT 뷰의 '계약 등록'으로 마저") + PTView 회복버튼이 해치. user 롤백 안 함(DELETE 없음·정직한 등록 되돌리기 과함).
- **InactiveView 목록복귀 버튼**: `onGoList` prop 받아 렌더(shell이 2b-1에서 이미 넘김).

---

## 2. ★ 작업3 — PTView 실채우기 (다음 세션 본론)

지금 PTView = 회원기본정보 + 잔여카드 + 저장폼(손입력/음성/노쇼)뿐. **과거 수업이 안 보이고, "현재 방향/목표"가 없고, 홈에 재등록 타이밍 카드가 없다.** 이 셋을 채운다.

### 착수 순서 (웹 Claude 권고)

**▶ 작업3-1 = 운동일지 타임라인 먼저** (권고 · SQL 선행 없음 · 완결감)
- PTView가 이미 `logs`(daily_workout_log)를 로드 중인데 **렌더를 안 함.** 과거 수업 기록 목록을 저장폼 아래(또는 잔여카드 근처)에 시간역순으로 렌더.
- 각 행: `session_at`(날짜·시간) · `source`(manual/voice/noshow 배지) · body(ai_summary) 요약 · `sent_at`(카톡 전송 증거) 표시 · voided면 흐리게/취소선.
- **차감 되돌리기(voided) UI**를 여기서 얹을지 판단: 스키마에 `voided` 컬럼 있음(count 제외 로직도 remainingSessions에 이미 있음). 잘못 저장한 수업 무르기 = 각 행에 "차감 취소" → voided=true UPDATE(.select() 하드닝). ⚠️ UPDATE라 anon UPDATE 정책 필요(부채 §4). **작업3-1에 포함할지, 타임라인 먼저 보고 별도로 뺄지는 착수 때 결정.**
- **session_at 수정 UI**도 여기 언저리(스키마 주석 "기본 now, 수정 가능"). 백로그였음 — 타임라인 붙이며 같이 볼지 판단.

**작업3-2 = 현재 방향/목표 필드** (SQL 선행 = user_table 컬럼 1개)
- `user_table`에 방향 필드 1개 추가(예: `pt_direction text`). origin 독립(PT면 다 가짐). OT 있었으면 그 목표에서 출발, 없으면 첫 세션에 트레이너가 잡음(member-status §5 하이브리드).
- PTView에 표시 + 인라인 편집(UPDATE .select() 하드닝). "관리로 만족도 → 재등록" 뷰의 살아있는 상태축.
- ⚠️ SQL: `alter table user_table add column if not exists pt_direction text;` + anon UPDATE 정책은 이미 열림(S5). 컬럼명은 착수 때 확정.

**작업3-3 = 홈카드 재등록 타이밍**
- `reregisterDue(basis:'paid')`를 홈(회원탭) `ReapproachToday` 카드 **형제**로. 잔여 임계 도래 PT 회원 목록.
- ⚠️ **클로징 저장 지점 늘면 `onClosingSaved`/`closingVersion`도 물려야** 함(page.jsx 주석 참고). 재등록은 아직이지만 홈카드가 계약/로그 변화를 반영해야 하니 refetch 신호 경로 확인.

### 작업3에서 같이 착지시킬 잔여 (스펙 문서들이 지정한 것)
- **음성일지 = PT 전용 편입** — 이미 1b에서 PTView `<details>` 서브로 들어옴. 추가 편입 없음(확인만).
- **회원 보관 = inactive 종결**: `toInactive` writer는 있으나 **UI 없음.** PTView 어딘가 "회원 보관" 액션 + 사유(status_note). + **보관 회원 재활성 UI**(inactive→ot/pt, 2b-1에서 미룬 것). 이 둘은 작업3 후반 or 별도.
- **① 캐시/배너 lift(C2):** 작업3에서 부모가 회원 round 상태 소유(lift) 시 배너 refetch·① 재방문 stale·2차 조회 통합 해소. C1 안 함·C2 채택(이월).

---

## 3. 작업4 (작업3 뒤) — 재등록 흐름 = OT 클로징의 PT 대칭

- 재등록 = 새 session_log 행(새 세션수·새 회당단가 = 잔여 리셋). **성공≠자동갱신** → 수동 '재등록 확정'(toPtActive 대칭). buildContract·ContractAmountFields 그대로 재사용(공짜).
- reg 축(스키마에 컬럼 있음): `reg_result`(success/hold/fail **영문**·교훈4) · `reg_reason`(카테고리·labels.js *_OPTS) · `reg_reapproach_at`(reapproachToday reader 재사용) · `report`(reg_brief 캐시).
- 재등록 브리핑 = route.js **별도 phase:"reregister"** 권장(2차에 얹지 말 것 · maxTokens·가드 독립). route↔harness 字-동일.
- 이유별 피드백 = OT 브리핑의 재등록판. **근거+방향까지만, 설득 대본 금지.**
- reg_reason 카테고리 seed: 금전 부담 / 시간 부족 / 스케줄 안 맞음 / 수업 남아 나중에 / 효과 체감 부족 / 개인 사정 / 기타. **실데이터 보며 확정.**

---

## 4. 살아있는 부채·주의 (작업3에서 밟을 것)

- **★ 테스트 데이터 청소 (대시보드 수동 · DELETE 정책 없음) — 실회원 투입 전 필수:**
  - `session_log`: 작업2 테스트 계약행 전부(2a 확정 테스트 세션수 24·30 등 · 2b-3 인계/외부 이월 테스트 · PTView 계약등록 테스트 · 황대수 계약).
  - `daily_workout_log`: 1b·PTView 저장 테스트 수업로그 행들.
  - `user_table`: **황대수 status 원복**(1b-A에서 pt_active로 세팅 후 원복 안 먹음 — 실제 맞는 값으로) + S5 테스트 회원(인계/외부/신규/1차즉등록) + **옛 한글 '성공' 행**(영문 필터에 안 걸려 통계 누락 = 교훈4 재발) + S6 테스트 round-2들.
  - → 지우는 법: Supabase 대시보드 → 해당 테이블 → 행 선택 → 삭제. (앱엔 삭제 UI 없음 = ⑦까지 보안 부채.)
- **차감 되돌리기(voided) UI · session_at 수정 UI** — 작업3-1 타임라인에서 착지 판단. voided/session_at 수정은 UPDATE라 anon UPDATE 정책 필요.
- **보안 ⑦ 이월:** session_log·daily_workout_log anon 정책 + user_table anon UPDATE + counts_as_revenue 수정 권한 미강제 + 기존 anon 전면 개방 → ⑦ 일괄 잠금. 신규 write엔 anon 정책 + `.select()` 0행 하드닝 계속.
- **InactiveView 재활성 UI** — 보관→ot/pt 되돌리기(2b-1·2b-3에서 미룸). 회원 보관(toInactive) UI와 한 묶음.
- **① 캐시/배너 lift(C2)** — 작업3 lift 통합(§2).
- **음성 harness 부재** — 음성일지 프롬프트(1b-B) A/B 실측 도구 없음. 튜닝 본격화 시 OT test-*-prompt.mjs 패턴대로 신설 검토. 지금 오버빌드라 안 함.
- **[미래]** 스케줄표(session_log `scheduled_at` 자리 비어둠) · 트레이너 프로필 세일즈 개인화(선행 ⑦) · 센터 가격표 테이블(⑦ 언저리) · 고정수업료 vs 매출구간% 급여계산(④ 소관) · 카톡 알림톡 자동발송(⑦ 후·비즈채널·개인카톡 자동전송 불가라 복사방식 유지) · MemberForm 이월계약 실패 시 모달 auto-close(⑥ 다듬기, 무해).

---

## 5. 관통 철학 (③에서도 지킬 것 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백·⑤ 치트키도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만** (단 **음성일지 요약은 예외** = 트레이너가 말한 수치 정리 자리라 수치 OK). ⑤/재등록 운동 방향은 처방(각도·세트·중량) 금지.
- **의료 경계:** 통증·부상은 전문가/병원 우선, 치료·진단 단정 금지(1b-B 가드 = ⑤ 의료가드와 같은 결).
- **거절을 데이터로:** 실패도 inactive 보관(삭제 금지) = ④ 통계 원천.
- **뼈대 먼저, AI는 그 위:** session_log·계약 배선(작업2 완료)부터 깔고 재등록 AI(작업4)는 그 위.
- **입력=사고 / 편의성:** 핵심만 입력(회당단가·세션수 2개→총액 자동), 나머지 자동·기본값·음성. **트레이너가 쓰기 불편하면 설계가 틀린 것.**

---

## 6. 작업3 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main 커밋본)

- **`components/views/PTView.jsx`** — 작업3 본체. `logs`(daily_workout_log) 이미 로드 중·렌더만 없음(타임라인). 잔여카드·저장폼·계약등록모달 최신(2b-3).
- **`lib/memberStatus.js`** — reregisterDue·remainingSessions·activeContract·buildContract 소비처. 방향필드/재등록 전이 함수 추가 위치.
- **`app/page.jsx`** — 홈카드(작업3-3) 배선 = `ReapproachToday` 형제 + closingVersion/onClosingSaved 신호. MemberForm(2b-3 이월) 최신.
- **`components/views/ReapproachToday.jsx`** — 홈카드 형제 붙일 때(작업3-3).
- **`lib/labels.js`** — source·재등록 카테고리 *_OPTS 추가 위치(작업4).
- (작업4) `components/tabs/ObservationTab.jsx`(writer 패턴) · `app/api/ot-brief/route.js`(브리핑 대칭·phase:reregister).

⚠️ 붙는 코드는 항상 최신 main 커밋본(업로드 스냅샷 아님). 웹 Claude는 상단 주석·줄수로 최신 확인, §0 커밋 해시와 어긋나면 알림.

---

## 7. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록**: `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green 필수` + ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인. + ★"커밋하지 말 것 — 트레이너가 git diff 원문 검토 후 직접 커밋" 한 줄.
- **검토 = git diff 원문** (`git --no-pager diff <파일>`). 클로드 코드 서술 보고 ≠ 검토. 파일로 뽑을 땐 `| Out-File -Encoding utf8`(기본 `>`는 UTF-16라 깨짐). diff 덤프 파일명은 `save.txt`·`diff-*.txt`·`caf.txt` 등 = `.gitignore` 등록됨(자동 무시).
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만. 커밋 메시지 `③`→`3`(셸 특수문자 회피).
- **큰 작업은 작은 스텝으로 분할**(2a/2필터/2b-1/2b-2/2b-3처럼) — 각 독립 커밋·검토 깔끔.
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **코드는 필요할 때 짚어서 청구**(처음에 다 안 붙임).
- **환경:** 터미널 = PowerShell (`C:\Users\tig00\pt-navigator`). 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영). `.next` stale 유령버그 주의(`Remove-Item -Recurse -Force .next`).

---

## 8. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff-3.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1차) · v2-sprint6-postscript-handoff-2(2차) · CLAUDE.md.
>
> ③ 진행 중 — 작업2(session_log 계약생성 3진입점) 완료, push됨. 폰 확인 OK.
> 다음 = **작업3 = PTView 실채우기.** 착수 순서 = 작업3-1 운동일지 타임라인 먼저(SQL 선행 없음) →
> 작업3-2 현재 방향 필드(user_table 컬럼 1개) → 작업3-3 홈카드 재등록 타이밍.
>
> 먼저 작업3-1부터: PTView가 이미 logs(daily_workout_log) 로드 중인데 렌더를 안 해서 과거 수업이 안 보여.
> 이걸 시간역순 타임라인으로 그리고(source 배지·sent_at·body 요약), 차감 되돌리기(voided)·session_at 수정 UI를
> 여기 얹을지 판단하자. 필요한 코드는 짚어서 청구해줘(§6). 작업 방식은 인계 §7 규약대로.
