# v2 스펙 — #4 트레이너 프로필 → 맞춤 세일즈 (1·2·재등록 3 phase)

> 역할·흐름: 웹Claude(이 스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · `git show --stat HEAD`). SQL=**이번엔 없음**(`trainer_profile` 이미 적용됨). 환경: PowerShell(`C:\Users\tig00\pt-navigator`) · lint=`npm.cmd run lint` · 폰=Vercel 하드리프레시(`https://pt-navigator.vercel.app`).
> 선행 읽기 완료: `TrainerProfileSettings.jsx` · `docs/migrations/2026-07-12-trainer-profile.sql` · `app/api/ot-brief/route.js`(PREAMBLE·first/second/reregister/acute) · `lib/requireTrainer.js` · `lib/authHeader.js` · `lib/labels.js` · 클라 3 호출부.

---

## 0. 목표 & 확정된 설계 결정

**목표:** `trainer_profile`(자신있는 방향·선호 세일즈 강도·MBTI·한줄소개)을 OT 여정 AI 브리핑에 주입해, **회원 목적은 그대로 두되 '이 트레이너가 자기 입으로 낼 수 있는 결'로 멘트를 개인화**한다. 대상 = **1차(`first`)·2차(`second`)·재등록(`reregister`)** 3 phase. **급한불(`acute`)은 제외**(의료 안전 — 세일즈 개인화가 끼면 안 됨).

**확정 결정 2개(트레이너 승인):**
1. **전달 경로 = 서버가 직접 fetch(Option A).** `requireTrainer`가 이미 인증된 클라(`sb`)와 `user.id`를 갖고 `trainer.active`를 조회 중 → **ot-brief 라우트가 `trainer_profile` 1행만 더 읽어** 프롬프트에 주입. **클라 3파일(`FirstOTAssist`·`SecondOTTab`·`PtReRegTab`) 무변경.** 장점: 통합점 1곳 · 항상 최신(클라 캐시 stale 없음) · 위조 불가 · `obsHash` 캐시키 불변.
2. **캐시 무효화 = 안 함(재생성 버튼).** 프로필은 트레이너의 느린 속성이라, 기존 캐시(2차 `report.brief`·재등록 `reg_brief`·1차 `first_assist`)는 그대로 두고 트레이너가 원하면 각 탭 '재생성'으로 갱신. **staleness 해시(`obsHash`)·캐시 로직 무변경.** → 프로필을 나중에 채운 트레이너는 새 회원 브리핑부터 자동 반영, 기존 캐시는 재생성 시 반영(이 점만 인지).

**핵심 원칙(프롬프트 설계의 뿌리 — 아래 2절에서 강제):**
- 🧭 **회원 목적(goal)이 여전히 최우선 렌즈.** 프로필은 **방향을 바꾸지 않고 '전달'만 조정**한다. 회원 목적을 트레이너 취향에 맞춰 왜곡 금지.
- ⚖️ **회원별 세일즈 강도(2차 `sales_intensity`)가 프로필 강도보다 우선.** 둘 다 '강하게'라도 압박으로 합산 금지(근거만 더 또렷이). 1차·재등록엔 회원별 강도 지시가 없으니 프로필 강도가 기본 선명도.
- 🛡️ **PREAMBLE 윤리 그대로 상속.** 프로필이 '강하게'여도 허위 긴급성·공포·죄책감은 여전히 금지.
- ♻️ **회귀 안전 제1원칙.** 프로필이 비었거나(미작성) 데모/미인증이면 **프롬프트가 기존과 바이트 동일**해야 한다.

**건드리는 파일(단 2개):** `lib/requireTrainer.js` · `app/api/ot-brief/route.js`. **그 외 전부 무변경.**

---

## 1. 서브커밋 구성

한 기능·한 파일쌍이라 **단일 커밋** 권장. 논리 순서:
- **P1. `requireTrainer` — `sb` 반환**(auth 객체에 인증 클라 노출). 하위호환(필드 추가만) → voice-log 무영향.
- **P2. `route.js` — 프로필 조회 + 3 phase 주입**(헬퍼 `trainerProfileBlock` 신규 · first/second/reregister 시그니처에 `profile` 추가 · acute 무주입).

