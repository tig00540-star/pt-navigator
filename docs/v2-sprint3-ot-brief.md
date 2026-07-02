# v2 · 스프린트 3 — 관찰 데이터 기반 실 AI (OT 여정 파트너)

> 대상: Claude Code에 넘기는 구현 브리프
> 선행: 스프린트 1(음성일지 실 AI, `app/api/voice-log`) · 스프린트 2(1차 OT 관찰 `ot_log`, `ObservationTab`) 완료.
> 함께 읽을 것: `docs/MASTERPLAN.md`, `docs/v2-sprint2-observation.md`, `docs/v2-sprint3-notes.md`.
> 원칙(MASTERPLAN ⭐⭐): **AI는 정답 대본 제공기가 아니라 스파링 파트너.** 완성 대본을 던지면
> 트레이너가 사고 정지 → 하향평준화. "근거+방향(왜)"을 주고, 예시 문장은 어디까지나 예시다.
> 원칙(v1.5): 숫자 처방(각도·템포·세트·중량) 금지. 움직임은 '방향'까지만.
> 원칙(sprint1 계승): AI는 입력을 재구성할 뿐 0에서 창조하지 않는다(헛소리 확률↓).

---

## 1. 목표

`ot_log`에 저장된 실 관찰 데이터 위에 **실 AI**를 얹어, AI가 회원 한 명의 등록 여정
(1차 OT → 2차 OT → 클로징)을 함께 보는 파트너가 된다. 지금까지 하드코딩(김철수 고정)이던
2차 피드백 분석·세일즈 흐름·클로징을 **선택된 회원의 실제 관찰 기반 AI 생성**으로 교체하고,
1차에도 AI 지원 블록을 얹는다. 동시에 클로징 결과를 기록해 다음 스프린트(통계)의 데이터를 쌓기 시작한다.

### 여정 흐름

```
[1차 OT]  ─ ① AI 지원(기본정보+사전메모 → 가설 방향 · observe_targets · 대화흐름 · soft 클로징)
              │
              ├─ 트레이너가 observe_targets를 보고 1차 관찰 수행
              ↓
      [관찰기록 탭] 관찰 3덩어리 입력 + 회원 한마디 + ㉠ 1차 클로징 결과 기록
                   │
      ┌────────────┴─────────────┐
   [1차 클로징 성공]           [실패 / 보류 / 미시도]
      │                            │
  ㉣ "등록 완료" 상태          [2차 OT] ─ ③ AI 지원(1차 관찰 → 등록 당위성 브리핑 ·
  (2차 AI 스킵)                              대화흐름 arc · "마지막 OT"급 클로징 3분기 · 거절 대처)
                                        ↓
                                  ③ 브리핑은 캐시(다시 열면 그대로) · ㉠ 2차 클로징 결과 기록(round-2 행)
```

### ㉮ 루프 닫기 (MASTERPLAN 성장 루프의 핵심 — 빠뜨리지 말 것)

```
① AI: observe_targets 산출
   ↓ (트레이너가 관찰기록 탭 movements에 채움 — "입력하는 행위 자체가 사고의 시간")
ObservationTab: movements[] 저장
   ↓
③ AI: 그 movements를 유일 근거로 '증명' 설계
```

AI 산출이 다음 단계의 입력을 만든다. ①의 `observe_targets`는 트레이너가 관찰기록 탭에
그대로 옮겨 확인할 수 있도록 '관찰 가능한 행동/움직임 단위'로 나오게 프롬프트에 명시(§6).

### 산출물 저장 정책 (이번 스프린트 핵심 변경 — 캐시)

- **③ 2차 브리핑은 캐시한다.** 트레이너가 2차 들어가기 전 미리 숙지하는 동선이라, 다시 열면
  **아까 본 그대로** 떠야 한다. 저장 위치 = `ot_log` **ot_round=2 행의 `report` jsonb**
  (→ 마이그레이션 불필요). 진입 시 캐시가 있으면 렌더(재호출 X, 비용 0), 없으면 1회 생성 후 저장.
- **스테일 방지:** "재생성" 버튼 + 생성 시점(타임스탬프) + "어느 관찰 기준인지" 표시.
  관찰을 수정했는데 브리핑이 옛것이면 트레이너가 자각·수동 갱신할 수 있게(기본 캐시, 갱신 수동).
- **① 1차 지원은 캐시하지 않는다(세션 재생성).** 이유: ①의 입력인 사전메모는 비저장이라
  출력만 캐시하면 '입력은 사라졌는데 출력만 남은' 미스터리가 됨(=스테일 문제). ① 실행 시점엔
  round-1 행이 아직 없을 때가 많아 저장 슬롯도 애매. ①은 가설·비교용이라 버려도 되고 Haiku라 재생성이 쌈.
  (①의 캐시는 사전정보 구조화 저장이 선행돼야 깨끗함 → 스프린트 4+ 로드맵.)

### 스코프 경계

