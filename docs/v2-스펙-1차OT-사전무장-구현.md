# v2 구현 스펙 — 1차 OT 사전무장 (프롬프트 + 렌더 + CLAUDE.md)

> 앞 문서 `v2-스펙-1차OT-사전무장-프롬프트최적화.md`의 확정본을 **바로 diff 뜰 코드**로. 거절 5종 = price·hesitation·doubt·time·compare 확정.
> 흐름: 이 스펙 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰. 커밋 트레이너 직접(파일지정 add · lint 후 · `git show --stat HEAD`).
> **건드릴 파일 3개:** `app/api/ot-brief/route.js` · `components/tabs/FirstOTAssist.jsx` · `CLAUDE.md`. **그 외 무변경**(FirstOTTab·ObservationTab·labels·page.jsx 등).

**제안 커밋(2개):**
- `feat(ot-brief): 1차 사전무장 프롬프트 — 4블록 컨닝페이퍼(오프닝·타겟운동·비유·거절5) + 렌더 교체`
- `docs(claude): OT 지원 대전제 — 클로징 극대화·3분 컨닝페이퍼 원칙` (CLAUDE.md만 별도 or 위에 포함)

---

## PART 1 — `app/api/ot-brief/route.js`

### 1-a. `firstPrompt` 전체 교체

기존 `firstPrompt(member, packages)` 함수를 아래로 **통째 교체**. 상단 스캐폴딩(`m`·`machines`·`pkgBlock`)은 그대로, **return 템플릿만 새 4블록**. (프로필 주입 스펙과 합류 시 3번째 파라미터 `profile` + `trainerProfileBlock(profile)` 추가 — 지금은 무관.)

```js
// ── ① firstPrompt — 사전무장 컨닝페이퍼(4블록). 세일즈 클로징 극대화 · 3분전 스캔용. ──
function firstPrompt(member, packages) {
  const m = member || {};
  const machines = Array.isArray(m.machines) ? m.machines.join(", ") : g(m.machines);
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => {
        const per = p.sessions ? Math.round(p.price / p.sessions) : null;
        return `[${i}] name=${g(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g(p.duration_label)} · price=${Number(p.price).toLocaleString("ko-KR")}원${per ? ` · 회당=${per.toLocaleString("ko-KR")}원` : ""}${p.note ? ` · note=${p.note}` : ""}`;
      }).join("\n")
    : "등록된 패키지 없음";
  return `[상황·대전제] 1차 OT 입장 3분 전. 이 출력의 유일한 목적 = 이 회원의 '등록(클로징) 확률 극대화'다.
트레이너는 이걸 30초~1분에 훑어 머리에 넣고 폰을 주머니에 넣는다. '참고 설명'이 아니라 '바로 외워
바로 말할 완성 대사'로 써라. 추상 지침·개발자용 매핑 설명 금지.

[이 국면 특칙 — 대본 수위] 세일즈(오프닝·비유·클로징·거절)뿐 아니라 운동 파트도 '회원에게 그대로 말할
실제 대사'까지 구체적으로 준다. 단 아래는 여전히 절대 금지:
 - 숫자 처방(세트·횟수·각도·중량·템포·시간). 운동은 '방향 + 짚어줄 말'까지, 숫자는 빼라.
 - 의료 단정(치료·완치·진단). 통증은 '불편/부담' 수준 표현까지만.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, residence=${g(m.residence)},
               mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}, machines=${machines}
아직 관찰 전이다 — 신체 판단은 '~일 가능성' 가설 톤. 없는 관찰·수치·에피소드 창작 금지. 단 오프닝·
비유·거절 대사는 세일즈 기술이라 확신 있게 완성해도 된다(사실 왜곡이 아니므로).

[내 PT 패키지] (★이 목록에서만 추천. 없는 패키지·가격·세션수 창작 금지. [n]=참조번호)
${pkgBlock}

[★운동목적(goal) = 최우선 렌즈] goal이 4블록 전부의 중심축이다.
 - 통증개선/불편해소 → 불편 부위를 전면, 그 해소로 엮는다.
 - 외형/체중감량/바디라인 → 체형·라인·자신감을 전면, pain은 보조.
 - 건강/체력/활력 → 컨디션·에너지를 전면.  - 벌크업/근육 → 근성장·볼륨·자세를 전면.
 ⚠️ goal과 무관하게 pain만 물지 말 것. pain은 goal이 통증개선일 때만 주인공.

[컨닝페이퍼 4블록 — 트레이너가 읽는 순서]

