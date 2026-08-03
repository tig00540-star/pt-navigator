# 스펙 v2 — 원장 "오늘의 보고서" **구조화 개편**(매출 파이프라인 + 트레이너 코칭 + 견고성 · 2026-07-28)

> **배경:** v1(owner-report) 배포·작동 확인. 피드백 = **AI가 전부 줄글로 늘어놓아 한눈에 안 들어옴.** → **하이브리드 재설계:** 숫자·회원·트레이너는 **결정적 표/리스트로 렌더**(스캔·환각 0), **AI는 총평 1줄 + 트레이너 코칭 통찰만**.
> **추가 요청:** ①매출 파이프라인 — 어떤 트레이너가 어떤 회원(신규/재등록)으로 **얼마** 예상, **총 얼마**. ②오늘 챙길 것을 트레이너 약점 근거로 **구체 코칭**. ③**견고성** — AI 실패·premium이어도 결정적 블록은 그대로 노출.
> **결정(대수 확정):** 금액 **회원별**까지(재등록=회원 `amount_total`·신규=`avgNewAmount` 평균 라벨).
> **협업 그대로:** 웹=스펙+diff리뷰+순수함수 검증 / CC=구현 / 대수=커밋. additive 우선 · 로직/RLS/payload 불변 · 코드 내용 매칭 · 새 파일 `git add` 먼저 · 배치별 1커밋 · `npm.cmd`.
> **불변:** `ownerDailyDigest`(committed `51af15d`)·`requireTrainer`·`admin/page.jsx`·기존 파생 안 건드림. 신규 파생 1(`ownerReportData` · ownerDailyDigest 래핑) + 라우트 출력 개편 + `OwnerBriefing` 렌더 개편.

---

## 0. 무엇이 결정적 렌더고 무엇이 AI인가 (핵심)

| 블록 | 출처 | 방식 | AI 실패 시 |
|---|---|---|---|
| 총평 1줄(headline) | AI | 서술 | 생략(블록 유지) |
| 💰 매출 파이프라인 | 파생(`ownerReportData.pipeline`) | **결정적 표** | 그대로 노출 |
| 📊 어제·이번달 KPI | 파생(`ownerDailyDigest`) | **결정적 타일** | 그대로 노출 |
| ⚠️ 주의 회원 | 파생(`watchLists`) | **결정적 리스트** | 그대로 노출 |
| 🎯 오늘 챙길 코칭 | AI(약점·top3 근거) | 서술 | **결정적 폴백**(약점 msg+top3) |

→ **AI는 headline+coaching만.** 나머지는 파생 그대로 → 대표가 스캔 · AI가 숫자 지어낼 여지 0 · **AI가 죽어도 보고서는 산다.**

---

## 1. `lib/memberStatus.js` — 신규 `ownerReportData` (파일 끝 append · ⚠️ mount-cache → diff 리뷰)

> `ownerDailyDigest`(committed) **래핑** — 요약 숫자 그대로 두고 **pipeline·watchLists·trainerCoaching** 추가. 파이프라인 금액은 `amount_total`(재등록 회원 본인)·`avgNewAmount`(신규 평균). 코칭은 `TrainerQualityReport` '전체 뷰' 로직·임계·메시지 **그대로 재사용**(인앱 오늘의 리포트와 일관).

