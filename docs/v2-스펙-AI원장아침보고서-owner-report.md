# 스펙 — #6 원장 **"오늘의 보고서"**(AI 종합 다이제스트 · 온디맨드 · owner-report · 2026-07-28)

> **범위:** admin '브리핑' 탭에서 원장이 **"오늘의 보고서 받기"** 버튼을 누르면, 서버 AI(Sonnet)가 **보고서 형식**(제목·날짜·총평·섹션별 서술)으로 그날의 센터 운영 브리핑을 제작해 인앱에 보여줌. **발송(푸시/이메일/카톡) 없음 · Cron 없음** — 대표가 출근해 앱 켜고 버튼 누르는 **온디맨드**.
> **이 스펙은 `docs/v2-스펙-AI원장브리핑-서술계층-owner-brief.md`(작은 요약 블록)를 대체·확장**한다(그건 미구현). 라우트·premium 게이트·버튼·캐시 뼈대는 계승, 출력이 **보고서**로 넓어지고 입력이 **종합 다이제스트**로 커짐.
> **결정(대수 확정):** 트리거=**버튼 온디맨드** · 캐시=**클라 메모리** · 게이트=**premium**(`auth_account_plan()==='premium'`) · 범위=**종합 다이제스트**(어제/이번달/주의/오늘 챙길 것).
> **협업 그대로:** 웹Claude=스펙+diff리뷰+순수함수 검증 / CC=로컬 구현 / 대수=커밋. additive 우선 · **로직/RLS/payload 불변** · 코드 내용 매칭(라인번호 X) · 새 파일 `git add` 먼저 · 배치별 1커밋 · Windows PowerShell(`npm.cmd`).
> **불변 핵심:** `requireTrainer`·`admin/page.jsx`(mount-cache)·기존 파생 **안 건드림**. 신규 = 파생 1(`ownerDailyDigest` · memberStatus.js append) + 라우트 1(신규 파일) + `OwnerBriefing.jsx` additive.

---

## 0. 판정 요약

- **DB fetch 0 · 마이그레이션 0 · RLS/payload 무변.** 보고서 숫자는 **admin이 이미 로드한 배열**(`rows·otRows·contracts·logs·appts·goals·trainers`)을 파생만 해 조립 → 클라가 라우트에 **숫자 묶음만** 전송 → 서버는 문장화만(서버 재조회·재계산 0). 회원 PII 없음(집계 수치 + 트레이너명뿐).
- **비용/대기 통제:** 자동 호출 0(버튼 클릭에서만) + premium 게이트 + 스로틀(`requireTrainer` 20/분). 결과는 클라 메모리 캐시(같은 화면 재사용 · "다시 생성").
- **재사용 우선(중복 0):** 이번 달 진행수업·신규등록·활성회원은 **`CenterMonthSummary`가 쓰는 파생 그대로**(`otSessionsThisMonthByTrainer`·`sessionsThisMonthByTrainer`·`revenueCompositionInMonth`), 매출·이탈·만료·클로징·미처리는 **`ownerBriefing`이 쓰는 파생 그대로**. 새 계산은 **어제 수업/노쇼·오늘 예약 2개(단순 KST 일자 필터)뿐.**
- **폴백 우선:** 키 미설정·premium 아님·API/파싱 실패 → 룰 top3 카드 유지 + **섹션별 결정적 한 줄 폴백**(숫자로 조립 · 보고서에 빈 구멍 없음). AI는 숫자 위에 얹는 서술 계층.

**패턴 출처:** `app/api/ot-brief/route.js`(runtime·maxDuration·Anthropic·에러 셰이프)·`lib/requireTrainer.js`(인증+구독)·`components/admin/CenterMonthSummary.jsx`(재사용 파생)·`ownerBriefing`(KST·closingDueSoon 패턴)·`docs/migrations/2026-07-16-b2-premium-gate.sql`(`auth_account_plan`).

---

## 1. `lib/memberStatus.js` — 신규 파생 `ownerDailyDigest` (파일 끝 append · ⚠️ mount-cache → diff 리뷰)

> 순수(기준시각 주입 · 모듈 내 무인자 `new Date()`/`Date.now()` 금지). **기존 파생 오케스트레이션 + 어제/오늘 KST 일자 필터 2개.** `members`엔 **full rows(hidden 포함)** 주입 → 내부에서 visible/전체맵 분리(`ownerBriefing`·`CenterMonthSummary`와 동일 규율). 반환은 **숫자 + top3**(서술 아님).

