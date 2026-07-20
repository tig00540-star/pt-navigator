"use client";
/* 원장 보고용 월간 실적 리포트 — 월 셀렉터로 과거월 조회. 데이터는 MyStats에서 props로(추가 fetch X).
   4-a: 뷰 + 집계 + 앱 내 보기. 내보내기(PDF/이미지)는 4-b에서 .report-sheet/.no-print 위에 얹음. */
import { useState, useRef } from "react";
import { X, Award, Wallet, Target, Dumbbell, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { labelOf, CLOSING_APPROACH_OPTS, CLOSING_REASON_OPTS, REG_REASON_OPTS } from "@/lib/labels";
import {
  revenueByTrainer, sessionCountByTrainer, sessionPriceSumByTrainer,
  sessionsByMemberInMonth, revenueContractsInMonth, refundsInMonth,
  resolveScheme, payForScheme, closingStats,
  closingApproachStats, closingReasonStats, reregisterStats, reregisterReasonStats,
} from "@/lib/memberStatus";

// 최근 n개월 ym 리스트(KST). 컴포넌트는 now 읽어도 됨(저장소 컨벤션).
function lastMonths(n) {
  const base = new Date(new Date().getTime() + 9 * 3600 * 1000);
  const y0 = base.getUTCFullYear(), m0 = base.getUTCMonth();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y0, m0 - i, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

// 전월 ym('YYYY-MM' → 한 달 전 'YYYY-MM'). 연도 경계·1월 안전(UTC 순수 계산, now 안 읽음).
function prevYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m은 1-based → m-2 = 전월의 0-based month index
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 전월대비 증감 pill. up=긍정지표(매출·수업·급여는 오를수록 좋음).
// prev===0 처리: 신규 발생(cur>0)이면 "신규", 둘 다 0이면 렌더 안 함(null).
function Delta({ cur, prev }) {
  if (!prev && !cur) return null;
  if (!prev) return <span className="text-[11px] font-semibold text-sub">신규</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="text-[11px] text-muted">± 0%</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const cls = up ? "text-primary-strong" : "text-rose-600";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>
      <Icon className="h-3 w-3" /> {Math.abs(pct)}%
    </span>
  );
}

// props.data = MyStats가 로드한 { contracts, logs, otRows, schemes, runs, uid, memberIds(Set), members, contractNames(Map), trainerName }
export default function MonthlyReport({ data, onClose }) {
  const months = lastMonths(12);
  const [ym, setYm] = useState(months[0]);          // 기본 = 이번달(KST). 원장이 지난달 고르면 셀렉트로.
  const sheetRef = useRef(null);                     // 4-b 내보내기 타깃
  const { contracts, logs, otRows, schemes, runs, uid, memberIds, members, contractNames, trainerName, goals } = data;

  // ── 선택 ym 재집계(전부 순수 함수·ym 주입) ──
  const rev = revenueByTrainer(contracts, ym).find((r) => r.trainer_id === uid)
            || { newRev: 0, reRev: 0, refund: 0, total: 0, cntNew: 0, cntRe: 0 };
  const sessionCount = sessionCountByTrainer(logs, contracts, ym).get(uid) || 0;
  const priceSum = sessionPriceSumByTrainer(logs, contracts, ym).get(uid) || 0;
  const scheme = resolveScheme(schemes, uid);
  const pay = payForScheme(scheme, { monthRevenue: rev.total, sessionCount, sessionPriceSum: priceSum });
  // ── 전월 재집계(MoM) — 같은 순수함수에 pym 주입. 추가 fetch 없음. ──
  const pym = prevYm(ym);
  const revP = revenueByTrainer(contracts, pym).find((r) => r.trainer_id === uid) || { total: 0 };
  const sessP = sessionCountByTrainer(logs, contracts, pym).get(uid) || 0;
  const priceP = sessionPriceSumByTrainer(logs, contracts, pym).get(uid) || 0;
  const payP = payForScheme(scheme, { monthRevenue: revP.total, sessionCount: sessP, sessionPriceSum: priceP });
  const myRun = runs.find((r) => r.trainer_id === uid && r.ym === ym) || null;
  const confirmed = myRun?.final_total != null;
  const sessionRows = sessionsByMemberInMonth(logs, memberIds, ym);   // [{user_id, count}]
  const revRows = revenueContractsInMonth(contracts, uid, ym);
  const refundRows = refundsInMonth(contracts, uid, ym);
  // 클로징률 = 누적(월 스코프 불가). myOt = 내 회원 ot_log 전체.
  const myOt = (otRows || []).filter((r) => r && memberIds.has(r.user_id));
  const closing = closingStats(myOt);
  const rate = closing.rate == null ? "—" : Math.round(closing.rate * 100) + "%";
  // 클로징 성과 상세(누적) — 성공 방향(강점)·실패/보류 사유(약점).
  const approachRows = closingApproachStats(myOt); // [{approach, count}]
  const reasonRows = closingReasonStats(myOt);     // [{reason, count}]
  // 재등록 파이프라인(누적) — 내 계약만(방어 필터). 전환 퍼널 + 미등록 사유.
  const myContracts = contracts.filter((c) => c && c.trainer_id === uid);
  const reReg = reregisterStats(myContracts);            // {attempted, success, hold, fail, rate}
  const regReasonRows = reregisterReasonStats(myContracts); // [{reason, count}]
  // 다음 급여 구간까지(banded 스킴 한정 · manual이면 bands 빈 배열 → 자동 숨김). 읽기 전용 파생.
  const bands = [...(scheme?.bands || [])].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  const basisVal = scheme?.band_basis === "session_count" ? sessionCount : rev.total;
  const nextBand = bands.find((b) => (b.min ?? 0) > basisVal);
  const toNext = nextBand ? (nextBand.min ?? 0) - basisVal : 0;
  // 목표 달성률(nextBand 프록시 대체) — 선택 ym의 trainer_goal.
  const goalRow = (goals || []).find((g) => g.ym === ym) || null;
  const target = goalRow?.target_revenue ?? null;

  const nameOf = (id) => (members.find((m) => m.id === id)?.name) || contractNames.get(id) || "(알 수 없음)";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8">
      {/* 상단 컨트롤 바 — 인쇄/이미지에서 제외(.no-print) */}
      <div className="no-print mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3">
        <select value={ym} onChange={(e) => setYm(e.target.value)}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-primary">
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="flex items-center gap-2">
          {/* 4-b에서 여기 'PDF 저장'·'이미지 저장' 버튼 추가 */}
          <Button variant="ghost" size="md" onClick={onClose}>
            <X className="h-4 w-4" /> 닫기
          </Button>
        </div>
      </div>

      {/* 리포트 본문 — 내보내기 타깃(흰 A4풍 시트) */}
      <div ref={sheetRef} className="report-sheet mx-auto max-w-2xl rounded-2xl bg-bg p-6 shadow-xl">
        {/* 리포트 헤더 */}
        <div className="mb-5 flex items-center justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted">
              <Award className="h-3.5 w-3.5" /> 월간 실적 보고서
            </div>
            <h2 className="mt-1 text-xl font-bold text-ink">{personName(trainerName)} 트레이너 · {ym}</h2>
          </div>
        </div>

        {/* 급여 헤드라인(확정/예상) */}
        <Card tone="emerald">
          <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted">
            <Wallet className="h-3.5 w-3.5" /> {confirmed ? "확정" : "예상"} 급여
          </div>
          {confirmed ? (
            <div className="mt-2 tabular-nums text-3xl font-extrabold text-primary-strong">{won(myRun.final_total)}</div>
          ) : pay.computed != null ? (
            <>
              <div className="mt-2 tabular-nums text-3xl font-extrabold text-primary-strong">{won(pay.computed)}</div>
              <div className="mt-1 text-xs text-muted">미확정 · 기본 {won(pay.base)}{pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}</div>
              {payP.computed != null && payP.computed > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">전월대비 <Delta cur={pay.computed} prev={payP.computed} /></div>
              )}
              {nextBand && (
                <div className="mt-1 text-[11px] text-muted">
                  다음 급여 구간까지 {scheme.band_basis === "session_count" ? `${toNext}회` : won(toNext)}
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 tabular-nums text-2xl font-extrabold text-muted">확정 대기(수동 급여)</div>
          )}
        </Card>

        {/* 핵심 지표 grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="이달 순매출" value={won(rev.total)}>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-sub">
              <span>신규 <b className="text-ink">{won(rev.newRev)}</b> · {rev.cntNew}건</span>
              <span>재등록 <b className="text-sky-700">{won(rev.reRev)}</b> · {rev.cntRe}건</span>
              {rev.refund > 0 && <span>환불 <b className="text-rose-600">-{won(rev.refund)}</b></span>}
            </div>
            {revP.total > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">전월대비 <Delta cur={rev.total} prev={revP.total} /></div>
            )}
          </StatTile>
          <StatTile icon={Dumbbell} label="이달 수업" value={`${sessionCount}회`}>
            {sessP > 0 && (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">전월대비 <Delta cur={sessionCount} prev={sessP} /></div>
            )}
          </StatTile>
          <StatTile icon={RefreshCw} label="재등록" value={`${rev.cntRe}건`}>
            <div className="mt-2 text-[11px] text-muted">재등록 매출 {won(rev.reRev)}</div>
          </StatTile>
          <StatTile icon={Target} label="클로징률(누적)" value={rate}>
            <div className="mt-2 text-[11px] text-muted">시도 {closing.attempted}명 중 {closing.success} 성공 · 전체 기간</div>
          </StatTile>
        </div>

        {/* 목표 달성 — trainer_goal(선택 ym). 급여 확정/예상 무관(매출 기준)이라 여기 독립 표시. */}
        {target != null && (
          <div className="mb-4 rounded-2xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-label-ko text-muted"><Target className="h-3.5 w-3.5" /> 이달 목표 달성</span>
              <span className="tabular-nums text-lg font-bold text-ink">{Math.round((rev.total / target) * 100)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevate">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${Math.min(100, Math.round((rev.total / target) * 100))}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted">{won(rev.total)} / 목표 {won(target)}</div>
          </div>
        )}

        {/* 클로징 성과 — ot_log 누적(월 스코프 불가). 성공/보류/실패 + 강점 방향 + 놓친 이유 */}
        <Card tone="zinc">
          <SectionHeader tone="zinc" icon={Target} title="클로징 성과" hint="전체 기간 누적" />
          {closing.attempted === 0 ? (
            <EmptyState className="py-1 text-sm">아직 클로징 시도 기록이 없어요.</EmptyState>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center">
                  <div className="text-[10px] tracking-label-ko text-muted">성공</div>
                  <div className="tabular-nums text-lg font-bold text-primary-strong">{closing.success}</div>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
                  <div className="text-[10px] tracking-label-ko text-muted">보류</div>
                  <div className="tabular-nums text-lg font-bold text-amber-700">{closing.hold}</div>
                </div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-center">
                  <div className="text-[10px] tracking-label-ko text-muted">실패</div>
                  <div className="tabular-nums text-lg font-bold text-rose-700">{closing.fail}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted">시도 {closing.attempted}명 · 성공률 {rate}</div>
              {approachRows.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-sub">통한 방향</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {approachRows.map((a) => (
                      <Chip key={a.approach}>{labelOf(CLOSING_APPROACH_OPTS, a.approach)} <b className="ml-0.5 text-ink">{a.count}</b></Chip>
                    ))}
                  </div>
                </div>
              )}
              {reasonRows.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-sub">놓친 이유</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {reasonRows.map((x) => (
                      <Chip key={x.reason} muted>{labelOf(CLOSING_REASON_OPTS, x.reason)} <b className="ml-0.5 text-sub">{x.count}</b></Chip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* 재등록 파이프라인 — 이달 결과(월) + 누적 전환 퍼널(reg_result, 월 스코프 불가) */}
        <Card tone="zinc">
          <SectionHeader tone="zinc" icon={RefreshCw} title="재등록 파이프라인" />
          <div className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-sm">
            <span className="text-sub">이달 재등록</span>
            <span className="tabular-nums font-semibold text-ink">{rev.cntRe}건 · <span className="text-sky-700">{won(rev.reRev)}</span></span>
          </div>
          {reReg.attempted === 0 ? (
            <EmptyState className="mt-2 py-1 text-sm">아직 재등록 시도 기록이 없어요.</EmptyState>
          ) : (
            <>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted">누적 전환</span>
                <span className="tabular-nums text-sub">
                  성공 <b className="text-primary-strong">{reReg.success}</b> · 보류 <b className="text-amber-700">{reReg.hold}</b> · 미등록 <b className="text-rose-700">{reReg.fail}</b>
                  {reReg.rate != null && <> · 전환율 <b className="text-ink">{Math.round(reReg.rate * 100)}%</b></>}
                </span>
              </div>
              {regReasonRows.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-sub">미등록 사유</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {regReasonRows.map((x) => (
                      <Chip key={x.reason} muted>{labelOf(REG_REASON_OPTS, x.reason)} <b className="ml-0.5 text-sub">{x.count}</b></Chip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* 매출 내역 */}
        <Card tone="zinc">
          <SectionHeader tone="zinc" icon={Wallet} title="매출 내역" count={revRows.length + refundRows.length} />
          {revRows.length === 0 && refundRows.length === 0 ? (
            <EmptyState className="py-1 text-sm">이번달 매출이 없어요.</EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {revRows.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{nameOf(c.user_id)}
                    <Badge tone={c.kind === "reregister" ? "sky" : "primary"} className="ml-2">
                      {c.kind === "reregister" ? "재등록" : "신규"}</Badge>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-ink">{won(c.amount_total ?? 0)}</span>
                </li>
              ))}
              {refundRows.map((c) => (
                <li key={"rf-" + c.id} className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{nameOf(c.user_id)}
                    <Badge tone="rose" className="ml-2">환불</Badge></span>
                  <span className="shrink-0 tabular-nums font-semibold text-rose-600">-{won(c.refund_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 수업 내역(회원별) */}
        <Card tone="zinc">
          <SectionHeader tone="zinc" icon={Dumbbell} title="회원별 수업" count={sessionRows.length} hint={`총 ${sessionRows.reduce((s, r) => s + r.count, 0)}회`} />
          {sessionRows.length === 0 ? (
            <EmptyState className="py-1 text-sm">이번달 수업 기록이 없어요.</EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {sessionRows.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-sm">
                  <span className="text-ink">{nameOf(r.user_id)}</span>
                  <span className="tabular-nums font-semibold text-sub">{r.count}회</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="mt-4 text-[10px] text-muted">※ 예상 급여는 완료 수업 기준 자동계산 · 실지급은 원장 확정액 기준. 클로징률은 전체 기간 누적. 생성 {ym} 기준.</p>
      </div>
    </div>
  );
}
