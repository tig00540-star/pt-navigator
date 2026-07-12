# v2 기능D (D-3) 스펙 — 2차 OT 브리핑에 "내 과거 클로징 케이스" 근거 주입

> 역할·흐름: 웹Claude(이 스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 상위 설계 = `docs/v2-closing-cases-D3-design-note.md`(권위) + MASTERPLAN(스파링 파트너·세일즈=책임). 이 문서 = 그 설계의 "2차 1차 증분" 구현 지시.
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · `git show --stat HEAD`). SQL 없음(이번 증분은 **읽기만**).

---

## 0. 이번 증분의 범위 (합의)

- **딱 2차만.** `SecondOTTab` + `app/api/ot-brief` `secondPrompt`에만 케이스 근거를 물린다.
- **코어 3장치만:** ① 진단(진짜 장애물) · ② 성공 리딩(통한 접근 활용) · ③ 다른 벡터(막힌 것 반복 차단) + "네 판단은?" 넛지.
- **후속(이번 X):** 1차(`FirstOTAssist`) 대칭 주입 · 반복패턴=블라인드스팟(cross-case) · 결정권자 맞춤 키트(비금액 근거·가격표 선행). → §10.
- **게이트 상태 = OFF.** 지금 성공 케이스 0~2건이라 실사용자에겐 안 보인다. **dark 빌드** — 코드는 넣되 5건 되면 자동 발동. 개발 중 확인은 **오버라이드 플래그 + 데모 케이스 픽스처**로(§3).
- **회귀 안전 제1원칙:** 게이트 OFF / 케이스 미전송이면 `secondPrompt` 출력·캐시 스키마가 **지금과 100% 동일**해야 한다(케이스 블록·`case_feedback`은 순수 additive).

---

## 1. DB — 마이그레이션 불필요 (읽기 전용)

이번 증분은 새 컬럼·정책이 **없다.** 근거:

- 재료는 이미 캡처 중 — `ot_log.closing_result` / `closing_approach` / `closing_reason` / `closing_detail(jsonb {approach,reaction,outcome})` / `closing_profile(jsonb {age,job,residence,mbti,pain,goal,goal_type})`. (C 스프린트에서 round1·round2 둘 다 적재 중.)
- D-3은 그걸 **조회해서 프롬프트에 실을 뿐**이라 쓰기 없음 → RLS UPDATE 정책 이슈(현장 트러블슈팅) 무관.
- 단, `ot_log`는 **계정 스코프만**이고 trainer_id 컬럼이 없다 → "내 케이스"는 `user_table.trainer_id` **조인으로** 좁힌다(§2).

---

## 2. 케이스 조회 — `lib/memberStatus.js`에 함수 2개 신설

`ot_log`엔 trainer_id가 없으니 `user_table`를 `!inner` 임베드로 조인해 트레이너 스코프를 건다(PostgREST 패턴). 현재 회원 본인 행은 제외.

```js
// lib/memberStatus.js (기존 export 패턴·데모가드 준수)

// (a) 게이트용 성공 케이스 수 — 본인 트레이너, 현재 회원 제외.
export async function closingSuccessCount(supabase, trainerId, excludeUserId) {
  if (!supabase || !trainerId) return 0;
  let q = supabase
    .from("ot_log")
    .select("id, user_table!inner(trainer_id)", { count: "exact", head: true })
    .eq("user_table.trainer_id", trainerId)
    .eq("closing_result", "success");
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { count } = await q;
  return count || 0;
}

// (b) 재료용 케이스 목록 — 성공+실패+보류(closing_detail 있는 것 위주), 최근순, 익명 프로파일만.
//     name 등 식별정보는 싣지 않는다(프라이버시+토큰). closing_profile + 3박자 + 카테고리만.
export async function closingCasesForTrainer(supabase, trainerId, { excludeUserId, limit = 12 } = {}) {
  if (!supabase || !trainerId) return [];
  let q = supabase
    .from("ot_log")
    .select("closing_result, closing_approach, closing_reason, closing_detail, closing_profile, user_table!inner(trainer_id)")
    .eq("user_table.trainer_id", trainerId)
    .in("closing_result", ["success", "fail", "hold"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { data } = await q;
  return (data || [])
    .filter((r) => r.closing_detail || r.closing_result === "success") // 3박자 있거나 성공이면 재료
    .map((r) => ({
      result: r.closing_result,
      approach: r.closing_approach || null,
      reason: r.closing_reason || null,
      profile: r.closing_profile || null,
      detail: r.closing_detail || null,
    }));
}

// (c) 게이트 판정 — 티어까지. (설계노트: 5~9 잠정, 10+ 확신, 5 미만 OFF)
export function closingCaseGate(successCount) {
  if (successCount >= 10) return { on: true, tier: "confident" }; // 뚜렷
  if (successCount >= 5)  return { on: true, tier: "tentative" }; // 잠정 경향
  return { on: false, tier: "off" };
}
```