① opening(오프닝 — 첫 만남 긴장 풀기): 회원의 직업·거주·나이·목표 같은 '일상 소재'로 가볍게 문을 여는
   완성 대사 1개. 날씨 같은 무난한 소재도 좋다. 세일즈 냄새 0, 사람 대 사람의 라포.
   - line: 그대로 말할 첫 대사("○○님, …") 1~2문장.  - why: 이게 여는 것(긴장 완화·신뢰) 1문장.

② target_exercise(타겟 운동 & 리액션 — 세일즈의 '증거' 만들기): 이 회원에게 '되네?'/'통증 없이
   자극되네?'를 몸으로 체감시킬 운동 1개와 그걸 세일즈로 잇는 법.
   - exercise: 시킬 운동(방향까지 · 숫자 금지).  - target_reaction: 노릴 반응(무엇을 느끼게).
   - point_it_out: 그 반응이 나온 순간 그대로 말할 실제 대사("방금 느끼셨어요? …") 1~2문장.
   - so_what: 그 체감을 등록 논리로 잇는 한 줄("혼자선 이 세팅 못 잡습니다" 결).

③ sales_metaphor(세일즈 비유 — 회원 세계 언어): 회원의 직업·일상·목표에서 끌어온 비유 하나로 '지금
   안 하면/함께 하면'을 그림처럼. 운동·기계 클리셰("브레이크-액셀") 금지.
   - metaphor: 그대로 말할 비유 대사 1~2문장.  - bridge: 비유→등록 필요성으로 잇는 한 줄.

④ closing_line(클로징 한마디): 오늘 체감을 근거로 한 '가정 종결' 한 문장. '등록하세요'(판매 동사) 금지 →
   "다음 주부터 이렇게 가시죠" 결. 긴급성은 사실 기반 손실만.

⑤ objection_defense(거절 선제 방어 5종): 아래 5개 각각 미리 무장. 반박이 아니라 '공감으로 빗장 풀고
   세일즈로 다시 끌기'. reason 키 고정(5개 전부 · 각 1개):
     price(가격 부담) · hesitation(생각해볼게요·망설임) · doubt(효과·필요성 의심) ·
     time(시간 부족·바빠서) · compare(타 센터 비교 — "가격 비교하고 올게요/다른 데서도 OT 받아볼게요").
   - trigger: 이 거절이 나올 신호(회원이 흔히 하는 말) 1문장.
   - defense: 공감으로 걱정 풀고 바로 잇는 세일즈 무브 1~2문장.
   - line: 그 자리에서 그대로 말할 실제 대사("○○님, …") 1문장.
   ⚠️ compare는 경쟁사 비방·가격 맞대응 금지 → '오늘 이미 당신 몸에서 확인한 것'이라는 관계·데이터
     선점 우위로("다른 데선 0부터 다시 파악해야 해요. 저는 오늘 이미 ○○을 봤고요").
   ⚠️ 허위 긴급성·공포·죄책감 금지(PREAMBLE 상속).

[recommended_program] 위 패키지에서 가장 맞는 1개(pick_ref)만 확신 있게. 가격·세션수를 값 텍스트에 쓰지
   마라(앱이 목록에서 채움). why_fit=목적·직업·나이 근거 2문장 이내. 대안(alt_ref) 마땅찮으면 null.
   패키지 없으면 pick_ref=null + data_gaps에 "가격 설정 탭에 패키지를 등록하면 콕 집어드려요".

[data_gaps — 성장 프레임] 기본정보로 위 전부를 반드시 생성한다("정보 부족" 반환 금지). data_gaps는 결핍이
   아니라 "○○를 관찰해오면 △△까지" 형태 긍정 코칭. 충실하면 빈 배열.

[분량 — 외우기 쉽게] 각 대사는 짧고 입에 붙게. line류 1~2문장, why/bridge/so_what 1문장.
[필드명 인용 금지] 값 텍스트에 스키마 키(point_it_out·so_what·objection_defense 등)를 쓰지 마라.
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지).
{
  "member_read": "이 회원 한 줄 — 누구고/뭘 원하고/뭐가 걸리나 (3분전 각인 앵커)",
  "opening": { "line": "...", "why": "..." },
  "target_exercise": { "exercise": "...", "target_reaction": "...", "point_it_out": "...", "so_what": "..." },
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  "closing_line": "가정 종결 한마디('등록' 단어 없이)",
  "objection_defense": [ { "reason": "price|hesitation|doubt|time|compare", "trigger": "...", "defense": "...", "line": "..." } ],
  "recommended_program": { "pick_ref": 0, "why_fit": "...", "alt_ref": null, "alt_why": "" },
  "data_gaps": ["..."]
}
※ objection_defense는 위 5개 reason을 각각 1개씩(총 5). pick_ref/alt_ref는 정수 또는 null.`;
}
```

