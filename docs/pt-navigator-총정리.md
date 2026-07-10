# pt-navigator — 앱 총정리본 (개발자 인계 · 프롬프트 튜닝용)

> 목적: (1) 앱이 어떻게 구동·진행되는지, (2) 각 AI 파트가 어떤 모델·프롬프트로 어떤 결과를 내는지, (3) 개발자에게 물어볼 보안·수정 항목, (4) 손볼 프롬프트 후보를 한 문서로.
> 작성 기준: 현재 코드(밝은테마 이관·③-b Sonnet 심화 반영 시점).

---

## 0. 한눈 요약

- **한 줄 정의:** 피트니스 트레이너용 AI 세일즈·CRM·PT관리 웹앱. 트레이너가 OT(무료체험)→PT(유료)→재등록 여정을 AI 지원과 함께 진행하고, 원장은 매출·트레이너 실적을 대시보드로 감시.
- **스택:** Next.js 16 (App Router) · React 19 · 순수 JavaScript/JSX (TypeScript 없음) · Tailwind CSS v4 (설정파일 없이 `app/globals.css`의 `@theme`) · Supabase (PostgreSQL + PostgREST + Auth) · Vercel 배포.
- **형태:** 웹앱이지만 PWA로 세팅됨(`manifest.js` + `appleWebApp capable`) → "홈 화면에 추가"로 앱처럼 설치·전체화면 실행. (네이티브 앱 필요 시 Capacitor로 래핑 가능.)
- **AI 제공자:** Anthropic Claude(요약·브리핑) + OpenAI(음성 STT). 키는 **서버 API 라우트 안에서만** 사용, 프론트 노출 없음.
- **핵심 원칙(코드 전반):** ① 배관(등록·저장·조회)은 실연동, 콘텐츠 생성은 실 AI 또는 데모 폴백을 명확히 라벨. ② AI는 "정답 대본"이 아니라 "스파링 파트너"(트레이너가 비교·검증). ③ 환각·의료단정·숫자처방 금지.

---

## 1. 아키텍처 & 구동 방식

### 1.1 라우트 구조
```
/           → 트레이너 화면  (app/page.jsx, "use client")
/admin      → 원장 대시보드  (app/admin/page.jsx, owner 전용)
서버 API (Node 런타임, 키 서버전용):
  /api/voice-log      → 음성일지: 오디오 → STT → 요약
  /api/ot-brief       → OT/PT 브리핑: 4 phase (first/second/reregister/acute)
  /api/create-trainer → 원장이 트레이너 계정 생성 (service_role 키 · 서버전용)
```

### 1.2 클라이언트 ↔ Supabase ↔ AI 흐름
```
[브라우저(트레이너)] --직접--> [Supabase]  (RLS로 계정·권한 필터, PostgREST)
        |
        +--fetch--> [Next 서버 API 라우트] --키 사용--> [Claude / OpenAI]
                     (프론트는 결과 JSON만 받음, 키 안 봄)
```
- **Supabase 직접 호출**: 회원·계약·수업로그·관찰·인바디 등 CRUD는 브라우저에서 Supabase 클라이언트로 직접(RLS가 방어).
- **AI는 서버 경유**: 음성일지·브리핑은 반드시 서버 라우트를 거침(키 보호 + 프롬프트 서버 조립).

### 1.3 인증·권한(RLS) — ⑦에서 도입
- **로그인 게이트**: `components/AuthGate.jsx`가 Supabase Auth 로그인 요구. 미로그인/권한없음 화면 분기.
- **계정 격리**: 모든 데이터 테이블에 `account_id`. RLS 정책이 `account_id = auth_account_id()`로 계정 간 격리.
- **트레이너/원장 구분**: `trainer` 테이블(role=owner|trainer). 헬퍼 함수(SECURITY DEFINER):
  - `auth_account_id()` — 로그인 유저 → 소속 계정 id
  - `auth_is_owner()` — 로그인 유저가 원장인가
- **회원 스코프**: `user_table`은 "같은 계정 AND (원장이거나 내 회원)"으로 트레이너별 격리(⑦-c-2a).
- **파일럿 계정 id(고정):** `11111111-1111-1111-1111-111111111111`.

### 1.4 데모 폴백(키 없을 때도 렌더)
- **Supabase 키 없음** → `supabase`가 `null` → 각 호출부가 `if(!supabase)`로 하드코딩 데모 데이터 사용.
- **AI 키 없음/실패** → 라우트가 명확한 상태코드(503/502) → 프론트가 데모 리포트로 폴백하고 "데모" 라벨 표기.

