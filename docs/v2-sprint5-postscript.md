# v2 스프린트5 — 종료 후기 · 세션 인수인계 (② 완전 종료)

> 스프린트5(② OT/PT 뷰 분리 = member_status) **Step 1~7 전부 완료 = ② 종료** 시점의 인수인계.
> 상위 설계 docs/MASTERPLAN.md, 로드맵 docs/v2-roadmap-next.md(② 완료 반영됨), 스프린트5 착수 스펙
> docs/v2-sprint5-member-status.md, 직전 인수인계 docs/v2-sprint4-postscript.md.
> 다음 세션은 이 문서 + 위 넷 + CLAUDE.md를 읽고 **현장 사용성 패스 → ③(PT 관리 뷰)**로 간다.
> (이 문서는 이전 "Step 1~6 완료" 판을 대체하는 최종본이다.)

## 종료 상태
- 착수 스펙 §8 기준 **Step 1~7 전부 완료. ② 완전 종료.** 상태모델·뷰 분리·등록·전이·캐시 + 홈 "오늘 재접근"까지.
- roadmap-next.md 상단에 "② = v2-S5 완료" 갱신 반영됨.
- 커밋 체인(origin/main 반영·작업트리 clean):
  8c97a1e(스펙) → 1124af3(step1 컬럼) → ea74f63(§5 하이브리드) → a8bdde6(step2 모듈) → 521ac98(§9 스케줄표)
  → 10bd551(step3·4 뷰스위치+등록 origin) → 1700c81(§3 마이그레이션 완료) → fa97e66(1차 클로징 위치 기록)
  → fe12039(step5 PT확정+UPDATE 하드닝) → 65bbbd3(step6 ① 캐시) → d93aed3(step7-a reader 영문정렬)
  → 4692cb0(step7-b Scope2 잠복버그) → 9252b84(step7-c writer) → f214765(step7-d reader 홈카드)
  → 8975712(roadmap ② 완료).
- ⚠️ 프로덕션 배포·회귀는 별도 확인(이번 세션은 push까지). 실기기 점검 = 아래 "현장 사용성 패스".

## Step별 종료 요약 (무엇을 닫았나)
- **S1 컬럼:** user_table += status/origin/status_changed_at/status_note, ot_log += closing_reapproach_at.
  DEMO_MEMBER·mapMemberRow 기본값(`?? 'ot_active'`/`?? 'ot_funnel'`)으로 미반영/구행/데모 전부 안전.
  ⚠️ user_table anon UPDATE 정책 신설(§3 조용한 실패 방지). ⑦에서 잠글 부채.
- **S2 lib/memberStatus.js (순수):** viewFor / nextAction / isClosingStatSubject(origin==='ot_funnel') /
  initialStatus / reapproachToday + 전이 toPtActive·toInactive. 전이는 "필드 패치"만 반환(호출부가 update+가드).
  supabase·react import 0. 나중 테스트의 유일 지점.
- **S3 MemberViewShell:** 분기는 viewFor(member)만(status 직접 비교 금지). ot→기존 6탭 감쌈(회귀 최소),
  pt→PTView(빈 껍데기), inactive→간단 뷰. view!=='ot'이면 탭 네비 숨김(§7 경량화).
- **S4 등록 origin:** MemberForm에 origin 3값(ot_funnel/handover/external). status는 initialStatus(origin)로 파생.
  §1.5 진입 문 두 개(handover/external=PT 직행) 실동작 검증.
- **S5 PT 등록 확정(toPtActive):** PtConfirmBanner — status==='ot_active' && (round1|round2 closing='success')일 때만.
  both-round(1차 즉등록 포함). .update().select()→data.length===0 실패 처리(§3 하드닝). **anon UPDATE 정책 end-to-end 실증.**
- **S6 ① 캐시(report.first_assist):** FirstOTAssist(haiku) 출력을 round-1 report에 캐시. **report jsonb 양방향 공존**
  (raw 확인). 스테일=firstInputHash 불일치 배지. **round-1 행 없을 때=Option B(세션 전용)** — ①만 담긴 행 INSERT 금지
  (SecondOTTab이 "관찰 있음" 오인 회피).
- **S7 재접근 (writer+reader):**
  - **writer:** closing_result='hold' 저장 경로에 closing_reapproach_at(date) top-level 추가. 1차=ObservationTab(round-1)
    / 2차=SecondOTTab(round-2). 입력 UI = ReapproachDateField(B안: 2주/1개월/3개월 프리셋 + 수동, 월말 클램프 보정).
    .select() 하드닝, 기존 closing_*·report 미덮음(raw 확인). reapproachPreset 순수(todayISO 주입).
  - **reader:** ReapproachToday 카드 — roster(회원 탭) 최상단. both round의 hold+도래분(오늘 이하, 미도래·null 제외)을
    reapproachToday로 판정, 회원명·예정일·경과·round 표시, 클릭→해당 회원(1차 OT 탭). 데모(!supabase)=미표시.

