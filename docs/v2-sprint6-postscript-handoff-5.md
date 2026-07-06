# v2 — 스프린트6 인수인계 ⑤차 · ③ PT 관리 뷰 **완전 종료** → ④(통계) 진입

> ③ PT 관리 뷰 = **작업1~4 전부 완료 = ③ 종료.** 재등록 결과 기록 → 홈 재접근 → 진입점 → AI 브리핑까지
> 실데이터로 돈다. **다음 = ④ 클로징/매출 통계** (지금까지 쌓은 데이터를 관리자 시점으로 모으는 파생 조립).
> 역할: 트레이너=클로드 코드 코딩+다리 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너→웹Claude(검토·git diff 원문)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만.
> ★ **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(반쪽 커밋 방지 · S6에서 실제로 밟은 교훈).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차) ·
> `docs/v2-sprint6-postscript-handoff-2.md`(2차) · `docs/v2-sprint6-postscript-handoff-3.md`(3차) ·
> `docs/v2-sprint6-postscript-handoff-4.md`(4차) · `CLAUDE.md`. 코드는 ④ 착수 시 필요분만 짚어 청구(아래 §6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편) ✅
③ PT 관리 뷰       ✅ 종료 ← 이번 세션
   ├ 작업1 공통저장+차감+잔여렌더+음성PT편입   ✅ (196d720 계열)
   ├ 작업2 계약생성 3진입점                  ✅ (2b-3 계열)
   ├ 작업3 PTView 실채우기                  ✅ (타임라인·펼치기·방향필드·홈카드, ab978d5)
   └ 작업4 재등록 흐름(OT 클로징의 PT 대칭)   ✅ ← 이번 세션 종료
       ├ 4-1  재등록 결과 writer + 카테고리 + 입력 UI   ✅ 1aa04f7
       ├ 4-1c 재등록 재접근 홈 리더                    ✅ fe2bc14
       ├ 4-3  재등록 진입점(잔여 무관 버튼 + FIFO 대기)  ✅ 8aeb091
       ├ 4-2a 재등록 브리핑 route(phase:"reregister")   ✅ 4084485
       ├ 4-2b 거울 harness(톤 눈검사 · gitignored)      ✅ (커밋 없음)
       └ 4-2c PTView AI 지원 + reg_brief 캐시           ✅ 7d354ea