### 1.5 배포 파이프라인
```
코드 수정 → git push origin main → GitHub → Vercel 자동 배포 → https://...vercel.app
DB 변경 → Supabase 대시보드 SQL Editor 수동 실행 (git엔 docs/migrations/*.sql 기록본만)
폰 확인 → Vercel 배포본 하드리프레시 (localhost 아님)
```

---

## 2. 화면 지도 & 회원 라이프사이클

### 2.1 트레이너 화면 탭 (회원 상태에 따라 동적)
- **상시 탭:** 스케줄 · 회원 · 내 실적
- **OT 회원일 때:** + 1차 OT · 1차 피드백(관찰) · 2차 OT
- **PT 회원일 때:** + 운동일지 · 재등록 · 인바디
- 회원 상태(`user_table.status`: ot_active / pt_active / inactive)로 `viewFor()`가 뷰를 스위치.

### 2.2 라이프사이클(제품의 핵심 흐름)
```
[등록/데스크] 기본정보(+인바디 수기) 수집
      ↓
[1차 OT]  성향·관찰 기록(ObservationTab → ot_log round1) + AI 1차 지원(FirstOTAssist)
      ↓  ★ 1차 관찰이 2차 브리핑의 유일 근거
[2차 OT]  관찰 기반 AI 브리핑·클로징 4단계(SecondOTTab → ot-brief phase:second) → 클로징 결과 기록
      ↓  클로징 성공 → 'PT 등록 확정'(PtConfirmBanner) → status pt_active + session_log 계약 생성
[PT 관리] 운동일지(수업=차감·카톡)·현재방향·급한불·인바디 추이 (PtWorkoutTab/PtInbodyTab)
      ↓  잔여 임계 도래 → 재등록 타이밍
[재등록]  PT 관리데이터 기반 AI 브리핑(PtReRegTab → ot-brief phase:reregister) → 결과 기록
```
- **스케줄 보드**: 주간 그리드·오늘 뷰. 예약(appointment) → 완료 시 daily_workout_log 1행(세션 차감) + 카톡 복사. 원장은 트레이너별 색상 구분.
- **인계·외부 PT**: OT 없이 바로 PT로 시작(관찰 데이터 없음 → 재등록 AI는 관찰 비의존).

---

## 3. AI 파트 총괄 ★핵심

### 3.1 엔드포인트·모델 요약표

| 기능 | 라우트 / phase | 모델 | max_tokens | 입력 근거 | 캐시 | 폴백 |
|---|---|---|---|---|---|---|
| 음성일지 STT | /api/voice-log | OpenAI **gpt-4o-mini-transcribe** (ko) | — | 오디오 + 헬스어휘·회원머신 prompt | 없음 | 503→데모 |
| 음성일지 요약 | /api/voice-log | Claude **claude-sonnet-5** (thinking off) | 4096 | STT 원문 + 회원 머신 | 없음(저장은 DB) | 503→데모 |
| 1차 OT 지원 | /api/ot-brief `first` | Claude **claude-haiku-4-5** | 8192 | 회원 기본정보만 | 없음(세션) | 503→데모 |
| 2차 OT 브리핑 | /api/ot-brief `second` | Claude **claude-sonnet-5** (thinking off) | 5120 | 1차 관찰(ot_log) | ot_log round2 `report.brief`(재생성·스테일감지) | 503→데모 |
| 재등록 브리핑 | /api/ot-brief `reregister` | Claude **claude-sonnet-5** | 5120 | PT 관리데이터(계약·최근수업) | session_log 최신행 `report.reg_brief` | 503→데모 |
| 급한불 대처 | /api/ot-brief `acute` | Claude **claude-sonnet-5** | 5120 | 트레이너 입력 급변상황 + 최근수업 | 없음(세션 전용·DB 무관) | 502/503→에러 |

> **STT 비용 팁:** 요약 모델(Sonnet)만 phase당 1회 호출 → 월 200수업 기준 요약 비용 차이 Haiku 대비 약 +$1.6~3.2(인트로 단가 기준). STT는 모델 선택 무관.

