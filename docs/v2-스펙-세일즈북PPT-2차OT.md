# 구현 스펙 — 2차 OT 회원 대면 세일즈북 (클로드코드용)

> **역할:** 웹Claude(스펙) → 클로드코드(구현) → 대수(커밋). 이 문서는 정본 스펙.
> **불변 규칙 계승(CLAUDE.md §1):** 로직·RLS·payload 불변 기본 · **표시/additive 우선** · **스펙은 라인번호 말고 코드 내용으로 매칭** · 새 파일 `git add` 먼저 · **배치별 1커밋=revert 단위** · Windows **PowerShell**(`&&` 금지 · `-m` 여러 개) · 클라 write는 **교훈1 하드닝**(`.select()`+0행 체크) · **anon-open RLS 금지** · 디자인시스템 프리미티브(`components/ui/`) 사용.

---

## 0. 한 줄 정의

2차 OT **준비 시점(수업 전)에 미리 자동 생성**되어, 2차 수업을 마친 **클로징에서 회원에게 직접 보여주는** 개인 맞춤 트레이닝 플랜 자료. 트레이너용 컨닝페이퍼(`ot-brief`)와 **다른 산출물** — 회원 대면 톤, 정성(사람이 만든 느낌)이 핵심.

---

## 1. 확정 결정 요약

| 항목 | 결정 |
|---|---|
| 엔진 | 기존 `ot-brief` 라우트의 Sonnet(`MODEL_SECOND = "claude-sonnet-5"`) 재사용. **신규 phase `"salesbook"`** 추가. |
| system 프리앰블 | 트레이너용 `PREAMBLE` **못 씀**(실전 클로저 톤). phase가 `salesbook`이면 **회원 대면용 `SALESBOOK_PREAMBLE`로 분기**. |
| 콘텐츠 소스 | 트레이너 브리핑 JSON을 변환하지 **않음**. 원천 데이터(1차 관찰 `ot_log`)에서 **회원 대면 톤으로 재생성**. 단 이미 생성된 2차 브리핑의 `recommended_program`(pick_ref·alt_ref·frequency·duration·session_logic)을 **주입해 숫자 일치**. |
| 생성 시점 | **2차 브리핑 생성 성공 직후 자동 동반 생성**(회원이 "미리 준비됐구나" 느끼게). 수동 재생성 버튼도. |
| 캐시 | `ot_log`(`ot_round=2`) `report.salesbook`에 additive 저장(기존 `report.brief`·`closing_*` 보존). |
| 진입점 | **`SecondOTTab`(탭 id 2 "2차 OT 준비") 한 곳.** (회원자료 탭 10은 `pt:true`=PT회원 전용이라 OT 회원 없음.) |
| 전달 | **① 인앱 뷰**(가로 16:9 기본 · 폰 좁으면 세로 — 회원 대면 제시, 픽셀 충실) + **② PDF 인쇄/저장**(인앱 뷰 `window.print()` + `@media print` A4 가로 · 서버 PDF 인프라 없음 · 인쇄해 종이로 주거나 카톡 전송). **PPTX 안 만듦** — 편집본은 그라데이션·손글씨 등 단순화돼 '성의없음'으로 읽혀 정성 목적과 상충(검토 후 폐기). |
| 정성(AI티 차단) | 고정 수제 템플릿(AI는 텍스트 JSON만 채움) + 회원 실사진(`member_photo`)·실명·실제 한마디 + 손글씨 다짐 + **직접 그리는 서명**(트레이너 프로필 저장→자동적용) + 트레이너 편집 + 프롬프트 미사여구 금지. |
| 가드레일 | **금액 노출**(트레이너 가격표 기준 · 앱이 `packages[ref].price` 채움 · **AI는 값 텍스트에 금액 안 씀**) · 의료 단정 금지 · **없는 성과 창작 금지**(회원이 직접 봄) · 트레이너 내부요소(objection_defense·closing_sequence·sales_intensity·member_read) 제외. |

---

## 2. 슬라이드 구성(7장) · goal 적응

