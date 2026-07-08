# v2 — 스프린트7 인계 · ⑤ 급한불 **완료** + ⑥ 다듬기/lint **완료** · 다음 = ⑦ 로그인·RLS

> ⑤ 치트키/급한불(회원 급변 대처 AI + 의료 가드) **완전 종료**. ⑥ 다듬기+lint **완전 종료**
> (lint green · 실상태 배지 · KST 월경계 · 죽은 재등록탭 제거 · 탭 순서/이름). SQL 0(⑤ DB무관·⑥ 클라/집계).
> **다음 = ⑦ 로그인·RLS (다중 트레이너 확정 · 배포 전 필수).** 무거운 국면 — 코드 전 운영방식 결정 선행.
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만.
> ★ **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(반쪽 커밋 방지 — 이번 세션 실제로 밟음, §5).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차) ·
> `-2`(2차) · `-3`(3차) · `-4`(4차) · `-5`(5차) · `-6`(6차) · `CLAUDE.md`. 코드는 착수 시 필요분만 짚어 청구(§6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5)
③ PT 관리 뷰       ✅ (v2-S6)
④ 클로징/매출 통계  ✅ (v2-S6 · HEAD 6b094a8) + PWA 최소분 ✅
⑤ 치트키/급한불    ✅ ← 이번 세션 (③ PTView에 얹은 대칭 · DB무관)
⑥ 다듬기 + lint    ✅ ← 이번 세션 (lint green · 표면 정돈)
──────────────────────────────
⑦ 로그인·RLS      ⏳ ← 다음 (다중 트레이너 확정 · 배포 전 필수)
```

**이번 세션 커밋 체인(origin/main · push 완료 · 폰 확인 완료):**
`6b094a8`(④ 끝) → `461afef`(⑤-a route acute) → `00f9b6c`(⑤-b PTView 급한불) →
`9dac988`(lint 배치1 FirstOTAssist hoist) → `02f38e0`(lint 배치2 반쪽) → `911cdb3`(반쪽 보정) →
`e6c6c58`(KST 월경계) → `b72dff8`(죽은 재등록탭 제거) → `ae4d699`(탭 순서/이름).
원격 HEAD = `ae4d699`(main = origin/main). 작업트리 clean(untracked txt 3개 page-slices/reapproach/shell는 무해).

> ⚠️ **SQL 없음**: 이번 세션 전체에서 새 마이그레이션 0. ⑤는 DB무관(세션 전용)·⑥은 클라/집계/lint뿐.
> lint 상태: **green(0 problems)** — 5에러+2경고 → 0. 이후 "대상 파일이 lint에 새로 뜨나" 판별 깨끗.

---

## 1. 이번 세션 완료·확정

### ⑤ 급한불 = 회원 급변 대처 (461afef · 00f9b6c)
로드맵 ⑤ = ①·③에 얹는 대칭. 이번엔 **③ PTView에만** 얹음(①판은 파킹 — §4).

**⑤-a route (461afef · app/api/ot-brief/route.js):**
- `phase:"acute"` 신설 = `reregisterPrompt` 패턴 대칭 복제. `acutePrompt(member, acuteContext)`.
- **자동 Sonnet·5120·thinking off** — 기존 삼항(`first?...:MODEL_SECOND` / `maxTokens first?8192:5120` / `thinking if(phase!=="first")`)에 acute가 else로 떨어져 wiring 최소(whitelist·prompt 삼항·body 구조분해만).
- **의료 가드 = safety-first 스키마**: `{data_gaps, safety, avoid[], alternatives[], principle, note}`. safety(병원·의료진 우선)·avoid(피할 움직임)가 본체, alternatives는 "의학 확인 이후 전제" 게이트. 숫자 처방 금지·방향만·세일즈 몰이 금지(프롬프트에 명시).
- FIELD_TERMS에 safety/avoid/alternatives/principle append(값 누출 방어). 거울 harness `test-acute-prompt.mjs`(gitignored).

**⑤-b PTView (00f9b6c · PTView.jsx 편집 + AcuteBriefView.jsx 신설):**
- 급한불 `<details>` = 수업 확인서 섹션 **아래**, 재등록 결과 기록 **위**. `generateAcute`(fetch phase:"acute", **세션 전용·DB write 0·캐시 0** = ① FirstOTAssist 판).
- **상시 의료 배너** = AI 출력·에러와 무관하게 급한불 펴면 항상 뜨는 고정 빨간 배너(이중 방어). `AcuteBriefView`가 AI 출력(safety 최상단) 렌더.
- 회원 전환 시 입력·결과 리셋(세션 전용). demo 폴백 없음(의료 안전 — 키 없으면 503 → 정직한 에러 + 상시 배너).

### ⑥ lint green (9dac988 · 02f38e0 · 911cdb3)
5에러+2경고 → 0. **동작 무변경·순수 청소.**
- **9dac988** FirstOTAssist `Example` 컴포넌트를 모듈 스코프로 hoist(render 중 생성 3에러 = static-components) + 죽은 exhaustive-deps disable 삭제.
- **02f38e0**(반쪽) + **911cdb3**(보정) — page.jsx 부팅 effect·PtConfirmBanner 가드 브랜치에 set-state-in-effect disable(의도된 mount 로드/리셋이라 구조 안 뜯음) + FirstOTTab 죽은 no-unused-vars disable 삭제. ⚠️ 02f38e0이 FirstOTTab 빠뜨린 반쪽 커밋 → 911cdb3로 봉합(교훈 §5).

### ⑥ 표면 정돈 (e6c6c58 · b72dff8 · 탭순서 커밋)
- **실상태 배지** — FirstOTTab 회원카드의 가짜 고정 "1차 OT·LIVE"(하드코딩 데모잔재) → `member.status` 실배지(OT 라임/PT 에메랄드/종료 zinc). labels.js `STATUS_OPTS` + FirstOTTab `STATUS_TONE` 정적 색맵. 죽은 `session` 필드 청소. **1차/2차 세분은 안 함**(round 조회 필요 → 나중 C2 통합 때).
- **KST 월경계 (e6c6c58)** — ④ 매출/수업 '이달' 필터가 UTC 자정이라 KST 월초 0~9시/월말 밤 계약이 엉뚱한 달로 샘. memberStatus에 순수헬퍼 `kstYm(iso)`(UTC ISO → KST 'YYYY-MM', now 안 읽음) + `revenueInMonth`·`sessionsCount`의 `.slice(0,7)` → `kstYm(...)`. admin `ym`도 KST 이달로. **started_at 저장포맷은 UTC 유지**(activeContract·latestContract 정렬 안전). 노드 눈검사 경계 4케이스 PASS.
- **죽은 재등록탭 제거 (b72dff8)** — 재등록 실기능은 ③ PTView로 이관 완료 → 옛 데모 `CRMTab`(292줄) + CRM 전용 상수 9개(CRM_SIGNALS·CRM_PSYCH·CRM_RISK·CRM_OPP·CRM_OFFER·CRM_SCRIPT·RESIGN_DIRECTION·RESIGN_TIMING·timingStatus) + 미사용 아이콘 11개 삭제(-449줄). TABS 재등록 줄 + 렌더 `{tab===3&&<CRMTab/>}` 제거. **id 명시값이라 번호 안 밀림**(관찰 id:5 유지).
- **탭 순서/이름 (탭순서 커밋)** — `1차 OT → 2차 OT → 관찰기록`을 `1차 OT → 1차 피드백 → 2차 OT`로. TABS 배열에서 관찰(id:5) 줄을 2차(id:2) 앞으로 이동 + label "관찰 기록"→"1차 피드백". **id 값 무변경**(렌더 스위치·setTab 그대로). 동선: 1차 → 피드백 기록 → 그 근거로 2차.
  - ⚠️ **미확인 후속**: "1차 피드백" 탭 **내부**(ObservationTab.jsx)에 "관찰 기록" 제목/문구가 남아 탭이름↔내용 어긋나는지 폰 확인 필요. 어긋나면 ObservationTab 내부 문구도 개명(표면 정돈 후속 조각).

---

## 2. ⑤ 소관 / 경계 (오버빌드 방지)

- **⑤가 한 것:** ③ PTView에 급한불 블록 = 급변 상황 한 줄 입력 → safety-first 방향 제시(피할 움직임·의학확인후 결·원리). 세션 전용.
- **⑤가 안 한 것:**
  - **①(1차 OT) 대칭판** = 파킹(§4). 1차는 관찰이 얇아 급변 재료 부실 우려(sprint5 "관찰 기반 1차 정확도 낮음" 결). ③에서 값어치 확인 후 확장.
  - **저장/캐시/히스토리** = 안 함(급변은 일회성 순간 대응 · DB무관 확정).
  - **①판 급한불** = ①(FirstOTAssist) 즉각피드백 자리에 얹는 건 나중.
- **의료 가드 = 이 기능의 전부.** route 프롬프트 톤 손볼 게 나오면 route.js만 후속 커밋(UI 그대로).

---

## 3. 살아있는 부채·주의 (⑦에서 밟을 것)

- **★ 보안 = ⑦ 본체:** anon 전면 개방(URL+키면 개인정보·매출 접근) 잠금이 ⑦의 이유. ⑤·⑥에서 새 anon write 경로 0(⑤ DB무관·⑥ 클라/집계). 기존 부채: user_table anon UPDATE(S5)·session_log/daily_workout_log anon(S6)·ot_log anon(S2)·/admin anon 개방 전부 ⑦ 일괄 잠금.
- **★ ④ 테스트행 청소**(Supabase 대시보드 수동 · DELETE 정책 없음): 각 세션 테스트 회원/계약/수업로그 + **옛 한글 '성공' 행**(교훈4 잠복 트랩 — 영문 필터 silent 누락). **본 청소는 ⑦ go-live 직전에 묶음**(auth 테스트로 또 생기니 마지막 한 번). **예외: 한글 '성공' 행은 다음 대시보드 열 때 먼저** 지워도 좋음(④ 방금 실데이터 읽기 시작 → 조용히 오염).
- **① 캐시/배너 lift(C2):** ③ 언저리에서 부모가 회원 round 상태 소유(lift)로 배너 refetch·① 재방문 stale·2차 조회 통합. 이걸 하면 **실상태 배지의 1차/2차 세분도 공짜**(round 재료 생김). C1 안 함·C2 채택.
- **탭 내부 문구 후속**: ObservationTab.jsx "관찰 기록" → "1차 피드백" 결로(폰 확인 후 필요 시).
- **untracked txt 3개**(page-slices/reapproach/shell): 트레이너 임시 파일. 필요없으면 삭제, 계속 쓰면 .gitignore 한 줄.

---

## 4. 기능 국면 파킹 (⑦ 뒤 · "OT/재등록 AI·통계 강화" 한 국면)

> 다 프롬프트 스키마 확장 + harness 물림이 필요한 기능. ⑦(배포 안전) 뒤에 묶어서.

- **(B) AI PT 패키지 제안** — 1·2·재등록 AI가 수업 내용 보고 "앞으로의 목적·방향 + 구체 프로그램 구성(주차·세션·성격, 예 '12주 집중 다이어트 · 주2~3회')"을 이름 붙여 제안.
  - ★ **철학 재정리(트레이너 지적 반영):** "숫자 금지"는 **운동 처방 숫자**(세트·중량·각도)가 겨냥 — 그건 트레이너 본질 역량이라 사고 대체 시 하향평준화. **세일즈 패키지 숫자(주차·세션·금액)는 본질 역량 아님** → AI 제공이 오히려 상향(세일즈 말문 막힘 = 트레이너 공포의 핵심). 그래서 **패키지 구성 제안 = OK**.
  - ⚠️ **남는 가드 = "숫자"가 아니라 "압박"**: "○○님 지금 안 하면 원점" 류 푸시 대본 금지(공감 근거로만). **금액**은 센터 가격표 재료 있어야 정확(환각 가격 방지) → 가격표 테이블은 ⑦ 언저리.
  - 형태: ✅ 프로그램 구성 근거와 함께 · ⚠️ 금액은 가격표 있을 때 · ❌ 압박 문구.

- **(C) 클로징/재등록 가능성 예측** — 2차 브리핑에 1차 반응·거절사유·**심리학적 요인**(회원 실제 생각 추론) 종합해 클로징 가능성, 재등록은 트라이 회차별 가능성.
  - ★ **형태 = 구간(높음/중간/낮음) + 왜 + 지렛대**(뭘 하면 올라가나). **정밀 %(80%) 아님.**
  - ⚠️ 이유(sprint5-postscript "재논의 필요" 결론): ①④ 데이터 축적 전 % = 환각 ②자기실현·기록 왜곡(예측 보고 관찰 조정 → ④ 오염) ③숫자=사고정지. **구간+근거가 %보다 유용**(트레이너가 행동 바꿀 수 있음).
  - 심리요인은 "본인 데이터 추론"(PREAMBLE 환각 가드) · **④ 실데이터 쌓인 뒤 강화**.

- **(D) OT 클로징 실패사유 수집** — 지금 성공은 `closing_approach`(방향)를 받는데 **실패/보류 사유는 안 받음**(재등록 reg_reason엔 있음 = 비대칭). 사유 카테고리를 받으면 트레이너가 "나는 주로 어떤 이유로 놓치나" 보고 **자기 약점 교정**(⭐상향평준화).
  - 규모: SQL(`ot_log.closing_reason` = reg_reason 대칭) + 1·2차 입력 UI(fail/hold일 때 드롭다운) + labels.js `CLOSING_REASON_OPTS`(⚠️ 실데이터 보며 확정 — 재등록도 그랬듯) + ④ `closingReasonStats` 순수함수(reregisterReasonStats 대칭) + admin "실패 사유 분포" 카드.

- **[기존 파킹]** ⑤ ①판 급한불 · 스케줄표(scheduled_at 자리 있음) · 트레이너 프로필 세일즈 개인화(선행 ⑦) · -4 프롬프트 문구 다듬기(harness) · 회원 기본정보 수정 UI · 음성 디테일 강화.

---

## 5. ⑦ 착수 — 운영 방식 결정 (다중 트레이너 확정)

**★ 트레이너가 "다중 트레이너(여러 명 각자 회원 관리)" 확정.** → trainer_id 소유권 RLS 필요(무거운 버전).

**⑦는 지금까지와 다르다 — 신중:** ① RLS 잘못 걸면 앱 통째 안 뜸/안 잠김(SQL 레벨, git revert로 안 끝남) ② 실회원·개인정보 걸림(실수 비용 큼) ③ 운영방식 결정이 코드 선행.

**착수 순서 권고 (⑦도 잘게):**
- **⑦-a = 로그인 + anon 전면개방 잠금 (소유권 무관)** — Supabase Auth + `/admin` 보호 + anon 개방 닫음. **"로그인한 사람만 앱 씀"까지.** 아래 3결정 없이도 착수 가능 → 지금 바로 설계 가능.
- **⑦-b = trainer_id 소유권 RLS** — 아래 3결정 반영해 "본인 회원만" 잠금 + 배정/이관.
- **⑦-c = 관리자 권한 차등 + QC 실데이터** — 관리자 전체 열람 + 트레이너 QC(데모 → 실데이터).

**⑦-b 들어갈 때 정할 3결정 (뼈대):**
1. **회원↔트레이너 배정 누가/언제** — (가)등록 트레이너 자동 소유 / (나)관리자 배정 / (다)등록 폼 드롭다운 선택.
2. **관리자 = 누구·뭘 보나** — (가)전체열람 별도 계정(원장) / (나)트레이너 겸직. `/admin`(매출·QC) 지금 anon 개방 = 여기 권한 차등이 핵심.
3. **트레이너 간 열람** — (가)완전 격리(내 회원만·안전·단순) / (나)부분 공유(인계·대타용·RLS 복잡).

**마이그레이션 주의:** 기존 anon으로 쌓인 회원 `trainer_id` = NULL. 잠그는 순간 아무도 못 볼 수 있음(NULL 처리 정책 필요). `user_table.trainer_id`는 선반영돼 있음(값·필터는 ⑦).

---

## 6. 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main)

- (⑦-a) `lib/supabaseClient.js`(anon 키·null 가드) · `app/layout.js` · 로그인 페이지 신설 자리 · `app/admin/page.jsx`(보호 대상).
- (⑦-b) `app/page.jsx`(MemberForm 등록·trainer_id 배선 자리) · `lib/memberStatus.js`(buildContract·전이) · 각 fetch 경로(user_table·ot_log·session_log·daily_workout_log) · Supabase RLS 정책.
- (⑦-c) `app/admin/page.jsx`(전체 열람·QC) · trainer 테이블 신설.
- (참고·⑤) `app/api/ot-brief/route.js`(acutePrompt) · `components/views/AcuteBriefView.jsx` · `components/views/PTView.jsx`.

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 해시와 어긋나면 알림.

---

## 7. 관통 철학 (유지 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록·급한불·통계 인사이트도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만:** 단 **운동 처방 숫자**(세트·중량·각도) 한정 — 트레이너 본질 역량 보호용. **세일즈 패키지 숫자는 별개**(§4-B). 클로징 "정밀 %"도 과신 금지(구간·방향 우선 · §4-C).
- **의료 경계:** 통증·부상은 병원·의료진 우선, 치료·진단·처방 단정 금지(⑤ 급한불 특히 · safety-first + 상시 배너 이중 방어).
- **압박 아닌 공감:** 세일즈 강도 = 근거의 세기지 압박의 세기 아님.
- **거절을 데이터로:** OT 실패·재등록 실패도 inactive 보관(삭제 금지) = ④ 통계 원천. 실패사유 수집(§4-D)도 이 결.
- **뼈대 먼저, AI는 그 위 · %하드코딩=가짜 회귀 금지.**
- **★ 상향평준화(제품의 영혼):** 통계·실패사유·급한불 다 "정답 하달"이 아니라 트레이너가 자기 강점/약점 보고 스스로 교정하게.

---

## 8. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green` +
  ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인 + ★"커밋 금지 — 트레이너가 직접".
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설 파일은 `--no-index /dev/null <파일>`.
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만.
  **커밋 직후 `git show --stat HEAD`로 반쪽 확인**(이번 세션 02f38e0에서 실제로 밟음 → 911cdb3 보정).