```js
/* =========================================================================
   #6 원장 "오늘의 보고서" — 종합 다이제스트 조립(룰 기반·결정적). 기존 파생 재사용 + 어제/오늘 KST 필터.
   반환: { dateISO, ym, yesterday, today, month, members, watch, top3 }. AI 서술은 owner-report 라우트.
   ========================================================================= */
export function ownerDailyDigest({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], ym, nowISO } = {}) {
  const now = typeof nowISO === "string" ? nowISO : "";
  const kstMs = (Date.parse(now) || 0) + 9 * 3600 * 1000;
  const todayISO = new Date(kstMs).toISOString().slice(0, 10);
  const yestISO  = new Date(kstMs - 86400000).toISOString().slice(0, 10);
  const hISO     = new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10);
  const kstDayOf = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10); };

  const visible = (members || []).filter((m) => m && !m.hidden);
  // 노쇼 귀속용 전체맵(ownerBriefing과 동일) · 세션집계용 visible맵(CenterMonthSummary와 동일).
  const fullMap = new Map((members || []).map((m) => [m.id, m.trainer_id]));
  const visMap  = new Map(visible.filter((m) => m?.id).map((m) => [m.id, m.trainer_id ?? "unknown"]));

  // 어제 진행 수업/노쇼(daily_workout_log · KST 일자 = 어제). 노쇼는 source==='noshow', 정상은 !voided.
  let ySessions = 0, yNoshows = 0;
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l) continue;
    if (kstDayOf(l.session_at ?? l.created_at) !== yestISO) continue;
    if (l.source === "noshow") { yNoshows++; continue; }
    if (l.voided) continue;
    ySessions++;
  }
  // 오늘 예약(booked · start_at KST = 오늘).
  let tBookings = 0;
  for (const a of Array.isArray(appts) ? appts : []) {
    if (a && a.status === "booked" && kstDayOf(a.start_at) === todayISO) tBookings++;
  }

  // 이번 달 진행수업/신규등록 — CenterMonthSummary가 쓰는 파생 그대로.
  const otSess = otSessionsThisMonthByTrainer(otRows, visMap, ym);
  const ptSess = sessionsThisMonthByTrainer(logs, visMap, ym);
  const sessionsOT = [...otSess.values()].reduce((s, n) => s + n, 0);
  const sessionsPT = [...ptSess.values()].reduce((s, n) => s + n, 0);
  const comp = revenueCompositionInMonth(contracts, ym) || {};
  const newRegs = comp.cntNew ?? 0;
  const reRegs  = comp.cntRe ?? 0;

  // 매출 진도 — ownerBriefing과 동일(revenueInMonth vs Σgoals.target_revenue).
  const revenueNet = revenueInMonth(contracts, ym);
  const revenueTarget = (goals || []).filter((g) => g && g.ym === ym && g.target_revenue != null).reduce((s, g) => s + (g.target_revenue || 0), 0);
  const progressPct = revenueTarget > 0 ? Math.round((revenueNet / revenueTarget) * 100) : null;

  // 회원 구성 — CenterMonthSummary와 동일 status 기준.
  const activeTotal = visible.filter((m) => m.status === "ot_active" || m.status === "pt_active").length;
  const activePt    = visible.filter((m) => m.status === "pt_active").length;
  const otCount     = visible.filter((m) => m.status === "ot_active").length;

  // 주의 신호 — ownerBriefing과 동일 파생.
  const churn    = churnRiskMembers(visible, contracts, logs, { nowISO: now });
  const expiring = expiringMembers(visible, contracts, logs, { nowISO: now });
  const otIds    = new Set(visible.filter((m) => viewFor(m) === "ot").map((m) => m.id));
  const validIds = new Set(visible.map((m) => m.id));
  const due      = closingDueSoon(otRows, { todayISO, horizonISO: hISO, otMemberIds: otIds, validMemberIds: validIds });
  const closingSoon = new Set(due.map((d) => d.user_id)).size;
  const pastDue     = pastDueAppointments(appts, now).length;

  // 오늘 챙길 것 top3 — 카드와 동일 산출(visible + 전체맵). 서술 재료.
  const top3 = ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, memberTrainer: fullMap, ym, nowISO: now }).slice(0, 3);

  return {
    dateISO: todayISO,
    ym: ym || "",
    yesterday: { sessions: ySessions, noshows: yNoshows },
    today: { bookings: tBookings },
    month: { revenueNet, revenueTarget, progressPct, sessionsOT, sessionsPT, sessionsTotal: sessionsOT + sessionsPT, newRegs, reRegs },
    members: { activeTotal, activePt, ot: otCount },
    watch: { churnRisk: churn.length, expiring: expiring.length, closingSoon, pastDue },
    top3,
  };
}
```