goal이 **최우선 렌즈**(기존 `ot-brief`의 "goal = 중심축, pain은 goal이 통증개선일 때만 주인공" 원칙 계승). 하나의 프롬프트가 goal로 알맹이를 다르게 생성 — goal별 템플릿 분기 없음.

| # | 슬라이드 | 내용 | goal 적응 예 |
|---|---|---|---|
| 1 | 표지 | 회원명·부제 + 트레이너 소개칩(프로필에서) | — |
| 2 | 목표 | 회원 언어 목표 + "지금 겪는 것" 태그 | 교정="펴진 자세" / 벌크업="가슴·어깨 키우기" |
| 3 | 오늘 확인한 것 | 1차 before→after + **회원 실제 한마디** + bridge | 교정="편해짐" / 벌크업="자극점 찾음" |
| 4 | 사진 | **모드 분기** (아래 ★) | — |
| 5 | 로드맵+현재 | 3단계 + "지금 여기" + 단계별 "느낄 변화" | goal별 단계 상이 |
| 6 | 추천 플랜 | **2선택지**(pick_ref+alt_ref), 회차·빈도·기간 + **가격(가격표)** + 회당 단가 + 포함내역 | 빈도 논리 상이 |
| 7 | 마무리 | 제공 서비스(전용공간 포함) + 손글씨 **다짐** + **서명** | 다짐 맥락 상이 |

**★ 사진 슬라이드 모드(`photo_slide.mode`) — goal로 프롬프트가 판단:**
- `within_session` — 눈에 보이는 변화(자세교정·체형): 세션 내 **비포→애프터** 두 컷.
- `baseline` — 장기목표(벌크업·근력): 하루에 근육 안 커지므로 **"오늘=시작점, 3개월 뒤 비교 기준"**(정면/후면 시작점). 가짜 성장 사진 금지.

---

## 3. Batch S1 — `salesbook` phase (서버 · additive)

**파일:** `app/api/ot-brief/route.js` (기존 phase 경로는 바이트 불변 유지 — 순수 additive)

### 3-1. phase 검증 확장
`POST`의 phase 화이트리스트에 `"salesbook"` 추가:
```
if (phase !== "first" && phase !== "second" && phase !== "reregister" && phase !== "acute" && phase !== "salesbook")
```

### 3-2. 요청 body 확장(additive)
기존 destructure에 필드 추가. 세일즈북 생성에 필요한 입력:
- `member` (기존 재사용)
- `report` — 1차 관찰(`ot_log` `report`의 movements·reaction·goal·memberQuote·trainer_note 등, `second`와 동일 소스)
- `recommendedProgram` — **이미 생성된 2차 브리핑의 `recommended_program` 객체**(pick_ref·alt_ref·frequency·duration·session_logic·why_fit·alt_why)
- `packages` (기존 재사용 — 회차 표시용, 금액은 값 텍스트 금지)
- `photoLabels` — 회원 `member_photo`에 존재하는 라벨 배열(예: `["before","after"]`) — 사진 슬라이드 표시/모드 참고용(없으면 사진 슬라이드 프롬프트가 "사진 없음" 처리)

body 크기 가드(`MAX_BODY_BYTES`) 그대로 적용됨.

### 3-3. system 분기 — `SALESBOOK_PREAMBLE`
`PREAMBLE` 옆에 신설. `anthropic.messages.create`의 `system`을 phase로 분기:
```
system: phase === "salesbook" ? SALESBOOK_PREAMBLE : PREAMBLE
```