## ★ 이번 세션 핵심 교훈 (4개)
1. **잠복 마이그레이션은 첫 "쓰기"에서 터진다.** S1 컬럼 SQL이 이 DB엔 미반영이었는데 읽기(`?? 기본값`)가 가려서
   안 보이다가 **S4 INSERT(첫 쓰기)에서 표출**. 합본 멱등 SQL로 흡수. 교훈: 실제 쓰기 경로가 생기는 단계까지 가야
   마이그레이션이 진짜 검증됨. SQL 에디터 성공 ≠ 반영 확인.
2. **SQL 에디터는 RLS 우회 → UPDATE 정책 검증의 거짓양성.** anon 키 경로 .select()→data.length>0가 유일한 실증(S5).
3. **report jsonb 공존은 양방향 다 확인.** 같은 jsonb를 관찰·캐시가 나눠 쓰면 한쪽이 통째 교체 시 상대 데이터 조용히 증발.
4. **★값 컨벤션(한글 vs 영문)까지 raw로 봐야 한다 — S7이 잡은 Step5 잠복버그.** Step5의 PtConfirmBanner·nextAction이
   한글 `"성공"`/`"보류"`를 검사했는데 **실제 저장값은 영문 `"success"`/`"hold"`**였음 → **Step5 배너가 실데이터에선
   한 번도 안 떴음**(테스트 데이터가 한글이라 통과한 거짓양성). §1 성공≠PT 게이트의 UI가 프로덕션에서 구멍이었던 것.
   S7 writer 붙이며 reader 값 정렬하다 발견, step7-b(4692cb0)로 수정. 교훈: raw 검증 시 **값 자체가 실제 앱 컨벤션과
   같은지**까지 볼 것(status 있는지만 보지 말고).

## 주의 · 부채
- **테스트 흔적 정리(대시보드 수동, DELETE 정책 없음):** ot_log의 S6테스트 round-1(hold)·김철수 round-2(hold, 검증용
  07-01로 당겨둠)·S5테스트-신규 round-2(옛 한글 '성공'). user_table의 S5테스트-인계/-외부/-신규/-1차즉등록·S6테스트(pt_active).
  ⚠️ **옛 한글 '성공' 행은 꼭 지울 것** — 영문 필터에 안 걸려 나중 reader/통계에서 또 조용히 누락(교훈4 재발). 김철수 회원은
  데모면 round-2만 지우고 회원 유지. 현장 투입 전 필수 청소.
- **정책 부채 ⑦ 이월:** user_table anon UPDATE + 기존 anon 전면 개방 → ⑦에서 일괄 잠금. DELETE 정책은 일부러 안 엶.
- **프롬프트 만질 때 route↔harness 字-동일**(S4 postscript). test-first-prompt.mjs는 gitignored 거울.
- **status_note**는 컬럼·toInactive writer는 있으나 이탈 처리 UI는 아직 없음(전이 액션은 확정=toPtActive만). 이탈 UI 붙일 때 착지.

## 다음 국면(③④) 백로그 — 이번 세션 트레이너 아이디어
> ③(PT 관리 뷰)·④(클로징 통계) 들어갈 때 검토. 전부 로드맵에 앉고 새로 뒤엎을 것 없음.

### ★ 재등록 흐름 = OT 클로징 흐름의 PT 대칭 (③ 본체 + ④ 집계) — 이번 세션 집중 논의
- **핵심 관점:** 재등록은 새 개념이 아니라 **우리가 OT에서 만든 closing 흐름의 PT 재등록판(대칭 복제)**. 설계 위험 낮음(검증된 패턴).
- **③ PTView 입력·가이드:**
  - 재등록 성공/실패/보류 = OT closing_result의 재등록판.
  - **실패 이유**(금전여유 없음 / 수업 남아 나중에 / 기타…) = closing_approach의 재등록판. ⚠️ **정해진 카테고리로 입력**해야
    ④에서 이유별 분포 집계 가능(자유서술이면 집계 불가). 카테고리 목록은 ③ 설계 때 **실데이터 보며 확정**(지금 미리 확정 X —
    OT approach도 현장에서 다듬음).
  - **이유별 피드백** = OT 브리핑의 재등록판. 예: "수업 남아 밀림 → 앞으로의 구체 로드맵 제시로 지금 재등록할 근거 제공",
    "금전 부담 → 부담 낮은 커리큘럼 방향". ⚠️ **근거+방향까지만, 설득 대본 금지**(OT와 동일 철학 — "○○님 지금 안 하시면…"
    같은 압박 스크립트 X, 사고정지·하향평준화 방지).
  - **다음 트라이 시점** = closing_reapproach_at의 재등록판(이미 만든 writer 패턴 재사용).
- **④ + 관리자 집계:** 관리자가 **재등록률 + 실패사유 분포**를 정리해 열람. OT 클로징률·approach 분포에 재등록률·실패사유를
  대칭으로 얹음(④의 재등록판). ⚠️ 선행 2겹 — ③에서 데이터 축적(먼저) + **⑦ 소유권**(관리자가 "누구 것"을 보려면 trainer_id).
  → 순서: ③ → 데이터 쌓임 → ④ 집계 → ⑦ 관리자 열람. 입력 단계부터 카테고리화해둬야 나중 집계가 공짜(미리 알고 설계).
