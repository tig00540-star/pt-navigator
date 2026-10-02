"use client";

/* =========================================================================
   OwnerWideHome — 대표 화면 홈의 넓은 버전(태블릿 가로·PC lg 1024px~ · 2026-10-02).
   폰은 OwnerHub(바로가기 타일) 그대로. 넓은 화면에선 탭을 넘기지 않고 한 화면에서 본다:
     ① 지금 손쓰면 지킬 수 있는 매출(브리핑 top3 영향액 합)
     ② 3칸 — 오늘 챙길 것(브리핑 순서) · 이달 매출 목표 · 등록·이탈 깔때기
     ③ 기존 '한눈에' 콘솔(OwnerOverview) — KPI 6칸 · 트레이너별 현황 · 오늘 타임테이블 · 요일별 매출
   숫자는 전부 기존 파생 함수(OwnerHub·OwnerBriefing·MemberFlow와 같은 출처) · DB 조회 0 · hidden은 여기서 거른다.
   ========================================================================= */

import { useMemo } from "react";
import { AlertTriangle, ChevronRight, Filter, Target } from "lucide-react";
import Card from "@/components/ui/Card";
import { manwon, won } from "@/lib/format";
import { ownerBriefing, revenueCompositionInMonth, otFunnel, reregisterStats } from "@/lib/memberStatus";
import OwnerOverview from "@/components/admin/OwnerOverview";

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Box({ title, icon: Icon, action, onAction, children }) {
  return (
    <Card padding="md" className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
          <Icon className="h-4 w-4 text-admin-text" aria-hidden="true" /> {title}
        </h2>
        {action && (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-fuchsia-700 hover:underline">
            {action} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function OwnerWideHome({
  members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], expenses = [],
  trainers = [], ym, centerName, onGoTab,
}) {
  const visible = useMemo(() => members.filter((m) => !m.hidden), [members]);
  const nowISO = new Date().toISOString();
  const brief = useMemo(() => ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, ym, nowISO }),
    // nowISO는 렌더마다 바뀌므로 의존성에서 뺀다(분 단위 차이는 의미 없음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, otRows, contracts, logs, appts, goals, ym]);
  const top3 = brief.slice(0, 3);
  const atRisk = top3.reduce((s, c) => s + (c.impact || 0), 0);

  const rev = useMemo(() => revenueCompositionInMonth(contracts, ym), [contracts, ym]);
  const target = useMemo(() => goals.filter((g) => g && g.ym === ym && g.target_revenue != null)
    .reduce((s, g) => s + (g.target_revenue || 0), 0) || null, [goals, ym]);
  const goalPct = target ? rev.net / target : null;

  const funnel = useMemo(() => otFunnel(visible, otRows), [visible, otRows]);
  const rereg = useMemo(() => reregisterStats(contracts), [contracts]);
  const stages = [
    { label: "OT 회원", n: funnel.intake },
    { label: "1차 OT", n: funnel.first },
    { label: "2차 이상", n: funnel.second },
    { label: "PT 등록", n: funnel.confirmed },
  ];
  const maxN = Math.max(1, funnel.intake);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">{ym}</p>
          <h1 className="text-[24px] font-bold tracking-[-0.03em] text-ink">{centerName || "내 센터"} 현황</h1>
        </div>
      </div>

      {/* ① 지금 손쓰면 지킬 수 있는 매출 */}
      <Card as="button" interactive padding="sm" onClick={() => onGoTab("briefing")}
        className="flex w-full items-center justify-between gap-3 border-primary/30 bg-primary-soft text-left">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary-strong">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-primary-strong">지금 손쓰면 지킬 수 있는 매출</span>
            <span className="block truncate text-[16px] font-bold tracking-[-0.02em] text-ink">
              {top3.length === 0 ? "오늘은 급한 건이 없어요" : `약 ${manwon(atRisk)} · ${top3.length}건`}
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary-strong" />
      </Card>

      {/* ② 3칸 */}
      <div className="grid grid-cols-3 gap-4">
        <Box title="오늘 챙길 것" icon={AlertTriangle} action="자세히" onAction={() => onGoTab("briefing")}>
          {brief.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">지금은 비어 있어요.</p>
          ) : (
            <ol className="space-y-2">
              {brief.slice(0, 5).map((c, i) => (
                <li key={`${c.kind}-${i}`}>
                  <button type="button" onClick={() => onGoTab(c.tab || "briefing")}
                    className="flex w-full items-center gap-2.5 rounded-xl bg-elevate px-3 py-2.5 text-left transition hover:bg-line/60">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-[12px] font-bold text-sub">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{c.title}</span>
                    {c.amount != null && c.kind !== "churn" && <span className="shrink-0 text-[12px] text-sub">{manwon(c.amount)}</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Box>

        <Box title="이달 매출" icon={Target} action="매출" onAction={() => onGoTab("revenue")}>
          <div className="text-[26px] font-bold tracking-[-0.02em] text-ink">{won(rev.net)}</div>
          <p className="text-[12px] text-muted">신규 {rev.cntNew}건 · 재등록 {rev.cntRe}건</p>
          {target ? (
            <>
              <div className="mt-3 flex items-baseline justify-between text-[13px]">
                <span className="text-sub">목표 {manwon(target)}</span>
                <span className="font-semibold text-primary-strong">{pct(goalPct)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((goalPct ?? 0) * 100))}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-[12px] text-muted">이달 목표가 아직 없어요 — 트레이너가 &lsquo;내 실적&rsquo;에서 정하면 합산돼요.</p>
          )}
        </Box>

        <Box title="등록·이탈" icon={Filter} action="자세히" onAction={() => onGoTab("flow")}>
          <div className="space-y-2">
            {stages.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[12px] text-sub">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-ot" style={{ width: `${Math.round((s.n / maxN) * 100)}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-[13px] font-semibold text-ink">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-center">
            <div>
              <div className="text-[12px] text-muted">등록률</div>
              <div className="text-[18px] font-bold text-ink">{pct(funnel.intake ? funnel.confirmed / funnel.intake : null)}</div>
            </div>
            <div>
              <div className="text-[12px] text-muted">재등록률</div>
              <div className="text-[18px] font-bold text-ink">{pct(rereg.rate)}</div>
            </div>
          </div>
        </Box>
      </div>

      {/* ③ 기존 '한눈에' 콘솔 */}
      <OwnerOverview
        members={members} otRows={otRows} contracts={contracts} logs={logs}
        trainers={trainers} appts={appts} expenses={expenses} ym={ym} onGoTab={onGoTab} />
    </div>
  );
}
