"use client";
/* =========================================================================
   #6 원장 브리핑 — admin '브리핑' 탭(기본 랜딩). "오늘 챙길 것 3가지".
   ownerBriefing(기존 파생 조립)의 top 3을 카드로. 룰 기반·결정적(AI 서술은 후속).
   회원신호=visible · 노쇼 트레이너 귀속=전체 회원맵. 색: 기회 cyan · 위험 rose · 위생 muted.
   ========================================================================= */
import { useMemo, useState } from "react";
import { RefreshCw, Filter, TrendingDown, CalendarClock, UserX, Target, CheckCircle2, ChevronRight, FileText, Loader2, Printer } from "lucide-react";
import { ownerBriefing, ownerDailyDigest } from "@/lib/memberStatus";
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

  // ── 오늘의 보고서(온디맨드 AI · premium) ──
  const [rep, setRep] = useState(null);              // { headline, sections, closing } | null
  const [repState, setRepState] = useState("idle");  // idle | loading | ready | error | premium
  const [repErr, setRepErr] = useState("");

  // 날짜 라벨(결정적 · AI에 안 맡김). 예: 2026년 7월 28일 월요일
  const dateLabel = useMemo(() => {
    const kst = new Date(new Date(nowISO).getTime() + 9 * 3600000);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${days[kst.getUTCDay()]}요일`;
  }, [nowISO]);

  // 섹션이 비면 숫자로 만드는 결정적 한 줄(보고서에 빈 구멍 금지).
  function fallbackLine(key, d) {
    const m = d.month, y = d.yesterday, w = d.watch;
    if (key === "yesterday") return `어제 진행 수업 ${y.sessions}건${y.noshows ? `, 노쇼 ${y.noshows}건` : ""}.`;
    if (key === "month") return `이번 달 매출 ${won(m.revenueNet)}${m.progressPct != null ? ` (목표 대비 ${m.progressPct}%)` : ""} · 신규 등록 ${m.newRegs}건.`;
    if (key === "watch") return `이탈 위험 ${w.churnRisk}명 · 만료 임박 ${w.expiring}명 · 미처리 예약 ${w.pastDue}건.`;
    if (key === "today") return top.length ? top.map((c, i) => `${i + 1}. ${c.title}`).join(" ") : "오늘 급히 챙길 항목은 없어요.";
    return "";
  }

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
      const filled = ["yesterday", "month", "watch", "today"].reduce((o, k) => { o[k] = secs[k] || fallbackLine(k, digest); return o; }, {});
      setRep({ headline: data?.headline || "", sections: filled, closing: data?.closing || "" });
      setRepState("ready");
    } catch {
      setRepErr("네트워크 오류로 실패했어요."); setRepState("error");
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

      <p className="text-[10px] leading-relaxed text-muted">돈·긴급도 규칙으로 자동 정렬한 요약이에요. 금액은 과거 평균 기반 추정입니다.</p>
    </div>
  );
}
