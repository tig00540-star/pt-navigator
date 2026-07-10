# v2 인계 — 1차 OT 클로징률 스프린트 (다음 채팅 시작점)

> 이 문서 = 새 채팅에서 이어가기용 인계. 함께 첨부할 것: CLAUDE.md · MASTERPLAN.md ·
> v2-closing-cases-D3-design-note.md · pt-navigator-총정리.md(구조·AI·보안 총정리) · 이 문서.
> 역할·흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 git add · 통과 후 · 직후 git show --stat HEAD). SQL=Supabase 대시보드, git엔 docs/migrations 기록본.

---

## 0. 직전 세션 성과 (이번에 나간 것)

- **③-a 인바디** — `inbody_log` 테이블 신설 + PtInbodyTab 실구현(수기 입력·최근요약 delta·이력·삭제·지표별 스파크라인). SQL 기록본 `docs/migrations/2026-07-10-inbody-log.sql`.
- **③-b 운동일지 AI 심화** — voice-log 요약 모델 **Haiku→Sonnet(claude-sonnet-5, thinking off, max_tokens 4096)** + few-shot로 **운동별 method(실행 큐 3~6개)** 풍부화. STT prompt에 헬스어휘+회원머신 주입. 카톡 헤더 **회차**(non-voided 수업수+1, 노쇼 포함, 재등록 누적).
- **⑤ 밝은테마 전면 이관** — globals.css 시맨틱 토큰(bg·card·elevate·line·ink·sub·muted·primary·primary-strong·primary-soft) + 전 화면(셸·스케줄·회원·PT탭·OT탭·admin·auth) 라이트. 규율: 무채색 뼈대 + 초록 액센트만 + 정체성색은 배지/점/바만 + 카드=border-line+shadow.
- **탭 전환 애니** — globals.css `tabIn` keyframe(0.5s·16px), 셸 리마운트 없이 리프/PT서브탭만 재생.
- **총정리본** — `pt-navigator-총정리.md`(구동·AI모델·프롬프트·보안수정·프롬프트튜닝 후보·개발자 질문).

⚠️ **넘기기 전 확인:** 탭 전환 0.5초 tweak 커밋·push 여부. (미완이면 그것만 마무리 후 시작.)

---

## 1. 다음 스프린트 목표 = 1차 OT 클로징률 올리기

트레이너가 "와 클로징률 오르네" 체감하도록 1차 OT AI를 개편. 현재 1차 프롬프트가 7개 병렬 섹션이라 **어지럽고 실제 수업 흐름과 안 맞음** → 순서 있는 한 줄기 스크립트 + 구체 프로그램 + 거절 대응 + (임계 뒤) 트레이너 강점 활용.

### 확정된 결정 (지난 논의)
- **1차 OT 모델: Haiku → `claude-sonnet-5`** (2차와 동일 최신). thinking 처리도 2차 패턴 따라감.
  - ⚠️ 주의: 외부 추천표의 `claude-3-5-sonnet/haiku`는 **구세대 이름** — 절대 그걸로 바꾸지 말 것(다운그레이드). 앱 최신은 `claude-sonnet-5`·`claude-haiku-4-5`.
  - 음성 요약·2차·재등록은 지금이 최선 → 안 건드림. (음성요약 Haiku 다운그레이드 제안은 반려 — 방금 올린 품질 후퇴.)
- **가격 공급: 트레이너가 본인 PT 가격 설정**(내 실적 탭 "내 PT 가격 설정"). AI 환각 가격 방지. 원장 센터공통 관리는 나중 확장.
- **강점 활용(D)은 지금 만든다** — 임계값 게이트로. 성공 클로징 케이스 **5건 미만=꺼짐, 5건 이상=자동 켜짐**. 5~9건은 '잠정 경향'으로 조심, 10+ 확신. 케이스에 **회원 프로파일(목적·불편·직업 등) 스냅샷**을 같이 저장해야 '비슷한 회원' 매칭 가능.
- **철학 유지:** 구체 세일즈로 가되 '압박 아닌 공감'(이 트레이너가 나를 정확히 이해했다). PREAMBLE 상속.

