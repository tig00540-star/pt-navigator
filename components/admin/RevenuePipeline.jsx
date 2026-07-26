"use client";
/* =========================================================================
   #3 매출 파이프라인·예측 — admin '매출' 탭.
   이달 매출/목표 게이지 · 다음달 예측(추정) · 신규/재등록 구성비 · 매출/환불 추이.
   admin이 이미 로드한 배열 + goals(trainer_goal)를 props로 받아 파생·렌더만.
   ★hidden = 회원기반 함수(forecast)만 visible로 걸러 넘김. 매출/환불/구성비는 계약기반이라 원본 contracts.
   색: 긍정 cyan · 위험/환불 rose · 게이지 primary(red). emerald 금지. 예측은 '추정' 명시.
   ========================================================================= */
import { useMemo, useState } from "react";
import { Wallet, TrendingUp, PieChart, LineChart, ChevronDown, ChevronRight } from "lucide-react";
import {
  revenueInMonth, revenueCompositionInMonth, revenueTrendByMonth, revenueForecastNextMonth,
} from "@/lib/memberStatus";
import { won } from "@/lib/format";
import Card from "@/components/ui/Card";

const pctText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
// 차트 라벨 축약 — 만원 단위(6열이 폰에서 안 겹치게). 원 단위 전체값은 막대 title(hover)에 유지.
const manLabel = (n) => { const man = Math.round((n ?? 0) / 10000); return man === 0 ? "0" : man.toLocaleString("ko-KR") + "만"; };