### 1-b. `REQUIRED_FIRST` 갱신 (POST 핸들러 · 파서 완전성)

기존:
```js
const REQUIRED_FIRST = ["hypothesis", "arc", "movement_cues", "recommended_program", "closing", "objections"];
```
→ 새 스키마 키로:
```js
const REQUIRED_FIRST = ["member_read", "opening", "target_exercise", "sales_metaphor", "closing_line", "objection_defense"];
```
> `parseBrief`가 이 키 전부 있어야 '완전'으로 판단(잘림·부분객체 방어). recommended_program·data_gaps는 선택(패키지 없을 때 pick_ref=null이라 required에서 빼도 됨 · data_gaps는 finalize가 기본 []).

### 1-c. `FIELD_TERMS` 추가 (값 텍스트 누출 방어)

`FIELD_TERMS` 배열에 아래 신규 키 추가(맨 끝 `["closing", "클로징"]` **위**에 · 긴 키 우선 규칙 유지). 기존 옛-first 항목(closing_compass·movement_cues·observe_targets 등)은 **무해하니 그대로 둔다**(제거 시 churn·리스크).
```js
["member_read", "회원 한 줄"],
["opening", "오프닝"],
["target_exercise", "타겟 운동"],
["target_reaction", "노릴 반응"],
["point_it_out", "짚어줄 말"],
["so_what", "등록 논리"],
["sales_metaphor", "세일즈 비유"],
["objection_defense", "거절 방어"],
["closing_line", "클로징 한마디"],  // ← ["closing", ...]보다 위
```

---

## PART 2 — `components/tabs/FirstOTAssist.jsx`

**로직(캐시 fetch·패키지 로드·generate·캐시저장·stale/sameInput·로딩·notice·pick/alt 조회)은 전부 유지.** 바꾸는 것 = ①import 정리 ②OBJ_LABEL ③파생 변수 ④`{data && !loading && ...}` 렌더 블록 ⑤최초 안내 문구 ⑥Example 컴포넌트 제거.

### 2-a. import 정리
- **제거(미사용):** `MessageSquareQuote, Dumbbell, Zap, Lightbulb, Target, MessageSquare`(arc/치트키/관찰용) · `CLOSING_APPROACH_OPTS, labelOf`(approach_tag 없어짐).
- **유지:** `Sparkles, ShieldCheck, CreditCard, Flag` · `Eyebrow, Button, supabase, authHeader, won, firstInputHash`.
- **`Example` 컴포넌트 정의 삭제**(새 스키마에 example/cueing/dialogue 없음).

### 2-b. `OBJ_LABEL` 교체 (거절 5종 확정)
```js
const OBJ_LABEL = {
  price: "가격 부담",
  hesitation: "생각해볼게요 (망설임)",
  doubt: "효과·필요성 의심",
  time: "시간 부족",
  compare: "타 센터 비교",
};
```

### 2-c. 파생 변수 교체
기존 `mc/rp/cl/obj/arc/beatBy/awareBeat/observe` 블록을 아래로:
```js
const mr = data?.member_read || "";
const op = data?.opening || {};
const te = data?.target_exercise || {};
const sm = data?.sales_metaphor || {};
const cline = data?.closing_line || "";
const obj = Array.isArray(data?.objection_defense) ? data.objection_defense : [];
const rp = data?.recommended_program || {};
const pick = Number.isInteger(rp.pick_ref) ? (packages[rp.pick_ref] || null) : null;
const alt = Number.isInteger(rp.alt_ref) ? (packages[rp.alt_ref] || null) : null;
const perSession = (p) => (p && p.sessions ? won(Math.round(p.price / p.sessions)) : null);
const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];
// 구캐시(구 스키마) 감지 — 신필드 전무면 '이전 형식' 안내 후 재생성 유도.
const legacyCache = Boolean(data) && !op.line && !te.exercise && obj.length === 0;
```