- **IN:** ① 1차 지원 · ③ 2차 지원(+캐시) · ㉠ 클로징 결과+방향 기록 · ㉣ 1차 성공 시 분기.
- **삭제:** 2차 실패 후 포기/인계 판단 — 트레이너 재량, AI 판정 대상 아님.
- **스프린트 4 예약(구현 X, 메모만):** 2차 일정 타이밍 추천 · 클로징 통계 대시보드
  (본인 클로징률 + 나이·성별·직업·클로징방향별 강점 분석). ㉠ 데이터가 쌓여야 의미 있음.
- **탭1 전면 정리:** 이번 제외. ①은 탭1을 **뜯지 않고 추가형 블록**으로 얹는다(별도 후속 패스).
- **숫자 처방:** 제외. 단 arc 안 "이 시점엔 이런 움직임으로 증명" 수준의 방향 언급은 유지.

---

## 2. 완료 기준 (Acceptance Criteria)

- [ ] `app/api/ot-brief/route.js` 신설. `phase: "first"|"second"`로 분기, JSON만 반환, 키 미설정/실패 시 폴백 시그널.
- [ ] ③ 모델 `claude-sonnet-5`, ① 모델 `claude-haiku-4-5-20251001` 사용. 키는 서버 전용(`ANTHROPIC_API_KEY`).
- [ ] `SecondOTTab`이 `member` prop을 받아 **member-aware**로 전환된다(현재 무props 정적 김철수 제거).
- [ ] `SecondOTTab`이 그 회원의 `ot_log`(ot_round=1)를 fetch → **없으면** "관찰기록 탭에서 먼저 입력" 게이트(AI 안 돎).
- [ ] ㉣ ot_round=1 행의 `closing_result === "success"` → "1차에서 등록 완료" 상태 렌더, ③ AI 호출 스킵.
- [ ] **③ 캐시:** 진입 시 ot_round=2 행 `report.brief`가 있으면 그걸 렌더(재호출 X). 없으면 1회 생성 후 `report`에 저장.
- [ ] **재생성 버튼:** 누르면 ③를 재호출해 `report.brief`/`briefMeta`를 덮어쓴다.
- [ ] **스테일 표시:** 생성 시점(`generatedAt`) 노출 + 현재 1차 관찰과 브리핑 생성 기준 관찰이 다르면 "관찰이 바뀌었습니다 — 재생성 권장" 배지.
- [ ] ③ 산출(briefing · arc · closing 3분기 · objections)이 기존 하드코딩 자리에 렌더된다.
- [ ] 기존 `SECOND_ACT`(yes/partial/no) 토글은 유지, 분기 스위칭은 **클라이언트에서**(AI 재호출 없음).
- [ ] `ObservationTab`에 "회원 한마디"(자유입력, `report.memberQuote`, 마이그레이션 불필요)가 추가된다.
- [ ] `ObservationTab`에 ㉠ 1차 클로징 결과(`closing_result` / `closing_approach`) 기록 UI가 추가되고 ot_round=1 행에 저장된다.
- [ ] `SecondOTTab`에 ㉠ 2차 클로징 결과 기록 UI가 추가되고 **ot_round=2 행**에 upsert된다(브리핑 캐시와 같은 행에 공존, 필드 안 겹침).
- [ ] 탭1에 ① AI 지원 블록 + "사전 메모" textarea가 추가된다(탭1 기존 하드코딩 미변경). ①은 캐시 없이 세션 재생성.
- [ ] 사전 메모 textarea에 "이 메모는 이번 AI 생성에만 쓰이고 저장되지 않습니다" 안내가 명시된다.
- [ ] 키 미설정(데모 모드) 시 기존 하드코딩이 **데모 폴백**으로 뜨고, 앱이 죽지 않으며, 진짜/데모 라벨이 분리된다.
- [ ] AI 산출에 `data_gaps`가 있으면 화면에 "데이터 부족 — 트레이너가 채우세요"로 노출된다(빈 채로 단정 금지).
- [ ] `npm run build` 통과. 기존 6탭 기능은 그대로 동작.

---

## 3. DB 마이그레이션 (Supabase SQL Editor에서 실행 — git 아님)

```sql
alter table ot_log
  add column if not exists closing_result   text,   -- 'success' | 'fail' | 'hold' | 'none'
  add column if not exists closing_approach text;    -- 'pain' | 'appearance' | 'value' | 'other'
```

- "회원 한마디"와 **③ 브리핑 캐시**는 **마이그레이션 없이** `report` jsonb 안에 넣는다.
- `ot_log`는 sprint2에서 anon INSERT/SELECT/UPDATE 정책을 이미 열어둠(MASTERPLAN 보안부채로 기록) → **새 정책 불필요.**

### 행 구조 (round별 1행 유지)

```
ot_round = 1  →  report: { movements[], reaction, goal, memberQuote }   ← 1차 관찰 + 회원 한마디
                 closing_result / closing_approach                       ← 1차 클로징 결과(㉠)

ot_round = 2  →  report: { brief: {...③ JSON...}, briefMeta: {...} }     ← 2차 브리핑 캐시(신규)
                 closing_result / closing_approach                       ← 2차 클로징 결과(㉠)
```