```js
/* =========================================================================
   #6 원장 "오늘의 보고서" v2 — 구조화 데이터(파이프라인·주의회원·트레이너 코칭).
   ownerDailyDigest(요약 숫자) 래핑 + 추가. 금액=amount_total(재등록 본인)/avgNewAmount(신규 평균).
   코칭=TrainerQualityReport 전체뷰 로직 재사용(가장 약한 1개). 이름은 컴포넌트가 해소(여긴 id).
   ========================================================================= */
export function ownerReportData({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], ym, nowISO } = {}) {
  const base = ownerDailyDigest({ members, otRows, contracts, logs, appts, goals, ym, nowISO });

  const now = typeof nowISO === "string" ? nowISO : "";
  const kstMs = (Date.parse(now) || 0) + 9 * 3600 * 1000;
  const todayISO = new Date(kstMs).toISOString().slice(0, 10);
  const hISO     = new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10);

  const visible = (members || []).filter((m) => m && !m.hidden);
  const byId = new Map(visible.filter((m) => m?.id).map((m) => [m.id, m]));
  const memberTrainer = new Map(visible.filter((m) => m?.id).map((m) => [m.id, m.trainer_id ?? "unknown"]));

  const avgNew = avgNewAmount(contracts);
  const avgRe  = avgReregisterAmount(contracts);

  // ── 매출 파이프라인 ──
  // 신규(이번주 클로징 임박 · user_id dedup) — 금액=센터 평균 신규(개인 이력 없음).
  const otIds    = new Set(visible.filter((m) => viewFor(m) === "ot").map((m) => m.id));
  const validIds = new Set(visible.map((m) => m.id));
  const dueRaw   = closingDueSoon(otRows, { todayISO, horizonISO: hISO, otMemberIds: otIds, validMemberIds: validIds });
  const seenNew  = new Set();
  const newCandidates = [];
  for (const d of dueRaw) {
    if (!d || seenNew.has(d.user_id)) continue;
    seenNew.add(d.user_id);
    newCandidates.push({ user_id: d.user_id, trainerId: byId.get(d.user_id)?.trainer_id ?? "unknown", amount: avgNew });
  }
  // 재등록(만료임박) — 금액=회원 본인 현재 계약 amount_total(있으면) 아니면 센터 평균 재등록.
  const exp = expiringMembers(visible, contracts, logs, { nowISO: now });
  const reCandidates = exp.map((e) => ({
    user_id: e.user_id,
    trainerId: e.trainer_id ?? "unknown",
    amount: typeof e.active?.amount_total === "number" ? e.active.amount_total : avgRe,
  }));

  const sumAmt = (arr) => arr.reduce((s, c) => s + (typeof c.amount === "number" ? c.amount : 0), 0);
  const newTotal = sumAmt(newCandidates);
  const reTotal  = sumAmt(reCandidates);

  const byTrainerMap = new Map();
  const bump = (tid, isNew, amt) => {
    let r = byTrainerMap.get(tid);
    if (!r) { r = { trainerId: tid, newCount: 0, reCount: 0, subtotal: 0 }; byTrainerMap.set(tid, r); }
    if (isNew) r.newCount += 1; else r.reCount += 1;
    r.subtotal += (typeof amt === "number" ? amt : 0);
  };
  newCandidates.forEach((c) => bump(c.trainerId, true, c.amount));
  reCandidates.forEach((c) => bump(c.trainerId, false, c.amount));
  const byTrainer = [...byTrainerMap.values()].sort((a, b) => b.subtotal - a.subtotal);

  const pipeline = {
    avgNew, avgRe, newEstimable: avgNew != null,
    newCandidates, reCandidates, byTrainer,
    newTotal, reTotal, grandTotal: newTotal + reTotal,
  };

  // ── 주의 회원(상위 6 · 이름은 컴포넌트 해소) ──
  const churn = churnRiskMembers(visible, contracts, logs, { nowISO: now });
  const watchLists = {
    churn:    churn.slice(0, 6).map((c) => ({ user_id: c.user_id, trainerId: c.trainer_id ?? "unknown", gap: c.gap ?? null, remTotal: c.rem?.total ?? null })),
    expiring: exp.slice(0, 6).map((e)   => ({ user_id: e.user_id, trainerId: e.trainer_id ?? "unknown", remTotal: e.rem?.total ?? null })),
  };

  // ── 트레이너 코칭(TrainerQualityReport 전체뷰 로직·임계·메시지 그대로) ──
  const TH = { obsAvgWarn: 0.5, gapWarn: 0.34, logRateWarn: 0.8, minObs: 3, minBrief: 1, minLog: 3, minClose: 3, closeWarn: 0.5, reRegWarn: 0.5 };
  const pctS = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
  const obsQ     = observationQualityByTrainer(otRows, memberTrainer);
  const gapsMap  = briefGapsByTrainer(otRows, contracts, memberTrainer);
  const logRate  = logWriteRateByTrainer(logs, memberTrainer, ym);
  const closeRnd = closingStatsByRoundByTrainer(otRows, memberTrainer);
  const reRegMap = reregisterStatsByTrainer(contracts);
  const trainerIds = new Set([...obsQ.keys(), ...gapsMap.keys(), ...logRate.keys(), ...closeRnd.keys(), ...reRegMap.keys()]);
  const trainerCoaching = [];
  for (const tid of trainerIds) {
    const o = obsQ.get(tid), g = gapsMap.get(tid), lr = logRate.get(tid), cr = closeRnd.get(tid), rr = reRegMap.get(tid);
    const cands = [];
    if (o && o.members >= TH.minObs && o.avgScore != null && o.avgScore < TH.obsAvgWarn)
      cands.push({ gap: TH.obsAvgWarn - o.avgScore, msg: `1차 관찰 기록이 얇아요 — 평균 ${pctS(o.avgScore)}` });
    const briefTot = g ? g.otBriefs + g.regBriefs : 0;
    const gapRatio = briefTot > 0 ? (g.otGaps + g.regGaps) / briefTot : null;
    if (briefTot >= TH.minBrief && gapRatio != null && gapRatio > TH.gapWarn)
      cands.push({ gap: gapRatio - TH.gapWarn, msg: `브리핑 근거부족이 잦아요 — ${pctS(gapRatio)}` });
    if (lr && lr.total >= TH.minLog && lr.rate != null && lr.rate < TH.logRateWarn)
      cands.push({ gap: TH.logRateWarn - lr.rate, msg: `이달 일지 작성이 부족해요 — ${pctS(lr.rate)}` });
    const r2 = cr?.r2;
    if (r2 && r2.attempted >= TH.minClose && r2.rate != null && r2.rate < TH.closeWarn)
      cands.push({ gap: TH.closeWarn - r2.rate, msg: `2차 클로징이 낮아요 — ${pctS(r2.rate)}` });
    if (rr && rr.attempted >= TH.minClose && rr.rate != null && rr.rate < TH.reRegWarn)
      cands.push({ gap: TH.reRegWarn - rr.rate, msg: `재등록이 낮아요 — ${pctS(rr.rate)}` });
    if (!cands.length) continue;
    cands.sort((a, b) => b.gap - a.gap);
    trainerCoaching.push({ trainerId: tid, msg: cands[0].msg });
  }

  return { ...base, pipeline, watchLists, trainerCoaching };
}
```