- **큰 작업은 작은 스텝 분할**(⑤-a/⑤-b · lint 배치1/2처럼) — 각 독립 커밋·검토·폰확인.
- **⑦는 특히 잘게 + SQL 신중**(되돌리기 어려움). SQL은 멱등·재실행 안전 + 첫 write 경로에서 `.select()`→data.length>0 검증(교훈1: SQL 성공 ≠ 반영).
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **환경:** 터미널 = **PowerShell** (`C:\Users\tig00\pt-navigator`) — `grep`·`sed` 없음(`Select-String`·`Get-Content` 쓰거나 파일 업로드). lint = `npm.cmd run lint`.
  폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영). `.next` stale 유령버그 주의. 배포 Ready = Vercel 대시보드 수동(토큰 상시 부여 금지).

---

## 9. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 환경: 터미널 PowerShell(grep 없음 — Select-String이나 파일 업로드). lint = npm.cmd run lint.
> 첨부 문서 먼저 읽어줘: v2-sprint7-handoff.md(직전 인계·제일 중요) + MASTERPLAN · v2-roadmap-next ·
> v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1~6차) · CLAUDE.md.
>
> ⑤ 급한불 + ⑥ 다듬기/lint **완전 종료**(lint green · 실상태 배지 · KST · 죽은 재등록탭 · 탭순서/이름).
> **다음 = ⑦ 로그인·RLS. 다중 트레이너 확정**(여러 명 각자 회원 관리) — trainer_id 소유권 RLS 필요한 무거운 버전.
>
> ⑦는 되돌리기 어렵고(SQL·RLS) 실개인정보 걸려서 신중해야 해. 착수 순서 권고 = ⑦-a(로그인+anon 전면개방 잠금·
> 소유권 무관)부터, 소유권 3결정(배정 주체·관리자 권한·트레이너 간 격리)은 ⑦-b에서. handoff §5 보고
> ⑦-a부터 갈지 3결정 먼저 정할지 정하자. ④ 테스트행 청소는 go-live 직전에 낀다(handoff §3).
> 필요 코드는 짚어서 청구(§6). 방식은 §8.