- 업서트 키: `(user_id, ot_round)`. ObservationTab=round1, SecondOTTab=round2로 각각 조회/저장.
- **round-2 행은 두 종류의 쓰기가 공존**한다: (a) 브리핑 캐시 = `report` 갱신, (b) 클로징 결과 = `closing_*` 컬럼 갱신.
  둘은 **다른 필드**라 서로 덮어쓰지 않는다. 단, 두 writer 모두 같은 `existingRow2Id`를 공유해
  "행 있으면 자기 필드만 update, 없으면 insert" 패턴으로 처리(§8 작업 4~6). report 통째 교체로 상대 필드 날리지 말 것.

### ③ 브리핑 캐시 shape (`ot_round=2` 행의 `report`)

```json
{
  "brief": { /* §7 ③ 스키마 전체(briefing/arc/closing/objections/data_gaps) */ },
  "briefMeta": {
    "generatedAt": "ISO 8601 timestamp",
    "obsHash": "1차 관찰 스냅샷 해시(스테일 감지용)",
    "model": "claude-sonnet-5"
  }
}
```

- **`obsHash`:** 브리핑 생성 시점의 1차 관찰 핵심을 정규화해 만든 가벼운 해시.
  대상 = round-1 `report`의 `movements` + `reaction` + `goal` + `memberQuote`를 **키 순서 고정**해
  `JSON.stringify` → 간단한 문자열 해시(예: djb2/간이 해시 함수 하나). 마이그레이션 불필요, 클라에서 계산.
  **위치 = `lib/otHash.js`** (순수 함수, 프로젝트 공용 추출 패턴 `fmt`/`Eyebrow`/`useToast`와 동일하게 lib에 둠).
  나중에 ① 캐시·통계에서 재사용 가능하도록 컴포넌트 밖으로 뺀다. export 예: `export function otObsHash(report)`.
- **스테일 판정(진입 시):** 현재 round-1 관찰로 `obsHash`를 재계산해 저장된 `briefMeta.obsHash`와 비교.
  다르면 "관찰이 바뀌었습니다 — 재생성 권장" 배지. 같으면 "생성: {generatedAt} · 현재 관찰 기준" 표기.
  (ot_log에 `updated_at`이 없어 타임스탬프만으로는 관찰 수정 감지가 안 되므로 해시로 감지 — 이게 자동 스테일 신호.)

---

## 4. 아키텍처 흐름

```
[탭1 · ① 블록] (캐시 없음)             [서버 라우트]                    [Anthropic]
member + preNote(비저장)
   POST /api/ot-brief {phase:"first"} ─▶  프리앰블(system) + ① 프롬프트(user)
                                            model: haiku ────────────▶  JSON(① 스키마)
                                          ◀── { hypothesis, observe_targets, arc, soft_closing, data_gaps }

[2차 OT 탭 · ③] (캐시 우선)
   진입 → ot_round=2 행 fetch
     ├─ report.brief 있음 → 렌더(재호출 X) + 스테일 배지 판정
     └─ 없음 → POST /api/ot-brief {phase:"second", member, report(1차 관찰)}
                    model: sonnet ─────────▶  JSON(③ 스키마)
                  ◀── { briefing, arc, closing{yes/partial/no}, objections, data_gaps }
                → report.brief/briefMeta 로 저장(캐시) → 렌더
   [재생성] 버튼 → 강제 재호출 → report.brief/briefMeta 덮어쓰기
   act 토글(yes/partial/no) → closing 3분기 클라 스위칭(재호출 X)
```

키는 서버 라우트 안에서만 사용 — 프론트 노출 금지(sprint1 패턴 그대로).

---

## 5. 가드레일 프리앰블 (①③ 공통 · system에 문자 그대로 박음 — 변경 금지)

```
너는 피트니스 트레이너의 '스파링 파트너'다. 정답 대본을 주는 도구가 아니라,
트레이너가 자기 생각과 비교·검증하도록 근거와 방향을 제시하는 파트너다.

[환각 금지]
- 트레이너가 입력한 관찰/정보만 재구성한다. 없는 관찰·수치·에피소드를 지어내지 않는다.
- 데이터가 빈약하면 채우지 말고 data_gaps 배열에 "무엇이 부족한지"를 적어 트레이너가
  채우게 남겨둔다. 빈약한 근거로 단정하지 않는다.

[윤리 가드레일]
- 허용: 회원 '본인 데이터'로 말하기 / 사실 기반 손실 프레이밍("지금 멈추면 원점") /
        "혼자서는 이 세팅을 못 잡는다"(사실인 책임의 말).
- 금지: 허위 긴급성, FOMO 남발, 죄책감 유발, 의료·완치·치료 표현.
- 경계선: '사실 기반 손실'은 OK, '없는 위기를 지어내는 공포 조장'은 금지.
  강한 클로징의 원천은 압박이 아니라 "이 트레이너가 나를 정확히 이해했다"는 공감이다.

[출력 규칙]
- 대본을 통째로 주지 말 것. intent(왜)·direction(무엇을) 중심으로 쓰고,
  example(예시 문장)은 어디까지나 '예시'다. 트레이너가 자기 스타일로 채운다.
- 숫자 처방(각도·템포·세트·중량) 금지. 움직임 '방향'까지만("전방 힙힌지로 둔근 개입").
- 반드시 지정된 JSON 스키마만 출력. 설명·마크다운·코드펜스 금지.
```