**⚠️ CC 확인(실제 시그니처 대조 · 웹 diff 검증):**
- `avgNewAmount(contracts)`·`avgReregisterAmount(contracts)` → `amount_total`·`kind`·`counts_as_revenue` 기반(확인됨). `expiringMembers`가 `.active`(계약)·`.rem` 반환 → `active.amount_total` 접근.
- 코칭 파생 5종(`observationQualityByTrainer`·`briefGapsByTrainer`·`logWriteRateByTrainer`·`closingStatsByRoundByTrainer`·`reregisterStatsByTrainer`)·반환 필드(`avgScore`·`otBriefs/regBriefs/otGaps/regGaps`·`total/rate`·`r2.{attempted,rate}`·`{attempted,rate}`) → **`TrainerQualityReport.jsx`가 쓰는 그대로**. 임계 `TH`·메시지도 그 컴포넌트와 동일.

---

## 2. `app/api/owner-report/route.js` — 출력 개편(headline + coaching만)

> v1은 4섹션 서술을 다 만들었음 → **이제 AI는 총평 1줄 + 코칭 배열만.** 게이트/`requireTrainer`/premium/에러 셰이프 **뼈대 불변**, **바뀌는 건 입력 조립·프롬프트·파서·출력**뿐.

### 2-1. 입력(클라가 보내는 `input`)
```
{ ym, yesterday, today, month, members, watch,        // KPI 숫자(총평 맥락)
  top3: [{title, detail, amount}],                     // 읽기용(트레이너명 해소됨)
  trainerCoaching: [{trainer, msg}],                   // 트레이너명 해소 + 약점 메시지
  pipeline: { newCount, reCount, grandTotal } }        // 파이프라인 총량(회원명·PII 없음)
```
> 회원 이름은 **AI에 안 보냄**(파이프라인·주의 회원은 클라 렌더). AI엔 트레이너명·집계 숫자만.