### 3.2 공용 시스템 프리앰블 (ot-brief 전 phase 공통)
`PREAMBLE` — **변경 시 톤 전체가 흔들리는 핵심**. 요지:
- **스파링 파트너**: 정답 대본이 아니라 근거·방향 제시(트레이너가 자기 생각과 비교).
- **환각 금지**: 입력된 관찰만 재구성, 없는 수치·에피소드 창작 금지. 빈약하면 `data_gaps`에 "무엇이 부족한지"만.
- **윤리 가드**: 허용=사실 기반 손실 프레이밍("지금 멈추면 원점")·"혼자선 못 잡는다"(책임의 말). 금지=허위 긴급성·FOMO·죄책감·의료(완치/치료).
- **출력 규칙**: 대본 통째 금지(intent=왜/direction=무엇을 중심, example은 '예시'). **숫자 처방(각도·템포·세트·중량) 금지**, 움직임 '방향'까지만. JSON 스키마만.

### 3.3 각 phase 상세

#### (A) 음성일지 — /api/voice-log
- **파이프라인:** 오디오 Blob → OpenAI STT(ko, `prompt`에 헬스 운동·머신 어휘 + 이 회원 등록 머신 주입) → Claude Sonnet 요약.
- **요약 시스템 프롬프트 요지(`SUMMARY_SYSTEM`):**
  - "오늘 한 사실"(운동 종류·중량·세트)은 트레이너가 말한 것만(허위 기록 방지).
  - STT 오인식 표기 교정(값은 보존).
  - **운동별 `method`를 자세히**: 언급된 각 운동마다 실전 실행 큐 3~6개(세팅·힘쓰는부위·가동범위·템포·중량진행). 표준 지식이라 '지어내기' 아님 = 회원 개인운동 만족도 목적. (few-shot으로 '아웃타이' 예시 박아둠.)
  - 의료 가드(치료·진단 단정 금지, 통증 시 전문가 상의).
- **출력 스키마:** `{ machines:[{name, detail, method:[]}], feedback, homework:[] }`
- **결과 사용:** 프리뷰 3섹션 → "일지 채우기" → 트레이너가 텍스트 수정 → 저장(=세션 차감) → 카톡 복사. **카톡 헤더에 회차**(앱 기록 non-voided 수업수+1, 노쇼 포함, 재등록 넘어 누적).
- **폴백:** 키 없음/실패 → 하드코딩 데모 리포트(`buildVoiceReport`).

#### (B) 1차 OT 지원 — ot-brief `first` (Haiku)
- **입력:** 회원 **기본정보만**(관찰 없음 → 모든 판단 '가설' 톤).
- **프롬프트 요지:** 1차 OT 6단계 흐름(arc: 라포→문진·공감→자각→치트키운동→피드백→세일즈) + 치트키 동작 1개(movement_cues) + 세일즈 나침반(closing_compass) + 부담없는 마무리(soft_closing). '자각'은 목적 고정·수단 자유, 평가동작은 '예시'로만.
- **출력 스키마:** `{ data_gaps, hypothesis, observe_targets, arc[], movement_cues, closing_compass, soft_closing }`
- **캐시:** 없음(세션 재생성).

#### (C) 2차 OT 브리핑 — ot-brief `second` (Sonnet)
- **입력:** 회원 기본정보 + **1차 관찰 기록**(ot_log: movements/reaction/goal/memberQuote/trainer_note/sales_intensity).
- **프롬프트 요지:** 등록 당위성 briefing(1차확인→혼자하면위험→2차에증명→클로징논리) + 2차 대화 arc + **클로징 4단계**(enter 진입/paint 일상비유/land 착지·가정종결/hold 침묵) × 자극결과 3분기(yes/partial/no) + 거절대처(황현진 4유형) + 자극반응별 운동대처. `sales_intensity`(soft/standard/strong)로 근거의 '선명도' 조절(압박 아님).
- **출력 스키마:** `{ data_gaps, briefing, arc[], closing{yes/partial/no{enter,paint,land,hold,approach_tag}}, objections[], stimulus_response{yes/partial/no} }`
- **캐시:** ot_log round2 `report.brief`에 저장(재생성 버튼 + 관찰 바뀌면 스테일 배지). 재방문 재호출 0.

#### (D) 재등록 브리핑 — ot-brief `reregister` (Sonnet)
- **입력:** 회원 기본정보 + 현재 PT방향 + 관리이력(계약회차·잔여) + 최근 수업기록. **관찰(ot_log) 비의존**(인계·외부 PT는 관찰 없음).
- **프롬프트 요지:** 재등록 당위성 briefing(그동안 확인·개선→멈추면 잃는것→다음 로드맵→클로징논리) + arc + 이유별 대처(money/time/schedule/sessions_left/low_effect/personal) + 클로징 4단계. "새로 파는 것 아님, 쌓은 만족 잇기".
- **출력 스키마:** `{ data_gaps, briefing{proven_in_pt,risk_if_stop,next_roadmap,closing_logic}, arc[], objections[{reason,...}], closing{enter,paint,land,hold} }`
- **캐시:** session_log 최신 계약행 `report.reg_brief`.

