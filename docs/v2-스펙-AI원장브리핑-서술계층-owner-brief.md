# 스펙 — #6 원장 브리핑 **AI 서술 계층** (owner-brief · Sonnet · 2026-07-27)

> **범위:** admin '브리핑' 탭 "오늘 챙길 것"의 **AI 자연어 서술**. 기존 룰 top3(`ownerBriefing`→`OwnerBriefing` 카드)는 **그대로 두고**(기본·항상 노출), 그 결과를 재료로 서버 AI(Sonnet)가 원장용 코칭 문단 생성. 근거: `docs/v2-스펙-AI원장브리핑-구현.md` §8.
> **결정(대수 확정):** ① 트리거 = **버튼 온디맨드**(룰 뷰 기본 · "AI 요약" 눌러야 생성) ② 캐시 = **클라 메모리**(state · 언마운트/다시생성 시 갱신 · 새 스키마 0) ③ 게이트 = **premium 적용**(`auth_account_plan()==='premium'`).
> **협업 그대로:** 웹Claude=스펙+diff리뷰+순수함수 검증 / CC=로컬 구현 / 대수=커밋. additive 우선 · **로직/RLS/payload 불변** · 코드 내용으로 매칭(라인번호 X) · 새 파일 `git add` 먼저 · 배치별 1커밋 · Windows PowerShell(`npm.cmd run build/lint`).
> **불변 핵심:** `requireTrainer`(공용 인증)·`ownerBriefing`(룰 파생)·`admin/page.jsx`(mount-cache) **안 건드림.** 새 파일 1 + `OwnerBriefing.jsx` additive 2파일뿐.

---

## 0. 판정 요약

- **DB fetch 0 · 마이그레이션 0 · RLS/payload 무변.** 라우트는 **클라가 보낸 룰 top3 숫자만** 문단화(회원 PII 없음 — 룰 후보는 명수·추정금액·트레이너명뿐). 서버 재조회·재계산 없음(§8 "룰 결과가 그대로 프롬프트 입력").
- **비용/대기 통제:** 관제 탭 열 때 자동 호출 **없음**. 원장이 버튼 누를 때만 1회. 결과는 클라 메모리 캐시(같은 화면 재사용).
- **게이트 2겹:** `requireTrainer`(로그인 활성 트레이너 + 구독 access + 스로틀 20/분) **위에** premium 등급(`auth_account_plan`) 추가. 비premium은 **룰 뷰까지만**(락아웃 금지 · 버튼이 "프리미엄 전용" 안내로 강등).
- **폴백 우선:** 키 미설정·premium 아님·API 실패·파싱 실패 → 전부 **룰 카드 유지**(이미 렌더됨) + 조용한 안내. AI는 룰 위에 얹는 계층일 뿐, 없어도 화면 정상.

**패턴 출처:** `app/api/ot-brief/route.js`(runtime·maxDuration·Anthropic·에러 셰이프)·`lib/requireTrainer.js`(인증+구독)·`docs/migrations/2026-07-16-b2-premium-gate.sql`(`auth_account_plan`).

---

## 1. `app/api/owner-brief/route.js` (신규 · `git add` 먼저)

> ot-brief 미러. **순수 생성기 — 캐시는 클라.** `requireTrainer`로 인증+구독, premium 등급만 라우트 로컬에서 추가 확인(requireTrainer는 공용이라 **안 건드림**). 키/게이트/실패 = 상태코드 + `fallback:"rule"`(클라가 룰 뷰 유지 판별).

