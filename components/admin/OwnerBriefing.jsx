"use client";
/* =========================================================================
   #6 원장 브리핑 — admin '브리핑' 탭(기본 랜딩). "오늘 챙길 것 3가지".
   ownerBriefing(기존 파생 조립)의 top 3을 카드로. 룰 기반·결정적(AI 서술은 후속).
   회원신호=visible · 노쇼 트레이너 귀속=전체 회원맵. 색: 기회 cyan · 위험 rose · 위생 muted.
   ========================================================================= */
import { useMemo, useState, useEffect } from "react";
import { RefreshCw, CalendarCheck, ChevronDown, Filter, TrendingDown, CalendarClock, UserX, Target, CheckCircle2, ChevronRight, FileText, Loader2, Printer, Wallet, AlertTriangle, Sparkles } from "lucide-react";
import { ownerBriefing, ownerReportData, churnRiskMembers, expiringMembers } from "@/lib/memberStatus";
import { won, wonApprox, manwon, personName } from "@/lib/format";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";

// kind별 카드 메타(아이콘·강조색·이동 라벨). 전부 정적 리터럴.
// hideDetail/hideAmount: 제목만으로 뜻이 통하는 카드는 설명글·금액을 지운다.
//   · 재등록·이탈위험은 '몇 명'이 전부다. 밑에 붙던 근거 한 줄은 카드만 무겁게 했다.
//   · 이탈위험 금액은 다른 카드와 성격이 달랐다(앞으로 들어올 돈 vs 이미 받은 미소진 수업료)
//     → 나란히 두면 더 헷갈려서 화면에서 뺀다. 랭킹·AI 입력에는 그대로 쓴다.
const META = {
  otToday:    { icon: CalendarCheck, accent: "cyan", go: "누가 오는지 보기", expand: true }, // 탭=제자리 펼침(이동 아님)
  reregister: { icon: RefreshCw,     accent: "cyan", go: "누구인지 보기", hideDetail: true, expand: true },
  closing:    { icon: Filter,        accent: "cyan", go: "OT 회원 보기" },
  churn:      { icon: TrendingDown,  accent: "rose", go: "누구인지 보기", hideDetail: true, hideAmount: true, expand: true },
  goal:       { icon: Target,        accent: "rose", go: "매출 보기" },
  pastdue:    { icon: CalendarClock, accent: "muted", go: "스케줄 보기" },
  trainer:    { icon: UserX,         accent: "rose", go: "트레이너 보기" },
};
// 이 페이지 세션에서 자동 생성을 시도한 날(KST ymd). 탭을 오갈 때마다 컴포넌트가 새로 마운트되는데,
// 생성이 실패하면 캐시가 안 남아 왕복할 때마다 AI를 다시 부르게 된다. 하루 한 번만 시도한다.
let autoRunDay = null;

const accentText = (a) => (a === "cyan" ? "text-cyan-700" : a === "rose" ? "text-danger-text" : "text-muted");