#### (E) 급한불 대처 — ot-brief `acute` (Sonnet)
- **입력:** 회원 기본정보 + PT방향 + 트레이너가 입력한 급변상황 + 최근수업. **DB 무관(세션 전용·캐시 없음).**
- **프롬프트 요지(★의료 경계 최우선):** 부상·급성통증 의심 시 최우선 출력=병원·의료진 먼저. 트레이너가 줄 수 있는 건 (a)오늘 피할 움직임 (b)의학적 확인 이후 복귀 결까지. 숫자 처방·대체 처방 금지. 세일즈 몰이 금지.
- **출력 스키마:** `{ data_gaps, safety, avoid[], alternatives[], principle, note }`

### 3.4 결과 후처리(ot-brief 공통)
- **`parseBrief`**: 모델이 코드펜스·구분자·다중블록으로 흘려도 JSON 추출(펜스제거→단일파싱→첫 완전객체 균형추출→비겹침 union). 불완전하면 실패 처리(부분객체 채택 안 함).
- **`sanitizeFieldNames`**: 모델이 값 텍스트에 스키마 키(memberQuote·closing_compass 등)를 흘리면 한글로 치환(최종 안전망).

---

## 4. 데이터 모델 (Supabase / PostgreSQL)

| 테이블 | 용도 | 핵심 컬럼 |
|---|---|---|
| `account` | 소유·격리 단위 | id, type, name |
| `trainer` | 로그인 유저↔계정↔역할 | id(=auth.users.id), account_id, role(owner/trainer), active |
| `user_table` | 회원 | name·age·job·pain·goal·machines · status(ot/pt/inactive) · origin · pt_direction · account_id · trainer_id |
| `ot_log` | OT 관찰·클로징 | user_id, ot_round(1/2), report(jsonb, 2차 브리핑 캐시), closing_result/approach/reason/reapproach_at, closing_detail(jsonb) |
| `session_log` | 계약(PT) | user_id, trainer_id, sessions_total, price_per_session, amount_total, counts_as_revenue, kind(new/reregister), started_at, reg_result/reason/reapproach_at, report(jsonb, 재등록 브리핑 캐시) |
| `daily_workout_log` | 수업 로그(=차감) | user_id, contract_id, session_at, source(manual/voice/noshow), ai_summary, raw_voice_text, sent_at, voided |
| `appointment` | 예약(스케줄) | account_id, trainer_id, user_id, start_at, status, log_id |
| `pay_policy` | 급여 구간표 | min_amt, max_amt, base_pct, incentive_type/value |
| `inbody_log` | 인바디 수기(신규) | user_id, measured_at, weight, skeletal_muscle, body_fat_mass, body_fat_pct, bmr, visceral_fat_level, note |
| `center_machine` | 센터 머신 옵션 | brand, name |

- **급여 공식:** 급여 = (이달 완료 수업의 회당단가 합) × 구간% + 인센. 구간%는 이달 총매출로 결정. 노쇼(차감분)는 포함, 보강(계약없음)·voided 제외.
- **진짜 vs 데모:** 배관(등록·저장·조회·복사)·음성AI·OT브리핑·재등록·급한불·인바디·매출/급여/클로징 집계 = **실연동**. 남은 데모: 재등록 CRM '정적 대본' 일부, admin **QC 섹션(TRAINERS 하드코딩)·카피봇 문장 템플릿**.

---

## 5. ★ 보안·수정 필요 목록 (개발자에게 물어볼 것)

### 5.1 보안·격리
1. **트레이너 스코프 부재(부분):** `daily_workout_log`·`ot_log`·`inbody_log`는 **계정 스코프만**(트레이너별 격리 아님). 정상 UI 동선엔 안 새지만 직접 REST 호출 방어는 없음. → 파일럿 신뢰 하 무방하나, 필요 시 `trainer_id` 기반 RLS 추가할지?
2. **오프보딩 구멍:** 트레이너 `active=false`로 비활성해도 **RLS 헬퍼가 active를 안 봄** → 접근 차단이 안 됨. → auth ban 또는 헬퍼에 `and active` 필요.
3. **service_role 키:** `/api/create-trainer`가 service_role 사용(RLS 우회). 서버 전용 유지·브라우저/깃 절대 금지 — 노출 여부 점검 요청.
4. **API 라우트 보호:** `/api/voice-log`·`/api/ot-brief`에 인증/레이트리밋이 있는지? (현재 로그인 세션 전제지만 라우트 자체 인증 검증 여부 확인.)
5. **프롬프트 인젝션:** 회원 필드(name·job·pain·pt_direction)·트레이너 입력(급변상황·수업기록)이 프롬프트에 그대로 삽입됨. 악의적 입력이 지시를 뒤엎을 여지(내부 도구라 위험 낮지만 점검 가치).