- **선행:** 재등록 "시점"은 잔여 세션·만기일(**session_log**)이 있어야 산출 → ③ 본격에서. 없이 하면 하드코딩 가짜(위반).

### 기타 ③④ 아이디어
- **음성일지 타이핑 입력:** STT 부정확 대비 텍스트 폴백. daily_workout_log 입력 경로 추가, 모델 무변경. **가벼움·아무 때나**(② 후 ③ 전도 가능).
- **재등록 트라이 회차 픽스 → 관리자 열람:** 트레이너가 "이 회차에 재등록 트라이" 찍음(③) + 관리자가 "오늘 재등록 트라이하는 트레이너" 봄(④).
  ⚠️ 관리자 열람 = ⑦(trainer_id) 의존. (위 재등록 집계와 한 묶음.)
- **★클로징 확률 예측 — 재논의 필요(트레이너와):** 관찰일지 입력 시 2차 성공 확률 표시 아이디어. ⚠️ **정밀 %(80% 등) 지양** —
  숫자=레시피=사고정지 / ④ 축적 전엔 근거 없는 환각 / 자기실현·기록 왜곡(예측 보고 관찰 조정→④ 오염). **권장: 구간(높음/중간/낮음)
  + "왜·뭘 하면 올라가나".** 방향 분석은 2차 브리핑 강화로 지금도 가능, 정량 %는 ④ 이후 + 구간·방향 우선. **③④ 세션에서 반드시 재논의.**

### ★ 프롬프트 페르소나 실험 (⑥/실사용 튜닝)
- "성실하고 본질을 지키는 트레이너" 페르소나 부여 아이디어. ⚠️ **매출 숫자("월 1000만원")는 빼라**(세일즈 압박 편향→푸시 세일즈봇화).
  ⚠️ 페르소나는 톤을 바꾸지 디테일을 못 만듦(디테일은 출력 구조 지시에서). ⚠️ haiku는 확률적으로 지시 어김(S4 교훈)→모델별 효과 차.
  **harness A/B 실측**(있음/없음, 디테일↑·세일즈 편향·톤 유지) 후 판단. 실험 설계는 그때 같이.

## ② 종료 후 = 현장 사용성 패스 (③ 가기 전 — 최우선)
- **코드 진도 멈추고**, 트레이너 본인이 **실기기(폰)에서 실제 회원 한 명 전체 흐름**(등록 → 1차 → 관찰 → 2차 → 확정,
  그리고 보류→재접근→홈 카드)을 시뮬레이션으로 끝까지 써본다. 개발용 강제 주입 말고 진짜 수업 흐름.
- 뽑을 것 = **"매일 못 쓰겠는 치명적 마찰"만**(버튼 위치, 글씨 크기, 입력 마찰, 수업 중 못 쓰는 지점). 사소한 카피·순서는 ⑥으로.
- 이유: 지금까지 검증은 전부 "기능이 도는가"(build·end-to-end)였고 **"엄지로 편한가"는 실측 0**. daily 앱 판정은 트레이너 손에서만.
- 여기서 나온 치명 마찰은 ③ 전에 먼저 처리. (홈 카드 위치 격상·회원 dedup 등 S7에서 열어둔 판단도 여기서 실사용 보고 결정.)

## §9 기존 백로그(스펙 문서) — 요약
- **[미래] 스케줄표(PT/OT 일정):** ③(session_log) 뒤 · ⑦ 언저리. session_log에 예정 일시 필드 자리 미리.
- **[미래] 화이트라벨(회사별 브랜딩):** 단순 교체는 토큰/brand 설정(아무때나), 테넌트별은 ⑦ 이후. 브랜드 요소 한 곳에서 읽기.
- (스케줄표·화이트라벨·재등록 트라이/집계 관리자 열람·클로징 확률 모두 ⑦의 로그인·trainer_id·소유권으로 수렴 —
  ⑦ 설계 시 이 백로그들이 "⑦이 뭘 받쳐야 하나" 체크리스트.)

## 다음 = 현장 사용성 패스 → ③
착수 순서:
1. **테스트행 정리**(대시보드 수동, 위 "주의·부채" 목록 — 특히 옛 한글 '성공' 행).
2. **현장 사용성 패스**(위 섹션, 최우선) — 실기기 전체 흐름, 치명 마찰만.
3. **③ 진입** — PTView 실채우기(daily_workout_log 타임라인 + 현재 방향 필드, origin 독립 · §5 하이브리드).
   `session_log`(잔여 세션·만기일) 신설 → 재등록 흐름(위 ★, OT 클로징의 PT 대칭) 구현 시작. ③④ 백로그 검토
   (특히 ★클로징 확률 재논의). ⑤ 치트키는 ③ 뷰와 함께 대칭.