**⚠️ CC 확인 포인트(실제 시그니처 대조 · 웹은 diff에서 검증):**
- `otSessionsThisMonthByTrainer(otRows, memberTrainer, ym)`·`sessionsThisMonthByTrainer(logs, memberTrainer, ym)`·`revenueCompositionInMonth(contracts, ym)` — **CenterMonthSummary.jsx가 쓰는 그대로**(인자 순서·`.cntNew`/`.cntRe` 필드 확인됨).
- `revenueInMonth(contracts, ym)`·`closingDueSoon(otRows,{todayISO,horizonISO,otMemberIds,validMemberIds})`·`churnRiskMembers`·`expiringMembers`·`pastDueAppointments(appts, now)`·`ownerBriefing({...})`·`viewFor(m)` — **ownerBriefing 본문이 쓰는 그대로**. 시그니처가 다르면 그 호출만 실제에 맞춰 조정(로직 의미 불변).
- `member.status` 값 `ot_active`/`pt_active` — CenterMonthSummary와 동일 가정.

---

## 2. `app/api/owner-report/route.js` (신규 · `git add` 먼저)

> ot-brief 미러. **순수 생성기 — 캐시는 클라.** 입력 = 클라가 보낸 `digest`(숫자 + 읽기용 top3). 출력 = **보고서 섹션 서술**. `requireTrainer`(인증+구독) + premium 등급만 라우트 로컬 추가(공용 파일 불변).

```js
// app/api/owner-report/route.js
// -----------------------------------------------------------------------------
// #6 원장 "오늘의 보고서" AI 서술(서버 전용). ownerDailyDigest 숫자 묶음 → 원장용 보고서 문장화.
// 순수 생성기 — 캐시는 클라. DB fetch 0(클라가 숫자 동봉). 게이트: requireTrainer + premium(auth_account_plan).
// 출력: { headline, sections:{yesterday,month,watch,today}, closing }. 실패/키부재 → 상태코드+fallback:"rule".
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = "claude-sonnet-5";
const MAX_BODY_BYTES = 96 * 1024;

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

const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") + "원" : "—");

// digest 숫자 → 프롬프트(라벨된 근거만 · AI는 이 숫자만 서술).
function factsBlock(d) {
  const m = d?.month || {}, y = d?.yesterday || {}, t = d?.today || {}, mem = d?.members || {}, w = d?.watch || {};
  const top = Array.isArray(d?.top3) ? d.top3 : [];
  const topLines = top.length
    ? top.map((it, i) => `  ${i + 1}) ${[it?.title, it?.detail, typeof it?.amount === "number" ? "추정 임팩트 약 " + won(it.amount) : null].filter(Boolean).join(" · ")}`).join("\n")
    : "  (오늘 급히 챙길 항목 없음)";
  return [
    `[어제] 진행 수업 ${y.sessions ?? 0}건 · 노쇼 ${y.noshows ?? 0}건`,
    `[오늘] 예약(booked) ${t.bookings ?? 0}건`,
    `[이번 달 ${d?.ym || ""}] 매출 ${won(m.revenueNet)}${m.revenueTarget ? ` / 목표 ${won(m.revenueTarget)} (진도 ${m.progressPct ?? "—"}%)` : " (목표 미설정)"} · 진행수업 OT ${m.sessionsOT ?? 0}·PT ${m.sessionsPT ?? 0} · 신규등록 ${m.newRegs ?? 0}건(재등록 ${m.reRegs ?? 0}건)`,
    `[회원] 활성 ${mem.activeTotal ?? 0}명(PT ${mem.activePt ?? 0}·OT ${mem.ot ?? 0})`,
    `[주의] 이탈위험 ${w.churnRisk ?? 0}명 · 만료임박 ${w.expiring ?? 0}명 · 이번주 클로징 임박 ${w.closingSoon ?? 0}명 · 미처리 예약 ${w.pastDue ?? 0}건`,
    `[오늘 챙길 것 top3]\n${topLines}`,
  ].join("\n");
}

const PREAMBLE = `너는 피트니스 센터 원장의 운영 참모다. 매일 아침 원장이 30초 안에 센터 상황을 파악하도록, 주어진 숫자만 근거로 담백한 보고서를 쓴다. 없는 사실(회원 이름·구체 수치·에피소드)을 지어내지 않고, 금액은 과거 평균 기반 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.`;

function buildPrompt(d) {
  return `아래는 오늘 아침 우리 센터의 실측 숫자다. 이 숫자만 근거로 원장용 "오늘의 보고서"를 써라.