### 2-d. 렌더 블록 교체 (`{data && !loading && ( ... )}` 통째)
```jsx
{data && !loading && (
  <div className="mt-4 space-y-3">
    {legacyCache && (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
        이전 형식 브리핑이에요 — &lsquo;다시 생성&rsquo;을 누르면 새 사전무장 컨닝페이퍼로 바뀝니다.
      </div>
    )}

    {/* 앵커 — 3분 각인 */}
    {mr && (
      <div className="rounded-xl border border-line bg-elevate p-3.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <Sparkles className="h-3.5 w-3.5" /> 3분 각인
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink">{mr}</p>
      </div>
    )}

    {/* ① 오프닝 */}
    {op.line && (
      <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">👋</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">오프닝 · 긴장 풀기</span>
        </div>
        <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-ink">&ldquo;{op.line}&rdquo;</p>
        {op.why && <p className="mt-1 text-[11px] leading-relaxed text-muted">{op.why}</p>}
      </div>
    )}

    {/* ② 타겟 운동 & 리액션 */}
    {(te.exercise || te.point_it_out) && (
      <div className="rounded-xl border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">타겟 운동 · 증거 만들기</span>
        </div>
        {te.exercise && <p className="mt-1.5 text-sm font-semibold text-ink">{te.exercise}</p>}
        {te.target_reaction && (
          <p className="mt-1 text-[13px] leading-relaxed text-sub"><span className="font-semibold">노릴 반응 · </span>{te.target_reaction}</p>
        )}
        {te.point_it_out && (
          <p className="mt-2 rounded-lg bg-primary-soft px-3 py-2 text-sm leading-relaxed text-ink">
            <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">짚어줄 말</span>
            &ldquo;{te.point_it_out}&rdquo;
          </p>
        )}
        {te.so_what && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted"><span className="font-semibold text-sub">등록 논리 · </span>{te.so_what}</p>
        )}
      </div>
    )}

    {/* ③ 세일즈 비유 */}
    {sm.metaphor && (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">세일즈 비유</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">&ldquo;{sm.metaphor}&rdquo;</p>
        {sm.bridge && <p className="mt-1 text-[12px] leading-relaxed text-muted">{sm.bridge}</p>}
      </div>
    )}

    {/* ④ 클로징 한마디 — 크게(L0) */}
    {cline && (
      <div className="rounded-xl border border-primary/40 bg-primary-soft p-4">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary-strong" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">클로징 한마디</span>
        </div>
        <p className="mt-1.5 text-base font-semibold leading-relaxed text-ink">&ldquo;{cline}&rdquo;</p>
      </div>
    )}

    {/* 추천 프로그램 — 가격은 내 목록(pick/alt)에서 */}
    {pick ? (
      <div className="rounded-xl border border-primary/30 bg-card p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-3.5 w-3.5 text-primary-strong" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">추천 프로그램</span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
          <span className="font-bold">{pick.name}</span>
          <span className="font-mono font-semibold">{won(pick.price)}</span>
          {perSession(pick) && <span className="text-[11px] text-muted">· {perSession(pick)}/회</span>}
        </p>
        {rp.why_fit && <p className="mt-1 text-[12px] leading-relaxed text-sub">{rp.why_fit}</p>}
        {alt && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            <span className="rounded bg-elevate px-1.5 py-0.5 font-semibold">대안</span> {alt.name} · {won(alt.price)}{rp.alt_why ? ` — ${rp.alt_why}` : ""}
          </p>
        )}
      </div>
    ) : packages.length === 0 ? (
      <div className="rounded-xl border border-line bg-card p-4 text-[12px] leading-relaxed text-muted">
        가격 설정 탭에서 패키지를 등록하면 이 회원에게 맞는 프로그램을 추천해드려요.
      </div>
    ) : null}

    {/* 거절 5방어 — 기본 펼침(현장 핵심) */}
    {obj.length > 0 && (
      <details open className="rounded-xl border border-line bg-card">
        <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-strong" /> 거절 선제 방어 ({obj.length})
        </summary>
        <div className="space-y-2 px-3.5 pb-3.5">
          {obj.map((o, i) => (
            <div key={i} className="rounded-lg border border-line bg-elevate p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold text-sub">{OBJ_LABEL[o.reason] || o.reason}</span>
                {o.trigger && <span className="text-[11px] italic text-muted">&ldquo;{o.trigger}&rdquo;</span>}
              </div>
              {o.defense && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-sub"><span className="font-semibold text-sub">대응 · </span>{o.defense}</p>
              )}
              {o.line && (
                <p className="mt-1.5 rounded-md bg-primary-soft px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
                  <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>
                  &ldquo;{o.line}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      </details>
    )}

    {/* data_gaps — 접힘 */}
    {gaps.length > 0 && (
      <details className="rounded-xl border border-primary/30 bg-primary-soft p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary-strong">
          이렇게 하면 더 좋아져요 (선택 · {gaps.length})
        </summary>
        <ul className="mt-3 space-y-1.5">
          {gaps.map((gp, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-sub"><span className="mt-0.5 text-primary-strong">＋</span> {gp}</li>
          ))}
        </ul>
      </details>
    )}

    <p className="text-[10px] leading-relaxed text-muted">
      ※ 관찰 전 &lsquo;가설&rsquo;이에요 — 현장에서 회원 반응 보며 조정하세요. 관찰 기록을 저장한 회원은 이 브리핑이 남습니다.
    </p>
  </div>
)}
```