---

## 6. AI 순간별 user 프롬프트

### ① 1차 지원 (phase="first", haiku)

```
[상황] 1차 OT 전/중. 아직 관찰 데이터가 없다 — 아래는 관찰이 아니라 '사전 정보'다.
[회원 기본정보] name={name}, age={age}, job={job}, residence={residence},
               mbti={mbti}, pain={pain}, goal={goal}, machines={machines}
[트레이너 사전 메모/인바디 요약] {preNote || "없음"}

기본정보만으로 1차 OT를 지원하라. 관찰이 아니므로 모든 판단은 '가설'임을 전제한다("~일 가능성" 톤).
1) hypothesis: 이 회원 접근 가설 방향. 단정 금지.
2) observe_targets: 1차에서 실제로 관찰해와야 할 것. 트레이너가 관찰기록 탭에 그대로 옮겨
   확인할 수 있도록 '관찰 가능한 행동/움직임 단위'로 작성.
3) arc: 1차 대화 흐름(도입→중반→후반→마무리). 각 비트 when/intent/direction/tone/example.
4) soft_closing: 1차 마무리의 부담 없는 클로징. 강요·긴급성 금지.
정보가 얇으면 지어내지 말고 data_gaps에 남겨라.
```

### ③ 2차 지원 (phase="second", sonnet)

```
[상황] 2차 OT. 아래 '1차 관찰 기록'은 트레이너가 실제 입력한 관찰이다(가설 아님).
[회원 기본정보] name={name}, age={age}, job={job}, mbti={mbti}, pain={pain}, goal={goal}
[1차 관찰 기록]
  movements[]: { observation, memberAware(회원이 스스로 인지함), plan2nd(2차에 풀 것) }
  reaction: { stimulus, attitudeTags, memo }
  goal: { identified, type, detail }
  memberQuote: "회원이 1차에 남긴 인상적인 한마디" (있으면)

이 '1차 관찰'을 유일한 근거로 2차를 설계하라.
1) briefing(등록 당위성 논리): proven_in_1st(1차 확인) → risk_if_alone(혼자 하면 위험한 지점,
   사실 기반) → to_prove_in_2nd(2차에 몸으로 증명할 것) → closing_logic("혼자선 못 잡는다"의 논리, 낭독 대본 아님).
2) arc(2차 대화 흐름): movements[].plan2nd를 arc의 중심축으로. memberAware=true 항목은
   '회원이 스스로 인지한 것'이라 소환 비트에 강력하니 우선 활용. memberQuote가 있으면
   '1차 소환' 비트에서 회원 본인 워딩을 그대로 되살려라(가장 강한 공감 지점).
3) closing: 2차 실시간 자극 결과 분기(yes/partial/no) 3버전 프리생성. 각 분기를 아래 4단계
   골격으로(진입→그림→착지→침묵). 각 분기에 approach_tag 제안.
   "마지막 OT"급으로 확실하되, 압박이 아니라 '깊이 이해받았다'는 공감으로.
4) objections(거절 대처): 황현진 4유형(망설임·거부·의심·재확인)으로. 반박이 아니라 '공감으로 빗장 풀기'.

[클로징 4단계 골격 — 각 분기 필수]
  enter(진입):  "등록" 단어로 시작 금지. 오늘 회원 몸에서 일어난 사실을 짚고 "그래서 회원에게
                무슨 의미인지(So what?)"로 연다. memberQuote/memberAware를 여기서 소환하면 강력.
  paint(그림):  핵심 진단·필요성을 추상 설명 금지. 반드시 '일상 비유 하나'로 회원 머릿속에
                그림을 그린다(예: "브레이크 밟고 액셀 밟는 격"). 이게 이 화법의 시그니처.
  land(착지):   등록 제안을 '왜 필요한가 + 왜 지금인가'로. goal_type에 맞는 기대 키워드로 착지
                (pain→해결·안심 / appearance→자부심 / health→안심 / 기타→이익).
                '등록하세요'(판매 동사) 금지 → 가정 종결("다음 주부터 이렇게 가시죠")로.
                긴급성은 '사실 기반 손실'만("지금 멈추면 이 감각 사라져요"), 없는 위기 조장 금지.
  hold(침묵):   land 후 멈추라는 지시. "여기서 말 멈추고 회원 답을 기다리세요" 문구를 담는다.

[화법 원리 — 황현진式, 모든 문장에 적용]
  - 畵法(그림 그리기): 설명은 추상어 대신 비유·오감으로 생생하게. "설득"이 아니라 "설명".
  - So what?: 사실 나열 금지. 반드시 "그래서 회원에게 무슨 의미인지"까지 연결.
  - 담백하게: 화려한 설득·고상한 단어 금지. 쉬운 말로.
  - 위협 소구(겁주기) 금지 → 사실 기반 손실 프레이밍으로 대체(공포 조장은 재등록을 무너뜨림).
관찰이 빈약하면 단정 말고 data_gaps에 남겨라.

[data_gaps 절제 + 최선 브리핑 규칙]
  - 관찰이 1~2개로 얇더라도, 있는 것만으로 클로징 4단계와 arc를 '반드시' 생성한다.
    "데이터 부족으로 못 한다"는 반환 금지. 빈손으로 돌려주지 말 것.
  - data_gaps는 '있으면 좋은 것' 전부가 아니라, 브리핑을 더 강하게 만들 '핵심 관찰 1~2개'만
    남긴다(최대 3개). 톤은 잔소리가 아니라 코칭: "이 관찰을 더하면 클로징이 이렇게 강해진다".
  - memberQuote(회원 한마디)는 얇은 관찰에서도 강력한 재료 — 있으면 도입 소환에 반드시 활용.
  - ⚠️ 프레임: '부족/결핍'이 아니라 '더하면 좋아지는 것(성장)'. "없어서 못 한다" 뉘앙스 금지.
    문구는 항상 긍정 코칭: "○○를 더 관찰하시면 클로징에서 △△까지 짚어드릴 수 있어요" 형태.
    관찰이 이미 충실하면 이 배열을 **빈 배열 또는 1개 이하**로. 억지로 채우지 말 것
    (채울수록 새 항목이 무한 생성되면 트레이너가 '영원히 부족하다'고 느낌 → 금지).

[출력 언어 규칙]
  - 모든 출력 텍스트는 자연스러운 한국어. 입력으로 받은 영문 코드값(timid, well, pain,
    appearance, memberQuote 등)을 출력에 그대로 노출 금지. 반드시 한글로 풀어 쓴다
    (timid→겁많음, active→적극적, well→자극 잘 느낌, pain→통증개선 등). 필드명은 화면에 쓰지 말 것.

[비유 개인화 규칙]
  - paint(비유)는 이 회원의 직업·취미·일상(job, goal.detail)에서 끌어와라
    (골프→스윙·어드레스, 좌식→책상·의자, 요리사→주방 동작 등). 운동/기계 클리셰
    ("브레이크-액셀", "기름칠" 등)에 기대지 말 것. 회원 세계의 언어로 그린다.
    회원 정보에 쓸 소재가 없을 때만 일반 비유 허용.
```