${factsBlock(d)}

아래 JSON만 출력(코드블록·설명·군더더기 금지):
{"headline":"오늘 상황 한 문장 총평","sections":{"yesterday":"어제 마감 1~2문장","month":"이번 달 진행 상황 1~3문장(매출 진도·수업·신규 중심)","watch":"지금 주의할 회원 1~2문장(이탈·만료·클로징·미처리)","today":"오늘 우선 챙길 것 2~3문장(top3를 행동 지시로)"},"closing":"짧은 마무리 1문장"}
- 각 섹션은 준 숫자를 자연스러운 실무 문장으로. 숫자를 새로 지어내지 마라.
- 매출·임팩트 금액은 '추정'이다. "확실히 X원"이 아니라 "목표 대비 ~%", "성사되면 대략" 식으로.
- 데이터가 0이거나 없으면 억지로 부풀리지 말고 담백히("어제 진행 수업은 없었습니다").`;
}

function parseReport(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj = null;
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  try { if (s !== -1 && e > s) obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== "object") return null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const sec = obj.sections && typeof obj.sections === "object" ? obj.sections : {};
  const out = {
    headline: str(obj.headline),
    sections: { yesterday: str(sec.yesterday), month: str(sec.month), watch: str(sec.watch), today: str(sec.today) },
    closing: str(obj.closing),
  };
  const any = out.headline || out.closing || Object.values(out.sections).some(Boolean);
  return any ? out : null;
}

export async function POST(request) {
  const auth = await requireTrainer(request);           // 인증+구독+스로틀(공용 · 불변)
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 키가 설정되지 않았습니다.", fallback: "rule" }, { status: 503 });

  if (!(await accountIsPremium(request))) {
    return Response.json({ error: "프리미엄 전용 기능입니다.", code: "premium_required", fallback: "rule" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 }); }

  let bodyBytes = 0;
  try { bodyBytes = JSON.stringify(body).length; } catch { bodyBytes = MAX_BODY_BYTES + 1; }
  if (bodyBytes > MAX_BODY_BYTES) return Response.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 });

  const digest = body?.digest;
  if (!digest || typeof digest !== "object") {
    return Response.json({ error: "보고서 데이터가 없습니다.", fallback: "rule" }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: PREAMBLE,
      messages: [{ role: "user", content: buildPrompt(digest) }],
      thinking: { type: "disabled" },
    });
    const textOut = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseReport(textOut);
    if (!parsed) return Response.json({ error: "AI 응답 파싱 실패.", fallback: "rule" }, { status: 502 });
    return Response.json(parsed);
  } catch (e) {
    console.error("[owner-report] 생성 실패:", e?.message || e);
    return Response.json({ error: "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", fallback: "rule" }, { status: 502 });
  }
}
```

---

## 3. `components/admin/OwnerBriefing.jsx` 배선 (additive)

> **룰 카드(`top` 렌더)·빈상태·캡션 무변.** 아래 additive: import 추가 · 보고서 상태/생성 함수 · 카드 밑 **"오늘의 보고서 받기"** 버튼 + **보고서 뷰**. `admin/page.jsx`는 **손 안 댐**(props 이미 다 넘어옴).

### 3-1. import 추가
- `useMemo`는 이미 있음. lucide에 **`FileText`, `Loader2`, `Printer`** 추가. `won`은 이미 import됨.
- 새 줄: `import { ownerDailyDigest } from "@/lib/memberStatus";`(기존 `ownerBriefing` import 줄에 이어붙이거나 별도 줄) · `import { supabase } from "@/lib/supabaseClient";`
  - `if (!supabase)`(데모·키부재)면 보고서 버튼 안 그림.