### 2-2. 프롬프트·파서·핸들러 교체분
```js
const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") + "원" : "—");

function factsBlock(d) {
  const m = d?.month || {}, y = d?.yesterday || {}, t = d?.today || {}, w = d?.watch || {}, p = d?.pipeline || {};
  const top = Array.isArray(d?.top3) ? d.top3 : [];
  const coach = Array.isArray(d?.trainerCoaching) ? d.trainerCoaching : [];
  const topLines = top.length ? top.map((it, i) => `  ${i + 1}) ${[it?.title, it?.detail].filter(Boolean).join(" · ")}`).join("\n") : "  (없음)";
  const coachLines = coach.length ? coach.map((c) => `  - ${c.trainer}: ${c.msg}`).join("\n") : "  (약점 신호 없음)";
  return [
    `[어제] 수업 ${y.sessions ?? 0}건·노쇼 ${y.noshows ?? 0} / [오늘] 예약 ${t.bookings ?? 0}`,
    `[이번 달] 매출 ${won(m.revenueNet)}${m.revenueTarget ? ` (목표 대비 ${m.progressPct ?? "—"}%)` : ""} · 신규등록 ${m.newRegs ?? 0}건`,
    `[매출 파이프라인] 신규 후보 ${p.newCount ?? 0}명 · 재등록 후보 ${p.reCount ?? 0}명 · 성사 시 합계 ${won(p.grandTotal)}(추정)`,
    `[주의] 이탈위험 ${w.churnRisk ?? 0}명 · 만료임박 ${w.expiring ?? 0}명 · 미처리 ${w.pastDue ?? 0}건`,
    `[오늘 챙길 것 top3]\n${topLines}`,
    `[트레이너 약점 신호]\n${coachLines}`,
  ].join("\n");
}

const PREAMBLE = `너는 피트니스 센터 원장의 운영 참모다. 주어진 숫자·약점 신호만 근거로, 원장이 오늘 뭘 할지 콕 집어준다. 없는 사실(회원 이름·구체 수치·에피소드)을 지어내지 않고, 금액은 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.`;

function buildPrompt(d) {
  return `아래는 오늘 아침 우리 센터 실측 요약이다. 이 숫자·신호만 근거로 원장 브리핑을 써라.

${factsBlock(d)}

아래 JSON만 출력(코드블록·설명 금지):
{"headline":"오늘 상황·우선순위 한 문장","coaching":["실행 지시 1","실행 지시 2","..."]}
- headline: 오늘 가장 중요한 것 한 문장(예: 재등록 우선·특정 코치 코칭 필요).
- coaching: 3~5개. 각 항목은 '누가·무엇을·오늘 어떻게'가 담긴 구체 실행 지시.
  · [트레이너 약점 신호]가 있으면 그 코치를 지목해 오늘 할 개인 교육을 구체적으로(예: "박코치 2차 클로징이 낮으니 오늘 '가격·생각해볼게요' 거절 롤플레이 10분").
  · top3의 재등록·신규·이탈 항목은 오늘의 액션으로(예: "재등록 임박 회원부터 오늘 연락").
- 준 숫자를 새로 지어내거나 부풀리지 마라. 신호가 거의 없으면 담백하게 1~2개만.`;
}

function parseOwnerReport(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj = null;
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  try { if (s !== -1 && e > s) obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== "object") return null;
  const headline = typeof obj.headline === "string" ? obj.headline.trim() : "";
  const coaching = Array.isArray(obj.coaching)
    ? obj.coaching.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()).slice(0, 6)
    : [];
  if (!headline && coaching.length === 0) return null;
  return { headline, coaching };
}
```
- POST 핸들러: v1과 동일(requireTrainer → apiKey 503 → premium 403 → body/크기 검증). **바뀌는 부분:** `const d = body?.input;`(← `body?.digest` 대신 · 없으면 400 `fallback:"rule"`) · `content: buildPrompt(d)` · `max_tokens: 1024` · `parseOwnerReport(textOut)` · 실패 502 `fallback:"rule"`. 모델·runtime·maxDuration·thinking·premium 로직 그대로.

---

## 3. `components/admin/OwnerBriefing.jsx` — 렌더 개편 (⚠️ 견고성: 결정적 ↔ AI 분리)

> `ownerDailyDigest` → **`ownerReportData`**. 렌더 = **결정적 4블록(항상) + AI(총평·코칭 · 실패해도 블록 유지)**. 룰 카드(`top`)·빈상태·캡션 무변.

### 3-1. import
- `ownerDailyDigest` → **`ownerReportData`**로 교체 import. lucide에 `Wallet`·`AlertTriangle`·`Sparkles` 추가(기존 `FileText`·`Loader2`·`Printer` 유지).