제안 커밋 메시지:
`feat(ot-brief): 트레이너 프로필 주입 — 1·2·재등록 맞춤 세일즈(서버 조회·클라 무변경)`

---

## 2. P1 — `lib/requireTrainer.js` (auth 객체에 `sb` 노출)

지금 성공 리턴은 `{ ok: true, user: u.user }`. **인증된 클라 `sb`를 그대로 반환**해 라우트가 프로필 조회에 재사용(새 클라 생성·추가 인증 없음).

```js
// (변경) 성공 리턴에 sb 추가 — 라우트가 RLS-스코프 조회에 재사용.
if (!throttle(u.user.id)) {
  return { ok: false, res: Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 }) };
}
return { ok: true, user: u.user, sb };   // ← sb 추가
```

- **데모 브랜치는 그대로:** 파일 상단 `if (!url || !anon) return { ok: true, user: null };` — `sb` 없음(undefined). 라우트가 `if (auth.sb && ...)`로 가드하므로 데모 모드는 프로필 조회 스킵 = 기존 동작 보존.
- **하위호환:** 반환 객체에 필드 하나 추가일 뿐. `voice-log/route.js`는 `auth.ok`/`auth.user`만 쓰므로 무영향(착수 시 `Get-ChildItem app -Recurse -File | Select-String 'requireTrainer'`로 소비처 확인 — 구조분해로 `sb` 없다고 깨지는 곳 없음).

---

## 3. P2 — `app/api/ot-brief/route.js`

### 3-a. import 추가(파일 상단)

```js
import { CLOSING_APPROACH_OPTS, SALES_INTENSITY_OPTS, labelOf } from "@/lib/labels";
```
> `lib/labels.js`는 순수 모듈("use client"·react 의존 0) → 서버 라우트 import 안전. 라벨 하드코딩 없이 재사용(자신있는 방향·강도를 한글로 변환).

### 3-b. 헬퍼 `trainerProfileBlock(profile)` 신규 (first/second/reregister 공용)

`firstPrompt` **위**(또는 `PREAMBLE` 아래, `g` 헬퍼 근처)에 추가. **프로필이 전부 비면 `""` 반환 → 회귀 안전(바이트 동일).**

```js
// 트레이너 프로필 블록 — first/second/reregister 공용. 전부 비면 "" (프로필 없는 트레이너는 기존과 100% 동일).
// ⚠️ acute(급한불)엔 주입 금지(의료 안전 — 세일즈 개인화가 끼면 안 됨).
function trainerProfileBlock(profile) {
  const p = profile || {};
  const approaches = Array.isArray(p.strong_approaches) ? p.strong_approaches.filter(Boolean) : [];
  const style = p.sales_style || "";
  const mbti = (p.mbti || "").trim();
  const bio = (p.bio || "").trim();
  // 전부 비었으면 블록 생략 → 회귀 안전.
  if (!approaches.length && !style && !mbti && !bio) return "";

  const approachLabels = approaches.map((v) => labelOf(CLOSING_APPROACH_OPTS, v)).join(", ");
  const styleLabel = style ? labelOf(SALES_INTENSITY_OPTS, style) : "";
  const lines = [
    approachLabels ? `· 자신있는 세일즈 방향: ${approachLabels}` : null,
    styleLabel ? `· 평소 선호 세일즈 강도: ${styleLabel}` : null,
    mbti ? `· 트레이너 MBTI: ${mbti}` : null,
    bio ? `· 트레이너 한줄소개/성향: ${bio}` : null,
  ].filter(Boolean).join("\n");

  return `
[트레이너 프로필 — 이 도구를 쓰는 '트레이너 본인'의 성향 (회원 아님)]
${lines}

