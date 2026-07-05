# v2 스프린트5 — 종료 후기 · 세션 인수인계

> 스프린트5(② OT/PT 뷰 분리 = member_status) **기능 축(Step 1~6) 완료** 시점의 인수인계.
> 상위 설계 docs/MASTERPLAN.md, 로드맵 docs/v2-roadmap-next.md ②, 스프린트5 착수 스펙
> docs/v2-sprint5-member-status.md, 직전 인수인계 docs/v2-sprint4-postscript.md.
> 다음 세션은 이 문서 + 위 넷을 읽고 **Step 7(홈 "오늘 재접근")부터** 시작한다.
> ⚠️ Step 7엔 선행이 있다(§"Step 7 선행"). 그다음 ② 종료 → 현장 사용성 패스 → ③.

## 종료 상태
- 착수 스펙 §8 기준 **Step 1~6 완료**. ②의 기능 축(상태모델·뷰 분리·등록·전이·캐시) 완성.
  남은 건 Step 7(홈 "오늘 재접근") 하나 + 그 선행.
- 커밋 체인(origin/main 반영·동기화 확인):
  8c97a1e(스펙) → 1124af3(step1 컬럼 기본값) → ea74f63(§5 하이브리드) → a8bdde6(step2 memberStatus 모듈)
  → 521ac98(§9 스케줄표 백로그) → 10bd551(step3·4 뷰스위치+등록 origin) → 1700c81(§3 마이그레이션 완료)
  → fa97e66(1차 클로징 위치·writer부재 기록) → fe12039(step5 PT확정+UPDATE 하드닝) → 65bbbd3(step6 ① 캐시).
- 프로덕션 배포는 별도 확인 필요(이번 세션은 origin/main push까지). ①·② 회귀 없는지 실기기 점검은 아래 "현장 사용성 패스".

## Step별 종료 요약 (무엇을 닫았나)
- **S1 컬럼·기본값:** user_table += status/origin/status_changed_at/status_note, ot_log += closing_reapproach_at.
  DEMO_MEMBER·mapMemberRow 기본값(`?? 'ot_active'`/`?? 'ot_funnel'`)으로 미반영/구행/데모 전부 안전.
  ⚠️ **user_table anon UPDATE 정책 신설**(없으면 §3 조용한 실패). 이 개방은 ⑦에서 잠글 부채.
- **S2 lib/memberStatus.js (순수 모듈):** viewFor / nextAction / isClosingStatSubject(origin==='ot_funnel')
  / initialStatus / reapproachToday + 전이 toPtActive·toInactive. **전이는 "필드 패치"만 반환**,
  supabase·react import 0(호출부가 update+가드). 나중 테스트의 유일 지점.
- **S3 MemberViewShell:** 분기는 viewFor(member)만(status 직접 비교 금지). ot→기존 6탭 그대로 감쌈(회귀 최소),
  pt→PTView(§5 의도 빈 껍데기), inactive→간단 뷰. view!=='ot'이면 탭 네비 숨김(§7 화면 경량화).
- **S4 등록 origin:** MemberForm에 origin 드롭다운 3값(ot_funnel/handover/external). status는 손 안 고르고
  initialStatus(origin)로 파생. INSERT에 origin+status 둘 다 명시. **§1.5 진입 문 두 개**(handover/external=PT 직행) 실동작.
- **S5 PT 등록 확정 (toPtActive):** PtConfirmBanner — status==='ot_active' && (round1|round2 closing='성공')일 때만
  노출(§1 성공≠PT 게이트, **both-round** = 1차 즉등록 포함). .update().select() → data.length===0 실패 처리
  (§3 하드닝) + 낙관적 flip·실패 롤백. **anon UPDATE 정책 end-to-end 실증됨**(그동안 미검증이던 걸 첫 통과).
- **S6 ① 캐시 (report.first_assist):** FirstOTAssist(haiku) 출력을 round-1 report에 캐시. **report jsonb 양방향 공존**
  (①이 캐시 쓸 때 관찰 안 덮고, ObservationTab이 관찰 쓸 때 캐시 보존 — raw 확인). 스테일=firstInputHash(회원 정규 필드)
  불일치 배지(2차 obsHash 대칭). **round-1 행 없을 때 = Option B(세션 전용)** — ①만 담긴 행 INSERT 금지
  (SecondOTTab이 "관찰 있음"으로 오인 → 관찰 없는 2차 브리핑 생성 위험 회피). 관찰 저장 후 재생성 시 캐시.