### 3-2. 상태 + 결정적 폴백 헬퍼 (본문 · 기존 `top` 아래)
```js
const [rep, setRep] = useState(null);          // { headline, sections, closing } | null
const [repState, setRepState] = useState("idle"); // idle | loading | ready | error | premium
const [repErr, setRepErr] = useState("");

// 날짜 라벨(결정적 · AI에 안 맡김). 예: 2026년 7월 28일 월요일
const dateLabel = useMemo(() => {
  const d = new Date(nowISO); const kst = new Date(d.getTime() + 9 * 3600000);
  const days = ["일","월","화","수","목","금","토"];
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${days[kst.getUTCDay()]}요일`;
}, [nowISO]);

// 섹션이 비면 숫자로 만드는 결정적 한 줄(보고서에 빈 구멍 금지).
function fallbackLine(key, d) {
  const m = d.month, y = d.yesterday, t = d.today, w = d.watch;
  if (key === "yesterday") return `어제 진행 수업 ${y.sessions}건${y.noshows ? `, 노쇼 ${y.noshows}건` : ""}.`;
  if (key === "month") return `이번 달 매출 ${won(m.revenueNet)}${m.progressPct != null ? ` (목표 대비 ${m.progressPct}%)` : ""} · 신규 등록 ${m.newRegs}건.`;
  if (key === "watch") return `이탈 위험 ${w.churnRisk}명 · 만료 임박 ${w.expiring}명 · 미처리 예약 ${w.pastDue}건.`;
  if (key === "today") return top.length ? top.map((c, i) => `${i + 1}. ${c.title}`).join(" ") : "오늘 급히 챙길 항목은 없어요.";
  return "";
}
```

### 3-3. 생성 함수 (getSession 토큰 → Bearer → POST)
```js
async function genReport() {
  if (!supabase) return;
  setRepState("loading"); setRepErr("");
  try {
    const digest = ownerDailyDigest({ members, otRows, contracts, logs, appts, goals, ym, nowISO }); // members=rows(hidden 포함)
    // top3 트레이너명 클라에서 해소(라우트엔 읽기용 title만).
    const readableTop3 = digest.top3.map((c) => ({
      kind: c.kind,
      title: c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title,
      detail: c.detail, amount: c.amount ?? null,
    }));
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch("/api/owner-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ digest: { ...digest, top3: readableTop3 } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && data?.code === "premium_required") { setRepState("premium"); return; }
      setRepErr(data?.error || "보고서 생성에 실패했어요."); setRepState("error"); return;
    }
    // 섹션 비면 결정적 폴백으로 메움.
    const secs = data?.sections || {};
    const filled = ["yesterday","month","watch","today"].reduce((o, k) => { o[k] = secs[k] || fallbackLine(k, digest); return o; }, {});
    setRep({ headline: data?.headline || "", sections: filled, closing: data?.closing || "" });
    setRepState("ready");
  } catch {
    setRepErr("네트워크 오류로 실패했어요."); setRepState("error");
  }
}
```
> `members`(=props, hidden 포함)·`otRows`·`contracts`·`logs`·`appts`·`goals`·`ym`·`nowISO`·`nameOf`·`top`·`won`은 기존 스코프.

### 3-4. 렌더 (룰 카드 블록 **아래** · 최하단 캡션 위 · 룰 부분 무변)
```jsx
{/* ===== 오늘의 보고서(온디맨드 AI · premium) — 룰 카드는 위에 이미 렌더됨 ===== */}
{supabase && (
  <div className="pt-1">
    {(repState === "idle" || repState === "error" || repState === "premium") && (
      <button type="button" onClick={genReport}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-[13px] font-bold text-ink hover:bg-card">
        <FileText className="h-4 w-4 text-cyan-700" /> 오늘의 보고서 받기
      </button>
    )}
    {repState === "loading" && (
      <div className="inline-flex items-center gap-2 text-[13px] text-sub">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700" /> 오늘의 보고서를 작성하고 있어요…
      </div>
    )}
    {repState === "premium" && (
      <p className="mt-2 text-[12px] text-muted">AI 보고서는 프리미엄 전용이에요. (위 3가지는 그대로 챙기시면 돼요.)</p>
    )}
    {repState === "error" && (
      <p className="mt-2 text-[12px] text-sub">{repErr}{" "}<span className="text-cyan-700 underline underline-offset-2">다시 시도</span></p>
    )}

    {repState === "ready" && rep && (
      <Card>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2 border-b border-line pb-2">
            <div>
              <div className="text-[11px] font-bold tracking-label-ko text-muted">오늘의 운영 보고서</div>
              <div className="text-[12px] text-sub">{dateLabel}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={genReport} className="text-[11px] font-semibold text-muted underline underline-offset-2">다시 생성</button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted"><Printer className="h-3.5 w-3.5" /> 인쇄</button>
            </div>
          </div>
          {rep.headline && <p className="text-sm font-bold text-ink">{rep.headline}</p>}
          {[
            { k: "yesterday", h: "어제 마감" },
            { k: "month", h: "이번 달 진행 상황" },
            { k: "watch", h: "지금 주의할 회원" },
            { k: "today", h: "오늘 챙길 것" },
          ].map(({ k, h }) => (
            <div key={k}>
              <div className="text-[11px] font-bold tracking-label-ko text-muted">{h}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-sub">{rep.sections[k]}</p>
            </div>
          ))}
          {rep.closing && <p className="pt-1 text-[12px] italic text-muted">{rep.closing}</p>}
          <p className="text-[10px] leading-relaxed text-muted">AI가 오늘 지표를 정리한 보고서예요. 금액은 과거 평균 기반 추정입니다.</p>
        </div>
      </Card>
    )}
  </div>
)}
```

**불변 보증(리뷰 포인트)**
- 룰 카드(`top.map`)·빈상태(`top.length === 0`)·최하단 캡션 **무변**. 보고서 블록은 그 아래 additive.
- `top.length === 0`이어도 보고서는 받을 수 있음(어제/이번달/주의 숫자는 여전히 유효 · today 섹션만 "급히 챙길 것 없음"). ⚠️ 단 데이터 자체가 텅 빈 베타 첫날이면 숫자 대부분 0 → 보고서가 "조용한 하루" 톤이 됨(정상).
- 색: cyan(강조)·muted/sub(본문)·danger-text 없음. `emerald` 미사용.
- 자동 호출 0(useEffect 신설 X) — **버튼 클릭에서만** fetch. `ownerDailyDigest`도 클릭 시 1회 계산(마운트 시 아님).

---

## 4. 프롬프트 대전제 (§2 코드 반영 · 요지)
- **역할:** 원장의 운영 참모. 아침 30초 파악용 **보고서**(대회원 대사 아님 · 내부 운영).
- **근거 한정:** 준 digest 숫자만. 회원 이름·구체 수치·에피소드 지어내기 금지.
- **추정 명시:** 금액은 과거 평균 기반 추정 → 단정 금지("목표 대비 ~%", "성사되면 대략").
- **톤:** 담백·행동지향. 0/빈 데이터는 부풀리지 말고 담백히.
- **출력:** `{headline, sections{yesterday,month,watch,today}, closing}` JSON. 구조는 **클라 소유**(제목·날짜·섹션 제목 고정) · AI는 **문장만**. 섹션 누락 시 클라가 숫자로 결정적 폴백 → 빈 구멍 없음.

---

## 5. 검증

**웹Claude (구현 전)**
- `ownerDailyDigest` **신규 로직**(어제/오늘 KST 일자 필터·progressPct·shape·빈입력) 토이 데이터 Node 검증 — 기존 파생은 스텁(합성 정확성은 대수 런타임+웹 diff 리뷰). ⇒ **완료(아래 §부록 로그 참조)**.
- 라우트 `factsBlock`·`buildPrompt`·`parseReport` Node 검증 — 정상 JSON·코드펜스·앞뒤 잡텍스트·깨진 JSON·섹션 일부 누락·전부 누락 → 파싱/폴백 확인. ⇒ **완료.**

**대수 (구현 후)**
1. `npm.cmd run lint` · `npm.cmd run build` green(신규 경고 0 · 미사용 import 0 · `FileText`/`Loader2`/`Printer`/`ownerDailyDigest`/`supabase` 사용 확인).
2. **⚠️ ownerDailyDigest 시그니처 대조:** `git diff lib/memberStatus.js` 붙여주면 웹이 §1의 CC 확인 포인트(재사용 파생 인자·필드) 정확성 최종 리뷰.
3. **환경변수:** Vercel `ANTHROPIC_API_KEY`(ot-brief 이미 사용 → 있을 것). 없으면 503 → 버튼 "다시 시도" 강등(락아웃 아님).
4. **폰(premium):** 브리핑 탭 → 룰 카드 아래 "오늘의 보고서 받기" → 로딩 → 보고서(제목·날짜·총평·4섹션·마무리). 인쇄 동작.
5. **정합성:** 보고서 숫자 vs 각 탭 — 어제 수업/오늘 예약/이번달 진행수업·신규등록(=CenterMonthSummary 타일)·매출 진도(=매출 탭 게이지)·이탈/만료(=리텐션 탭)·top3(=위 카드). **AI가 준 숫자를 넘는 값을 지어내지 않는지**(환각 체크).
6. **폰(basic 있으면):** 버튼 → "프리미엄 전용" 안내 · 룰 카드 유지.
7. **자동 호출 0:** 탭 진입만으로 `/api/owner-report` 호출 없음(버튼 눌러야 1회) — 네트워크 탭.

---

## 6. 커밋 배치 (배치별 1커밋 = revert 단위 · 스코프 add만 · `git add -A` 금지)
1. `feat(stats): 원장 오늘의 보고서 다이제스트 파생(ownerDailyDigest)` — `lib/memberStatus.js`
   - `git commit -m "feat(stats): 원장 오늘의 보고서 종합 다이제스트 파생(ownerDailyDigest)" -- lib/memberStatus.js`
2. `feat(api): 원장 오늘의 보고서 AI 라우트(owner-report)` — `app/api/owner-report/route.js`(**신규 · `git add` 먼저**)
   - `git add app/api/owner-report/route.js`
   - `git commit -m "feat(api): 원장 오늘의 보고서 AI 라우트(owner-report · Sonnet · premium)" -- app/api/owner-report/route.js`
3. `feat(admin): 오늘의 보고서 받기 버튼+보고서 뷰(OwnerBriefing)` — `components/admin/OwnerBriefing.jsx`
   - `git commit -m "feat(admin): 원장 오늘의 보고서 온디맨드 버튼/보고서 뷰" -- components/admin/OwnerBriefing.jsx`

> ⚠️ working tree `/lp` AuthGate WIP + untracked docs → **스코프 add만.** `git add -A`/`commit -am` 금지.

---

## 7. 성격·주의·후속
- **additive:** DB 쿼리 0 · 마이그레이션 0 · RLS/payload 무변. 기존 파생·`requireTrainer`·`admin/page.jsx` 무변.
- **⚠️ 원장 = 활성 트레이너 행 확인**(owner-brief 스펙과 동일): `requireTrainer`가 `trainer.active`를 요구. 원장이 그 계정의 활성 트레이너로 로그인하는 구조면 통과. 1차 스모크에서 원장 계정이 통과하는지 먼저 확인(막히면 requireOwner 변형).
- **premium 확인 위치:** 라우트 로컬(`accountIsPremium`) — 공용 `requireTrainer` 불변. (대안: `requireTrainer(request,{plan})` 옵션 통합 = 공용 파일 건드려 전 AI 라우트 회귀대상 → 이번은 로컬.)
- **후속(선택):** ① **발송(매일 아침 자동)** — 지금은 온디맨드 버튼. 나중에 원하면 Vercel Cron + 이메일(Resend) 또는 카카오 알림톡으로 승급(백로그 `v2-백로그-알림리마인더.md` 2·3단계). 이 보고서 파생·라우트가 그대로 재료가 됨. ② 보고서 PDF 저장 · ③ 어제 대비 증감(전일 스냅샷 쌓이면).

## 8. CLAUDE.md 동기화 포인트 (구현·커밋 후)
- Server API routes에 **`app/api/owner-report`**(원장 오늘의 보고서 AI · Sonnet · premium 게이트 · `ownerDailyDigest` 숫자 문장화 · DB fetch 0) 추가.
- `lib/memberStatus.js` 파생에 **`ownerDailyDigest`**(종합 다이제스트 조립 · 기존 파생 재사용 + 어제/오늘 KST 필터) 등재.
- admin '브리핑' 탭 설명에 "룰 top3 카드 + **온디맨드 AI '오늘의 보고서'(premium · 종합 다이제스트 · 클라 메모리 캐시)**" 한 줄.