> 조인 필터 주의: PostgREST에서 `.eq("user_table.trainer_id", …)`는 `!inner` 임베드가 있어야 실제 필터로 먹는다. count 쿼리도 동일 임베드 필요. 클로드코드가 로컬에서 한 번 실측(0행/정상행)해서 조인 문법 확인할 것.

---

## 3. 게이트 + 개발 오버라이드 + 데모 케이스 픽스처

게이트 OFF라 개발 중엔 아무것도 안 보인다 → 확인 수단 필요. 앱의 데모-폴백 패턴을 그대로 빌린다.

```js
// SecondOTTab.jsx 상단 (모듈 스코프)
// 개발용: URL에 ?d3=1 이면 게이트 무시 + 실 케이스 5건 미만이면 데모 케이스로 렌더/프롬프트 경로 점검.
// 실사용자는 이 플래그를 안 쓰므로 영향 0. 커밋 전 남겨둬도 되지만(내부툴), ⑦ 상용화 때 제거 권장.
const D3_FORCE = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("d3") === "1";

// 명백히 가짜인 데모 케이스(오버라이드일 때만·실데이터 5건 미만일 때만 사용).
const DEMO_CLOSING_CASES = [
  { result: "success", approach: "value", reason: null,
    profile: { age: 41, job: "개발자", residence: "판교", mbti: "INTJ", pain: "목·어깨", goal: "체형개선", goal_type: "appearance" },
    detail: { approach: "오늘 자극 들어간 순간 사진 보여주고 '혼자선 이 세팅 못 잡는다'로 착지",
              reaction: "'확실히 다르네요' 하며 스스로 다음 주 얘기 꺼냄", outcome: "10회 등록" } },
  { result: "hold", approach: "pain", reason: "decider",
    profile: { age: 36, job: "주부", residence: "분당", mbti: null, pain: "허리", goal: "통증개선", goal_type: "pain" },
    detail: { approach: "통증 개선 근거로 바로 가격 제안", reaction: "'남편이랑 상의할게요'", outcome: "보류·2주 뒤 재접근" } },
];
```

게이트·오버라이드 흐름:
- `gate.on === true` (실 성공 5건+) → 실 케이스 전송.
- `gate.on === false` **AND** `D3_FORCE()` → 실 케이스가 있으면 실 케이스, 없으면 `DEMO_CLOSING_CASES` 전송(개발 확인용).
- 그 외 → **케이스 미전송**(body에 아예 `closingCases` 없음 = 지금 동작).

---

## 4. 클라이언트 — `SecondOTTab.jsx`

### 4-1. 케이스 로드 (회원 변경 useEffect 안, 기존 Promise.all 근처)

`member.trainer_id`가 있으면 그걸로 스코프(P4에서 mapMemberRow에 추가됨). 없으면 스킵(게이트 자동 OFF). 새 state: `caseData`(목록) · `caseGate`({on,tier}).

```js
// 기존 res1/res2 조회 뒤에 이어서 (같은 useEffect, cancelled 가드 공유)
const tid = member.trainer_id || null;
if (tid) {
  const cnt = await closingSuccessCount(supabase, tid, member.id);
  const gate = closingCaseGate(cnt);
  let cases = [];
  if (gate.on) cases = await closingCasesForTrainer(supabase, tid, { excludeUserId: member.id });
  else if (D3_FORCE()) {
    const real = await closingCasesForTrainer(supabase, tid, { excludeUserId: member.id });
    cases = real.length ? real : DEMO_CLOSING_CASES;
  }
  if (!cancelled) { setCaseGate(gate.on || D3_FORCE() ? { on: true, tier: gate.tier === "off" ? "tentative" : gate.tier } : gate); setCaseData(cases); }
} else if (!cancelled) { setCaseGate({ on: false, tier: "off" }); setCaseData([]); }
```