```js
// app/api/owner-brief/route.js
// -----------------------------------------------------------------------------
// #6 원장 브리핑 AI 서술 계층 (서버 전용). 룰 top3(ownerBriefing 결과)를 받아 원장 코칭 문단화.
// 순수 생성기 — 캐시는 클라(OwnerBriefing). DB fetch 0(클라가 근거 숫자 동봉).
// 게이트: requireTrainer(인증+구독+스로틀) + premium 등급(auth_account_plan). 실패/키부재 → 상태코드+fallback:"rule".
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = "claude-sonnet-5";        // ot-brief MODEL_SECOND과 동일
const MAX_BODY_BYTES = 64 * 1024;       // top3 몇 건 = 수 KB. 넉넉한 상한(심층방어).
const MAX_ITEMS = 6;                    // ownerBriefing 최대 신호 6종. 초과분 조용히 버림.

// premium 등급 확인(구독 access는 requireTrainer가 이미 통과시킴 · 여기선 plan='premium'만 추가).
// auth_account_plan()=returns text(스칼라) → supabase-js가 스칼라/배열 어느 셰이프로 줘도 방어.
async function accountIsPremium(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!url || !anon || !token) return false;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.rpc("auth_account_plan");
  if (error) return false;
  const plan = Array.isArray(data) ? (data[0]?.auth_account_plan ?? data[0]) : data;
  return plan === "premium";
}

// 룰 후보 1건 → 프롬프트 한 줄(근거 숫자만 · 없는 값 생략).
function itemLine(it, i) {
  const parts = [];
  if (it?.title) parts.push(String(it.title).slice(0, 80));
  if (it?.detail) parts.push(String(it.detail).slice(0, 120));
  if (typeof it?.amount === "number") parts.push("추정 임팩트 약 " + Math.round(it.amount).toLocaleString("ko-KR") + "원");
  return `${i + 1}. ${parts.join(" · ")}`;
}

const PREAMBLE = `너는 피트니스 센터 원장의 운영 파트너다. 룰이 돈·긴급도로 뽑아준 우선순위를, 원장이 3초 안에 "오늘 뭐부터 챙기면 되는지" 잡도록 담백한 실무 언어로 브리핑한다. 준 숫자만 근거로 삼고, 없는 사실(회원 이름·구체 수치·에피소드)은 지어내지 않는다. 금액은 과거 평균 기반 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.`;

function buildPrompt(items, ym) {
  const lines = items.map(itemLine).join("\n");
  return `[이번 달${ym ? " " + ym : ""}] 우리 센터에서 지금 챙길 우선순위 ${items.length}가지(룰 자동 선별):
${lines}

위 항목만 근거로 원장에게 오늘의 브리핑을 써라. 아래 JSON만 출력(코드블록·설명·군더더기 금지):
{"summary":"오늘 상황 한 문장 총평","points":["항목1을 1~2문장 코칭","항목2 …"]}
- points는 위 항목 순서 그대로, 각 1~2문장으로 "무엇을·왜·오늘 뭐부터".
- 금액은 '추정'이다. "확실히 X원"이 아니라 "성사되면 대략" 식으로.
- 준 숫자 외의 회원 이름·수치·에피소드를 지어내지 마라.`;
}

// 방어 파싱 — 코드펜스·앞뒤 잡텍스트 제거 후 첫 {…} 파스. summary/points 형태 강제. 실패 시 null.
function parseOwnerBrief(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj = null;
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  try { if (s !== -1 && e > s) obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== "object") return null;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const points = Array.isArray(obj.points)
    ? obj.points.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim())
    : [];
  if (!summary && points.length === 0) return null;
  return { summary, points };
}

export async function POST(request) {
  const auth = await requireTrainer(request);        // 인증+구독+스로틀(공용 · 불변)
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI 키가 설정되지 않았습니다.", fallback: "rule" }, { status: 503 });
  }

  // premium 등급 게이트(구독 access는 위에서 확인됨 · 여기선 등급만).
  if (!(await accountIsPremium(request))) {
    return Response.json({ error: "프리미엄 전용 기능입니다.", code: "premium_required", fallback: "rule" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 }); }

  let bodyBytes = 0;
  try { bodyBytes = JSON.stringify(body).length; } catch { bodyBytes = MAX_BODY_BYTES + 1; }
  if (bodyBytes > MAX_BODY_BYTES) return Response.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 });

  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (items.length === 0) {
    return Response.json({ error: "브리핑할 항목이 없습니다.", fallback: "rule" }, { status: 400 });
  }
  const ym = typeof body?.ym === "string" ? body.ym.slice(0, 7) : "";

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,                       // summary + 최대 6 points 한국어 · 상한(과금은 실사용 기준)
      system: PREAMBLE,
      messages: [{ role: "user", content: buildPrompt(items, ym) }],
      thinking: { type: "disabled" },         // sonnet-5 adaptive thinking JSON엔 불필요(ot-brief와 동일)
    });
    const textOut = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseOwnerBrief(textOut);
    if (!parsed) return Response.json({ error: "AI 응답 파싱 실패.", fallback: "rule" }, { status: 502 });
    return Response.json(parsed);              // { summary, points }
  } catch (e) {
    console.error("[owner-brief] 생성 실패:", e?.message || e);
    return Response.json({ error: "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", fallback: "rule" }, { status: 502 });
  }
}
```