### 3-2. 상태 + 이름 해소 + 생성 (★ 결정적 렌더와 AI 분리)
```js
const [report, setReport] = useState(null);     // ownerReportData 결과 · presence=보고서 노출(결정적)
const [ai, setAi] = useState(null);             // { headline, coaching } | null (AI 성공 시)
const [aiState, setAiState] = useState("idle"); // idle | loading | ready | premium | failed
const [aiErr, setAiErr] = useState("");
const nameById = useMemo(() => new Map((members || []).filter((m) => m?.id).map((m) => [m.id, m.name])), [members]);
const memberName = (id) => personName(nameById.get(id)) || "회원";
// nameOf(트레이너)·dateLabel·won은 기존/앞 스펙 그대로.

// 결정적 코칭 폴백(AI 실패·premium 시) — 트레이너 약점 msg + top3 제목.
function fallbackCoaching(d) {
  return [...d.trainerCoaching.map((c) => `${nameOf(c.trainerId)}: ${c.msg}`), ...top.map((c) => c.title)].slice(0, 6);
}

async function genReport() {
  if (!supabase) return;
  const d = ownerReportData({ members, otRows, contracts, logs, appts, goals, ym, nowISO });
  setReport(d);                       // ★ 결정적 4블록 즉시 노출(AI 성패와 무관)
  setAi(null); setAiErr(""); setAiState("loading");
  try {
    const aiInput = {
      ym: d.ym, yesterday: d.yesterday, today: d.today, month: d.month, members: d.members, watch: d.watch,
      top3: d.top3.map((c) => ({ title: c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title, detail: c.detail, amount: c.amount ?? null })),
      trainerCoaching: d.trainerCoaching.map((c) => ({ trainer: nameOf(c.trainerId), msg: c.msg })),
      pipeline: { newCount: d.pipeline.newCandidates.length, reCount: d.pipeline.reCandidates.length, grandTotal: d.pipeline.grandTotal },
    };
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch("/api/owner-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ input: aiInput }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && body?.code === "premium_required") { setAiState("premium"); return; }  // ★ report 유지
      setAiErr(body?.error || "AI 요약 생성 실패"); setAiState("failed"); return;                        // ★ report 유지
    }
    setAi({ headline: body?.headline || "", coaching: Array.isArray(body?.coaching) ? body.coaching : [] });
    setAiState("ready");
  } catch {
    setAiErr("네트워크 오류"); setAiState("failed");                                                     // ★ report 유지
  }
}
```
> **핵심:** `setReport(d)`가 **fetch 이전**에 실행 → 파이프라인·KPI·주의 블록은 AI 성패와 무관하게 항상 뜬다. AI(총평·코칭)만 `aiState`로 별도 관리 → 실패·premium이어도 보고서 본문 유지, 코칭은 `fallbackCoaching` 대체.
> **premium 정책:** 결정적 보고서(파생·비용 0)는 노출하고 **AI 총평·코칭만 프리미엄**(basic도 데이터·기본 코칭은 봄). 보고서 전체를 premium으로 막으려면 클라 `auth_account_plan` 확인 후 게이팅 — 필요 시 별도 요청.