---

## 7. 반환 JSON 스키마

### ③ (phase="second") — 리치 (이 객체가 `report.brief`로 캐시됨)

```json
{
  "data_gaps": ["관찰이 부족해 트레이너가 채워야 할 것 (없으면 [])"],
  "briefing": {
    "proven_in_1st":  "1차 관찰로 확인된 것",
    "risk_if_alone":  "혼자 하면 악화/정체될 지점(사실 기반)",
    "to_prove_in_2nd":"2차에서 몸으로 증명할 것",
    "closing_logic":  "1차→증명→'혼자선 못 잡는다'의 한 줄 논리(방향, 대본 아님)"
  },
  "arc": [
    { "when": "도입|중반|후반|마무리",
      "intent": "이 비트가 이 회원에게 왜 필요한지",
      "direction": "무엇을 전달할지(움직임 증명 언급 가능·숫자 금지)",
      "example": "예시 문장(UI에서 접힘/흐림)",
      "tone": "어떻게 말할지" }
  ],
  "closing": {
    "yes":     { "approach_tag": "value|pain|appearance|other",
                 "enter": "진입 — So what? 로 여는 말(등록 단어 금지, memberQuote 소환 가능)",
                 "paint": "그림 — 핵심을 일상 비유 하나로",
                 "land":  "착지 — 왜+지금 / 기대 키워드 / 가정 종결(판매 동사 금지)",
                 "hold":  "침묵 — '여기서 멈추고 회원 답을 기다리세요' 지시" },
    "partial": { "approach_tag": "…", "enter": "…", "paint": "…", "land": "…", "hold": "…" },
    "no":      { "approach_tag": "…", "enter": "…", "paint": "…", "land": "…", "hold": "…" }
  },
  "objections": [
    { "type": "망설임|거부|의심|재확인",
      "customer_says": "이 유형 회원이 흔히 하는 말(예: 망설임='선택하기 좀 그래요')",
      "reframe_direction": "공감으로 빗장 푸는 방향(반박 아님)",
      "example": "예시 문장(선택)" }
  ]
}
```

### ① (phase="first") — 얇은 가설 (캐시 안 함)

```json
{
  "data_gaps": ["…"],
  "hypothesis": "기본정보 기반 접근 가설(관찰 아님 명시)",
  "observe_targets": ["1차에서 관찰해올 것 → ObservationTab movements와 연결(관찰 단위)"],
  "arc": [ { "when": "…", "intent": "…", "direction": "…", "example": "…", "tone": "…" } ],
  "soft_closing": { "approach_tag": "…", "logic": "…", "example": "…" }
}
```

공통: `example`은 항상 별도 필드(**낭독기 방지 UI 훅** — §8-훅) · 근거 없으면 `data_gaps`로 정직하게 비움 · `approach_tag`가 ㉠ 기록과 물림.