```text
SALESBOOK_PREAMBLE:
너는 트레이너가 회원에게 '직접 보여줄' 자료(세일즈북)를 만드는 조력자다. 독자는 트레이너가 아니라 회원 본인이다.

[목적]
- 회원이 "이 트레이너가 나를 정확히 이해했고, 정성껏 준비했구나"를 느끼게 하는 '나를 위한 리포트'.
- 판매 문구가 아니라 증거와 계획. 설득은 압박이 아니라 회원 자신의 데이터로.

[절대 금지 — 회원이 직접 보므로 트레이너용보다 엄격]
- 압박·공포·조작: "지금 안 하면 원점" 강요, 허위 긴급성, 죄책감 유발.
- 트레이너 내부용 요소: 거절 방어 대사, 클로징 멘트/시퀀스, 재정·투자 판단, 세일즈 강도.
- 없는 성과·수치·에피소드 창작(회원이 직접 보므로 거짓은 신뢰를 즉시 무너뜨린다). 관찰/데이터에 있는 것만.
- 의료 단정(진단·치료·완치·교정완료). 통증은 '불편/부담'까지만.
- 숫자 처방(세트·횟수·중량·각도·템포). ★가격(금액)은 값 텍스트에 쓰지 마라 — 앱이 패키지 가격표에서 채운다. 회차·빈도·기간은 주어진 recommended_program 값만.

[AI티 금지 — 사람이 쓴 느낌]
- 두루뭉술 미사여구 금지("최고의 결과를 위해", "귀하의 목표를 달성하기 위해", "함께라면 무엇이든" 류).
- 회원 실명·실제 한마디·구체 관찰만으로 채운다. 트레이너가 실제 회원에게 쓸 법한 따뜻한 구어체("~하셨죠", "~예요").

[goal = 최우선 렌즈]
- 모든 슬라이드를 회원 goal 중심으로. pain은 goal이 통증개선일 때만 주인공.

[출력] 지정 JSON만. 설명·마크다운·코드펜스 금지. 모든 값은 한국어 문장.
```

### 3-4. `salesbookPrompt(member, report, recommendedProgram, packages, photoLabels)`

`secondPrompt`와 같은 헬퍼 스타일(`g`/pkgBlock). 핵심 지시:

```text
[상황] 이 회원의 2차 OT 준비 자료다. 트레이너가 2차 수업을 마친 뒤 회원에게 직접 보여준다.
너는 회원이 볼 화면의 '텍스트'만 채운다. 폰트·구도·디자인은 이미 정해져 있다.

[회원 기본정보] name·age·job·gender·pain·goal (secondPrompt와 동일 주입)
[1차 관찰 — 유일 근거] {report의 movements·reaction·goal·memberQuote·trainer_note}
  ⚠️ 이 JSON 키(movements·reaction·memo 등)의 영어 단어를 값 텍스트에 절대 노출 금지. 한국어로 풀어라.
[추천 프로그램(이미 확정) — 이 값만 사용, 새 숫자·금액 창작 금지]
  {recommendedProgram: pick_ref·alt_ref·frequency·duration·session_logic·why_fit·alt_why}
[내 패키지 목록] {pkgBlock} (회차 표시용 · 금액은 값 텍스트 금지)
[회원 사진 라벨] {photoLabels}

각 슬라이드 채우기:
① cover: subtitle 1줄(무엇을 정리한 자료인지, goal 톤). ※회원명·트레이너 정보·서명은 앱이 프로필에서 채우니 생성 금지.
② goal: headline(회원 목표 회원 언어 1줄) · body(왜 이 목표인지 배경 2문장, 관찰 기반) · current_issues(지금 겪는 것 3개, 짧은 명사구).
③ confirmed(오늘 확인한 것): before(처음 상태 1줄) · after(잡아드린 뒤 1줄) · member_quote(1차 memberQuote가 있으면 그 말 그대로, 없으면 "") · bridge(그 변화의 의미 1줄, '혼자선 매번 만들기 어렵지만 익히면 몸이 기억' 결. ★압박 아님, 사실).
④ photo_slide:
   - mode: goal이 자세교정·체중감량·체형처럼 '눈에 보이는 변화'면 "within_session"; 벌크업·근력·근비대처럼 '하루에 안 보이는 장기목표'면 "baseline".
   - title·body: within_session이면 "눈으로도 달라졌어요"(세션 내 비포→애프터). baseline이면 "오늘을 시작점으로 — 3개월 뒤 비교 기준"(가짜 성장 금지).
   - points(3): within_session=함께 확인한 포인트 / baseline=우선 키울 타겟.
   - photoLabels가 비었으면 body에 '사진은 다음에 함께 남겨요' 톤 + points는 유지.
⑤ roadmap: current_step(정수, 보통 1) · steps[3] 각 {title·desc(1문장)·feel("느낄 변화 — …")}. goal 기반 단계.
⑥ plans[2]: A=pick_ref, B=alt_ref(없으면 목록에서 더 가벼운 패키지 1개 선택). 각 {ref(정수)·name(예 "집중 코스"/"기본 코스")·recommended(불린)·meta("주 N회 · 약 M개월" — A는 recommendedProgram.frequency·duration에서, B는 더 가벼운 빈도)·sessions_label("함께 K회" — 패키지 sessions에서)·why(2문장, session_logic 회원 언어로)·includes[3](포함 서비스, 전용공간 관리 포함)}. ★금액(원)은 값 텍스트에 쓰지 마라 — 앱이 `packages[ref].price`(+ 회당 = price/sessions)를 슬라이드에 렌더한다. JSON엔 금액 없음.
⑦ closing: services[4](제공 서비스 — 매 수업 점검·기록 / 홈케어 피드백 / 진행사진 / **회원 전용 공간에 기록 쌓기**. goal 톤) · vow(트레이너 다짐 1~2문장 — "등록 권유가 아니라 책임지겠다는 약속" 결. 손글씨로 렌더됨. ★판매 동사 금지).

[data_gaps] 관찰이 얇아도 전부 생성("정보 부족" 금지). 긍정 코칭. 충실하면 빈 배열.
[출력 언어] 한국어만. 영문 키/코드값 값 텍스트 노출 금지. 아래 JSON만.
```