──────────────────────────────
④ 클로징/매출 통계  ⏳ ← 다음
⑤ 치트키 운동 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳
```

**커밋 체인(origin/main · push 완료 · 폰 확인 완료):**
`ab978d5`(작업3-3) → `1aa04f7`(4-1) → `fe2bc14`(4-1c) → `8aeb091`(4-3) → `4084485`(4-2a) → `7d354ea`(4-2c).
원격 HEAD = `7d354ea`. 작업트리 clean(harness `test-reregister-prompt.mjs`는 gitignored로 untracked).

> ⚠️ **SQL 없음**: 작업4 전체에서 새 마이그레이션 0. reg_result/reg_reason/reg_reapproach_at/report는
> session_log 스키마(schema §7)에 이미 있었고, 정책 `"session_log anon all"`이 UPDATE까지 커버.

---

## 1. 작업4에서 완료·확정된 것 (재등록 흐름 = OT 클로징의 PT 대칭)

### 4-1 — 재등록 결과 writer + 카테고리 + 입력 UI (1aa04f7)
- **reg_* 대상 = `latestContract`(started_at 최신, 잔여 무관)** — `activeContract`(FIFO 잔여>0)와 다른 신규 순수함수.
  전소진 회원도 재등록 대화 대상이라 잔여로 게이트 안 함. "이 계약이 갱신됐나"의 기록 위치.
- **writer = ObservationTab closing_* 패턴 복제**: PTView `saveReg`가 최신 계약 행에 reg_* UPDATE + `.select()` 하드닝.
  `report`·타 컬럼 미포함 = reg_brief 공존 보존. payload 조건부(이유=hold/fail, 재접근일=hold — reader가 result로 게이트해 stale 무해).
- **labels.js += `REG_RESULT_OPTS`**(none/success/hold/fail 영문·교훈4) **+ `REG_REASON_OPTS`**(안정 키+한글).
  seed: money/time/schedule/sessions_left/low_effect/personal/etc. **못 박지 않음 — 실데이터로 확정.**
- **입력 UI** = 재등록 결과 섹션(`<details>` 접힘) · 잔여 카드 "재등록 타이밍" 배지가 신호.
- ★교훈1 값 실증: session_log 첫 reg write raw 앱 경로로 실제 찍힘(폰 하드리프레시 후 유지 확인).
- **stale 타겟 fix**: reg 폼 시드를 `[latest?.id]` 효과로 이동 — 새 계약 추가로 latest 바뀌면 재시드,
  saveReg 낙관적 patch(같은 id)엔 안 튐. (새 계약 append 시 옛 계약 값 든 채 새 계약 타겟하던 버그 방지.)

### 4-1c — 재등록 재접근 홈 리더 (fe2bc14)
- **`ReapproachToday`(OT)의 재등록판 · 형제 신설**(`RegisterReapproachToday.jsx`) — 원본 `reapproachToday` 무변경(회귀 최소).
- **`reregisterReapproachToday(rows, today)`** 순수함수 신설: 회원별 그룹핑 → `latestContract` → `reg_result='hold'` + `reg_reapproach_at<=today` 필터.
  ⚠️ **최신 계약만 봄** — 옛 계약의 지난 보류(이미 재등록=새 계약이 최신)가 잘못 뜨는 것 방지(session_log 다계약 함정 · ot_log엔 없던 것).
- 카드 = emerald 톤, PT id만 `.in()`(inactive 제외), reg 필터 없이 계약 전부 당겨 최신 판정 위임. `onSelect` → PTView 착지.
- **재등록으로 새 계약 생기면 자동 해소**: 새 계약이 최신이 되고 reg_result=null(hold 아님) → 리더에서 자동으로 빠짐.

### 4-3 — 재등록 진입점 (8aeb091)
- **[재등록] 버튼 = 잔여 유무 무관 상시 노출**(잔여 카드 active 브랜치). "금전 여유 생겨 즉석 재등록" = 흔한 현장이 막혀 있던 마찰 해소.
- **기존 계약 등록 모달 100% 재사용**(`ContractAmountFields`·`saveContract`·`buildContract`) → 새 session_log 행 append. 로직 변경 0.
- **성공 기록에 게이트 안 걸음** — reg_result 없이도 눌림(즉석 재등록). "성공≠자동갱신"은 "성공이 자동 계약 X"지 "계약하려면 성공 먼저 X"가 아님.
- **FIFO 대기 가시화**: "다음 계약 N회 대기" 표시 + 토스트("기존 잔여 소진 후 적용"). 미리 재등록 시 잔여 숫자가 안 늘어 "안 됐나?" 오해하는 걸 닫음.
- 모달 제목/버튼/토스트는 `isReReg`(=!!active)로 "재등록"/"계약 등록" 분기(로직 동일).

### 4-2a — 재등록 브리핑 route (4084485)
- **`phase:"reregister"`** 추가 = OT 브리핑(first/second)의 재등록판. 모델=Sonnet(`MODEL_SECOND`)·maxTokens 5120(non-first 삼항 커버)·thinking disabled(`phase!=="first"`로 확장).
- **`reregisterPrompt(member, ctx)`** — ⚠️ **origin 독립**: ot_log 무의존(인계·외부 PT는 관찰 없음). 재료 = PT 관리 데이터
  (`member.pt_direction` + 잔여 + 최근 수업 요약 + 계약 회차).
- 출력 스키마 = `{data_gaps, briefing(proven_in_pt/risk_if_stop/next_roadmap/closing_logic), arc, objections(이유별·reason 영문키 유지), closing(4단계)}`.
  second의 closing 3분기·stimulus_response는 없음(재등록에 무의미) → objections를 reg_reason 카테고리별로 미리 생성.
- PREAMBLE·파싱·sanitizer 재사용. sanitizer FIELD_TERMS에 reg 키 없음 → `reason:"money"` 등 안전.
- 철학 가드 상속 + 프롬프트에 명시: 압박·공포 금지 · 숫자 처방 금지 · low_effect는 방어 아닌 정직한 방향 · 없는 성과 저작 금지.

### 4-2b — 거울 harness (커밋 없음 · gitignored)
- `scripts/test-reregister-prompt.mjs` = route.js phase:"reregister"의 字-동일 미러(PREAMBLE·reregisterPrompt·파싱·sanitizer 복사) + 재등록 SAMPLE + 톤 안전핀 스캔.
- **실키 1회 눈검사 통과**(Sonnet, out≈3014/5120 여유, ~39초): 압박/공포 누출 없음 · 숫자 처방 없음 · reason 영문키 유지 · proven_in_pt 저작 없음(입력 기록만) · low_effect 정직 · paint 비유 회원 세계(좌식/사무직).
- ⚠️ **route↔harness 字-동일 규율**: 이후 reregisterPrompt 고치면 이 harness도 같이(단일 소재지 아님 = 알려진 부채).

### 4-2c — PTView AI 지원 + reg_brief 캐시 (7d354ea)
- **PTView 첫 AI 배선**. `generateReReg` = SecondOTTab `generateBrief` 미러: `/api/ot-brief` POST `{phase:"reregister", member, ptContext}` → 렌더 + 캐시.
- **ptContext 조립**(PTView 보유 데이터): `remaining`(rem) · `recent_logs`(타임라인 non-voided 요약 최근 5) · `contract_count`.
- **캐시 = `latest.report.reg_brief`**(session_log UPDATE · 공존 보존 `...(latest.report||{})` · `.select()` 하드닝). 재방문 재호출 0. 재생성 버튼. **스테일 해시 없음**(재등록은 관찰 스냅샷 없어 근거 약함 → ⑥ 파킹).
- **표시 분리**: `RegBriefView.jsx`(순수) 신설 — briefing/arc/objections/closing/data_gaps 렌더. **기록된 reg_reason을 `highlightReason`으로 강조**(daily 무기).
- 폴백: 키없음(503)/실패 → amber 에러, 앱 안 죽음. 캐시는 supabase·latest 있을 때만.

---

## 2. ★ 다음 국면 = ④ 클로징/매출 통계 (파생 조립 · 새 발명 아님)

**핵심 관점:** ④는 "새로 만드는 것"이 아니라 **③까지 쌓은 raw를 관리자 시점으로 모으는 파생**이다(schema §8 못박음).
재료가 이미 다 쌓이는 중이라 위험이 낮다. 단 **선행 2겹**이 있다.

### 재료 지도 (전부 이미 쌓임)
```
OT 클로징:  ot_log.closing_result / closing_approach (round 1·2)      → 클로징률 · 방향별 강점
재등록:     session_log.reg_result / reg_reason                       → 재등록률 · 실패사유 분포
매출:       session_log.amount_total · counts_as_revenue · started_at → 월 매출(월필터+게이트+리셋)
급여:       session_log.price_per_session + 매출구간%(센터 설정)        → 회당 수업료
수업량:     daily_workout_log count (voided 제외)                     → 총 수업수
대상자:     reapproachToday · reregisterReapproachToday · reregisterDue → 오늘의 재접근/재등록 대상
회원속성:   user_table age/job/mbti + closing_approach               → 나이·직업·방향별 강점 분석
```

### ④ 소관 vs 다운스트림 (오버빌드 방지 · schema §8)
- **④가 하는 것:** 월필터·합산·구간% 적용·이유별 분포·클로징률/재등록률·강점 분석. 관리자 대시보드 조립.
- **선행 2겹:**
  1. **데이터 축적** — ③ 완료로 시작됨(실회원 투입 후 쌓임).
  2. **⑦ 소유권**(`trainer_id`) — 관리자가 "누구 것"을 보려면 필요. **단일 트레이너 가정이면 로그인 전 우회 가능**(trainer_id 없이 전체 = 본인). 자리는 이미 선반영됨(값은 ⑦).
- **급여 구간% = 센터별 {매출구간% | 고정수업료} 분기 = ④ 관리자 설정.** session_log는 raw만(price_per_session). 지금 자리도 안 만듦.
- **counts_as_revenue 수정 소급 파장**(월초 리셋·구간% 소급) = ④에서 "월 확정 스냅샷 vs 실시간 재계산" 결정.

### 관리자 대시보드 = 트레이너 아이디어(handoff-4 §5.2)와 동일
- KPI + 금일 센터 총 재등록 예정자 + 금일 트레이너별 OT 대상자 → 관리자 피드백.
- 재료(reapproachToday·reregisterReapproachToday·reregisterDue·closing/reg 통계) 다 쌓이는 중. 파생을 관리자 시점으로 모으는 것.
- **⑤ 치트키(급한불 탭)는 ③ PTView와 함께 얹는 대칭**이었으나 미착수 — ④와 순서 트레이너 판단(로드맵상 ⑤는 ③에 얹힘, 지금 별도).

---

## 3. 관통 상수 (트레이너 daily — 지켜야 성립)

- 50분 수업 / 10분 휴식 → **10분 안에 확인·넘어가기.** 로딩·런타임 길면 daily 실격.
- 잔여·타이밍·오늘의 대상자 = **전부 파생**(저장·수동감산 0). 활성계약 자동연결(FIFO).
- 재등록 = 등록폼 재사용(학습비용 0). 홈카드·nextAction·뷰분리 등 ②가 깐 편의에 얹힘.
- AI = **캐시로 재방문 즉시** · 첫 생성만 대기 · 실패해도 입력·앱 보존.
- **트레이너가 쓰기 불편하면 설계가 틀린 것.**

---

## 4. 살아있는 부채·주의 (④ 착수 전/중 밟을 것)

- **★ 테스트 데이터 청소 (Supabase 대시보드 수동 · DELETE 정책 없음) — 실회원/통계 산출 전 필수:**
  - `session_log`: 작업2 테스트 계약(2a 확정 24·30 · 인계/외부 이월 · PTView 계약등록 · 황대수) + **작업4 테스트 계약**(4-3 즉석 재등록 테스트행 · 4-1c 검증용 수동 추가행) + reg_* 테스트값 · report.reg_brief 테스트 캐시.
  - `daily_workout_log`: 1b·PTView·3-x·4-2c 테스트 수업로그.
  - `user_table`: **황대수 status 원복** + S5 테스트 회원 + **옛 한글 '성공' 행**(영문 필터 누락 = 교훈4 재발) + S6 테스트 round-2.
  - ⚠️ 통계(④)는 이 쓰레기행을 그대로 집계하므로 **④ 산출 전 청소가 특히 중요**(가짜 숫자 오염).
- **보안 ⑦ 이월:** session_log·daily_workout_log·user_table anon 정책(reg writer·reg_brief 캐시도 anon UPDATE 사용) + counts_as_revenue 수정 권한 미강제 + 기존 anon 전면 개방 → ⑦ 일괄 잠금. 신규 write엔 anon 정책 + `.select()` 0행 하드닝 계속.
- **route↔harness 字-동일:** first/second/**reregister** 프롬프트 고칠 때 test-*-prompt.mjs 거울도 같이. gitignored.
- **재등록 브리핑 스테일 감지 없음:** pt_direction·수업기록 바뀌어도 캐시 안 갱신(수동 재생성만). 관찰 스냅샷 없어 obsHash 근거 약함 → ⑥ 또는 "입력 해시" 방식 검토.
- **reg_reason 카테고리 실데이터 확정:** 현재 seed 7개. 실사용 분포 보며 ④ 집계 전 확정(자유서술 금지 유지).
- **ot_log 스냅샷 재료 미사용:** 재등록 브리핑이 origin 독립 위해 ot_log 안 씀. ot_funnel 회원은 과거 관찰이 참고될 수 있으나 백로그(PTView가 ot_log 로드 안 함 = 추가 fetch 필요).
- **작업3-1b(voided 무르기·session_at 수정 UI):** daily_workout_log anon UPDATE 정책 선행. 파킹(급한 마찰 아님) → 필요 시 or ⑥.
- **① 캐시/배너 lift(C2):** 이월 유지. ⑥/필요 시.

---

## 5. ⑦ 이후 백로그 — 트레이너 신규 아이디어 (handoff-4 §5에서 유지)

> ⑦ 로그인/RLS가 서면 관리자/트레이너/회원 3역할 분기. 아래 셋 다 ⑦ 선행.

- **5.1 회원용 앱 "재등록 아쉬움" 설계**(가벼움·가성비 최고): 회원 로그인 시 본인 운동일지+계획(+식단) 열람 → 재등록 안 하면 아쉬움 남게. 이미 쌓은 `daily_workout_log`·`pt_direction`을 회원 시점으로 읽는 뷰라 대부분 공짜. MASTERPLAN ⭐ "거절을 데이터로"의 회원판.
- **5.2 관리자 대시보드 = 로드맵 ④**(위 §2와 동일): KPI + 금일 재등록 예정자 + 트레이너별 OT 대상. 선행 = ③ 축적 + ⑦ 소유권.
- **5.3 식단 사진 분석 = v3 독립 확장**(무거움·코어 아님): 이미지 인식+영양DB+새 테이블. ⚠️ 의료·건기식 경계(처방 아닌 방향) · 칼로리 정밀숫자 함정(방향 피드백=숫자금지의 식단판). v2 코어 굳힌 뒤 v3. 지원사업엔 "확장 로드맵"으로.
- **[미래]** 스케줄표(session_log `scheduled_at` 자리 이미 비워둠) · 트레이너 프로필 세일즈 개인화(선행 ⑦) · 센터 가격표 테이블(⑦ 언저리) · 카톡 알림톡 자동발송(⑦ 후·비즈채널·개인카톡 자동전송 불가라 복사방식 유지) · ⑤ 급한불/치트키(stimulus_response 대칭·의료가드).

---

## 6. ④ 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main 커밋본)

- **`app/admin/page.jsx`** — 관리자 대시보드(현재 KPI/QC 전부 데모 하드코딩). ④가 실데이터로 교체할 본체.
- **`lib/memberStatus.js`** — 파생 함수 소비처(remainingSessions·reregisterDue·reapproachToday·reregisterReapproachToday·isClosingStatSubject). ④ 통계 파생 추가 위치.
- **`lib/labels.js`** — CLOSING_APPROACH_OPTS·GOAL_TYPE_OPTS·REG_REASON_OPTS(집계 라벨). 강점/분포 분석 축.
- (참고) `components/tabs/ObservationTab.jsx`·`SecondOTTab.jsx`(closing_* 저장 위치) · `components/views/PTView.jsx`(reg_* 저장 위치) — 집계 원천 컬럼 확인용.
- (참고) session_log·ot_log·daily_workout_log 스키마 = `docs/v2-sprint6-session-log-schema.md` §7.

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 커밋 해시(`7d354ea`)와 어긋나면 알림.

---

## 7. 관통 철학 (④에서도 지킬 것 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백·⑤ 치트키·통계 인사이트도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만** (음성일지 요약은 예외 = 트레이너 발화 수치 정리). 통계의 "정밀 %"도 과신 금지 — 구간·방향 우선(sprint5 §클로징 확률 재논의 미결).
- **의료 경계:** 통증·부상·영양은 전문가/병원 우선, 치료·진단·건기식 처방 단정 금지.
- **압박 아닌 공감:** 세일즈 강도 = 근거의 세기지 압박의 세기 아님(4-2b 톤 검증으로 재확인됨).
- **거절을 데이터로:** 재등록 실패도 inactive 보관(삭제 금지) = ④ 통계 원천. + 회원판(5.1).
- **뼈대 먼저, AI는 그 위:** ④도 raw(이미 쌓임) 위에 집계·인사이트를 얹는다. %하드코딩=가짜 회귀 금지.
- **★상향평준화(제품의 영혼):** 통계도 "정답 하달"이 아니라 "트레이너가 자기 강점/약점을 보고 스스로 교정"하게. 관찰·판단은 트레이너 몫.

---

## 8. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green 필수` +
  ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인. + ★"커밋 금지 — 트레이너가 git diff 원문 검토 후 직접" 한 줄.
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설 파일은 `git add -N` 후 diff 또는 `--no-index /dev/null <파일>`.
  PowerShell 파일 덤프는 `| Out-File -Encoding utf8`, 읽기는 `Get-Content -Encoding utf8`(기본 CP949/UTF-16 → 한글 깨짐).
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만. 커밋 메시지 `③`→`3`(셸 특수문자 회피).
  **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(반쪽 커밋 교훈).