---

## 8. 작업 항목 (파일별)

### 작업 1 — `app/api/ot-brief/route.js` (신설)
- `POST` 핸들러. body `{ phase, member, report?, preNote? }`.
- **sprint1의 `app/api/voice-log/route.js` Anthropic 호출 패턴을 재사용**(SDK/fetch 동일 방식).
- `phase==="first"` → model `claude-haiku-4-5-20251001`, §6 ① 프롬프트, 없는 필드는 "없음"/기본값.
- `phase==="second"` → model `claude-sonnet-5`, §6 ③ 프롬프트.
- system = §5 프리앰블(공통). **JSON only** 유도 + 응답에서 코드펜스 strip 후 `JSON.parse`, try/catch.
- 파싱 실패·키 미설정·API 실패 → 명확한 상태코드 + 메시지(프론트 데모 폴백 판별용).
- max_tokens: ①은 작게, ③은 넉넉히(arc+closing 3분기+objections). (라우트는 캐시를 모른다 — 순수 생성기.)

### 작업 2 — `ObservationTab.jsx` (확장)
- **회원 한마디:** ② 반응 섹션 근처에 자유입력 한 칸 추가 → 최상위 `report.memberQuote`에 저장.
  `emptyForm()`/`rowToForm()`/`save()`의 report 조립에 `memberQuote` 추가.
- **㉠ 1차 클로징 결과:** 저장 버튼 위 섹션 추가.
  - `closing_result` 드롭다운: 성공(success)/실패(fail)/보류(hold)/미시도(none, 기본).
  - `closing_approach` 드롭다운: 통증개선(pain)/외형변화(appearance)/가치체감(value)/기타(other).
  - 라벨(한글)↔저장값(영문) 분리 — 기존 `STIMULUS_OPTS` 패턴 그대로.
- `save()` payload에 top-level `closing_result`/`closing_approach` 추가(ot_round=1 행).
- 기존 `.select()` 0행=실패 하드닝, 업서트 규칙, 데모 폴백 전부 유지.

### 작업 3 — `SecondOTTab.jsx` member-aware 배선 (앱 안 깨지게 우선) + `page.jsx` 배선
- `function SecondOTTab({ member })`로 시그니처 변경(무props 정적 김철수 제거).
- `page.jsx`: `<SecondOTTab />` → `<SecondOTTab member={selectedMember} />` (현재 line ~2259).
- 회원 변경 시 `ot_log` round-1 관찰 행 조회 + round-2 행 조회(캐시/클로징용, `existingRow2Id` 보관).
- 게이트 분기:
  - `!supabase || !member?.id` → 데모/미선택 안내(기존 하드코딩을 **데모 폴백**으로 렌더).
  - round-1 관찰 행 없음 → "1차 관찰 기록이 없습니다 → 관찰기록 탭에서 먼저 입력" 안내(AI 안 돎).
  - **㉣** round-1 행 `closing_result === "success"` → "1차에서 등록 완료" 상태 렌더 + ③ 스킵.
  - 그 외(fail/hold/none) → 작업 4로.
- 이 커밋까지는 AI 미연결, 폴백 하드코딩 유지 → build 그린.

### 작업 4 — `SecondOTTab.jsx` ③ AI 연동 (캐시 우선)
- 진입 시 round-2 행 `report.brief` 존재 검사:
  - **있으면** → 그 JSON 렌더(재호출 X).
  - **없으면** → `/api/ot-brief` `{phase:"second", member, report(round-1 관찰)}` 1회 호출 →
    성공 시 round-2 행에 `report = { brief: <JSON>, briefMeta: { generatedAt, obsHash, model } }`로 저장
    (existingRow2Id 있으면 update({report}), 없으면 insert 후 id 보관) → 렌더.
- 렌더 매핑:
  - `briefing` → 피드백 분석 카드 자리(기존 `FEEDBACK_ANALYSIS` 구조 치환).
  - `arc` → 세일즈 흐름 자리(기존 `buildSecondSales` 구조 재활용). `example`은 §8-훅대로 접기/흐림.
  - `closing[act]` → **클로징 메인 카드**: 4단계(enter→paint→land→hold)를 위→아래 세로로 큼직하게.
    `paint`(비유)와 `land`(착지)는 시선이 가게, `hold`는 "🤐 여기서 멈추고 답 기다리기"로 시각 강조.
    이게 화면의 주인공 — briefing/arc/objections는 접어두고 이 카드가 먼저 눈에 들어오게.
  - `objections` → 거절 대처 섹션(신규). 4유형(망설임/거부/의심/재확인) 탭·아코디언, `customer_says`를 라벨로.
  - `data_gaps` 있으면 상단 "데이터 부족" 배지.
- **act 분기:** 기존 `SECOND_ACT`(yes/partial/no) 토글 유지. 누르면 `brief.closing[act]`의 4단계를 **클라에서 스위칭**(재호출 X).
- 키 없음/실패 → 기존 하드코딩 데모 폴백 + "데모" 라벨.