**JSON 스키마:**
```json
{
  "cover": { "subtitle": "..." },
  "goal": { "headline": "...", "body": "...", "current_issues": ["...","...","..."] },
  "confirmed": { "before": "...", "after": "...", "member_quote": "", "bridge": "..." },
  "photo_slide": { "mode": "within_session|baseline", "title": "...", "body": "...", "points": ["...","...","..."] },
  "roadmap": { "current_step": 1, "steps": [ {"title":"...","desc":"...","feel":"..."}, {"...":"..."}, {"...":"..."} ] },
  "plans": [
    { "ref": 0, "name":"집중 코스", "recommended": true,  "meta":"주 2회 · 약 3개월", "sessions_label":"함께 24회", "why":"...", "includes":["...","...","..."] },
    { "ref": 2, "name":"기본 코스", "recommended": false, "meta":"주 1회 · 약 3개월", "sessions_label":"함께 12회", "why":"...", "includes":["...","...","..."] }
  ],
  "closing": { "services": ["...","...","...","..."], "vow": "..." },
  "data_gaps": []
}
```

### 3-5. 파싱·정제·토큰
- `REQUIRED_SALESBOOK = ["cover","goal","confirmed","photo_slide","roadmap","plans","closing"]` → `parseBrief(textOut, REQUIRED_SALESBOOK)`.
- `sanitizeFieldNames` 그대로 적용. FIELD_TERMS에 신규 키 방어 추가(`current_issues`,`photo_slide`,`roadmap`,`plans`,`includes`,`services`,`vow`,`bridge` 등 — 값 텍스트 누출 시 한글 치환).
- `maxTokens`: salesbook은 브리핑보다 가벼움 → **3072** (거절5종·클로징시퀀스 없음).
- `thinking: disabled` 유지.
- **장비 블록(`fetchCenterMachines`/`equipmentBlock`)은 salesbook에 안 붙임**(회원 대면엔 불필요) — `phase === "acute"`처럼 제외 조건에 salesbook 추가.

### 3-6. 회귀 안전
- first/second/reregister/acute 경로는 문자 그대로 불변. salesbook 분기만 추가.
- 키 미설정(`ANTHROPIC_API_KEY` 없음) → 기존과 동일 503(프론트가 숨김/데모 처리).

---

## 4. Batch S2 — 자동 생성 + 캐시 (클라 · `SecondOTTab`)

**파일:** `components/tabs/SecondOTTab.jsx`