**설계 근거 메모**
- **DB fetch 0:** 클라가 이미 계산한 top3(카드에 뜬 그 값)를 `items`로 동봉 → 서버는 문단화만. ot-brief가 회원/관찰을 받는 것과 같은 결(서버 재조회 아님). 회원 이름·PII 미포함(룰 후보엔 명수·추정금액·트레이너명뿐).
- **premium 라우트 로컬 확인 이유:** `requireTrainer`는 구독 **access**(active)까지만 봄(코드 주석 명시). 등급(basic/premium)은 안 봄 → 여기서 `auth_account_plan()`로 한 겹 추가. **공용 `requireTrainer`를 안 건드리는** 게 blast-radius 최소(대안은 §7).
- **`fallback:"rule"`:** 모든 실패 응답에 부착 → 클라가 "룰 뷰 유지 + 조용한 안내"로 통일 처리. `code:"premium_required"`만 별도 UX(프리미엄 안내).

---

## 2. `components/admin/OwnerBriefing.jsx` 배선 (additive)

> **현재 배포본 그대로 두고 얹기만.** 룰 카드(`top` 렌더)·빈상태·캡션 **무변**. 아래 3가지만 additive: import 추가 · AI 상태/생성 함수 · 카드 밑 "AI 요약" 영역. `admin/page.jsx`는 **손 안 댐**(props 이미 다 넘어옴 · mount-cache 회피).

### 2-1. import 추가 (기존 import 줄에 추가)
- `useState`는 이미 있음. lucide 아이콘에 **`Sparkles`, `Loader2`** 추가(기존 import 라인에 이어붙임).
- 새 줄: `import { supabase } from "@/lib/supabaseClient";`
  - ⚠️ admin이 쓰는 **트레이너/원장 클라이언트**(회원앱 `memberSupabase` 아님). `if (!supabase)`(데모·키부재)면 AI 버튼 자체를 안 그림(§2-4).

### 2-2. 상태 + 캐시 (컴포넌트 본문 · 기존 `top` 계산 아래)
```js
// AI 서술 계층(버튼 온디맨드 · 클라 메모리 캐시). 룰 뷰는 무조건 먼저 렌더 · AI는 그 위에 얹음.
const [aiState, setAiState] = useState("idle");   // idle | loading | ready | error | premium
const [aiData, setAiData]   = useState(null);      // { summary, points } | null
const [aiErr, setAiErr]     = useState("");
// 캐시 무효화 키 — top 구성(종류+명수/금액)이 바뀌면 옛 요약을 "다시 생성" 유도(자동 재호출 X).
const topKey = useMemo(
  () => top.map((c) => `${c.kind}:${c.count ?? ""}:${c.amount ?? ""}`).join("|"),
  [top]
);
const [aiKey, setAiKey] = useState("");            // aiData가 만들어진 시점의 topKey
const aiStale = aiState === "ready" && aiKey !== topKey;
```

### 2-3. 생성 함수 (기존 클라 AI 호출 패턴 미러 — getSession 토큰 → Bearer → POST)
```js
async function genAiBrief() {
  if (!supabase || top.length === 0) return;
  setAiState("loading"); setAiErr("");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const items = top.map((c) => ({
      kind: c.kind,
      title: c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title,  // 트레이너명 클라에서 해소
      detail: c.detail,
      amount: c.amount ?? null,
    }));
    const res = await fetch("/api/owner-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ items, ym }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && data?.code === "premium_required") { setAiState("premium"); return; }
      setAiErr(data?.error || "요약 생성에 실패했어요."); setAiState("error"); return;
    }
    setAiData({ summary: data?.summary || "", points: Array.isArray(data?.points) ? data.points : [] });
    setAiKey(topKey); setAiState("ready");
  } catch {
    setAiErr("네트워크 오류로 실패했어요."); setAiState("error");
  }
}
```
> `nameOf`·`ym`·`top`은 기존 스코프 값. `items`는 근거 숫자만(회원 PII 없음).