### 5.2 배포 전 필수
6. **시뮬 데이터 teardown:** `residence='SIM-데이터'` 회원·계약·수업·예약·클로징·인바디 삭제(seed 하단 블록).
7. **개인정보 동의 절차:** 실회원 입력 전 수집·활용 동의.
8. **마케팅 카피 의료·과장 표현** 검토(치료/완치 금지).
9. **데모 라벨:** 아직 데모인 것(admin QC 등) "데모" 표기 확인.

### 5.3 미완 UI/기능 (백로그)
- pay_policy 편집 UI(원장이 구간·인센 수정 — 현재 DB 직접).
- 오프보딩 UI(트레이너 비활성 + 접근차단).
- 비번 변경 UI · 초대 메일(SMTP) — 현재 임시비번 수동.
- 회원 기본정보 수정 UI.
- 스케줄: 반복 예약·시간변경·완료취소.
- admin QC 실데이터화(현재 TRAINERS 하드코딩) + 카피봇(행동 계측 선행).

### 5.4 코드 구조
- 큰 파일: `PtWorkoutTab`·`SecondOTTab`(~860줄)·`app/admin/page.jsx` — 필요 시 추가 분리.
- 테스트 프레임워크 없음(테스트 러너·테스트 파일 0).

---

## 6. ★ 프롬프트 손볼 후보 (튜닝 포인트)

> 프롬프트는 전부 **서버 파일**에 있음: 음성일지=`app/api/voice-log/route.js`(`SUMMARY_SYSTEM`), 브리핑=`app/api/ot-brief/route.js`(`PREAMBLE` + `firstPrompt`/`secondPrompt`/`reregisterPrompt`/`acutePrompt`).

1. **음성일지 `method` 깊이(방금 Sonnet+few-shot로 강화):** 여전히 얇으면 few-shot 예시를 2~3개로 늘리거나 큐 개수 하한(3~6→5~8) 상향. 반대로 너무 길면 상한.
2. **음성일지 homework vs method 역할 분리:** 현재 method=운동별 실행큐, homework=집에서 참고할 종합팁. 겹치면 homework 지침을 더 명확히.
3. **1차(Haiku) 장황함·필드명 누출:** Haiku가 값에 스키마 키를 흘리는 상습 지점 있어 `sanitizeFieldNames`로 방어 중. 품질 아쉬우면 1차도 Sonnet 검토(비용↑).
4. **2차 클로징 화법(황현진式):** paint(일상비유)·So what?·가정종결 톤. 회원 세계 언어로 비유 개인화 지침 강화 여지.
5. **sales_intensity(soft/standard/strong)** 체감이 약하면 각 강도의 '선명도' 예시를 프롬프트에 더 구체화.
6. **재등록 objections 카테고리**(money/time/…): 실데이터 보며 카테고리·문구 다듬기.
7. **급한불 의료 경계:** safety 우선순위·"넘지 말 선" 문구가 충분히 보수적인지(법적 리스크 관점) 검토.
8. **PREAMBLE(공통):** 톤 전체의 뿌리 — 손대면 4개 phase 다 흔들리니 신중. "압박 아닌 공감" 원칙이 핵심.

---

## 7. 개발자에게 바로 물어볼 질문(요약)

1. `/api/*` 라우트에 서버측 인증·레이트리밋을 넣을까? (현재 세션 전제만)
2. `daily_workout_log`·`ot_log`·`inbody_log`에 trainer_id RLS를 추가할 가치가 있나? (파일럿 규모 대비)
3. 오프보딩(active=false) 접근차단을 RLS 헬퍼 `and active`로 할지, auth ban으로 할지?
4. service_role 키 노출 경로(빌드·로그·클라 번들) 점검 결과는?
5. 프롬프트 인젝션(회원/트레이너 입력 → 프롬프트) 방어를 넣을 가치가 있나?
6. Sonnet phase들 지연(최대 ~1분) — 타임아웃/스트리밍/캐시 전략 추가할지?
7. 배포 전 teardown SQL·개인정보 동의·데모 라벨 체크리스트 최종 확인.
```