### 4-2. 브리핑 요청에 실어 보내기 (`generateBrief` body)

현재:
```js
body: JSON.stringify({ phase: "second", member, report: obsReport }),
```
변경 — 케이스가 있을 때만 additive로 첨부(없으면 필드 자체를 안 넣어 서버가 지금처럼 동작):
```js
const useCases = caseGate?.on && caseData?.length;
body: JSON.stringify({
  phase: "second",
  member,
  report: obsReport,
  ...(useCases ? { closingCases: caseData, caseTier: caseGate.tier } : {}),
}),
```

### 4-3. 렌더 — `case_feedback` 블록

브리핑 렌더 영역(등록 당위성 briefing 근처, closing 위쪽 권장)에 `brief.case_feedback` 있을 때만 카드 추가. 기존 `renderExample`(낭독 방지·흐림 장치) 재사용해 `example`을 '예시' 라벨로. 톤 배지로 `caseTier`(잠정/뚜렷) 표시.

```jsx
{brief?.case_feedback && (
  <section className="...zinc 카드...">
    <Eyebrow icon={History}>내 과거 케이스 거울 {briefMeta?.caseTier === "confident" ? "· 뚜렷" : "· 잠정 경향"}</Eyebrow>
    {/* diagnosis: 진짜 장애물 진단(거울 톤) */}
    {/* proven_lead: 통한 접근 → 이렇게 리딩 */}
    {/* avoid_repeat: 있으면 '이번엔 다른 벡터' (없으면 숨김) */}
    {/* example: renderExample()로 '예시' 라벨·흐림 */}
    {/* your_read: "네 판단은?" 넛지 — 끝에 옅은 문구 */}
  </section>
)}
```

> 아이콘: `History`(lucide, 이미 트리 안). 색은 C 토큰 맵 경유(동적 클래스 문자열 금지 — CLAUDE.md UI 규칙).
> `caseTier`를 렌더에서 쓰려면 briefMeta에 실어 캐시(§7).

---

## 5. 서버 — `app/api/ot-brief/route.js`

### 5-1. body 수신 + secondPrompt 시그니처

```js
const { phase, member, report, ptContext, acuteContext, packages, closingCases, caseTier } = body || {};
// ...
: phase === "second" ? secondPrompt(member, report, closingCases, caseTier)
```

`closingCases`가 없거나 빈 배열이면 secondPrompt는 **지금과 동일한 프롬프트**를 만든다(아래 조건부 블록·스키마 미출력).

### 5-2. `secondPrompt`에 조건부 케이스 블록

`function secondPrompt(member, report, cases = [], caseTier = "tentative")` 로 확장. 유효 케이스가 있을 때만 아래 두 조각을 삽입:

(A) **입력 블록** — `[1차 관찰 기록]` 뒤, `이 '1차 관찰'을 유일한 근거로…` 문장 **앞**에 삽입:

```
[내 과거 클로징 케이스 — 이 트레이너 본인 것만 · 경향 신뢰도={caseTier==="confident"?"뚜렷":"잠정(케이스 아직 적음)"}]
아래는 네가 과거에 클로징한 회원들의 '익명 프로파일 + 3박자(접근·반응·결과)'다. 이번 회원과
비슷한 프로파일을 골라 case_feedback을 채워라. 이건 세일즈 대본 하달이 아니라 '거울'이다 —
네 과거를 비춰 이번 판단을 돕는 스파링이다.
 - 진단 먼저: 표면 거절(가격·망설임)이 아니라 '진짜 장애물'을 짚어라(예: '남편 상의'=가격이
   아니라 결정권이 회원한테 없던 것). 트레이너에게 '다음에도 쓸 안목'을 남겨라.
 - 성공 케이스=리딩 재료: 비슷한 프로파일에 통한 접근을 근거로, 회원이 그 욕구를 '자기 말로'
   꺼내게 어떻게 리딩할지 방향을 줘라. ⚠️ 회원 입에 트레이너 논리를 이식(외운 대사)하는 건
   역효과다 — '배우고 싶다/혼자보다 낫다'는 느낌에 스스로 도달하게 이끄는 리딩이어야 한다.
 - 막힌 케이스=다른 벡터: 같은 프레임을 반복하지 마라. 과거 이 프로파일에서 막힌 방향이 있으면
   '이번엔 그거 말고 X 방향으로' + 왜인지 명시하라(같은 실패 반복 차단).
 - 강도 가드: 압박 ≠ 정당한 강조. 강도는 근거·책임의 세기지 소진·조작이 아니다. 허위 긴급성·
   공포·죄책감·2~3시간 붙잡기 금지. 단 회원 상태가 진짜 필요하면(부상 위험 등) 책임에서 나온
   '제대로 배우셔야 한다' 강조는 정당하다(의료 단정은 여전히 금지).
 - 경향이 '잠정'이면 단정하지 말고 '아직 케이스가 적어 잠정 경향' 톤으로 하되, 반드시 채워라.
[케이스 목록] (result=success/fail/hold · profile=익명)
{cases.map((c,i)=>`${i+1}. [${c.result}] 프로파일=${JSON.stringify(c.profile)} · 접근=${c.detail?.approach ?? c.approach ?? "-"} · 반응=${c.detail?.reaction ?? "-"} · 결과=${c.detail?.outcome ?? c.reason ?? "-"}`).join("\n")}
```