### 3-3. 렌더 (버튼→보고서 · 결정적 블록 항상 · AI만 적응 · 색: cyan 기회 / danger-text 주의 / muted 보조)
```jsx
{/* 버튼: 아직 안 받았을 때만 */}
{supabase && !report && (
  <button type="button" onClick={genReport}
    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-[13px] font-bold text-ink hover:bg-card">
    <FileText className="h-4 w-4 text-cyan-700" /> 오늘의 보고서 받기
  </button>
)}

{/* 보고서(결정적) — report 있으면 항상. AI는 안쪽에서만 적응 */}
{supabase && report && (
  <Card>
    <div className="space-y-4">
      {/* 머리글 + AI 총평 */}
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
      {aiState === "ready" && ai?.headline && <p className="text-sm font-bold text-ink">{ai.headline}</p>}
      {aiState === "loading" && <div className="inline-flex items-center gap-2 text-[12px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-700" /> AI 총평·코칭 작성 중…</div>}

      {/* 💰 매출 파이프라인 (결정적) */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-label-ko text-muted"><Wallet className="h-3.5 w-3.5" /> 오늘의 매출 파이프라인</div>
        {report.pipeline.byTrainer.length === 0 ? (
          <p className="text-[12px] text-muted">이번 주 신규·재등록 임박 후보가 없어요.</p>
        ) : (
          <div className="space-y-1.5">
            {report.pipeline.byTrainer.map((r) => (
              <div key={r.trainerId} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-ink">{nameOf(r.trainerId)}</span>
                  <span className="font-mono text-[13px] font-extrabold text-cyan-700">≈ {won(r.subtotal)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-sub">신규 {r.newCount} · 재등록 {r.reCount}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                  {report.pipeline.reCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => (
                    <span key={"r" + c.user_id}>{memberName(c.user_id)}<span className="text-danger-text">(재등록)</span> {typeof c.amount === "number" ? `≈${won(c.amount)}` : ""}</span>
                  ))}
                  {report.pipeline.newCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => (
                    <span key={"n" + c.user_id}>{memberName(c.user_id)}<span className="text-cyan-700">(신규)</span> {typeof c.amount === "number" ? `≈${won(c.amount)}` : ""}</span>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[12px] font-bold text-ink">총 예상 매출</span>
              <span className="font-mono text-sm font-extrabold text-cyan-700">≈ {won(report.pipeline.grandTotal)}</span>
            </div>
            <p className="text-[10px] text-muted">성사 시 합계 · 재등록=회원 현재 계약 기준 · 신규={report.pipeline.newEstimable ? "센터 평균 추정" : "이력 부족(산정 불가)"}.</p>
          </div>
        )}
      </div>

      {/* 📊 어제·이번달 (결정적) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "어제 수업", value: `${report.yesterday.sessions}건`, sub: report.yesterday.noshows ? `노쇼 ${report.yesterday.noshows}` : "" },
          { label: "오늘 예약", value: `${report.today.bookings}건`, sub: "" },
          { label: "이달 매출", value: won(report.month.revenueNet), sub: report.month.progressPct != null ? `목표 ${report.month.progressPct}%` : "목표 미설정" },
          { label: "이달 신규등록", value: `${report.month.newRegs}건`, sub: report.month.reRegs ? `재등록 ${report.month.reRegs}` : "" },
        ].map((t) => (
          <div key={t.label} className="rounded-lg bg-elevate px-2.5 py-2">
            <div className="text-[10px] tracking-label-ko text-muted">{t.label}</div>
            <div className="mt-0.5 font-mono text-sm font-extrabold text-ink">{t.value}</div>
            {t.sub && <div className="text-[10px] text-muted">{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* ⚠️ 주의 회원 (결정적) */}
      {(report.watchLists.churn.length > 0 || report.watchLists.expiring.length > 0) && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-label-ko text-muted"><AlertTriangle className="h-3.5 w-3.5" /> 지금 주의할 회원</div>
          <div className="space-y-1 text-[12px]">
            {report.watchLists.churn.map((c) => (
              <div key={"c" + c.user_id} className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-danger-text">이탈위험</span>
                <span className="font-medium text-sub">{memberName(c.user_id)}</span>
                <span className="text-[11px] text-muted">{nameOf(c.trainerId)} · 잔여 {c.remTotal ?? "—"}회{c.gap != null ? ` · ${c.gap}일 무수업` : ""}</span>
              </div>
            ))}
            {report.watchLists.expiring.map((e) => (
              <div key={"e" + e.user_id} className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">만료임박</span>
                <span className="font-medium text-sub">{memberName(e.user_id)}</span>
                <span className="text-[11px] text-muted">{nameOf(e.trainerId)} · 잔여 {e.remTotal ?? "—"}회</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🎯 오늘 챙길 코칭 (AI · 실패/premium이면 결정적 폴백) */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-label-ko text-muted"><Sparkles className="h-3.5 w-3.5 text-cyan-700" /> 오늘 챙길 코칭</div>
        {aiState === "loading" ? (
          <div className="text-[12px] text-muted">코칭 생성 중…</div>
        ) : (
          <>
            <ul className="space-y-1">
              {(aiState === "ready" && ai?.coaching?.length ? ai.coaching : fallbackCoaching(report)).map((c, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-sub"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-cyan-700" />{c}</li>
              ))}
            </ul>
            {aiState === "premium" && <p className="mt-1 text-[11px] text-muted">AI 코칭은 프리미엄 전용이에요 — 기본 코칭을 표시했어요.</p>}
            {aiState === "failed" && <p className="mt-1 text-[11px] text-sub">{aiErr} · <button type="button" onClick={genReport} className="font-semibold text-cyan-700 underline underline-offset-2">다시 시도</button></p>}
          </>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-muted">숫자·회원·금액은 실측 파생, 총평·코칭만 AI예요. 금액은 추정입니다.</p>
    </div>
  </Card>
)}
```