### 작업 5 — `SecondOTTab.jsx` 재생성 + 스테일 메타
- **obsHash 유틸:** `lib/otHash.js`에 `otObsHash(report)` 순수 함수로 신설 — round-1 관찰(`movements`+`reaction`+`goal`+`memberQuote`)을 키 순서 고정 `JSON.stringify` → 간이 문자열 해시. `import { otObsHash } from "@/lib/otHash"`로 사용(별칭 `@/*` 패턴).
- 진입 시 현재 관찰 obsHash를 재계산해 `briefMeta.obsHash`와 비교 → 다르면 "관찰이 바뀌었습니다 — 재생성 권장" 배지, 같으면 "생성: {generatedAt} · 현재 관찰 기준".
- **재생성 버튼:** 강제 재호출 → `report.brief`/`briefMeta` 덮어쓰기(update({report})) → 새 obsHash로 갱신.
  (report만 갱신하므로 같은 행의 `closing_*` 컬럼은 보존됨.)

### 작업 6 — `SecondOTTab.jsx` ㉠ 2차 클로징 결과 (round-2, 캐시와 공존)
- 클로징 섹션 하단 결과 UI(작업 2와 동일 옵션: result/approach).
- **ot_round=2 행** upsert: `existingRow2Id` 공유 → 있으면 update({closing_result, closing_approach}) (report 미변경),
  없으면 insert({user_id, ot_round:2, closing_result, closing_approach}).select → id 보관.
- `.select()` 0행 하드닝 적용. 편의: `approach` 기본값을 AI `closing[act].approach_tag`로 프리필(수정 가능).
- **주의:** 브리핑 캐시(작업 4/5)와 클로징 결과가 같은 행에 공존 → **각자 자기 필드만 update**해 상대를 덮지 말 것.

### 작업 7 — 탭1 ① AI 지원 블록 (추가형, 캐시 없음)
- 탭1(1차 OT)에 **기존 하드코딩을 건드리지 않고** ① 블록 추가:
  - "사전 메모/인바디 요약" textarea(비영속) + **"이 메모는 이번 AI 생성에만 쓰이고 저장되지 않습니다" 안내**.
  - "AI 지원 생성" 버튼 → `/api/ot-brief` `{phase:"first", member, preNote}` (매번 재생성, 저장 X).
  - `hypothesis`/`observe_targets`/`arc`/`soft_closing`/`data_gaps` 렌더. `example` 접기/흐림.
  - `observe_targets`에 "관찰기록 탭에서 이걸 관찰하세요" 힌트(㉮ 루프 닫기 안내).

### §8-훅 — 낭독기 방지 (필수)
`example`(모든 스키마의 예시 문장)은 UI에서 **기본 접힘 또는 흐리게(예: `text-zinc-500`, 작은 글씨, "예시" 라벨)** 처리해 트레이너 눈이 `intent`/`direction`에 먼저 닿게 한다. 이게 ⭐⭐ 철학의 실제 장치다.

---

## 9. 커밋 분할

```
1. feat: /api/ot-brief 라우트 (프리앰블+①③ 프롬프트 빌더, JSON 파싱, 폴백 시그널) — 프론트 없이
2. feat: ObservationTab — 회원 한마디(report.memberQuote) + 1차 클로징 결과(closing_result/approach)
3. feat: SecondOTTab member-aware 전환 + ot_log fetch + ㉣ 분기 게이트 (+ page.jsx member prop) — 폴백 유지, build 그린
4. feat: SecondOTTab ③ AI 연동 (캐시 우선: 있으면 렌더 / 없으면 생성 후 report.brief 저장, act 클라 스위칭, example 접기)
5. feat: lib/otHash.js(otObsHash 순수 함수) 신설 + SecondOTTab 재생성 버튼 + 스테일 감지(obsHash·generatedAt 배지)
6. feat: SecondOTTab 2차 클로징 결과 (ot_round=2 upsert, 브리핑 캐시와 필드 공존)
7. feat: 탭1 ① AI 지원 블록 추가형 + 사전메모 textarea(비저장 안내, 세션 재생성)
```

DB 마이그레이션 SQL(§3)은 코드가 아니므로 커밋과 별개로 Supabase에서 먼저 실행.

---

## 10. 기술 주의사항 (놓치기 쉬운 것)

- **모델 문자열:** ③=`claude-sonnet-5`, ①=`claude-haiku-4-5-20251001`. 혼동 금지.
- **JSON only 파싱:** 모델이 코드펜스/서두를 붙일 수 있음 → strip 후 parse, 실패 시 폴백. `data_gaps`는 없으면 `[]`로 방어.
- **캐시 공존(가장 조심):** round-2 행에서 브리핑(`report`)과 클로징(`closing_*` 컬럼)은 **다른 writer**다.
  각자 **자기 필드만** update. `report` 통째 교체로 상대 필드 날리지 말 것. 둘 다 같은 `existingRow2Id` 공유.