export default function RevenuePipeline({ members = [], contracts = [], logs = [], otRows = [], trainers = [], goals = [], ym }) {
  const [nowISO] = useState(() => new Date().toISOString()); // 마운트 1회 고정(렌더 순수)
  const [detailOpen, setDetailOpen] = useState(false); // 구성·추이 상세 접기(기본 닫힘 · 표시만)

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
  const trainerCount = trainers.length;

  return (
    <div className="space-y-6">
      <p className="text-[12px] leading-relaxed text-sub">이달 <b className="text-ink">번 돈과 목표</b>, 다음달 <b className="text-ink">들어올 돈 예상</b>을 한눈에.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 블록① 이달 매출/목표 게이지 */}
        <Card>
          <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted"><Wallet className="h-3.5 w-3.5" /> 이달 순매출</div>
          <div className="mt-2 font-mono text-4xl font-extrabold text-primary-strong">{won(net)}</div>
          <div className="mt-1 text-xs text-muted">{ym} · 환불 차감 · 인계·외부 제외</div>
          {target != null ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-sub">목표 달성</span>
                <span className="font-mono font-bold text-ink">{pctText(goalPct)}
                  <span className="ml-1 text-[11px] font-normal text-muted">({won(net)} / {won(target)})</span></span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((goalPct ?? 0) * 100))}%` }} />
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                <span>트레이너 {goalsThisYm.length}/{trainerCount}명 목표 설정</span>
                {goalPct != null && goalPct >= 1 && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-semibold text-cyan-700">목표 달성</span>}
              </div>
              {goalsThisYm.length < trainerCount && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted">일부 트레이너만 목표를 설정해 합산 목표가 과소할 수 있어요.</p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-elevate px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              이달 목표 미설정 — 트레이너가 &lsquo;내 실적&rsquo;에서 이달 목표를 설정하면 센터 합산 목표로 표시돼요.
            </div>
          )}
        </Card>

        {/* 블록② 다음달 예측(추정) */}
        <Card>
          <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted"><TrendingUp className="h-3.5 w-3.5" /> 다음달 예상 매출 · 추정</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-extrabold text-cyan-700">{forecast.total != null ? `≈ ${won(forecast.total)}` : "추정 불가"}</span>
            <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] font-semibold text-muted">추정</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-elevate p-3">
              <div className="text-[11px] font-semibold text-sub">신규 유입에서</div>
              {forecast.expectedNew != null ? (
                <>
                  <div className="mt-1 font-mono text-lg font-bold text-ink">≈ {won(forecast.expectedNew)}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-muted">OT 진행 {forecast.otPipeline}명 × 전환율 {pctText(forecast.convRate)} × 평균 {won(forecast.avgNew)}</div>
                </>
              ) : <div className="mt-1 text-[11px] text-muted">아직 부족 — OT/전환 이력 쌓이면 표시</div>}
            </div>
            <div className="rounded-xl border border-line bg-elevate p-3">
              <div className="text-[11px] font-semibold text-sub">재등록에서</div>
              {forecast.expectedRe != null ? (
                <>
                  <div className="mt-1 font-mono text-lg font-bold text-ink">≈ {won(forecast.expectedRe)}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-muted">만료임박 {forecast.expiringCount}명 × 재등록률 {pctText(forecast.reregRate)} × 평균 {won(forecast.avgRe)}</div>
                </>
              ) : <div className="mt-1 text-[11px] text-muted">아직 부족 — 재등록 이력 쌓이면 표시</div>}
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">과거 전환율·재등록률·평균 계약금액으로 계산한 추정치예요. 실제와 다를 수 있습니다.</p>
        </Card>
      </div>

      {/* 근거(접기 · 기본 닫힘) — 구성비 · 추이 */}
      <div className="space-y-4">
        <button type="button" onClick={() => setDetailOpen((v) => !v)} aria-expanded={detailOpen}
          className="flex w-full items-center gap-2 text-left">
          <PieChart className="h-4 w-4 text-muted" />
          <span className="text-[11px] font-semibold tracking-label-ko text-muted">매출 구성 · 추이 상세</span>
          <span className="ml-1 text-[11px] font-normal text-muted">{detailOpen ? "접기" : "펼치기"}</span>
          {detailOpen ? <ChevronDown className="ml-auto h-4 w-4 text-muted" /> : <ChevronRight className="ml-auto h-4 w-4 text-muted" />}
        </button>
        {detailOpen && (
        <>
      {/* 블록③ 신규/재등록 구성비 */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-[11px] tracking-label-ko text-muted"><PieChart className="h-3.5 w-3.5" /> 이달 매출 구성 · 신규 vs 재등록</div>
        {comp.gross === 0 ? (
          <p className="text-[12px] text-muted">이달 매출이 아직 없습니다.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full bg-primary" style={{ width: `${Math.round((comp.newShare ?? 0) * 100)}%` }} />
              <div className="h-full bg-cyan-500" style={{ width: `${Math.round((comp.reShare ?? 0) * 100)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-sub">신규</span>
                <b className="font-mono text-ink">{won(comp.newRev)}</b><span className="text-muted">({comp.cntNew}건 · {pctText(comp.newShare)})</span></span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500" /><span className="text-sub">재등록</span>
                <b className="font-mono text-ink">{won(comp.reRev)}</b><span className="text-muted">({comp.cntRe}건 · {pctText(comp.reShare)})</span></span>
            </div>
            {comp.refund > 0 && <div className="mt-2 text-[11px] font-semibold text-danger-text">환불 −{won(comp.refund)} · 순매출 {won(comp.net)}</div>}
          </>
        )}
      </Card>

      {/* 블록④ 매출/환불 추이 (6개월) */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-[11px] tracking-label-ko text-muted"><LineChart className="h-3.5 w-3.5" /> 매출·환불 추이 · 최근 6개월</div>
        {(() => {
          const maxNet = Math.max(1, ...trend.map((t) => t.net));
          const anyRev = trend.some((t) => t.rev > 0);
          if (!anyRev) return <p className="text-[12px] text-muted">매출 이력이 없습니다.</p>;
          return (
            <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
              {trend.map((t) => (
                <div key={t.ym} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div className="mx-auto w-5 rounded-t bg-primary" style={{ height: `${Math.max(2, Math.round((t.net / maxNet) * 100))}%` }} title={won(t.net)} />
                  </div>
                  <div className="font-mono text-[10px] text-ink">{manLabel(t.net)}</div>
                  {t.refund > 0 && <div className="font-mono text-[9px] text-danger-text">−{manLabel(t.refund)}</div>}
                  <div className="text-[10px] text-muted">{t.ym.slice(5)}월</div>
                </div>
              ))}
            </div>
          );
        })()}
        <p className="mt-3 text-[10px] leading-relaxed text-muted">막대=월 순매출(환불 차감) · 빨강=환불 · 숫자는 만원 단위(막대에 마우스 올리면 원 단위). ※ 미수금(미납) 추이는 준비 중이에요.</p>
      </Card>
        </>
        )}
      </div>
    </div>
  );
}