**불변 보증**
- 룰 카드·빈상태·최하단 캡션 무변. `ownerDailyDigest`(51af15d)·`requireTrainer`·`admin/page.jsx` 무변 — `ownerReportData`가 래핑만.
- **견고성:** `setReport(d)`가 fetch 전 → 결정적 4블록 항상 노출. AI `failed`/`premium`이어도 보고서 유지 · 코칭은 `fallbackCoaching`. `loading`만 코칭 자리에 "생성 중".
- 색 cyan/danger-text/muted만 · emerald 없음 · 자동호출 0(버튼·다시 생성/시도만).

---

## 4. 검증
**웹Claude(구현 전) — 완료(Node 19/19):** `ownerReportData` 파이프라인(dedup·회원별 amount_total vs 평균 폴백·byTrainer 소계·총액·null)·트레이너 코칭(임계·min표본·최약1개)·라우트 `parseOwnerReport`(headline+coaching·코드펜스·깨진 JSON·빈값) 전부 PASS.

**대수(구현 후):**
1. `npm.cmd run lint`·`build` green(신규 import `ownerReportData`·`Wallet`·`AlertTriangle`·`Sparkles` 사용 · 미사용 0).
2. **⚠️ `git diff lib/memberStatus.js`**(=`ownerReportData`) 붙여주면 웹이 §1 CC 확인 포인트(계약 `amount_total`·`active` 접근·코칭 파생 반환필드) 최종 대조.
3. **폰(premium):** 보고서 → 파이프라인(트레이너·회원별 금액·총액) · KPI · 주의회원 · 🎯코칭(트레이너 지목). 인쇄.
4. **⚠️ 견고성 스모크:** ①**정상**: AI 총평+코칭 뜸. ②**AI 강제 실패**(예: 네트워크 끊고 눌러보기) → **파이프라인·KPI·주의는 그대로**, 코칭만 결정적 폴백 + "다시 시도". ③**basic 계정**(있으면) → 보고서 뜨고 코칭은 결정적 폴백 + "프리미엄 전용" 안내(락아웃 없음).
5. **정합성:** 파이프라인 신규명수=전환탭 이번주 임박·재등록명수=리텐션 만료임박 · 재등록 회원 금액=그 회원 `amount_total` · 총액=회원별 합 · 코칭 문구=트레이너 탭 '오늘의 리포트' 전체뷰와 동일.
6. **환각 체크:** AI 코칭이 준 약점신호·top3 넘어 회원명/수치 지어내지 않는지.

## 5. 커밋 배치 (스코프 add만 · `git add -A` 금지)
1. `feat(stats): 원장 보고서 구조화 데이터 파생(ownerReportData · 파이프라인·주의·코칭)` — `lib/memberStatus.js`
2. `feat(api): owner-report 출력 개편(총평+코칭 · 파이프라인은 클라 렌더)` — `app/api/owner-report/route.js`
3. `feat(admin): 오늘의 보고서 구조화 렌더 + 견고성(결정적 블록·AI 분리)` — `components/admin/OwnerBriefing.jsx`

## 6. 성격
- **additive:** DB/마이그레이션/RLS 0. `ownerReportData`는 기존 파생 재사용 조립. `ownerDailyDigest`·`requireTrainer`·`admin/page.jsx` 무변.
- **AI 최소화·격리:** 호출 1회(max_tokens 1024) · 금액·회원·명수는 결정적 → 대표 신뢰 · **AI가 죽어도 보고서는 산다.**

## 7. 후속(선택)
- **매일 아침 자동 발송**(백로그 2·3단계 · Cron+이메일/카톡) — 이 파생·라우트 그대로 재료.
- 재등록 금액을 '본인 계약 × 재등록률' 기대값(확률 가중) 옵션화 · 어제 대비 증감(전일 스냅샷).
- 보고서 전체를 premium으로 막는 옵션(클라 `auth_account_plan` 게이팅).

## 8. CLAUDE.md 동기화 포인트
- `lib/memberStatus.js`에 `ownerReportData`(보고서 구조화: 매출 파이프라인·주의회원·트레이너 코칭 · 기존 파생 재사용) 등재.
- `app/api/owner-report` = 총평+코칭만 생성(파이프라인·KPI·주의는 클라 결정적 렌더 · AI 실패해도 블록 유지).
- 브리핑 탭 "오늘의 보고서" = 결정적 4블록 + AI(총평·코칭) 하이브리드 · **견고성**(AI 격리).