- **①은 캐시하지 않는다:** 세션 재생성. 저장 로직 넣지 말 것(입력 비저장이라 캐시 시 스테일 미스터리 발생).
- **member-aware 필수:** `SecondOTTab`은 현재 완전 정적. member 없음/관찰 없음/성공 분기 3게이트 반드시 처리(작업 3).
- **스테일 감지는 해시로:** ot_log에 `updated_at` 없음 → 타임스탬프만으론 관찰 수정 감지 불가. obsHash 비교로 자동 배지.
- **사전 메모 비저장 안내:** textarea에 "저장 안 됨" 문구 필수(트레이너가 날아가서 당황 안 하게).
- **데모 폴백 라벨:** 키 없으면 기존 하드코딩을 폴백으로 쓰되 "데모" 라벨 명시. 진짜/가짜 섞지 말 것(CLAUDE.md 규칙).
- **RLS:** `ot_log`는 이미 anon UPDATE 열려 있음 → 새 정책 불필요. `.select()` 0행=실패 하드닝은 round-2 저장에도 적용.
- **비용 표시 금지:** 트레이너 화면에 API 비용 노출 X(sprint1 원칙).
- **기존 6탭 회귀 금지:** 탭1 하드코딩·타이머·`buildClosing` 등은 이번에 건드리지 않는다.

---

## 11. 검증

- 마이그레이션 SQL 먼저 실행(컬럼 2개 추가 확인).
- 회원 선택 → 탭1 ① 블록: 사전메모 입력 → AI 지원 생성 → `observe_targets`/`arc` 표시, `example` 접힘/흐림 확인. (탭 나갔다 오면 재생성되는지 = 캐시 없음 확인.)
- 관찰기록 탭: 관찰 입력 + 회원 한마디 + 1차 클로징(예: hold) 저장 → Supabase `ot_log` round-1 행에 `closing_*`/`report.memberQuote` 확인.
- 2차 OT 탭: 같은 회원 → 게이트 통과 → ③ 생성 → briefing/arc/closing/objections 렌더 → **Supabase round-2 행 `report.brief`/`briefMeta` 저장 확인.**
- **캐시:** 탭 나갔다 재진입 → 재호출 없이 **같은 브리핑** 그대로 뜨는지(네트워크 탭에 /api 호출 없음).
- **스테일:** 관찰기록 탭에서 관찰 수정 → 2차 탭 재진입 → "관찰 바뀜 — 재생성 권장" 배지 뜨는지 → 재생성 눌러 갱신되고 배지 사라지는지.
- `SECOND_ACT` 토글로 closing 분기 스위칭(재호출 없이) 확인.
- 1차 클로징을 success로 바꿔 재진입 → 2차 탭 "등록 완료"로 ㉣ 스킵 확인.
- 2차 클로징 결과 저장 → round-2 행 `closing_*` 갱신 + **기존 `report.brief` 보존** 확인(공존).
- 관찰 없는 회원 → 2차 탭 게이트 안내(AI 안 돎) 확인.
- 키 제거(데모 모드) → 폴백 하드코딩 + "데모" 라벨, 앱 안 죽음.
- AC 대조 · `npm run build` 통과 · 기존 6탭 정상.

---

## 12. 이 스프린트가 끝나면 (다음 — 스프린트 4 예약)

> **설계 결정 기록(클로징 화법):** ③ 클로징은 황현진式 화법(畵法=그림 그리기, So what?, 담백한 설명,
> 기대 그물[해결·안심·자부심], 가정 종결) + MASTERPLAN ⭐⭐(공감>압박)을 골격으로 삼는다.
> 황현진 방법 중 '위협 소구(겁주기)'는 **의도적으로 제외** — MASTERPLAN "공포 조장 금지·재등록
> 무너뜨림" 선과 충돌하므로, '사실 기반 손실 프레이밍'으로 대체(§6 ③ 프롬프트에 명시).


- **클로징 통계 대시보드:** 본인 클로징률 + 나이·성별·직업·`closing_approach`별 강점 분석.
  이번에 쌓기 시작한 `closing_result`/`closing_approach`가 원천.
- **2차 일정 타이밍 추천.**
- **2콜 옵션:** ③ 클로징을 증명 결과 나온 뒤 재생성(신선도↑). 이번엔 1콜+분기 프리생성.
- **① 캐시:** 사전정보 구조화 저장(등록 폼 확장)이 선행되면 그때 ①도 캐시 가능.
- **니즈 충족 '치트키 운동' 1개 추천(①③ 대칭):** 루틴 전체가 아니라 이 회원 핵심을 뚫는
  '딱 한 동작 + 왜 이게 열쇠인지'만. v1.5 준수(숫자 처방 금지, 방향+원리). 2차용은 클로징
  paint(그림)의 소재로 연결("아까 그 한 동작에서 느끼셨죠?"). 1차용은 즉각 피드백 동작으로.
  center_machine 연동·세트 처방으로 번지지 않게 '1개·방향만' 선을 지킬 것.
- **탭1 전면 정리:** 하드코딩 스캐폴드 → AI 전면 교체.
- **인바디 구조화 입력:** 사전메모 textarea → 등록 폼 확장. MASTERPLAN 로드맵.
- **보안 슬라이스(MASTERPLAN 4순위):** trainer_id + Supabase Auth + RLS 잠금. `ot_log` anon 개방 부채 청산.
```