### 2-4. 렌더 (룰 카드 블록 **바로 아래**, 최하단 캡션 위에 삽입 · 룰 부분 무변)
```jsx
{/* ===== AI 서술 계층(버튼 온디맨드 · premium) — 룰 카드는 위에 이미 렌더됨 ===== */}
{supabase && top.length > 0 && (
  <div className="pt-1">
    {aiState === "idle" && (
      <button type="button" onClick={genAiBrief}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-[13px] font-bold text-ink hover:bg-card">
        <Sparkles className="h-4 w-4 text-cyan-700" /> AI 요약 보기
      </button>
    )}

    {aiState === "loading" && (
      <div className="inline-flex items-center gap-2 text-[13px] text-sub">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700" /> 오늘 브리핑을 정리하고 있어요…
      </div>
    )}

    {aiState === "ready" && aiData && (
      <Card>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-cyan-700" />
            <span className="text-[11px] font-bold text-muted">AI 요약</span>
          </div>
          {aiData.summary && <p className="text-sm font-bold text-ink">{aiData.summary}</p>}
          {aiData.points.length > 0 && (
            <ol className="space-y-1.5">
              {aiData.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-sub">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] font-extrabold text-muted">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <button type="button" onClick={genAiBrief} className="text-[11px] font-semibold text-muted underline underline-offset-2">다시 생성</button>
            {aiStale && <span className="text-[11px] text-danger-text">지표가 바뀌었어요 · 다시 생성 권장</span>}
          </div>
          <p className="text-[10px] leading-relaxed text-muted">AI가 위 3가지를 문장으로 정리한 거예요. 금액은 과거 평균 기반 추정입니다.</p>
        </div>
      </Card>
    )}

    {aiState === "premium" && (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-muted">
        <Sparkles className="h-4 w-4 text-muted" /> AI 요약은 프리미엄 전용이에요. (위 3가지는 그대로 챙기시면 돼요.)
      </div>
    )}

    {aiState === "error" && (
      <div className="text-[12px] text-sub">
        {aiErr || "요약 생성에 실패했어요."}{" "}
        <button type="button" onClick={genAiBrief} className="font-semibold text-cyan-700 underline underline-offset-2">다시 시도</button>
      </div>
    )}
  </div>
)}
```

**불변 보증(리뷰 포인트)**
- 룰 카드(`top.map`)·빈상태(`top.length === 0`)·최하단 캡션 **한 글자도 안 바뀜**. AI 블록은 그 사이/아래 **additive**.
- `top.length === 0`이면 AI 블록도 안 뜸(요약할 게 없음 → 기존 "급히 챙길 건 없어요" 그대로).
- `emerald` 미사용 · 색은 cyan(강조)·muted(보조)·danger-text(주의)만(DS 초록제거 준수).
- 자동 호출 없음(useEffect 신설 X) — **버튼 클릭에서만** fetch.

---

## 3. 프롬프트 대전제 (§2 코드에 반영됨 · 리뷰용 요지)

- **역할:** 원장 옆 운영 파트너. "오늘 뭐부터"를 3초에 잡게. `ot-brief`의 세일즈 클로저와 다름 — 여긴 **내부 운영 브리핑**(대회원 대사 아님).
- **근거 한정:** 준 top3 숫자만. 없는 회원 이름·구체 수치·에피소드 **지어내기 금지**(환각 차단).
- **추정 명시:** 금액은 과거 평균 기반 추정 → "확실히" 단정 금지, "성사되면 대략". 허위 정밀도 금지(룰 스펙 §4와 동일 규율).
- **톤:** 담백·행동지향. 재촉·과장·감탄사·은어·의료 단정 금지.
- **출력:** `{summary, points[]}` JSON만. points는 top 순서 보존(카드 번호와 정렬).

---

## 4. 검증

**웹Claude (구현 전 · 완료)**
- 라우트 순수함수 로컬 실행: `itemLine`·`buildPrompt`·`parseOwnerBrief`를 토이 입력으로 — 정상 JSON·코드펜스 감싼 JSON·앞뒤 잡텍스트·깨진 JSON·빈 문자열·`points` 누락 케이스 파싱 결과 확인(§ 배치 후 CC diff 오면 최종 대조).

