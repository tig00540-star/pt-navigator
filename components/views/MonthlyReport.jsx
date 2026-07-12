"use client";
/* 원장 보고용 월간 실적 리포트 — 월 셀렉터로 과거월 조회. 데이터는 MyStats에서 props로(추가 fetch X).
   4-a: 뷰 + 집계 + 앱 내 보기. 내보내기(PDF/이미지)는 4-b에서 .report-sheet/.no-print 위에 얹음. */
import { useState, useRef } from "react";
import { X, Award, Wallet, Target, Dumbbell, RefreshCw } from "lucide-react";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import {
  revenueByTrainer, sessionCountByTrainer, sessionPriceSumByTrainer,
  sessionsByMemberInMonth, revenueContractsInMonth, refundsInMonth,
  resolveScheme, payForScheme, closingStats,
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

// props.data = MyStats가 로드한 { contracts, logs, otRows, schemes, runs, uid, memberIds(Set), members, contractNames(Map), trainerName }
export default function MonthlyReport({ data, onClose }) {
  const months = lastMonths(12);
  const [ym, setYm] = useState(months[0]);          // 기본 = 이번달(KST). 원장이 지난달 고르면 셀렉트로.
  const sheetRef = useRef(null);                     // 4-b 내보내기 타깃
  const { contracts, logs, otRows, schemes, runs, uid, memberIds, members, contractNames, trainerName } = data;

  // ── 선택 ym 재집계(전부 순수 함수·ym 주입) ──
  const rev = revenueByTrainer(contracts, ym).find((r) => r.trainer_id === uid)
            || { newRev: 0, reRev: 0, refund: 0, total: 0, cntNew: 0, cntRe: 0 };
  const sessionCount = sessionCountByTrainer(logs, contracts, ym).get(uid) || 0;
  const priceSum = sessionPriceSumByTrainer(logs, contracts, ym).get(uid) || 0;
  const scheme = resolveScheme(schemes, uid);
  const pay = payForScheme(scheme, { monthRevenue: rev.total, sessionCount, sessionPriceSum: priceSum });
  const myRun = runs.find((r) => r.trainer_id === uid && r.ym === ym) || null;
  const confirmed = myRun?.final_total != null;
  const sessionRows = sessionsByMemberInMonth(logs, memberIds, ym);   // [{user_id, count}]
  const revRows = revenueContractsInMonth(contracts, uid, ym);
  const refundRows = refundsInMonth(contracts, uid, ym);
  // 클로징률 = 누적(월 스코프 불가). myOt = 내 회원 ot_log 전체.
  const myOt = (otRows || []).filter((r) => r && memberIds.has(r.user_id));
  const closing = closingStats(myOt);
  const rate = closing.rate == null ? "—" : Math.round(closing.rate * 100) + "%";

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
          <button onClick={onClose} className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-sub hover:text-ink">
            <X className="h-4 w-4" /> 닫기
          </button>
        </div>
      </div>

      {/* 리포트 본문 — 내보내기 타깃(흰 A4풍 시트) */}
      <div ref={sheetRef} className="report-sheet mx-auto max-w-2xl rounded-2xl bg-bg p-6 shadow-xl">
        {/* 리포트 헤더 */}
        <div className="mb-5 flex items-center justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
              <Award className="h-3.5 w-3.5" /> 월간 실적 보고서
            </div>
            <h2 className="mt-1 text-xl font-bold text-ink">{personName(trainerName)} 트레이너 · {ym}</h2>
          </div>
        </div>

        {/* 급여 헤드라인(확정/예상) */}
        <Card tone="emerald">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
            <Wallet className="h-3.5 w-3.5" /> {confirmed ? "확정" : "예상"} 급여
          </div>
          {confirmed ? (
            <div className="mt-2 tabular-nums text-3xl font-extrabold text-primary-strong">{won(myRun.final_total)}</div>
          ) : pay.computed != null ? (
            <>
              <div className="mt-2 tabular-nums text-3xl font-extrabold text-primary-strong">{won(pay.computed)}</div>
              <div className="mt-1 text-xs text-muted">미확정 · 기본 {won(pay.base)}{pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}</div>
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
          </StatTile>
          <StatTile icon={Dumbbell} label="이달 수업" value={`${sessionCount}회`} />
          <StatTile icon={RefreshCw} label="재등록" value={`${rev.cntRe}건`}>
            <div className="mt-2 text-[11px] text-muted">재등록 매출 {won(rev.reRev)}</div>
          </StatTile>
          <StatTile icon={Target} label="클로징률(누적)" value={rate}>
            <div className="mt-2 text-[11px] text-muted">시도 {closing.attempted}명 중 {closing.success} 성공 · 전체 기간</div>
          </StatTile>
        </div>

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
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.kind === "reregister" ? "bg-sky-500/10 text-sky-700" : "bg-primary-soft text-primary-strong"}`}>
                      {c.kind === "reregister" ? "재등록" : "신규"}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-ink">{won(c.amount_total ?? 0)}</span>
                </li>
              ))}
              {refundRows.map((c) => (
                <li key={"rf-" + c.id} className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{nameOf(c.user_id)}
                    <span className="ml-2 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">환불</span></span>
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