- **트리거:** 2차 브리핑(`ot-brief` phase="second") 생성이 성공해 `report.brief`가 확정되면, **이어서 phase="salesbook" 호출**(백그라운드). 입력: `report`(1차 관찰) + `brief.recommended_program`(→ `recommendedProgram`) + `packages` + `photoLabels`(아래 조회).
- **`photoLabels` 조회:** `member_photo`에서 `user_id` = 회원, `label` distinct(`MemberPhotoSummary`의 조회 패턴 재사용). 라벨 배열만 넘김(URL은 렌더 시점에 뷰가 서명URL 발급).
- **캐시 저장:** `ot_log`(`ot_round=2`) `report`에 `salesbook` 키 **머지**(기존 `report.brief`·`closing_*` 보존). 기존 report 업데이트 패턴을 그대로 따르되 **read-modify-write**로 salesbook만 추가. 클라 write는 **교훈1 하드닝**(`.update(...).select()` + 0행 체크, 실패 시 사용자 안내).
- **스테일 감지:** 1차 관찰 또는 `report.brief`가 갱신되면 salesbook도 재생성(기존 브리핑 스테일 로직 미러). 캐시 있으면 재호출 안 함.
- **수동 재생성:** "세일즈북 다시 만들기" 버튼(브리핑 재생성 옆).
- **상태:** 생성 중/실패/키 미설정 → 기존 AI 기능 폴백 패턴과 동일(숨김 또는 "데모" 라벨). 자동 생성 실패해도 브리핑 흐름은 막지 않음(세일즈북은 부가).

---

## 5. Batch S3 — `SalesbookView` 컴포넌트 (렌더)

**신규 파일:** `components/views/SalesbookView.jsx` (`git add` 먼저). 필요 시 프린트 CSS는 `globals.css` 또는 컴포넌트 스코프.

**Props:** `{ salesbook, member, trainer, editable = false, onSave }`
- `salesbook` — 캐시된 JSON.
- `member` — 회원(이름 등).
- `trainer` — 프로필(이름·자격·**signature**).

**렌더:**
- 7장 슬라이드를 JSON에서 렌더. **가로 16:9 기본**, `@media (orientation: portrait)` 또는 좁은 폭이면 세로 카드 레이아웃으로 전환(둘 다 같은 JSON). 디자인 토큰(빨강 `#dc2626`·Pretendard)은 디자인시스템/`globals` 사용.
- 표지: `member.name` + `salesbook.cover.subtitle` + **트레이너 소개칩**(`trainer` 프로필에서 — AI 아님). 브랜드 로고는 **`components/ui/BrandMark`(침=trainer red)·`Wordmark` 프리미티브 그대로 사용**(커스텀 SVG 금지 — 샘플 HTML의 심볼은 근사치일 뿐, 실제 구현은 프리미티브).
- 사진 슬라이드: `member_photo` **서명 URL 발급**(`createSignedUrls`, `MemberPhotoSummary` 패턴 재사용). mode=within_session → `before`+`after`; baseline → 최근 2컷(정면/후면 등). 사진 없으면 "다음에 함께 남겨요" 플레이스홀더.
- 추천 플랜: 2개 카드. **가격은 `packages[plans[i].ref].price`를 앱이 렌더**(+ 회당 단가 = price/sessions). AI JSON엔 금액 없음 — 트레이너가 가격표 바꾸면 세일즈북 가격도 자동 반영. 회차·빈도·기간·why·includes는 JSON에서.
- 마무리: `salesbook.closing.vow`를 **손글씨 폰트**로(다짐), 아래 **서명**(`trainer.signature` 있으면 표시). 손글씨 폰트(예: Nanum Pen Script)는 프로젝트 폰트 로딩 방식에 맞춰 추가(self-host 권장).
- **네비:** 스와이프(터치)·좌우 키·점 인디케이터·화살표.
- **PDF:** "PDF로 저장/인쇄" 버튼 → `window.print()`. `@media print { @page{size:A4 landscape;margin:0} .track{display:block;transform:none} .slide{height:100vh;page-break-after:always} 네비·버튼 display:none }`. (상단정렬로 세로 여백 최소화.)
- **present 모드**(editable=false): 편집·샘플 주석 없이 깨끗하게. 회원에게 보이는 화면.

---

## 6. Batch S4 — 트레이너 서명 저장 (프로필)

**목표:** 서명을 트레이너가 **한 번 그려 프로필에 저장 → 모든 세일즈북에 자동 적용**.