export default function OwnerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], trainers = [], ym, onGoTab }) {
  const [nowISO] = useState(() => new Date().toISOString());
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(members.map((m) => [m.id, m.trainer_id])), [members]); // 전체(노쇼 귀속)
  const cands = useMemo(
    () => ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO }),
    [visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO]
  );
  // 오늘 신규 OT 예정 — 브리핑 3번 자리.
  // ⚠️ ownerBriefing(금액 랭킹)에 넣지 않는다 — 대표 홈 '지킬 수 있는 매출' 합계와
  //    AI 보고서 입력(top3)이 금액 없는 항목으로 오염된다. 여기서만 끼워 넣는다.
  const otTodayList = useMemo(() => {
    const kstDay = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : new Date(t + 9 * 3600000).toISOString().slice(0, 10); };
    const day = new Date(new Date(nowISO).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const otIds = new Set(visible.filter((m) => m.status === "ot_active").map((m) => m.id));
    const out = [];
    for (const a of appts || []) {
      if (!(a && a.status === "booked" && otIds.has(a.user_id) && kstDay(a.start_at) === day)) continue;
      const kst = new Date(Date.parse(a.start_at) + 9 * 3600000);
      out.push({
        id: a.id ?? `${a.user_id}-${a.start_at}`,
        at: `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
        user_id: a.user_id,
        trainerId: a.trainer_id ?? "unknown",
        sort: Date.parse(a.start_at),
      });
    }
    return out.sort((x, y) => x.sort - y.sort);
  }, [appts, visible, nowISO]);
  const otTodayCount = otTodayList.length;
  // 이탈위험·만료임박 명단 — ownerBriefing이 개수를 셀 때 쓰는 함수 그대로.
  // 다른 함수로 뽑으면 "3명"이라 써놓고 명단은 4줄이 되는 사고가 난다.
  const churnList = useMemo(
    () => churnRiskMembers(visible, contracts, logs, { nowISO })
      .slice(0, 8)
      .map((c) => ({ id: c.user_id, user_id: c.user_id, trainerId: c.trainer_id ?? "unknown", rem: c.rem?.total ?? null, gap: c.gap ?? null })),
    [visible, contracts, logs, nowISO]
  );
  const expiringList = useMemo(
    () => expiringMembers(visible, contracts, logs, { nowISO })
      .slice(0, 8)
      .map((e) => ({ id: e.user_id, user_id: e.user_id, trainerId: e.trainer_id ?? "unknown", rem: e.rem?.total ?? null, gap: null })),
    [visible, contracts, logs, nowISO]
  );
  const listFor = (kind) => (kind === "otToday" ? otTodayList : kind === "churn" ? churnList : kind === "reregister" ? expiringList : []);

  const [openKind, setOpenKind] = useState(null); // 제자리 펼침(한 번에 하나)

  // 3번은 항상 'OT 예정' 자리다 — 0건이면 감추지 않고 '없음'으로 둔다.
  // 감추면 어제는 3장이던 게 오늘 2장이 되어 "3번 카드 어디 갔지"가 된다.
  // ⚠️ 0건이 계속 뜨면 데이터가 없는 것 — 이 숫자는 appointment(예약) 표에서 온다.
  //    앱에 예약을 넣지 않으면 영원히 0이다.
  const top = useMemo(() => [
    ...cands.slice(0, 2),
    {
      kind: "otToday", tab: "funnel", amount: null, detail: "",
      title: otTodayCount > 0 ? `오늘 신규 OT 예정 ${otTodayCount}건` : "오늘 신규 OT 예정 없음",
      dim: otTodayCount === 0,
    },
  ], [cands, otTodayCount]);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || "트레이너";

  // ── 오늘의 보고서 v2(결정적 4블록 + AI 총평·코칭 분리) ──
  const [report, setReport] = useState(null);     // ownerReportData 결과 · presence=보고서 노출(결정적)
  const [ai, setAi] = useState(null);             // { headline, coaching } | null (AI 성공 시)
  const [aiState, setAiState] = useState("idle"); // idle | loading | ready | premium | failed
  const [aiErr, setAiErr] = useState("");
  const nameById = useMemo(() => new Map((members || []).filter((m) => m?.id).map((m) => [m.id, m.name])), [members]);
  const memberName = (id) => personName(nameById.get(id)) || "회원";

  // ── 하루 캐시(localStorage) + AI 1회/일 제한 ──
  // v2 — 보고서 블록 구성이 바뀌었다(어제/오늘 PT·OT 분해, 매출 신규/재등록, 존댓말 서술).
  // 키를 올려 예전 모양 캐시를 버린다(안 올리면 오늘 하루 옛 화면이 그대로 복원된다).
  const LS_KEY = "owner-report-v2";
  function loadCache() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
  function saveCache(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* 프라이빗·용량 = 무시 */ } }

  const [generatedAt, setGeneratedAt] = useState(""); // 생성 시각 ISO(표시용)
  const [locked, setLocked] = useState(false);        // 오늘 캐시 존재 = AI 1회 소진(다시 생성 차단)
  const todayYmd = useMemo(() => new Date(new Date(nowISO).getTime() + 9 * 3600000).toISOString().slice(0, 10), [nowISO]);

  // 생성시각 라벨: "오전 9시 12분 생성"
  function genLabel(iso) {
    if (!iso) return "";
    const k = new Date(new Date(iso).getTime() + 9 * 3600000);
    const h = k.getUTCHours(), m = k.getUTCMinutes(), h12 = h % 12 || 12;
    return `${h < 12 ? "오전" : "오후"} ${h12}시 ${String(m).padStart(2, "0")}분 생성`;
  }

  // 마운트 1회: 오늘(KST) 캐시가 있으면 복원(AI 호출 0), 없으면 그 자리에서 생성한다.
  // ★ 대표가 버튼을 누르게 하지 않는다 — 열었을 때 이미 있어야 보고서다.
  //   결정적 4블록은 즉시 뜨고(ownerReportData는 순수·동기) AI 총평·코칭만 뒤따라 채워진다.
  // localStorage 외부 저장소 sync라 마운트 후(effect) 복원 — 지연 초기화는 SSR 하이드레이션 불일치 유발이라 회피.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const c = loadCache();
      let uid = null;
      try { const { data: { session } } = await supabase.auth.getSession(); uid = session?.user?.id ?? null; }
      catch { return; } // 세션 조회 실패 = 계정 확인 불가 → 복원도 생성도 안 함
      if (cancelled) return;
      if (c && c.ymd === todayYmd && c.report && c.uid && c.uid === uid) {
        setReport(c.report);
        setAi(c.ai || null);
        setAiState(c.aiState === "premium" ? "premium" : "ready");
        setGeneratedAt(c.generatedAt || "");
        setLocked(true);
        return;
      }
      if (autoRunDay === todayYmd) return; // 이 페이지 세션에서 이미 시도(실패 후 탭 왕복 재호출 방지)
      autoRunDay = todayYmd;
      genReport();
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 날짜 라벨(결정적 · AI에 안 맡김). 제목="26년 9월 29일 보고서" · 아래줄="화요일".
  // 제목이 날짜를 들고 있으면 인쇄해 뒀을 때 어느 날 보고서인지 바로 보인다.
  const { reportTitle, weekdayLabel } = useMemo(() => {
    const kst = new Date(new Date(nowISO).getTime() + 9 * 3600000);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return {
      reportTitle: `${String(kst.getUTCFullYear()).slice(2)}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 보고서`,
      weekdayLabel: `${days[kst.getUTCDay()]}요일`,
    };
  }, [nowISO]);

  // 결정적 코칭 폴백(AI 실패·premium 시) — 트레이너 약점 msg + top3 제목.
  function fallbackCoaching(d) {
    return [...d.trainerCoaching.map((c) => `${nameOf(c.trainerId)}: ${c.msg}`), ...top.map((c) => c.title)].slice(0, 6);
  }

  async function genReport() {
    if (!supabase || locked) return;   // ★ 하루 1회: 잠기면 무시(오늘 캐시 존재 시)
    const d = ownerReportData({ members, otRows, contracts, logs, appts, goals, ym, nowISO });
    setReport(d);                       // ★ 결정적 4블록 즉시 노출(AI 성패와 무관)
    setAi(null); setAiErr(""); setAiState("loading");
    const gAt = new Date().toISOString();  // 표시용 실시각(순수함수 아님 · 컴포넌트 UI)
    try {
      const aiInput = {
        ym: d.ym, yesterday: d.yesterday, today: d.today, month: d.month, members: d.members, watch: d.watch,
        top3: d.top3.map((c) => ({ title: c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title, detail: c.detail, amount: c.amount ?? null })),
        trainerCoaching: d.trainerCoaching.map((c) => ({ trainer: nameOf(c.trainerId), msg: c.msg })),
        pipeline: { newCount: d.pipeline.newCandidates.length, reCount: d.pipeline.reCandidates.length, grandTotal: d.pipeline.grandTotal },
      };
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const uid = session?.user?.id ?? null;   // 계정 스코프
      const res = await fetch("/api/owner-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ input: aiInput }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && body?.code === "premium_required") {
          setAiState("premium"); setGeneratedAt(gAt); setLocked(true);
          saveCache({ ymd: todayYmd, report: d, ai: null, aiState: "premium", generatedAt: gAt, uid }); // 결정적 보고서 종일 유지
          return;
        }
        setAiErr(body?.error || "AI 요약 생성 실패"); setAiState("failed"); return;  // 실패=캐시 안 함·재시도 허용
      }
      const aiVal = { headline: body?.headline || "", coaching: Array.isArray(body?.coaching) ? body.coaching : [] };
      setAi(aiVal); setAiState("ready"); setGeneratedAt(gAt); setLocked(true);
      saveCache({ ymd: todayYmd, report: d, ai: aiVal, aiState: "ready", generatedAt: gAt, uid });  // ★ AI 1회/일 소진
    } catch {
      setAiErr("네트워크 오류"); setAiState("failed");  // 캐시 안 함
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">오늘 챙길 것</h2>
        <p className="mt-0.5 text-[12px] text-sub">매출은 과거 데이터 기반 추정 매출입니다.</p>
      </div>

      {cands.length === 0 && otTodayCount === 0 ? (
        <Card>
          <div className="flex items-center gap-2 py-4 text-sub">
            <CheckCircle2 className="h-5 w-5 text-cyan-700" />
            <span className="text-sm">지금 급히 챙길 건 없어요. 챙길 게 생기면 여기 떠요.</span>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {top.map((c, i) => {
            const m = META[c.kind] || META.pastdue;
            const Icon = m.icon;
            const title = c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title;
            return (
              <Card key={c.kind} interactive
                onClick={() => (m.expand ? setOpenKind((k) => (k === c.kind ? null : c.kind)) : onGoTab?.(c.tab))}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevate text-sm font-extrabold text-muted">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${c.dim ? "text-muted" : accentText(m.accent)}`} />
                      <span className={`text-sm font-bold ${c.dim ? "text-muted" : "text-ink"}`}>{title}</span>
                    </div>
                    {/* 누가 있는지는 여기서 끝나야 한다 — 분석 탭으로 보내면 명단이 안 나온다.
                        전체·조치는 목록 끝의 링크로(그때만 탭 이동). */}
                    {m.expand && openKind === c.kind && listFor(c.kind).length > 0 && (
                      <div className="mt-2 border-t border-line pt-2">
                        <ul className="space-y-1">
                          {listFor(c.kind).map((o) => (
                            <li key={o.id} className="flex items-center gap-2 text-[12px]">
                              {o.at && <span className="font-mono font-bold text-ink">{o.at}</span>}
                              <span className="font-medium text-sub">{memberName(o.user_id)}</span>
                              <span className="min-w-0 truncate text-[11px] text-muted">{nameOf(o.trainerId)}</span>
                              {o.rem != null && <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">잔여 {o.rem}회</span>}
                              {o.gap != null && <span className="shrink-0 font-mono text-[11px] text-danger-text">{o.gap}일 무수업</span>}
                            </li>
                          ))}
                        </ul>
                        {c.kind !== "otToday" && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); onGoTab?.(c.tab); }}
                            className="mt-2 inline-flex items-center text-[11px] font-semibold text-muted underline underline-offset-2">
                            PT회원 현황에서 전체 보기 <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                    {!m.hideDetail && c.detail && <p className="mt-0.5 text-[12px] text-sub">{c.detail}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {!m.hideAmount && c.amount != null && <div className={`font-mono text-sm font-extrabold ${accentText(m.accent)}`}>{wonApprox(c.amount)}</div>}
                    {m.expand ? (
                      c.dim || listFor(c.kind).length === 0 ? null : (
                        <div className="mt-0.5 inline-flex items-center text-[11px] text-muted">
                          {openKind === c.kind ? "접기" : m.go}
                          <ChevronDown className={`h-3 w-3 transition ${openKind === c.kind ? "rotate-180" : ""}`} />
                        </div>
                      )
                    ) : (
                      <div className="mt-0.5 inline-flex items-center text-[11px] text-muted">{m.go} <ChevronRight className="h-3 w-3" /></div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== 오늘의 운영 보고서 — 열면 자동 생성(버튼 없음) =====
           결정적 4블록 + AI(총평·코칭)만 적응. 생성 전 짧은 순간만 자리표시가 보인다. */}
      {supabase && !report && (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-[13px] font-bold text-muted">
          <FileText className="h-4 w-4 text-cyan-700" /> 오늘의 운영 보고서 준비 중…
        </div>
      )}

      {supabase && report && (
        <Card>
          <div className="space-y-4">
            {/* 머리글 + AI 총평 */}
            <div className="flex items-start justify-between gap-2 border-b border-line pb-2">
              <div>
                <div className="text-[19px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{reportTitle}</div>
                <div className="mt-1 text-[12px] text-sub">{weekdayLabel}{generatedAt ? ` · ${genLabel(generatedAt)}` : ""}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!locked && (
                  <button type="button" onClick={genReport} className="text-[11px] font-semibold text-muted underline underline-offset-2">다시 생성</button>
                )}
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted"><Printer className="h-3.5 w-3.5" /> 인쇄</button>
              </div>
            </div>
            {aiState === "ready" && ai?.headline && (
              <p className="rounded-xl border border-primary/30 bg-primary-soft px-3.5 py-3 text-[15px] font-extrabold leading-relaxed tracking-[-0.01em] text-primary-strong break-keep">
                {ai.headline}
              </p>
            )}
            {aiState === "loading" && <div className="inline-flex items-center gap-2 text-[12px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-700" /> AI 총평·코칭 작성 중…</div>}

            {/* 💰 매출 파이프라인 (결정적) */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-label-ko text-muted"><Wallet className="h-3.5 w-3.5" /> 오늘의 예상 PT매출</div>
              {report.pipeline.byTrainer.length === 0 ? (
                <p className="text-[12px] text-muted">이번 주 신규·재등록 임박 후보가 없어요.</p>
              ) : (
                <div className="space-y-1.5">
                  {report.pipeline.byTrainer.map((r) => (
                    <div key={r.trainerId} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold text-ink">{nameOf(r.trainerId)}</span>
                        <span className="font-mono text-[13px] font-extrabold text-cyan-700">{wonApprox(r.subtotal)}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-sub">신규 {r.newCount} · 재등록 {r.reCount}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        {report.pipeline.reCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => (
                          <span key={"r" + c.user_id}>{memberName(c.user_id)}<span className="text-danger-text">(재등록)</span> {typeof c.amount === "number" ? wonApprox(c.amount) : ""}</span>
                        ))}
                        {report.pipeline.newCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => (
                          <span key={"n" + c.user_id}>{memberName(c.user_id)}<span className="text-cyan-700">(신규)</span> {typeof c.amount === "number" ? wonApprox(c.amount) : ""}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[12px] font-bold text-ink">총 예상 매출</span>
                    <span className="font-mono text-sm font-extrabold text-cyan-700">{wonApprox(report.pipeline.grandTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 📊 어제·이번달 (결정적) */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* 어제 캐시(구 보고서)에는 pt/ot/total이 없다 — sessions로 떨어뜨려 빈칸을 막는다. */}
              {[
                {
                  label: "어제 총 수업",
                  value: `${report.yesterday.total ?? report.yesterday.sessions}건`,
                  sub: `PT ${report.yesterday.pt ?? report.yesterday.sessions}건 · OT ${report.yesterday.ot ?? 0}건${report.yesterday.noshows ? ` · 노쇼 ${report.yesterday.noshows}건` : ""}`,
                },
                {
                  label: "오늘 예정 수업",
                  value: `${report.today.bookings}건`,
                  sub: `PT ${report.today.pt ?? report.today.bookings}건 · OT ${report.today.ot ?? 0}건`,
                },
                {
                  label: "이달 매출",
                  value: won(report.month.revenueNet),
                  sub: `신규 ${manwon(report.month.newRev ?? 0)} · 재등록 ${manwon(report.month.reRev ?? 0)}`,
                },
                {
                  label: "이달 등록",
                  value: `${(report.month.newRegs ?? 0) + (report.month.reRegs ?? 0)}건`,
                  sub: `신규 ${report.month.newRegs ?? 0}건 · 재등록 ${report.month.reRegs ?? 0}건`,
                },
              ].map((t) => (
                <div key={t.label} className="rounded-lg bg-elevate px-2.5 py-2">
                  <div className="text-[10px] tracking-label-ko text-muted">{t.label}</div>
                  <div className="mt-0.5 font-mono text-sm font-extrabold text-ink">{t.value}</div>
                  {t.sub && <div className="text-[10px] leading-snug text-muted break-keep">{t.sub}</div>}
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

          </div>
        </Card>
      )}
    </div>
  );
}