(B) **출력 스키마 추가** — second 스키마 JSON에 `case_feedback` 최상위 키를 **추가**(cases 있을 때만 이 키를 스키마에 넣고, 위 [화법 원리] 뒤에 필드 설명 삽입):

```
[case_feedback — 내 과거 케이스 거울 (cases 있을 때만)]
 - diagnosis: 과거 케이스에 비춘 이 회원의 '진짜 장애물' 진단(표면 아닌 근본). 근거 얇으면
   1차 관찰로 가설. 1~2문장. [거울 톤 — 단정보다 '~로 보인다']
 - proven_lead: 비슷한 프로파일에 통한 접근을 근거로, 이번에 회원이 욕구를 '자기 말로' 꺼내게
   어떻게 리딩할지 방향. 대사 이식·낭독 금지. 1~2문장.
 - avoid_repeat: 과거 이 프로파일에서 막힌 벡터가 있으면 '이번엔 그거 반복 말고 X 방향' + 왜.
   해당 없으면 null. 1문장.
 - example: proven_lead의 한 문장 샘플('예시'·발판 — 낭독 대본 아님). 1문장.
 - your_read: 트레이너에게 사고를 되돌리는 넛지 1문장("네 판단은? 이 진단이 맞다고 보나?" 결).

  "case_feedback": { "diagnosis": "...", "proven_lead": "...", "avoid_repeat": "... 또는 null", "example": "...", "your_read": "..." }
```

> second는 `parseBrief(textOut, [])`(requiredKeys 없음)라 `case_feedback`는 최상위 additive 키로 자연히 파싱된다 — REQUIRED 목록 변경 불필요, 회귀 없음.

### 5-3. maxTokens 상향(케이스 있을 때만)

`case_feedback`가 ~300~500토큰 더 나오니 잘림 방지:
```js
const maxTokens = phase === "first" ? 8192 : (phase === "second" && closingCases?.length ? 6144 : 5120);
```

### 5-4. FIELD_TERMS에 신규 필드명 추가(값 누출 방어)

`FIELD_TERMS` 배열에 추가(sanitizeFieldNames가 값 텍스트의 스키마 키를 한글로 치환):
```js
["case_feedback", "과거 케이스 거울"],
["diagnosis", "진단"],
["proven_lead", "통한 접근 리딩"],
["avoid_repeat", "다른 벡터"],
["your_read", "네 판단"],
["caseTier", "경향 신뢰도"],
```

---

## 6. 톤 계약 (검토 기준 — 리뷰 때 이걸로 본다)

설계노트 §4·§5의 정수. 출력이 이걸 어기면 반려:

- **리딩 ≠ 대사 이식.** ✅ "회원이 '혼자보다 낫다·배우고 싶다'를 자기 말로 꺼내게 이렇게 이끌어봐" / ❌ "회원한테 '혼자선 못 잡는대요' 시켜라". 외운 티 = 역효과.
- **진단이 먼저, 대본은 나중.** 표면 거절 뒤 '진짜 장애물'을 짚어 트레이너 안목을 키운다(상향평준화). 낭독기 금지.
- **다른 벡터는 명시적으로.** 막힌 프레임 반복 차단이 이 기능의 구조적 가치.
- **거울이지 정답 하달 아님.** diagnosis·your_read는 스파링 톤(단정 자제). proven_lead·example만 구체 리딩(실전).
- **강도 = 근거·책임의 세기.** 압박·소진·허위 긴급성·공포·죄책감·의료단정 금지. 단 진짜 필요할 땐 책임에서 나온 강조는 정당(의무일 때가 있음).