[프로필 활용 규칙 — 방향이 아니라 '전달'만 조정한다]
- ★대전제: 출력의 중심축은 여전히 '회원의 목적(goal)'이다. 프로필은 방향을 바꾸는 게 아니라,
  같은 방향을 '이 트레이너가 자기 입으로 자연스럽게' 낼 수 있게 다듬는 재료다. 회원 목적을
  트레이너 취향에 맞춰 왜곡하지 마라.
- 자신있는 방향: 회원 목적이 이 방향과 맞물리면 그 쪽 근거·비유·멘트를 더 확신 있고 구체적으로.
  반대로 회원 목적이 트레이너의 자신있는 방향 '밖'이면(덜 익숙한 영역), 멘트를 더 또렷한 발판으로
  줘서 트레이너가 그 자리에서 바로 쓸 수 있게 하라(약한 곳을 보강).
- 세일즈 강도: '회원별 세일즈 강도 지시'가 따로 있으면 그것이 우선이다(프로필로 덮어쓰지 마라).
  그런 지시가 없으면 이 프로필 강도를 기본 선명도로 삼되, 강해도 '근거의 세기'까지다 —
  압박·공포·허위 긴급성은 프로필이 강하다고 허용되지 않는다(PREAMBLE 윤리 그대로).
  회원별 강도와 프로필 강도가 둘 다 '강하게'라도 압박으로 합산하지 마라(근거만 더 또렷이).
- MBTI·한줄소개: 트레이너의 '말투 톤'을 맞추는 힌트로만(있을 때만). 공감형이면 공감 결,
  계획형이면 단계·로드맵 결로 멘트 문장을 고른다. 단정·과장 금지, 비어 있으면 언급 금지.
  ※ 이건 '트레이너' 성향이다 — 회원의 MBTI/직업 개인화(비유 규칙)와 헷갈리지 마라.
`;
}
```

> 반환 문자열은 **선두 개행(`\n`)으로 시작** → 아래 주입점에서 앞줄 뒤에 자연히 붙고, 빈 프로필이면 `""`라 앞줄만 남아 **기존과 동일**. (기존 `caseInputBlock` 삽입 패턴과 동일 관습.)

### 3-c. 3개 프롬프트 시그니처 + 주입점

**주의:** 세 함수 모두 **`profile`을 마지막 파라미터로** 추가하고, **빈 프로필이면 바이트 동일**하도록 반환값이 `""`인 지점에 삽입.

**① `firstPrompt(member, packages)` → `firstPrompt(member, packages, profile)`**
`[내 PT 패키지]` 블록(`${pkgBlock}`) **바로 아래, `[이 도구의 정체성...]` 위**에 삽입(트레이너-컨텍스트끼리 묶음):

```js
${pkgBlock}
${trainerProfileBlock(profile)}
[이 도구의 정체성 — 모든 출력에 관통]
```
> 빈 프로필: `${trainerProfileBlock(profile)}`→`""` → `${pkgBlock}\n\n[이 도구의 정체성...]`로 기존과 동일(현재도 pkgBlock과 정체성 블록 사이 빈 줄 1개).

**② `secondPrompt(member, report, cases = [], caseTier = "tentative")` → `...caseTier = "tentative", profile = null)`**
`${caseInputBlock}` **아래, `이 '1차 관찰'을 유일한 근거로...` 위**에 삽입:

```js
${caseInputBlock}
${trainerProfileBlock(profile)}
이 '1차 관찰'을 유일한 근거로 2차를 설계하라.
```
> 회원별 `sales_intensity`(관찰 기록 `r.sales_intensity`)가 이미 프롬프트에 있음 → 프로필 활용 규칙의 "회원별 강도 우선"이 여기서 실제로 작동.

**③ `reregisterPrompt(member, ctx)` → `reregisterPrompt(member, ctx, profile)`**
`[최근 수업 기록]` 목록 **아래, `이 'PT 관리 데이터'를 유일한 근거로...` 위**에 삽입:

```js
${recent.length ? recent.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}
${trainerProfileBlock(profile)}
이 'PT 관리 데이터'를 유일한 근거로 재등록 대화를 설계하라. 없는 성과·에피소드를 지어내지 마라.
```

> **acutePrompt는 손대지 않는다**(파라미터·주입 없음). 의료 안전 경계 유지.

### 3-d. POST 핸들러 — 프로필 조회 + 호출부 배선

`phase` 검증 직후(프롬프트 조립 전)에 프로필 조회:

```js
// Option A — 서버가 트레이너 프로필을 직접 조회(클라 무변경). 데모/미인증(sb 없음)·acute면 null → 프롬프트 기존과 동일.
let trainerProfile = null;
if (auth.sb && auth.user?.id && phase !== "acute") {
  const { data: tp } = await auth.sb
    .from("trainer_profile")
    .select("strong_approaches, sales_style, mbti, bio")
    .eq("trainer_id", auth.user.id)
    .maybeSingle();
  trainerProfile = tp || null;
}
```

프롬프트 삼항에 `trainerProfile` 전달(acute만 그대로):

```js
const prompt =
  phase === "first"      ? firstPrompt(member, packages, trainerProfile)
  : phase === "second"   ? secondPrompt(member, report, closingCases, caseTier, trainerProfile)
  : phase === "reregister" ? reregisterPrompt(member, ptContext, trainerProfile)
  : acutePrompt(member, acuteContext);   // ← acute 무주입(의료 안전)
```

- **RLS:** `trainer_profile` sel 정책 = `account_id = auth_account_id()`. 서버가 트레이너 본인 JWT-클라(`auth.sb`)로 `.eq("trainer_id", 본인)` 조회 → 본인 행 통과. `maybeSingle()`이라 프로필 없으면 `null`.
- **비용:** first는 Sonnet ~30~60s 생성 → 프로필 select 1회(~수십 ms)는 무시 수준. acute는 `phase !== "acute"` 가드로 조회 자체 스킵.

### 3-e. (선택) 필드명 누출 방어 — `FIELD_TERMS`

방어적으로 2개만 추가(값이 코드키라 오치환 위험 낮음). **mbti/bio는 자연어라 추가 금지**(오치환 위험):

```js
["strong_approaches", "자신있는 방향"],
["sales_style", "세일즈 강도"],
```
> `sales_intensity`는 이미 등록됨. 스키마 키가 아니라 입력 컨텍스트라 누출 확률은 낮지만, 프롬프트에 문자열로 들어가니 저비용 방어.

### 3-f. (선택) 파일 헤더 주석 갱신

상단 `// 순수 생성기 — 캐시는 클라이언트가 담당.` 옆에 한 줄: `// (auth 클라로 trainer_profile 조회해 first/second/reregister 프롬프트에 주입 — acute 제외)`.

---

## 4. 왜 이렇게(설계 근거 · 검토용)

- **회원 목적 최우선 유지:** `firstPrompt`가 이미 "운동목적(goal) = 최우선 렌즈"를 강하게 못박음. 프로필 규칙을 **"방향 아닌 전달만 조정"**으로 좁혀 이 축을 침범하지 않게 함. 자신있는 방향은 (a)회원 목적과 겹칠 때 선명도↑ (b)어긋날 때 보강 발판↑ — **하이재킹이 아니라 트레이너 역량 보정**.
- **강도 이중적용 방지:** 2차엔 회원별 `sales_intensity`가 이미 있음. 프로필 `sales_style`이 이걸 덮으면 트레이너의 회원별 판단(⭐⭐ 스파링 파트너 철학)을 무너뜨림 → **회원별 우선 + 합산 금지** 명시. 1차·재등록엔 회원별 강도가 없어 프로필이 기본 선명도로 자연히 작동.
- **트레이너 vs 회원 혼동 차단:** 블록 제목에 "**트레이너 본인**(회원 아님)" 명시 + MBTI 규칙에 "회원 개인화와 헷갈리지 마라" 못박음(회원 mbti/job 비유 규칙과 분리).
- **회귀 안전:** 빈 프로필→`""`, 데모/미인증→조회 스킵, acute→무주입. 세 경로 모두 기존 바이트 동일.
- **캐시 정책:** `obsHash`는 관찰만 봄 → 프로필 변경은 자동 무효화 안 됨. 트레이너 승인대로 '재생성 버튼'으로 처리(느린 속성이라 수용). 캐시키 불변 = 사이드이펙트 0.