### 2-e. 최초 안내 문구 교체 (생성 전)
```jsx
{!data && !loading && !notice && (
  <p className="mt-3 text-[11px] leading-relaxed text-muted">
    회원 기본정보 + 내 패키지로 <b>3분 사전무장</b>을 만듭니다 — 오프닝 · 타겟운동 · 세일즈 비유 · 클로징 한마디 · 거절 5방어. (관찰 아님 · 가설)
  </p>
)}
```

---

## PART 3 — `CLAUDE.md` 대전제 추가

`## Architecture` 섹션 끝(또는 `### Real vs. demo data` 앞)에 아래 소단락 삽입:

```md
### OT 지원 AI의 대전제 (프롬프트·화면 작업 시 항상)

모든 OT/재등록 지원 출력의 목적은 **세일즈 클로징 확률 극대화**이고, 형태는 **수업 입장 직전 3분 사전무장 컨닝페이퍼**다 — 트레이너가 30초~1분에 훑어 외우고 폰을 주머니에 넣은 뒤 당당히 리드한다. 그러므로 출력은 '참고 자료'가 아니라 **바로 외워 바로 말할 완성 대사**여야 한다. 세일즈·운동 파트 모두 구체 대사를 허용하되 **숫자 처방(세트·횟수·각도·중량·템포)과 의료 단정(치료·완치·진단)은 금지**. 거절은 5종 선제 방어(가격·생각해볼게요·효과의심·시간부족·타 센터 비교). 단 **급한불(`acute`)만 예외** — 의료 안전 우선이라 기존 스파링·보수 톤 유지. 1차 사전무장 스키마·근거는 `docs/v2-스펙-1차OT-사전무장-*.md`.
```

---

## 검증 체크리스트 (커밋 전)

1. **`npm.cmd run lint` green** · 미사용 import 0(제거 목록 반영 · Example 정의 삭제).
2. **새 출력 스모크(실계정):** 1차 지원 '생성' → 4블록(오프닝·타겟운동·비유·클로징·거절5)이 다 뜨는지 · 거절이 정확히 5개(price/hesitation/doubt/time/compare)인지 · 추천 프로그램 가격이 **내 패키지 목록값**인지(환각 아님).
3. **거절 라벨:** 5개 칩이 한글 라벨로(가격 부담/생각해볼게요/효과·필요성 의심/시간 부족/타 센터 비교). `compare` 대응 멘트가 경쟁사 비방 아닌 '데이터 선점' 톤인지 눈검.
4. **구캐시 회원:** 옛 스키마 first_assist 저장된 회원 열면 '이전 형식' 안내 뜨고 '다시 생성' 시 새 형식으로 갱신 · 크래시 없음.
5. **패키지 0 트레이너:** pick 없음 → '가격 설정 탭…' 안내, data_gaps 동일 문구 · 크래시 없음.
6. **캐시 왕복:** 생성 후 새로고침/회원 재진입 시 캐시 렌더(재호출 X) · stale 배지(회원정보 변경 시).
7. **JSON 파싱:** `REQUIRED_FIRST` 신키로 갱신됐는지(구키 남으면 항상 파싱 실패) — 생성이 실제로 성공하는지 확인.
8. **급한불 무영향:** acute 탭 정상(이 변경은 first에만).

## 클로드코드 레일
- 파일 3개만: `app/api/ot-brief/route.js` · `components/tabs/FirstOTAssist.jsx` · `CLAUDE.md`.
- **grep 완전성:** `Select-String 'objection_defense'`(프롬프트 스키마·FIELD_TERMS·파생·렌더) · `'REQUIRED_FIRST'`(신키 반영) · `'OBJ_LABEL'`(5키) · 옛 키 잔존 확인 `'movement_cues|arc|awareBeat|observe_targets|approach_tag'`(렌더에서 전멸했는지) · `'Example'`(정의·사용 동시 제거).
- 불확실하면 멈추고 질문. 파일지정 `git add` · `git add .` 금지 · lint 후 커밋 · `git show --stat HEAD`.