---

## 7. 캐시·스테일 처리

- `case_feedback`는 생성된 `brief`(=`data`) 안에 그대로 들어가 `report.brief`로 캐시된다 — 별도 배선 불필요.
- **staleness 한계(알고 감):** `obsHash`는 '관찰' 스냅샷만 본다. 케이스가 새로 쌓여도 캐시된 case_feedback은 옛것이다. 이번 증분에선 **재생성 버튼으로 갱신**(재호출 시 최신 케이스 재조회)으로 충분. 게이트 0→ON 전환은 첫 생성 때 자연히 반영.
- 렌더에서 `caseTier` 배지를 쓰려면 `generateBrief`의 `meta`에 `caseTier: caseGate?.tier`를 추가해 캐시(§4-3). (선택 — 안 하면 배지 생략.)
- (선택·후속) 케이스 서명(성공수 등)을 otObsHash 입력에 섞어 '케이스 갱신됨' 스테일 배지까지 주는 건 오버빌드 → 지금은 생략.

---

## 8. 회귀 안전 체크(가장 중요)

게이트 OFF·오버라이드 없음(=실사용자 현재 상태)에서:
- `SecondOTTab`은 `closingCases`를 body에 **안 넣는다** → `secondPrompt(member, report, [], …)` → 케이스 블록·case_feedback **미출력** → 프롬프트·출력·캐시 스키마가 **지금과 바이트 동일**.
- 렌더도 `brief.case_feedback` 없으면 카드 자체가 안 뜸.
- 즉 D-3 코드가 들어가도 **5건 전까지 앱 동작은 완전 무변**.

---

## 9. 테스트 체크리스트 (클로드코드 로컬 + 폰)

1. `npm.cmd run lint` green.
2. **조인 스코프 실측:** `closingSuccessCount`·`closingCasesForTrainer`가 본인 트레이너 회원만 돌려주는지(다른 트레이너 케이스 안 새는지). `.eq("user_table.trainer_id", …)` + `!inner` 문법이 실제로 필터되는지 0행/정상행으로 확인.
3. **게이트 OFF 회귀:** 케이스 미전송 상태에서 2차 브리핑 생성 → case_feedback 없음, 기존과 동일 렌더·캐시. (§8)
4. **오버라이드 경로:** URL `?d3=1`로 진입 → 실 케이스 없으면 `DEMO_CLOSING_CASES`로 case_feedback 5필드 렌더 확인. proven_lead가 '대사 이식'이 아니라 '리딩'인지 눈으로(§6).
5. **maxTokens:** 케이스 동봉 시 JSON 잘림 없이 case_feedback까지 파싱되는지(parseBrief 실패 아님).
6. **필드명 누출:** 값 텍스트에 `case_feedback`·`proven_lead` 등 안 뜨는지(sanitize 동작).
7. **캐시 보존:** case_feedback 포함 생성 후, ㉠ 클로징 저장(saveClosing)이 `report`(브리핑) 안 덮고 closing_* 만 갱신하는지(기존 coexist 규칙 유지).
8. 폰: Vercel 배포본 하드리프레시 후 오버라이드로 1회 육안.

---

## 10. 후속(다음 증분 — 이번 X)

- **D-3-1차:** `FirstOTAssist`에 동일 패턴(케이스 로드→body→firstPrompt 조건부 블록·case_feedback). 1차는 관찰이 없어 '가설' 톤이라 진단 문구만 조정.
- **블라인드스팟(cross-case):** 최근 보류 N건의 reason·approach 분포를 집계해 "네 약점 = 결정권 파악 전 가격부터" 같은 자기패턴 1줄. 별도 집계 함수(`closingReasonStats` 재활용) + 프롬프트 조각. 10건+에서 의미.
- **결정권자 키트:** decider로 진단되면 비금액 근거(오늘 통증0 순간·3개월 방향)·결정권자 관심사 번역 + (금액 자료는 **가격표 테이블 선행** 후). §3 설계노트.
- **스테일 고도화:** 케이스 서명을 스테일 배지에 반영(선택).