- **큰 작업은 작은 스텝 분할**(4-1/4-1c/4-3/4-2a/4-2b/4-2c처럼) — 각 독립 커밋·검토 깔끔.
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **코드는 필요할 때 짚어서 청구**(처음에 다 안 붙임).
- **환경:** 터미널 = PowerShell (`C:\Users\tig00\pt-navigator`). 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영).
  `.next` stale 유령버그 주의(`Remove-Item -Recurse -Force .next`). 배포 Ready는 Vercel 대시보드 수동 확인(토큰 상시 부여 금지).

---

## 9. 부수 산출물 (S6 누적 · handoff-4에서 이월)

- **정부지원사업 사업개요 초안** — 트레이너 수령분. 신청 전 채울 것: 통계/목표 수치 확정(④ 산출과 맞물림) · 실증 협력 센터 명시(리바이 피트니스 등 = 가점) · 개발 진척 스크린샷 · 예산안. 차별성 서사 = 상향평준화(AI 의존 우려에 정면 답)·AI 안전윤리(4-2b 톤 검증이 근거)·확장로드맵(식단=v3).

---

## 10. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff-5.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1차) · -2(2차) · -3(3차) · -4(4차) · CLAUDE.md.
>
> ③ PT 관리 뷰 **완전 종료**(작업1~4, HEAD 7d354ea) — 재등록 결과 기록·홈 재접근·진입점·AI 브리핑까지 실데이터.
> 다음 = **④ 클로징/매출 통계.** 지금까지 쌓은 reg_result·reg_reason·closing_*·counts_as_revenue·amount_total을
> 관리자 시점으로 모으는 파생 조립(새 발명 아님).
>
> 먼저 방향부터: ④ 착수 전에 (a) 테스트 데이터 청소(§4 — 통계 오염 방지) 먼저 할지, (b) 단일 트레이너 가정으로
> ⑦ 로그인 전 우회로 ④ 대시보드부터 갈지 vs (c) 급여 구간% 등 관리자 설정 범위 확정부터 갈지 정하고 세부 설계 가자.
> 필요한 코드는 짚어서 청구해줘(§6). 작업 방식은 §8 규약대로.
