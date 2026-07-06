# v2 — 스프린트6 중간 인수인계 ④차 · 작업3(PTView 실채우기) 종료 → 작업4(재등록) 진입

> ③ PT 관리 뷰 진행 중. **작업3 = PTView 실채우기 완전 종료**(타임라인·펼치기·방향 필드·홈 재등록 카드).
> **다음 = 작업4 = 재등록 흐름 (OT 클로징의 PT 대칭).** ③의 마지막 조각.
> 역할: 트레이너=클로드 코드 코딩+다리 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너→웹Claude(검토·git diff 원문)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만. 클로드 코드에 커밋 위임 금지.
> ★ **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(이번 세션 3-2에서 반쪽 커밋 실제로 밟음 — §4 교훈).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차) ·
> `docs/v2-sprint6-postscript-handoff-2.md`(2차) · `docs/v2-sprint6-postscript-handoff-3.md`(3차) · `CLAUDE.md`.
> 코드는 작업4 착수 시 필요분만 짚어 청구(아래 §6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편) ✅
──────────────────────────────
③ PT 관리 뷰       🔄 진행 중
   ├ 작업1 공통저장+차감+잔여렌더+음성PT편입   ✅ (196d720 계열, handoff-2)
   ├ 작업2 계약생성 3진입점                  ✅ (92fdc64 계열, handoff-3)
   ├ 작업3 PTView 실채우기                  ✅ ← 이번 세션 종료
   │   ├ 3-1  지난 수업 타임라인(렌더)         ✅ 4b5b1c7
   │   ├ 3-2  현재 방향/목표 필드             ✅ 3ceef61 + 744… 사이 3-3-2b(누락분 보정)
   │   ├ 3-1c 본문 펼치기(클램프→전문)         ✅ 744ca68
   │   └ 3-3  홈 재등록 타이밍 카드            ✅ ab978d5
   └ 작업4 재등록 흐름(OT 클로징의 PT 대칭)     ⏳ ← 다음