## 이번 세션의 교훈 (핵심 3개)
1. **잠복 마이그레이션은 첫 "쓰기"에서 터진다.** S1 컬럼 SQL이 이 DB엔 실제 미반영이었는데, 읽기(`?? 기본값`)가
   다 막아줘서 안 보이다가 **S4 INSERT(origin/status 첫 쓰기)에서 표출**("origin column not found"). 합본 멱등 SQL로
   한 방에 흡수(컬럼 4 + closing_reapproach_at + UPDATE 정책). 교훈: 컬럼 추가 후 **실제 쓰기 경로가 생기는 단계**까지
   가야 마이그레이션이 진짜 검증된다. SQL 에디터 성공 ≠ 반영 확인.
2. **SQL 에디터는 RLS 우회 → UPDATE 정책 검증의 거짓양성.** 에디터에서 update 되는 건 정책 검증이 아님.
   **anon 키 경로에서 .select() → data.length>0**가 유일한 실증. S5에서 처음 통과.
3. **report jsonb 공존은 양방향 다 확인해야 한다.** 같은 jsonb(round-1 report)를 관찰·캐시가 나눠 쓰면,
   한쪽이라도 통째 교체 시 상대 데이터가 **조용히 증발**(`?? 기본값`도 못 막는 진짜 손실). raw report로 양방향 검증.

## Step 7 선행 (⚠️ 착수 전 필독)
- **홈 "오늘 재접근" 파생(reapproachToday)의 reader는 있는데 writer가 없다.** `closing_reapproach_at`은
  마이그레이션으로 컬럼 + lib/memberStatus.js의 reapproachToday(reader)만 존재, **저장하는 코드 0**.
  이대로 Step 7 가면 리스트가 영원히 빈다.
- **그래서 Step 7은 최소 2단계:** (1) writer 먼저 — 보류 클로징 저장 시 재접근 예정일을 기록하는 경로를
  **1차 보류=ObservationTab / 2차 보류=SecondOTTab**의 보류 클로징 경로에 붙임. (2) reader — 홈에서
  reapproachToday(round1·round2 both의 closing_result='보류' + closing_reapproach_at 도래분) 파생 리스트 렌더.
- 참고 사실(S5 조회에서 확인): **1차 closing_result/closing_approach는 FirstOTTab이 아니라 ObservationTab**이
  ot_round=1 행에 저장. 성공/보류 판정은 **round-1·round-2 both**를 읽어야 함(1차 즉등록·1차 보류 존재).
  SecondOTTab은 이미 round-1 성공 시 2차 브리핑 스킵 게이트 보유.

## 주의 · 부채
- **테스트 흔적 정리 필요:** user_table의 S5테스트-인계/-외부/-신규/-1차즉등록 + S6테스트(전부 pt_active),
  ot_log의 관련 round 행들. **DELETE 정책이 없어 앱에서 못 지움**(§3 패턴, 200·0행). Supabase 대시보드
  (RLS 우회)에서 수동 삭제. 안 지우면 앱 로드 시 최신 회원이 기본 선택돼 개발 중 헷갈림(기능은 무해).
- **정책 부채 ⑦ 이월:** 이번에 연 user_table anon UPDATE + 기존 anon 전면 개방 → ⑦(로그인/RLS)에서 일괄 잠금.
  DELETE 정책은 일부러 안 열었음(부채 최소).
- **프롬프트 만질 때 route↔harness 字-동일** 규칙 유지(S4 postscript §harness). scripts/test-first-prompt.mjs는
  gitignored 거울. 프롬프트/파서/sanitizer 수정 시 양쪽 동시 + diff 0.
- **status_note**는 컬럼·toInactive writer는 있으나 toInactive를 실제로 호출하는 UI(이탈 처리)는 아직 없음
  (전이 액션이 확정=toPtActive만 붙음). 이탈 UI 붙일 때 사유가 status_note에 착지.

## 다음 국면(③④) 백로그 — 이번 세션 트레이너 아이디어
> ③(PT 관리 뷰)·④(클로징 통계) 들어갈 때 검토. 전부 로드맵에 앉고 새로 뒤엎을 것 없음.
- **재등록 길잡이(③ 본체):** 잔여 세션 × 운동목적 → 재등록 트라이 타이밍 + 그날 어떻게 수업/세일즈.
  2차 OT 브리핑(SecondOTTab)의 PT판 대칭, ot-brief 프롬프트 패턴 재사용. `session_log` 선행.
  ⚠️ v1.5 원칙 — 숫자 처방 금지, "왜(근거)+방향"만(사고정지·하향평준화 방지).
- **음성일지 타이핑 입력:** STT 부정확(현장 트러블슈팅) 대비 텍스트 폴백. daily_workout_log에 입력 경로 추가,
  데이터 모델 무변경. **가벼움 · 로드맵 무관하게 아무 때나** 끼울 수 있는 독립 개선(② 후 ③ 전도 가능).
