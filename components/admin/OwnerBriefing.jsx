"use client";
/* =========================================================================
   #6 원장 브리핑 — admin '브리핑' 탭(기본 랜딩). "오늘 챙길 것 3가지".
   ownerBriefing(기존 파생 조립)의 top 3을 카드로. 룰 기반·결정적(AI 서술은 후속).
   회원신호=visible · 노쇼 트레이너 귀속=전체 회원맵. 색: 기회 cyan · 위험 rose · 위생 muted.
   ========================================================================= */
import { useMemo, useState } from "react";
import { RefreshCw, Filter, TrendingDown, CalendarClock, UserX, Target, CheckCircle2, ChevronRight } from "lucide-react";
import { ownerBriefing } from "@/lib/memberStatus";
import { won, personName } from "@/lib/format";
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
            <span className="text-sm">지금 급히 챙길 건 없어요. 지표가 안정적이에요.</span>
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

      <p className="text-[10px] leading-relaxed text-muted">돈·긴급도 규칙으로 자동 정렬한 요약이에요. 금액은 과거 평균 기반 추정입니다.</p>
    </div>
  );
}