④ 통계 / ⑤ 치트키 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳
```

**커밋 체인(origin/main · push 완료 · 폰 확인 완료):**
`92fdc64`(2b-3) → `4b5b1c7`(3-1 타임라인) → `3ceef61`(3-2 방향필드, ⚠️PTView 누락) →
`e5a0914`(3-2 PTView 누락분 보정) → `744ca68`(3-1c 펼치기) → `ab978d5`(3-3 홈카드).
원격 HEAD = `ab978d5`. 작업트리 clean.

---

## 1. 작업3에서 완료·확정된 것 (PTView 실채우기)

### 3-1 — 지난 수업 타임라인 (4b5b1c7 · 순수 렌더)
- PTView가 이미 로드 중인 `logs`(daily_workout_log)를 **렌더만 없던 것**을 시간역순 타임라인으로.
- 정렬 = `session_at ?? created_at` 역순(저장 시 append돼도 정렬이 최신 위로). 구행 NULL 안전.
- 행: 날짜(`fmtDT` 로컬 헬퍼) · source 배지(`SOURCE_TONE` 정적 클래스맵 · labels.js `SOURCE_OPTS` 신설) ·
  sent_at "카톡 전송" 칩 · voided면 opacity+취소선+"취소됨" 배지 · noshow="노쇼(본문 없음)".
- **labels.js += `SOURCE_OPTS`**(manual/voice/noshow → 손입력/음성/노쇼).

### 3-1c — 본문 펼치기 (744ca68 · 순수 렌더)
- 타임라인 본문 line-clamp-3 프리뷰 → 행별 `<details>`/`<summary>`로 전문 토글. state 0(네이티브).
- ⚠️ **클램프+whitespace-pre-wrap 같은 요소 금지**(-webkit-box 충돌) → **요소 분리:** 닫힘=`<summary>`(클램프),
  열림=별도 `<p>`(pre-wrap). `group-open:hidden`/`group-open:block`으로 토글.
- ★클로드 코드 개선: "더 보기" 힌트를 `<summary>` **안**에 둠 — 네이티브 details는 닫힘 시 summary 외
  자식을 숨겨서, 밖에 두면 닫힘일 때 힌트가 사라지는 버그. 안으로 넣어 해결(주석 있음).

### 3-2 — 현재 방향/목표 필드 (user_table.pt_direction · 인라인 편집)
- **SQL 실행:** `alter table user_table add column if not exists pt_direction text;`(멱등, anon UPDATE 정책 S5 개방분 재사용).
- `member.goal`(OT 시점 스냅샷)과 **별개** = PT 관리 중 갱신되는 살아있는 축(member-status §5 하이브리드). origin 독립.
- 3파일 관통 배선: **page.jsx**(mapMemberRow `pt_direction: r.pt_direction ?? ""` + DEMO_MEMBER 기본값 +
  `onMemberPatch(id, patch)` 범용 필드 패처 + Shell에 prop) → **MemberViewShell.jsx**(onGoList와 나란히 관통) →
  **PTView.jsx**(로컬 direction state를 member.pt_direction 시드 → 인라인 편집 → `user_table` UPDATE `.select()` 하드닝 →
  성공 시 onMemberPatch로 page.jsx 회원배열 반영).
- 재시드 useEffect = `[member?.id]`만 의존(저장 후 낙관적 patch를 재시드가 안 덮음 · eslint-disable-next-line 명시).
- **★교훈1 값 실증 착지:** pt_direction anon UPDATE 첫 실검증 = 폰 하드리프레시 후 저장값 유지 확인 완료.
- **★onMemberPatch를 범용으로 판 이유:** status 전용 `setMemberStatus`와 별개. 이후 필드 편집(작업4 등) 재사용 → rule-of-three 회피.

### 3-3 — 홈 재등록 타이밍 카드 (ab978d5 · RegisterDueToday 신설)
- **ReapproachToday(OT 재접근)의 재등록 대칭.** `members` prop만 받고 컴포넌트 내부 자체 fetch(page.jsx는 import+마운트 1줄씩).
- **PT 회원만 `.in()` 2쿼리**(session_log + daily_workout_log) Promise.all → 회원별 그룹핑 →
  `activeContract`·`reregisterDue`·`remainingSessions` 순수함수 재사용(새 규칙 0). `!active`(전소진) 제외.
- 카드 = 회원명 · 잔여 유료 N · 서비스 M. **잔여 적은 순(급한 순) 정렬.** 탭 → 그 회원 선택 → viewFor가 PT 뷰 자동.
- `!supabase`→[] 미표시 · `!rows.length`→null · cancelled stale 가드(ReapproachToday 골격 동일).
- ★클로드 코드 개선: 빈-배열 setRows를 IIFE 안으로(set-state-in-effect 회피 · ReapproachToday 골격 정합).
- **파생 원칙 정합:** session-log-schema §8 "오늘의 대상자=전부 파생·새 저장 0" → 캐시 저장 안 함(잔여는 파생이 대원칙).

---

## 2. ★ 작업4 — 재등록 흐름 (다음 세션 본론 · OT 클로징의 PT 대칭)

**핵심 관점:** 재등록은 새 개념이 아니라 **OT에서 만든 closing 흐름의 PT 재등록판(대칭 복제)** = 설계 위험 낮음.
buildContract·ContractAmountFields·reapproachToday reader·ObservationTab writer 패턴 전부 재사용(공짜).

### 착수 스펙 골격 (스키마 컬럼은 이미 session_log에 있음 · schema §7)
- **reg 축(session_log 기존 컬럼):** `reg_result`(success/hold/fail **영문**·교훈4) · `reg_reason`(카테고리) ·
  `reg_reapproach_at`(date · reapproachToday reader 재사용) · `report`(reg_brief 캐시·공존 패턴).
- **writer** = ObservationTab 저장 패턴 복제(`.select()` 하드닝, 기존 필드 미덮음). 저장 위치는 PTView(재등록은 PT 뷰 사건).
- **reg_reason 카테고리(labels.js `REG_REASON_OPTS` 신설):** seed = 금전 부담 / 시간 부족 / 스케줄 안 맞음 /
  수업 남아 나중에 / 효과 체감 부족 / 개인 사정 / 기타. **자유서술 금지**(④ 집계) · **실데이터 보며 확정**(못 박지 말 것).
- **재등록 브리핑 = route.js 별도 `phase:"reregister"`** 권장(2차에 얹지 말 것 — maxTokens·가드 독립). route↔harness 字-동일.
  이유별 피드백 = OT 브리핑의 재등록판. **근거+방향까지만, 설득 대본 금지**("○○님 지금 안 하시면…" X).
- **성공 ≠ 자동 갱신** → 수동 '재등록 확정' = **새 session_log 행**(새 세션수·새 회당단가 = 잔여 리셋). toPtActive 대칭.
  buildContract·ContractAmountFields 그대로 재사용. 성공은 의향, 갱신은 수동(④ 성공률 vs 실등록률 무결성).

### 작업4 착수 순서 제안 (작은 스텝 분할 · §7)
1. reg writer + labels.js REG_REASON_OPTS + PTView 재등록 결과 입력 UI (DB 배선 먼저).
2. 재등록 브리핑 route.js phase:"reregister" + harness 거울 + PTView "AI 지원" 소비.
3. 수동 '재등록 확정' = 새 계약행(buildContract 재사용, toPtActive 대칭 게이트).

---

## 3. 관통 상수 (트레이너 daily · 지켜야 ③ 성립)

- 50분 수업 / 10분 휴식 → **10분 안에 확인·넘어가기.** 로딩·런타임 길면 daily 실격.
- 잔여·타이밍 = 파생(저장·수동감산 0). 활성계약 자동연결. 입력은 회당단가·세션수 2개→총액 자동.
- 재등록 = 등록폼 재사용(학습비용 0). 홈카드·nextAction·뷰분리 등 ②가 깐 편의에 얹힘.
- **트레이너가 쓰기 불편하면 설계가 틀린 것.**

---

## 4. 살아있는 부채·주의 (작업4에서 밟을 것)

- **★ 테스트 데이터 청소 (대시보드 수동 · DELETE 정책 없음) — 실회원 투입 전 필수:**
  - `user_table`: **황대수 status 원복**(1b에서 pt_active 세팅 후 원복 안 먹음) + S5 테스트 회원(인계/외부/신규/1차즉등록) +
    **옛 한글 '성공' 행**(영문 필터 누락 = 교훈4 재발) + S6 테스트 round-2 + 3-x 테스트 방향/로그.
  - `session_log`: 작업2 테스트 계약행(2a 확정 24·30 · 인계/외부 이월 · PTView 계약등록 · 황대수).
  - `daily_workout_log`: 1b·PTView·3-x 저장 테스트 수업로그.
  - 지우는 법: Supabase 대시보드 → 테이블 → 행 선택 → 삭제(앱엔 삭제 UI 없음 = ⑦까지 보안 부채).
- **★교훈(이번 세션): 반쪽 커밋.** 3-2 커밋(3ceef61)에 PTView.jsx가 **add 누락** → 제목만 "방향 필드"고 정작 UI 빠진
  반쪽이 배포됨(폰에 입력란 안 뜸). 3-3-2b로 보정. **재발 방지 = 커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인.**
- **basis/threshold 폰 실측 조정:** `reregisterDue` 기본 `basis:'paid'·threshold:10`(잔여 9회부터). 홈카드가 첫 실사용처 —
  현장 감각과 다르면 한 글자 조정(handoff 예고분). 지금은 기본값.
- **onSelect PT 전환 확인:** 홈 재등록 카드 탭 → 회원 선택 → viewFor가 PT 뷰 띄움. onSelect가 PT 회원을 1차 OT 탭으로
  강제하지 않는지 폰 확인(어긋나면 onSelect 정의부 ~843줄 보정). — 이번 세션 폰 확인에 포함, 정상.
- **작업3-1b (voided 무르기 · session_at 수정):** UPDATE라 daily_workout_log anon UPDATE 정책 SQL 선행. 어포던스는
  타임라인 실물 보고 확정. 급한 마찰 아니라 파킹(폰 확인 시 되돌리기 급하지 않음 확정) → 필요 시 착수 or ⑥.
- **보안 ⑦ 이월:** session_log·daily_workout_log·user_table anon 정책 + counts_as_revenue 수정 권한 미강제 +
  기존 anon 전면 개방 → ⑦ 일괄 잠금. 신규 write엔 anon 정책 + `.select()` 0행 하드닝 계속.
- **route↔harness 字-동일**(작업4 재등록 브리핑 붙일 때). test-*-prompt.mjs = gitignored 거울.
- **① 캐시/배너 lift(C2):** 이월 유지(작업3에서 통합 안 함 — 방향 필드는 최소 seam으로 충분했음). ⑥/필요 시.
- **검토용 임시 txt** (`page-slices.txt`·`shell.txt`·`diff-*.txt`): `.gitignore`가 `*.txt` 와일드카드는 아닌 듯
  (특정 파일명만) — Untracked로 뜨면 파일 지정 add로 안 딸려가게 하거나 `Remove-Item`. `docs/*.md`는 커밋 대상.

---

## 5. ⑦(로그인) 이후 백로그 — ★이번 세션 트레이너 신규 아이디어 (까먹지 말 것)

> ⑦ 로그인/RLS가 서면 관리자/트레이너/회원 3역할 자동로그인 분기. 아래 셋 다 ⑦ 선행. 무게가 다르니 갈라둠.

### 5.1 회원용 앱 — "재등록 아쉬움" 설계 (★트레이너 핵심 아이디어 · 가벼움)
- **무엇:** 회원용 로그인 시 **본인 운동일지 + 운동계획 + (식단)** 을 기록·확인. PT 기간 이후 재등록 안 하면
  **아쉬움이 남게** 만드는 게 목적 — 쌓인 데이터·관리가 끊기는 상실감.
- **왜 정합:** MASTERPLAN ⭐ "제안 안 한 비용 보여주기 / 거절을 데이터로"의 **회원판.** 재등록 철학의 완성.
- **왜 가벼움(가성비 최고):** 새 생성 아니라 **이미 쌓은 걸 회원 시점으로 읽어주는 뷰.** 운동일지=`daily_workout_log`
  이미 있음. 운동계획=`pt_direction`(작업3-2)이 씨앗. → ⑦ 로그인만 서면 대부분 공짜로 열림.
- **선행:** ⑦(회원 계정·소유권). 회원이 본인 것만 보게 RLS.

### 5.2 관리자 대시보드 = 로드맵 ④ (★트레이너 아이디어 · ④가 이미 이것)
- **무엇:** 관리자 로그인 시 관리자 전용 대시보드 — **KPI 지표 + 금일 센터 총 재등록 예정자 + 금일 트레이너별 OT 대상자.**
  관리자가 보고 **피드백**할 수 있도록.
- **왜 정합:** session-log-schema §8이 못박은 "트레이너 대시보드" 그림 그대로. 재료(reapproachToday·reregisterDue·
  counts_as_revenue·closing 통계)가 지금 다 쌓이는 중. "새 발명"이 아니라 파생을 관리자 시점으로 모으는 것.
- **선행 2겹:** ③에서 데이터 축적(진행 중) + **⑦ 소유권**(trainer_id — 관리자가 "누구 것"을 보려면). 급여 구간%·월매출 리셋 = ④.
- **부담 경감:** 센터가 트레이너 구두 보고 대신 앱 KPI로 확인 → 트레이너 관리 시간 절약 → 시설·청결 등 센터 발전 → 회원 만족.

### 5.3 식단 사진 분석 — v3 독립 확장 (★결이 다름 · 무거움 · 코어 아님)
- **무엇:** 회원이 식단 사진 촬영 → 칼로리·영양성분 분석 + 보조식품(비타민·오메가3 등) 추천.
- **왜 별도 스프린트급:** 새 AI 파이프라인(이미지 인식 + 영양 DB) + 새 테이블 + 새 비용/정확도/책임 축.
  5.1·5.2는 "있는 데이터 시점 전환"이라 가벼운데 이건 새 생성.
- **⚠️ 의료·건기식 경계(필수):** 특정 보조제를 개인에게 추천 = 건강기능식품·의료 자문 영역. **처방 아닌 방향으로:**
  "이 영양 축이 낮게 잡히니 전문가와 상의해볼 방향"까지지 "○○ 드세요" 금지. 기존 의료가드(진단·처방 금지·전문가 우선)와 같은 결.
- **⚠️ 칼로리 정밀 숫자 함정:** 사진 분석 오차 큼(양·조리·가려진 재료). "382kcal" 정밀 숫자 = 가짜 정밀 = 사고정지
  (숫자 금지 원칙 위반). **방향 피드백**("탄수 위주·단백 부족해 보임")이 철학 정합. = 숫자 금지의 식단판.
- **위치:** v2 코어(트레이너 상향평준화) 굳힌 뒤 **v3 확장.** 지원사업엔 "확장 로드맵"으로 넣어 미래 비전 점수는 벌되
  지금 리스크는 안 짊어짐. 더 파보려면(방향 피드백 구조화·테이블 설계) 별도 세션.

---

## 6. 작업4 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main 커밋본)

- **`components/tabs/ObservationTab.jsx`** — writer 패턴(closing_* 저장·`.select()` 하드닝·기존 필드 미덮음). 재등록 writer의 원본.
- **`app/api/ot-brief/route.js`** — 브리핑 대칭(phase:"first"/"second" 구조). 여기에 phase:"reregister" 추가.
- **`components/views/PTView.jsx`** — 재등록 결과 입력 UI + "AI 지원" 소비처 얹을 곳(작업3 최신본).
- **`lib/labels.js`** — REG_REASON_OPTS 신설 위치(SOURCE_OPTS·SALES_INTENSITY_OPTS 옆).
- **`lib/memberStatus.js`** — 재등록 확정 전이 함수(toPtActive 대칭) 추가 위치 · buildContract 재사용.
- **`components/views/ContractAmountFields.jsx`** — 재등록 금액 입력 재사용(작업2 추출본).
- (참고) `components/views/SecondOTTab` 계열 — 2차 브리핑 캐시/재생성 UX 패턴(재등록 브리핑 대칭 참고).
- test-*-prompt.mjs (gitignored) — route↔harness 字-동일 거울.

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 커밋 해시와 어긋나면 알림.

---

## 7. 관통 철학 (③에서도 지킬 것 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백·⑤ 치트키도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만** (단 음성일지 요약은 예외 = 트레이너가 말한 수치 정리 자리). ⑤/재등록/식단 운동·영양 방향은 처방 금지.
- **의료 경계:** 통증·부상·영양은 전문가/병원 우선, 치료·진단·건기식 처방 단정 금지.
- **압박 아닌 공감:** 세일즈 강도 = 근거의 세기지 압박의 세기 아님.
- **거절을 데이터로:** 재등록 실패도 inactive 보관(삭제 금지) = ④ 통계 원천. + 회원판(5.1 아쉬움 설계).
- **뼈대 먼저, AI는 그 위:** session_log·계약·재등록 데이터 배선부터 깔고 AI 브리핑을 얹는다.
- **입력=사고 / 편의성:** 핵심만 입력, 나머지 자동·기본값·음성. 트레이너가 쓰기 불편하면 설계가 틀린 것.
- **★상향평준화(제품의 영혼):** 루틴 숫자 안 떠먹여줌 → 트레이너가 스스로 판단·공부. 정답 주면 사고정지·하향평준화.
  = 교육공학적 차별점(AI 의존 우려에 정면으로 답하는 서사 · 지원사업 각도).

---

## 8. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green 필수` +
  ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인. + ★"커밋 금지 — 트레이너가 git diff 원문 검토 후 직접" 한 줄.
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설 파일은 `git add -N` 후 diff(intent-to-add) 또는 `--no-index /dev/null <파일>`.
  파일로 뽑을 땐 `| Out-File -Encoding utf8`(기본 `>`·Out-File 무옵션은 UTF-16 → 한글 깨짐). **Get-Content도 `-Encoding utf8`**(PS 5.x는 기본 CP949로 읽어 깨짐 — 이번 세션 밟음).
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만. 커밋 메시지 `③`→`3`(셸 특수문자 회피).
  **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(§4 반쪽 커밋 교훈).
- **큰 작업은 작은 스텝 분할**(3-1/3-2/3-1c/3-3처럼) — 각 독립 커밋·검토 깔끔.
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **코드는 필요할 때 짚어서 청구.**
- **환경:** 터미널 = PowerShell (`C:\Users\tig00\pt-navigator`). 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영).
  `.next` stale 유령버그 주의(`Remove-Item -Recurse -Force .next`).

---

## 9. 부수 산출물 (이번 세션)

- **정부지원사업 사업개요 초안** — 트레이너가 직접 수령(파일). 심사 축(문제→해결→차별성→공공성→시장→KPI)으로 재구성 +
  정량지표·정책정합(생활체육지도사 2급 입법)·상향평준화 차별성·AI 안전윤리·확장로드맵(식단=v3) 보강.
  신청 전 채울 것: §7·§8 통계/목표 수치 확정 · 실증 협력 센터 명시(리바이 피트니스 등 = 강한 가점) · 개발 진척 스크린샷 · 예산안.

---

## 10. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff-4.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1차) · -2(2차) · -3(3차) · CLAUDE.md.
>
> ③ 진행 중 — 작업3(PTView 실채우기: 타임라인·펼치기·방향필드·홈 재등록카드) 완료, push·폰확인 OK(HEAD ab978d5).
> 다음 = **작업4 = 재등록 흐름(OT 클로징의 PT 대칭).** ③의 마지막 조각.
>
> 먼저 방향부터: 재등록 = 새 session_log 행(성공≠자동갱신·수동확정) + reg_* writer(ObservationTab 패턴) +
> 재등록 브리핑(route.js 별도 phase:"reregister") + reg_reason 카테고리(labels.js). 인계 §2 착수순서대로
> 1(writer+카테고리+입력UI) 먼저 갈지 확정하고 세부 설계 가자. 필요한 코드는 짚어서 청구해줘(§6). 작업 방식은 §8 규약.