- **재등록 트라이 회차 픽스 → 관리자 열람:** 트레이너가 "이 회차에 재등록 트라이" 찍음(③ PTView) + 관리자가
  "오늘 재등록 트라이하는 트레이너" 봄(④/관리자 대시보드, MASTERPLAN "행동 가능한 목표 대시보드" 축).
  ⚠️ 관리자 열람 = 소유권 필요 → **⑦(trainer_id) 의존**.
- **★클로징 확률 예측 — 재논의 필요(트레이너와):** 관찰일지 입력 시 2차 성공 확률 표시 아이디어.
  ⚠️ **정밀 %(80% 등)는 지양** — (a) 숫자=레시피=사고정지(철학 위반), (b) ④ 데이터 축적 전엔 근거 없는 환각,
  (c) 자기실현·기록 왜곡(예측 보고 관찰 조정 → ④ 원천 오염). **권장: 구간(높음/중간/낮음) + "왜 · 뭘 하면 올라가나".**
  아이디어 알맹이(반응 좋으면 밀고, 금전 거절이면 부담 낮은 커리큘럼 제시)는 숫자 없이 다 살릴 수 있음 —
  방향 분석은 2차 브리핑 강화로 지금도 가능, 정량 %는 ④ 이후 + 구간·방향 우선. **이 항목 ③④ 세션에서 반드시 재논의.**
- **★프롬프트 페르소나 실험:** "성실하고 본질을 지키는 트레이너" 페르소나를 프롬프트에 부여.
  ⚠️ **매출 숫자("월 1000만원")는 빼라** — 세일즈 압박 편향(푸시 세일즈봇화). ⚠️ 페르소나는 톤을 바꾸지 디테일을
  못 만든다(디테일은 출력 구조 지시에서 나옴). ⚠️ haiku는 확률적으로 지시를 어김(S4 교훈) → 모델별 효과 차.
  **harness로 A/B 실측**(있음/없음, 디테일↑·세일즈 편향·톤 유지) 후 판단. ⑥/실사용 튜닝 때. 실험 설계는 그때 같이.

## ② 종료 후 = 현장 사용성 패스 (③ 가기 전)
- Step 7로 ② 닫히면 **코드 진도 멈추고**, 트레이너 본인이 **실기기(폰)에서 실제 회원 한 명 전체 흐름**
  (등록 → 1차 → 관찰 → 2차 → 확정)을 시뮬레이션으로 끝까지 써본다. 개발용 강제 주입 말고 진짜 수업 흐름.
- 뽑을 것 = **"매일 못 쓰겠는 치명적 마찰"만**(버튼 위치, 글씨 크기, 입력 마찰, 수업 중 못 쓰는 지점).
  ⑥ 다듬기의 예고편이되, 사소한 카피·순서는 ⑥으로 미루고 **치명적 마찰만 ②③ 사이에 일찍** 거른다.
- 이유: 지금까지 검증은 전부 "기능이 도는가"(build·end-to-end)였고 **"엄지로 편한가"는 실측 0**. daily 앱
  판정은 트레이너 손에서만 나옴.

## §9 기존 백로그(스펙 문서) — 요약
- **[미래] 스케줄표(PT/OT 일정):** ③(session_log) 뒤 · ⑦ 언저리. session_log에 예정 일시 필드 자리만 미리.
- **[미래] 화이트라벨(회사별 브랜딩):** 단순 교체는 토큰/brand 설정(아무때나), 테넌트별은 ⑦ 이후.
  브랜드 요소를 한 곳에서 읽게 유지.
- (스케줄표·화이트라벨·재등록 트라이 관리자·클로징 확률 모두 결국 ⑦의 로그인·trainer_id·소유권으로 수렴.
  ⑦ 설계 시 이 백로그들이 "⑦이 뭘 받쳐야 하나" 체크리스트.)

## 다음 = Step 7 → ② 종료 → 현장 사용성 패스 → ③
착수 순서:
1. **Step 7 writer** — 보류 클로징 저장 시 closing_reapproach_at 기록(ObservationTab 1차 / SecondOTTab 2차).
2. **Step 7 reader** — 홈 "오늘 재접근" 파생(reapproachToday, both-round 보류 + 예정일 도래). +(③)만기임박은 나중.
3. **② 종료 커밋** + roadmap-next 상단에 "② = v2-S5 완료" 갱신 한 줄(S4에서 ①에 했던 것처럼).
4. **현장 사용성 패스**(위 섹션).
5. **③ 진입** — PTView 실채우기(daily_workout_log 타임라인 + 현재 방향 필드, origin 독립 · §5 하이브리드).
   ③④ 백로그 검토 시작(특히 ★클로징 확률 재논의).