- **저장 위치:** 트레이너 프로필(설정 화면 `TrainerProfileSettings.jsx`가 읽는 테이블/행). ⚠️ **클로드코드가 실제 프로필 테이블·컬럼 구조를 먼저 확인**하고, `signature_data_url text`(nullable) 컬럼을 **additive 마이그레이션**으로 추가(작은 PNG data URL). RLS는 **account 스코프 내 additive**(anon-open 금지).
- **입력 UI:** `TrainerProfileSettings`에 서명 패드(canvas 드로잉·"다시" 버튼) 추가 → PNG data URL 저장. 클라 write **교훈1 하드닝**.
- **적용:** `SalesbookView`가 `trainer.signature`를 마무리 슬라이드에 렌더. editable 뷰에서 서명이 없으면 그 자리에서 그려 저장 유도.

---

## 7. Batch S5 — 진입점 + 편집

**진입점(`SecondOTTab`):** 2차 브리핑/클로징 영역 하단에 **"회원에게 세일즈북 보기"** 버튼 → `SalesbookView`를 모달/풀스크린 present 모드로.

**편집(editable 뷰):** AI 초안 중 트레이너가 손대는 곳(MVP 범위):
- `confirmed`(before/after/member_quote/bridge) — 2차에서 실제 확인된 것에 맞게 조정.
- `closing.vow`(다짐) · `closing.services`.
- 사진 선택(어떤 `member_photo`를 쓸지).
- 저장 → `report.salesbook` PATCH(**교훈1 하드닝**, `report.brief` 보존).
- 나머지(목표·로드맵·플랜)는 편집 대신 재생성.

**권장 구현 순서:** S1 → S3(손으로 만든 JSON으로 뷰 검증) → S2(자동생성·캐시 연결) → S4(서명) → S5(진입·편집). 각 배치 1커밋.

---

## 8. 가드레일·검증 체크리스트

구현 후 각 배치에서 확인:
- [ ] 플랜 **금액은 트레이너 등록 패키지 값만**(앱이 `packages[ref].price` 렌더) — AI가 금액 텍스트 생성 안 함. 플랜 외 슬라이드엔 금액 없음.
- [ ] **의료 단정 없음**(진단·치료·완치·교정완료). 통증은 불편/부담까지.
- [ ] **없는 성과·수치 창작 없음** — 1차 관찰/데이터에 있는 것만.
- [ ] 트레이너 내부요소(거절방어·클로징시퀀스·재정판단·sales_intensity·member_read) **미노출**.
- [ ] 값 텍스트에 **영문 키/코드값 노출 없음**(sanitize + 프롬프트 금지 이중 방어).
- [ ] goal 다른 회원(교정 vs 벌크업)에서 **알맹이가 실제로 달라지는지** — 특히 사진 슬라이드 mode.
- [ ] 사진 없는 회원에서 사진 슬라이드가 **깨지지 않고** 플레이스홀더 처리.
- [ ] 기존 first/second/reregister/acute **회귀 없음**(바이트 불변 확인).
- [ ] 클라 write 전부 `.select()`+0행 체크.
- [ ] 신규 마이그레이션(서명 컬럼) RLS **anon-open 아님**.
- [ ] 가로/세로 인앱 뷰 + PDF 모두 같은 JSON에서 정상 렌더.

**검증 방식:** 교정·벌크업 두 케이스로 실제 생성→렌더→PDF까지 스모크. (웹Claude가 만든 샘플 HTML 4종이 비주얼 레퍼런스: `salesbook-landscape.html`(교정 가로 강화판), `salesbook-bulkup.html`(벌크업 가로), `salesbook-sample.html`(세로 v4).)

---

## 9. 후속(이번 스코프 밖) — 재등록용 세일즈북

`재등록 준비`(탭 id 11)에 대칭 구현. 소스: PT 관리데이터 + `reregisterPrompt` 산출(`why_now.proven`/`next_roadmap`/`recommended_program`). "그동안의 진전" 슬라이드가 "오늘 확인한 것"을 대체. 같은 `salesbook` phase에 `origin` 분기 또는 별도 프롬프트. 2차용 안정화 후 진행.
