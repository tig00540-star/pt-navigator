"use client";
/* =========================================================================
   #6 원장 브리핑 — admin '브리핑' 탭(기본 랜딩). "오늘 챙길 것 3가지".
   ownerBriefing(기존 파생 조립)의 top 3을 카드로. 룰 기반·결정적(AI 서술은 후속).
   회원신호=visible · 노쇼 트레이너 귀속=전체 회원맵. 색: 기회 cyan · 위험 rose · 위생 muted.
   ========================================================================= */
import { useMemo, useState } from "react";
import { RefreshCw, Filter, TrendingDown, CalendarClock, UserX, Target, CheckCircle2, ChevronRight, FileText, Loader2, Printer, Wallet, AlertTriangle, Sparkles } from "lucide-react";
import { ownerBriefing, ownerReportData } from "@/lib/memberStatus";
import { won, personName } from "@/lib/format";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";

// kind별 카드 메타(아이콘·강조색·이동 라벨). 전부 정적 리터럴.
const META = {
  reregister: { icon: RefreshCw,     accent: "cyan", go: "리텐션 보기" },
  closing:    { icon: Filter,        accent: "cyan", go: "전환 보기" },
  churn:      { icon: TrendingDown,  accent: "rose", go: "리텐션 보기" },
  goal:       { icon: Target,        accent: "rose", go: "매출 보기" },
  pastdue:    { icon: CalendarClock, accent: "muted", go: "스케줄 보기" },
  trainer:    { icon: UserX,         accent: "rose", go: "트레이너 보기" },
};
const accentText = (a) => (a === "cyan" ? "text-cyan-700" : a === "rose" ? "text-danger-text" : "text-muted");

export default function OwnerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], trainers = [], ym, onGoTab }) {
  const [nowISO] = useState(() => new Date().toISOString());
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(members.map((m) => [m.id, m.trainer_id])), [members]); // 전체(노쇼 귀속)
  const cands = useMemo(
    () => ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO }),
    [visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO]
  );
  const top = cands.slice(0, 3);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || "트레이너";

  // ── 오늘의 보고서 v2(결정적 4블록 + AI 총평·코칭 분리) ──
  const [report, setReport] = useState(null);     // ownerReportData 결과 · presence=보고서 노출(결정적)
  const [ai, setAi] = useState(null);             // { headline, coaching } | null (AI 성공 시)
  const [aiState, setAiState] = useState("idle"); // idle | loading | ready | premium | failed
  const [aiErr, setAiErr] = useState("");
  const nameById = useMemo(() => new Map((members || []).filter((m) => m?.id).map((m) => [m.id, m.name])), [members]);
  const memberName = (id) => personName(nameById.get(id)) || "회원";

  // 날짜 라벨(결정적 · AI에 안 맡김). 예: 2026년 7월 28일 월요일
  const dateLabel = useMemo(() => {
    const kst = new Date(new Date(nowISO).getTime() + 9 * 3600000);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${days[kst.getUTCDay()]}요일`;
  }, [nowISO]);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">오늘 챙길 것</h2>
        <p className="mt-0.5 text-[12px] text-sub">지표에서 <b className="text-ink">돈과 급한 순서</b>로 3가지만 뽑았어요.</p>
      </div>

      {top.length === 0 ? (
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
              <Card key={c.kind} interactive onClick={() => onGoTab?.(c.tab)}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevate text-sm font-extrabold text-muted">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${accentText(m.accent)}`} />
                      <span className="text-sm font-bold text-ink">{title}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-sub">{c.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.amount != null && <div className={`font-mono text-sm font-extrabold ${accentText(m.accent)}`}>≈ {won(c.amount)}</div>}
                    <div className="mt-0.5 inline-flex items-center text-[11px] text-muted">{m.go} <ChevronRight className="h-3 w-3" /></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== 오늘의 보고서 v2 — 결정적 4블록 항상 + AI(총평·코칭)만 적응 ===== */}
      {supabase && !report && (
        <button type="button" onClick={genReport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-[13px] font-bold text-ink hover:bg-card">
          <FileText className="h-4 w-4 text-cyan-700" /> 오늘의 보고서 받기
        </button>
      )}

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

      <p className="text-[10px] leading-relaxed text-muted">돈·긴급도 규칙으로 자동 정렬한 요약이에요. 금액은 과거 평균 기반 추정입니다.</p>
    </div>
  );
}