**대수 (구현 후)**
1. `npm.cmd run lint` · `npm.cmd run build` green(신규 경고 0 · 미사용 import 0). ⚠️ `Sparkles`/`Loader2`/`supabase` 실제 사용 확인.
2. **환경변수:** Vercel에 `ANTHROPIC_API_KEY` 있는지(ot-brief 이미 쓰므로 존재할 것). 없으면 503 → 버튼이 "실패·다시시도"로 강등(락아웃 아님) 확인.
3. **폰(premium 계정):** 브리핑 탭 → 룰 카드 아래 "AI 요약 보기" 버튼 → 탭 시 로딩 → 문단 요약(총평 + 항목별). 카드 번호와 문단 순서 일치. "다시 생성" 동작.
4. **폰(basic 계정 / 있으면):** 버튼 탭 → "프리미엄 전용이에요" 안내 · **룰 카드는 그대로**(락아웃 없음).
5. **정합성:** AI 문단이 위 카드의 명수·금액을 **넘어서는 수치를 새로 지어내지 않는지**(환각 체크). 지어내면 프롬프트 강화.
6. **자동 호출 0 확인:** 브리핑 탭 진입만으로 네트워크 `/api/owner-brief` 호출 **없음**(버튼 눌러야 1회). 개발자도구 네트워크 탭.

---

## 5. 커밋 배치 (배치별 1커밋 = revert 단위 · 스코프 add만 · `git add -A` 금지)

1. `feat(api): 원장 브리핑 AI 서술 라우트(owner-brief)` — `app/api/owner-brief/route.js`(**신규 · `git add` 먼저**)
   - `git add app/api/owner-brief/route.js`
   - `git commit -m "feat(api): 원장 브리핑 AI 서술 라우트(owner-brief · Sonnet · premium 게이트)" -- app/api/owner-brief/route.js`
2. `feat(admin): 원장 브리핑 AI 요약 토글/캐시 배선` — `components/admin/OwnerBriefing.jsx`
   - `git commit -m "feat(admin): 원장 브리핑 AI 요약 버튼/캐시(룰 뷰 위 서술 계층)" -- components/admin/OwnerBriefing.jsx`

> ⚠️ working tree에 `/lp` AuthGate WIP + untracked docs 떠 있으니 **반드시 스코프 add**. `git add -A`/`commit -am` 금지.

---

## 6. 성격

- **additive:** DB 쿼리 0 · 마이그레이션 0 · RLS/payload 무변. 룰 파생(`ownerBriefing`)·공용 인증(`requireTrainer`)·`admin/page.jsx` 무변.
- **비결정적(AI)이지만 격리:** 룰 뷰가 항상 진실원. AI는 버튼으로만·실패해도 룰 뷰 유지. 캐시는 클라 메모리(영속 저장 0).
- **비용:** 원장 클릭당 Sonnet 1회(~수백 토큰 출력). 자동호출 없음 + premium 게이트 + 스로틀(20/분)로 3중 상한.

---

## 7. 주의·대안·미결

- **⚠️ 원장 = 활성 트레이너 행 확인:** `requireTrainer`는 `trainer` 테이블 `active=true`를 요구. 원장이 그 계정의 활성 트레이너 행으로 로그인하는 구조면 통과(현 admin 접근 전제와 동일). **만약 원장이 trainer 행이 아니면** 이 라우트가 403 → 게이트를 owner 기준으로 조정 필요. **1차 스모크에서 원장 계정이 통과하는지 먼저 확인**(막히면 알려주면 requireOwner 변형 스펙).
- **대안(premium 확인 위치):** 지금은 라우트 로컬 `accountIsPremium`(공용 `requireTrainer` 불변 · blast-radius 최소). 더 깔끔하게 하려면 `requireTrainer(request, { plan: "premium" })` 옵션 인자(기본값 무동작=기존 콜러 불변)로 통합 가능하나 **공용 인증 파일을 건드려** 전 AI 라우트 회귀 대상이 됨 → 이번은 라우트 로컬 채택. 원하면 후속 별도 커밋.
- **후속(선택):** ① 캐시를 DB 영속(오늘자 1회·여러 기기 공유)로 승급 — 새 컬럼/테이블 필요, 지금은 클라 메모리로 충분. ② "AI 요약을 카드 위 헤드라인으로 자동 노출"은 비용 때문에 보류(버튼 유지). ③ 문단 톤 A/B(더 짧게/더 코칭)는 프롬프트만 조정.

## 8. CLAUDE.md 동기화 포인트 (구현·커밋 후)
- Server API routes에 **`app/api/owner-brief`**(원장 브리핑 AI 서술 · Sonnet · **premium 게이트**(`auth_account_plan`) · 룰 top3 문단화 · DB fetch 0) 추가.
- admin 분석 대시보드 "브리핑" 설명에 "룰 top3 + **버튼 온디맨드 AI 서술(premium · 클라 메모리 캐시)**" 한 줄.