---

## 5. 검증 체크리스트 (커밋 전)

1. **`npm.cmd run lint` green** · 미사용 import 0(labels 3개 실제 사용).
2. **회귀(빈 프로필):** 프로필 없는(혹은 전부 빈) 트레이너로 1차·2차·재등록 생성 → **기존과 동일 동작**(블록 미출현). 콘솔/네트워크로 500 없음.
3. **데모 모드:** 키 없이(`supabase=null`) 앱 → `auth.sb` 없음 → 프로필 조회 스킵, 각 데모 폴백 정상.
4. **주입 확인(프로필 채운 실계정):** 설정 탭 '내 프로필'에서 자신있는 방향(예: 통증개선) + 강도(강하게) + 한줄소개(예: "공감형, 통증개선 특화") 저장 → 각 탭 **재생성** → 멘트 톤이 공감 결·통증 방향 근거로 또렷해지는지, 회원 목적이 외형인 회원에선 **외형이 여전히 중심축이고 프로필이 방향을 안 뒤엎는지** 눈검.
5. **강도 우선순위(2차):** 회원 관찰에 `sales_intensity=soft`인데 프로필=강하게 → **soft가 이기는지**(부드러운 land·다음 접점 톤 유지, 압박으로 안 튐).
6. **acute 무영향:** 급한불 탭 생성 → 프로필 주입 흔적 0(safety·avoid·alternatives 스키마 그대로), 조회도 안 일어남.
7. **RLS:** 다른 트레이너 프로필이 안 섞이는지(본인 `trainer_id` 조회라 자연 격리) — 실계정 2개면 교차 확인.
8. **voice-log 무회귀:** `requireTrainer` 소비처(`Get-ChildItem app -Recurse -File | Select-String 'requireTrainer'`)에서 `sb` 미사용으로 깨지는 곳 없음 확인, 음성일지 1회 생성 정상.

---

## 6. 클로드코드 레일(착수 지침)

- **건드릴 파일 딱 2개:** `lib/requireTrainer.js`(리턴에 `sb`) · `app/api/ot-brief/route.js`(import·헬퍼·3 시그니처·주입점·POST 조회+배선·선택 FIELD_TERMS·선택 헤더). **클라 3파일·SQL·labels·다른 어떤 파일도 손대지 말 것.**
- **완전성 대조(grep):** 착수 후 `Select-String 'trainerProfileBlock'`(정의 1 + 호출 3 = 4곳) · `Select-String 'profile'`(3 시그니처 + 헬퍼) · `Select-String 'acute'`(주입 삼항에서 acute만 무주입인지) 대조.
- **불확실하면 멈추고 질문**(특히 주입점의 앞뒤 텍스트가 스테이징본과 다르면 — mtime 확인).
- 파일지정 `git add lib/requireTrainer.js app/api/ot-brief/route.js` · `git add .` 금지 · lint 후 커밋 · 직후 `git show --stat HEAD`.

---

## 7. 스코프 밖(후속 백로그 · 이번에 안 함)

- **배정 매칭**(원장이 회원↔트레이너를 프로필로 매칭) — 별도 스프린트.
- **급한불(acute) 프로필 주입** — 의료 안전상 의도적 제외(재검토 시 별도 결정).
- **프로필 변경→캐시 자동 무효화**(obsHash에 프로필 지문 포함) — 이번엔 재생성 버튼으로 수용. 필요해지면 3탭 캐시 메타에 프로필 해시 추가하는 후속.
- **음성일지(voice-log) 개인화** — 이번 스코프 아님(세일즈 3 phase만).