### 4단계 플랜 (전부 지금 · D만 임계값까지 대기)
- **A. 가격 프리셋 뼈대** — `pt_package` 테이블 + 내 실적 탭 "내 PT 가격 설정" UI(CRUD).
- **B. 1차 OT 개편** — 1차→Sonnet + 출력을 6단계 한 줄기 스크립트로 재구성 + 세일즈에 추천 프로그램(내 패키지에서) + 거절 이유별 대응·세일즈 방향. 클라: 내 패키지 로드해 `/api/ot-brief phase:first` 요청에 주입 + 새 출력 렌더.
- **C. 1차 클로징 캡처(D-2)** — ot_log round1에 클로징 방식(closing_detail 3박자: approach/reaction/outcome) + 결과(closing_result/approach/reason) + **회원 프로파일 스냅샷** 저장. (2차 round2엔 이미 있음 → 1차로 대칭 확장.)
- **D. 강점 활용(D-3, 임계 5건)** — 1차 프롬프트에 '이 트레이너의 과거 성공 케이스 ≥5건' 조건부 주입 → AI가 강점 경향 반영. 지금 코딩, 5건 되면 자동 켜짐.

### 1차 OT 새 출력 흐름(초안 — B에서 확정)
```
1) 만남·라포  2) 목적 파악(끌어낼 질문)  3) 원인→해결 간단 피드백
4) 방향 맞는 운동(치트키·몸으로 체감)  5) 마무리 상담(오늘 몸에서 일어난 것→세일즈로)
6) 세일즈: 추천 PT 프로그램(세션·기간·금액·왜 맞는지) + 클로징 4단계(진입→그림→착지→침묵)
          + 거절 대응(이유별 공감 방향 + 세일즈 무브)
```

---

## 2. 즉시 다음 액션

**A 착수 = `pt_package` 필드 확정 → 마이그레이션 SQL.** 제안 필드(확정 대기):
| 필드 | 뜻 |
|---|---|
| name | 패키지명 |
| sessions | 세션 수 |
| duration_label | 기간 표기(자유텍스트: "3개월·주2회") |
| price | 금액(원) |
| note | 대상·설명(선택) |
| sort | 표시 순서 |
| active | 노출 여부 |
+ 자동: account_id(=auth_account_id())·trainer_id(=auth.uid()). RLS: account 스코프 + 본인 편집(user_table 7c2a 패턴).
→ 회당단가 자동표시·할인가 넣을지만 결정하면 SQL 바로 뽑음.

그다음 B(프롬프트 원문은 `app/api/ot-brief/route.js`의 `firstPrompt` — 총정리본/이전 논의 참고) → C → D 순.

---

## 3. 참고 — 현재 AI 지점 (총정리본 발췌)
- `/api/voice-log`: OpenAI gpt-4o-mini-transcribe(STT) + claude-sonnet-5(요약).
- `/api/ot-brief`: phase first(**개편 대상**, Haiku→Sonnet) / second(Sonnet) / reregister(Sonnet) / acute(Sonnet). 공통 system=PREAMBLE. 후처리=parseBrief(JSON 하드닝)+sanitizeFieldNames.
- 관찰→2차, PT관리→재등록, 기본정보→1차. 1차 캡처(C)가 D-3 재료.

---

## 4. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음). lint=npm.cmd run lint. SQL=Supabase 대시보드(git엔 migrations 기록본).
> 첨부 먼저 읽어줘: v2-핸드오프-1차OT클로징.md(이 문서·제일 중요) + pt-navigator-총정리.md + CLAUDE.md + MASTERPLAN.md + v2-closing-cases-D3-design-note.md.
> 목표: 1차 OT 클로징률 개편 A→B→C→D. A(pt_package)부터 — 필드 확정하고 마이그레이션 SQL 뽑자.
