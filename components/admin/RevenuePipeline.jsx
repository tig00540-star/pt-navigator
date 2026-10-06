"use client";
/* =========================================================================
   #3 매출 파이프라인·예측 — admin '매출' 탭.
   이달 매출/목표 게이지 · 다음달 예측(추정) · 신규/재등록 구성비 · 매출/환불 추이.
   admin이 이미 로드한 배열 + goals(trainer_goal)를 props로 받아 파생·렌더만.
   ★hidden = 회원기반 함수(forecast)만 visible로 걸러 넘김. 매출/환불/구성비는 계약기반이라 원본 contracts.
   색: 긍정 cyan · 위험/환불 rose · 게이지 primary(red). emerald 금지. 예측은 '추정' 명시.
   ========================================================================= */
import { useMemo, useState } from "react";
import { Wallet, TrendingUp, PieChart, LineChart } from "lucide-react";
import {
  revenueInMonth, revenueCompositionInMonth, revenueTrendByMonth, revenueForecastNextMonth, revenueByTrainer,
} from "@/lib/memberStatus";
import { won, wonApprox, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const pctText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");

// 목표/현재/달성률 한 줄.
function Line({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[13px] font-semibold text-sub">{label}</span>
      <span className={`shrink-0 font-mono tabular-nums ${accent ? "text-[15px] font-extrabold text-primary-strong" : "text-[13px] font-bold text-ink"}`}>{value}</span>
    </div>
  );
}
// 차트 라벨 축약 — 만원 단위(6열이 폰에서 안 겹치게). 원 단위 전체값은 막대 title(hover)에 유지.
const manLabel = (n) => { const man = Math.round((n ?? 0) / 10000); return man === 0 ? "0" : man.toLocaleString("ko-KR") + "만"; };

export default function RevenuePipeline({ members = [], contracts = [], logs = [], otRows = [], trainers = [], goals = [], ym }) {
  const [nowISO] = useState(() => new Date().toISOString()); // 마운트 1회 고정(렌더 순수)

  // ★hidden 제외 — 회원기반(forecast)만.
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);

  // 계약기반(매출·구성·추이)은 원본 contracts.
  const net = useMemo(() => revenueInMonth(contracts, ym), [contracts, ym]);
  const comp = useMemo(() => revenueCompositionInMonth(contracts, ym), [contracts, ym]);
  const trend = useMemo(() => revenueTrendByMonth(contracts, ym, 6), [contracts, ym]);
  const forecast = useMemo(
    () => revenueForecastNextMonth(visible, otRows, contracts, logs, { nowISO }),
    [visible, otRows, contracts, logs, nowISO]
  );

  // 목표 = 이달 계정 트레이너 목표 합. 미설정(합 0)이면 null.
  const goalsThisYm = useMemo(() => goals.filter((g) => g && g.ym === ym && g.target_revenue != null), [goals, ym]);
  const target = useMemo(() => goalsThisYm.reduce((s, g) => s + (g.target_revenue || 0), 0) || null, [goalsThisYm]);
  const goalPct = target ? net / target : null;

  // 트레이너별 목표·현재 매출 — 합산 목표만 보면 누가 끌고 누가 밀리는지 모른다.
  // 목표를 세운 트레이너를 먼저(목표 큰 순), 목표 없는 트레이너는 뒤로.
  const revByT = useMemo(() => new Map(revenueByTrainer(contracts, ym).map((r) => [r.trainer_id, r.total])), [contracts, ym]);
  const goalByT = useMemo(() => new Map(goalsThisYm.map((g) => [g.trainer_id, g.target_revenue || 0])), [goalsThisYm]);
  // 대표는 수업을 안 하는 경우가 많다 — 목표도 매출도 없는 대표는 줄에서 뺀다("목표 미설정"으로 남지 않게).
  const trainerRows = useMemo(() => trainers.map((t) => {
    const goal = goalByT.get(t.id) ?? null;
    const rev = revByT.get(t.id) ?? 0;
    return { id: t.id, role: t.role, name: personName(t.name) || "트레이너", goal, rev, pct: goal ? rev / goal : null };
  }).filter((t) => !(t.role === "owner" && t.goal == null && !t.rev))
    .sort((a, b) => (b.goal ?? -1) - (a.goal ?? -1)), [trainers, goalByT, revByT]);

  return (
    <div className="space-y-6">
      <p className="text-[13.5px] leading-relaxed text-sub">이달 <b className="text-ink">번 돈과 목표</b>, 다음 달 <b className="text-ink">들어올 돈 예상</b>을 한눈에.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 블록① 이달 매출/목표 게이지 */}
        <Card>
          <SectionTitle icon={Wallet} className="mb-0">이달 매출 현황</SectionTitle>
          <div className="mt-2 font-mono text-4xl font-extrabold text-primary-strong">{won(net)}</div>
          <div className="mt-1 text-[13px] text-muted">{Number(ym.slice(5))}월 현재 총 매출</div>
          {target != null ? (
            <div className="mt-4">
              {/* 목표 · 현재 · 달성률 세 줄 */}
              <div className="divide-y divide-line rounded-xl border border-line">
                <Line label="이달 목표 매출" value={won(target)} />
                <Line label="현재 총 매출" value={won(net)} />
                <Line label="달성률" value={pctText(goalPct)} accent />
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((goalPct ?? 0) * 100))}%` }} />
              </div>
              {goalPct != null && goalPct >= 1 && (
                <div className="mt-2 inline-block rounded bg-cyan-500/10 px-1.5 py-0.5 text-[12px] font-semibold text-cyan-700">목표 달성</div>
              )}

              {/* 트레이너별 목표 — 합산 목표만으론 누가 밀리는지 모른다. */}
              {trainerRows.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-[13px] font-semibold text-sub">트레이너별 목표</div>
                  <ul className="space-y-1.5">
                    {trainerRows.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-medium text-sub">{t.name}</span>
                        {t.goal == null ? (
                          <span className="text-[12px] text-muted">목표 미설정</span>
                        ) : (
                          <>
                            <span className="font-mono text-ink">{won(t.rev)}</span>
                            <span className="text-[12px] text-muted">/ {won(t.goal)}</span>
                            <span className={`w-10 shrink-0 text-right font-mono text-[12px] font-bold ${t.pct >= 1 ? "text-cyan-700" : "text-muted"}`}>{pctText(t.pct)}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {trainerRows.some((t) => t.goal == null) && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">목표를 안 세운 트레이너가 있어 센터 목표가 실제보다 작게 잡혀 있어요.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-elevate px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              이달 목표가 아직 없어요. 트레이너가 &lsquo;내 실적&rsquo;에서 이달 목표를 설정하면 센터 합산 목표로 표시돼요.
            </div>
          )}
        </Card>

        {/* 블록② 다음달 예측(추정) */}
        <Card>
          <SectionTitle icon={TrendingUp} className="mb-0">다음 달 예상 매출 · 추정</SectionTitle>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-extrabold text-cyan-700">{forecast.total != null ? wonApprox(forecast.total) : "추정 불가"}</span>
            <span className="rounded bg-elevate px-1.5 py-0.5 text-[12px] font-semibold text-muted">추정</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-elevate p-3">
              <div className="text-[13px] font-semibold text-sub">신규 유입에서</div>
              {forecast.expectedNew != null ? (
                <>
                  <div className="mt-1 font-mono text-lg font-bold text-ink">{wonApprox(forecast.expectedNew)}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-muted">OT 진행 {forecast.otPipeline}명 × 등록률 {pctText(forecast.convRate)} × 평균 {wonApprox(forecast.avgNew)}</div>
                </>
              ) : <div className="mt-1 text-[12px] text-muted">OT 이력이 더 쌓이면 보여 드려요</div>}
            </div>
            <div className="rounded-xl border border-line bg-elevate p-3">
              <div className="text-[13px] font-semibold text-sub">재등록에서</div>
              {forecast.expectedRe != null ? (
                <>
                  <div className="mt-1 font-mono text-lg font-bold text-ink">{wonApprox(forecast.expectedRe)}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-muted">만료 임박 {forecast.expiringCount}명 × 재등록률 {pctText(forecast.reregRate)} × 평균 {wonApprox(forecast.avgRe)}</div>
                </>
              ) : <div className="mt-1 text-[12px] text-muted">재등록 이력이 더 쌓이면 보여 드려요</div>}
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">과거 등록률·재등록률·평균 계약금액으로 계산한 추정치예요. 실제와 다를 수 있어요.</p>
        </Card>
      </div>

      {/* 매출 구성 · 추이 — 상시 노출 */}
      <div className="space-y-4">
      {/* 블록③ 신규/재등록 구성비 */}
      <Card>
        <SectionTitle icon={PieChart}>이달 매출 구성 · 신규 vs 재등록</SectionTitle>
        {comp.gross === 0 ? (
          <p className="text-[12px] text-muted">이달 매출이 아직 없어요.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full bg-primary" style={{ width: `${Math.round((comp.newShare ?? 0) * 100)}%` }} />
              <div className="h-full bg-cyan-500" style={{ width: `${Math.round((comp.reShare ?? 0) * 100)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-sub">신규</span>
                <b className="font-mono text-ink">{won(comp.newRev)}</b><span className="text-muted">({comp.cntNew}건 · {pctText(comp.newShare)})</span></span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500" /><span className="text-sub">재등록</span>
                <b className="font-mono text-ink">{won(comp.reRev)}</b><span className="text-muted">({comp.cntRe}건 · {pctText(comp.reShare)})</span></span>
            </div>
            {comp.refund > 0 && <div className="mt-2 text-[12px] font-semibold text-danger-text">환불 −{won(comp.refund)} · 순매출 {won(comp.net)}</div>}
          </>
        )}
      </Card>

      {/* 블록④ 매출/환불 추이 (6개월) */}
      <Card>
        <SectionTitle icon={LineChart}>매출·환불 추이 · 최근 6개월</SectionTitle>
        {(() => {
          // 2026-10-06 대표: 신규 · 재등록을 한 막대에 색으로 나눠(아래 신규 빨강 · 위 재등록 하늘 = 위 '이달 구성' 막대와 같은 색).
          //   막대 = 그 달 등록 매출(환불 빼기 전) · 환불은 아래 빨간 숫자.
          const maxRev = Math.max(1, ...trend.map((t) => t.rev));
          if (!trend.some((t) => t.rev > 0)) return <p className="text-[12px] text-muted">매출 이력이 없어요.</p>;
          return (
            <>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-sub">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />신규</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" />재등록</span>
              </div>
              {/* items-stretch — 칸마다 높이를 다 받아야 막대 % 높이가 계산된다 · 환불 줄은 늘 자리를 잡아 막대 칸 높이를 같게 */}
              <div className="flex items-stretch justify-between gap-2" style={{ height: 180 }}>
                {trend.map((t) => (
                  <div key={t.ym} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div className="mx-auto flex w-6 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${t.rev > 0 ? Math.max(2, Math.round((t.rev / maxRev) * 100)) : 0}%` }}
                        title={`신규 ${won(t.newRev)} · 재등록 ${won(t.reRev)}`}>
                        <div className="w-full bg-primary" style={{ height: `${t.rev ? (t.newRev / t.rev) * 100 : 0}%` }} />
                        <div className="w-full bg-cyan-500" style={{ height: `${t.rev ? (t.reRev / t.rev) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div className="font-mono text-[12px] font-semibold text-ink">{manLabel(t.rev)}</div>
                    <div className={`font-mono text-[12px] text-danger-text ${t.refund > 0 ? "" : "invisible"}`} aria-hidden={t.refund > 0 ? undefined : true}>−{manLabel(t.refund || 0)}</div>
                    <div className="text-[12px] text-muted">{t.ym.slice(5)}월</div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
        <p className="mt-3 text-[12px] leading-relaxed text-muted">막대는 그 달 등록 매출(신규 + 재등록), 빨간 숫자는 그 달 환불이에요. 막대를 길게 누르거나 올리면 금액이 보여요. 단위는 만원이에요.</p>
      </Card>
      </div>
    </div>
  );
}
