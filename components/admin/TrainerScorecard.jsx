"use client";
/* =========================================================================
   #1 트레이너 KPI 스코어카드 / 리더보드 — admin 실적 탭.
   admin이 이미 로드한 데이터를 props로 받아 per-trainer 파생·렌더만(자체 fetch 0 · 쿼리 추가 0).
   실데이터(QC 탭 데모 아님). 표본 적은 지표는 "—"(neutral) — no-data ≠ 나쁨.
   급여 확정(PayrollConfirm)은 펼침 상세로 이관해 흐름 보존.
   ========================================================================= */
import { Fragment, useMemo, useState } from "react";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import {
  closingStatsByRoundByTrainer, reregisterStatsByTrainer, sessionsThisMonthByTrainer,
  logWriteRateByTrainer, churnRiskByTrainer, revenueByTrainer,
  sessionCountByTrainer, sessionPriceSumByTrainer, resolveScheme, payForScheme,
} from "@/lib/memberStatus";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import PayrollConfirm from "@/components/PayrollConfirm";

// 우수(good)/주의(warn) 임계 — 원장 조정 가능. rate 0..1, 소진 회/월.
const TH = {
  closing:  { good: 0.50, warn: 0.30 },   // 1·2차 공통
  rereg:    { good: 0.60, warn: 0.40 },
  logWrite: { good: 0.90, warn: 0.70 },
  churn:    { good: 0.10, warn: 0.25, invert: true },   // 낮을수록 좋음
  burn:     { good: 6.0,  warn: 4.0 },     // 회/월·회원
};
const MIN_N = 1; // 색 판정 최소 표본(분모). 보수적으로 하려면 3.

// value=지표값, n=분모(표본), t=TH 항목. n<MIN_N 또는 value==null → 'neutral'.
function grade(value, n, t) {
  if (value == null || (n ?? 0) < MIN_N) return "neutral";
  const good = t.invert ? value <= t.good : value >= t.good;
  const warn = t.invert ? value >= t.warn : value <= t.warn;
  if (good) return "good";
  if (warn) return "warn";
  return "mid";
}

// 색 매핑(정적 리터럴 · purge 안전). 우수=cyan · 주의=rose(danger) — DS 초록제거 정책 준수.
const GRADE_TEXT = { good: "text-cyan-700", warn: "text-danger-text", mid: "text-ink", neutral: "text-muted" };
const GRADE_CELL = { good: "bg-cyan-500/10", warn: "bg-rose-500/10", mid: "", neutral: "" };

const pct = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
const burnText = (v) => (v == null ? "—" : v.toFixed(1));
const payText = (t) => (t.run?.final_total != null ? won(t.run.final_total) : t.pay?.computed != null ? won(t.pay.computed) : "—");

// 정렬 옵션 — 이탈은 '문제 큰 순'(높은 이탈 먼저).
const SORTS = [
  { key: "rev",   label: "매출" },
  { key: "r1",    label: "1차 등록" },
  { key: "r2",    label: "2차 등록" },
  { key: "rereg", label: "재등록" },
  { key: "burn",  label: "출석" },
  { key: "churn", label: "이탈위험" },
];

const EMPTY_REV = { newRev: 0, reRev: 0, total: 0, cntNew: 0, cntRe: 0 };
const EMPTY_CLOSE = { r1: { attempted: 0, success: 0, rate: null }, r2: { attempted: 0, success: 0, rate: null } };

/* 펼침 상세 — 기존 트레이너별 실적의 신규/재등록 split + PayrollConfirm 재사용(급여 확정 흐름 보존). */
function ExpandDetail({ rev, id, ym, pay, run, onSaveRun, onGoPayroll }) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="flex items-center justify-between text-[10px] tracking-label-ko text-muted">
            <span>신규</span>
            <span>{rev.total > 0 ? Math.round((rev.newRev / rev.total) * 100) + "%" : "—"}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-ink">{won(rev.newRev)}</div>
          <div className="text-[11px] text-muted">{rev.cntNew}건</div>
        </div>
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="flex items-center justify-between text-[10px] tracking-label-ko text-muted">
            <span>재등록</span>
            <span>{rev.total > 0 ? Math.round((rev.reRev / rev.total) * 100) + "%" : "—"}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-cyan-700">{won(rev.reRev)}</div>
          <div className="text-[11px] text-muted">{rev.cntRe}건</div>
        </div>
      </div>
      <PayrollConfirm trainerId={id} ym={ym} pay={pay} run={run} onSaved={onSaveRun} />
      {onGoPayroll && (
        <button
          type="button"
          onClick={onGoPayroll}
          className="mt-2 text-[11px] font-medium text-muted underline-offset-2 transition hover:text-sub hover:underline"
        >
          급여 규칙(스킴) 수정 → 급여 탭
        </button>
      )}
    </div>
  );
}

/* 모바일 metric 타일 — 모듈 레벨(render 중 컴포넌트 생성 금지). */
function MetricTile({ label, value, g = "neutral" }) {
  return (
    <div className={`rounded-lg border border-line px-2.5 py-2 ${GRADE_CELL[g] || ""}`}>
      <div className="text-[10px] tracking-label-ko text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-bold ${GRADE_TEXT[g]}`}>{value}</div>
    </div>
  );
}

/* 순위 뱃지 — 매출>0 상위3만 메달톤(1위 트로피). */
function RankBadge({ rank, medal }) {
  if (medal) {
    return (
      <span className="inline-flex min-w-6 items-center justify-center gap-1 font-bold text-primary-strong">
        {rank === 1 && <Trophy className="h-3.5 w-3.5" />}{rank}
      </span>
    );
  }
  return <span className="inline-block min-w-6 text-center text-muted">{rank}</span>;
}

export default function TrainerScorecard({ members = [], otRows = [], contracts = [], logs = [], trainers = [], schemes = [], runs = [], ym, onSaveRun, onGoPayroll }) {
  // 기준시각 — 마운트 1회 고정(렌더 중 new Date() 지양 · churn gap 계산에 주입).
  const [nowISO] = useState(() => new Date().toISOString());
  const [sortKey, setSortKey] = useState("rev");
  const [expandedId, setExpandedId] = useState(null);

  // hidden(환불·소프트삭제) 회원은 트레이너 실적에서 제외 — memberTrainer·churn 둘 다 visible 기준.
  //   (memberCounts는 자체 !hidden 필터가 있어 members 그대로 둔다.)
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);

  const memberTrainer = useMemo(() => {
    const m = new Map();
    for (const r of visible) if (r?.id) m.set(r.id, r.trainer_id ?? "unknown");
    return m;
  }, [visible]);

  const closeMap = useMemo(() => closingStatsByRoundByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
  const reregMap = useMemo(() => reregisterStatsByTrainer(contracts), [contracts]);
  const sessMonth = useMemo(() => sessionsThisMonthByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const logRateMap = useMemo(() => logWriteRateByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const churnMap = useMemo(() => churnRiskByTrainer(visible, contracts, logs, { nowISO }), [visible, contracts, logs, nowISO]);
  const revMap = useMemo(() => new Map(revenueByTrainer(contracts, ym).map((r) => [r.trainer_id, r])), [contracts, ym]);
  const sessCount = useMemo(() => sessionCountByTrainer(logs, contracts, ym), [logs, contracts, ym]);
  const sessPriceSum = useMemo(() => sessionPriceSumByTrainer(logs, contracts, ym), [logs, contracts, ym]);

  // 담당 회원 수(현재 · !hidden · status 기준). all=ot+pt, pt=pt_active(세션소진·이탈률 status 분모).
  const memberCounts = useMemo(() => {
    const m = new Map();
    for (const r of members) {
      if (!r || r.hidden) continue;
      if (r.status !== "ot_active" && r.status !== "pt_active") continue;
      const tid = r.trainer_id ?? "unknown";
      let c = m.get(tid);
      if (!c) { c = { all: 0, pt: 0 }; m.set(tid, c); }
      c.all += 1;
      if (r.status === "pt_active") c.pt += 1;
    }
    return m;
  }, [members]);

  const rows = useMemo(() => {
    const ids = trainers.length
      ? trainers.map((t) => t.id)
      : [...new Set([...revMap.keys(), ...closeMap.keys(), ...memberCounts.keys()])];
    const nameOf = (id) => personName(trainers.find((t) => t.id === id)?.name) || (id === "unknown" ? "미배정" : String(id).slice(0, 8));
    const list = ids.map((id) => {
      const rev = revMap.get(id) || EMPTY_REV;
      const close = closeMap.get(id) || EMPTY_CLOSE;
      const rereg = reregMap.get(id) || { attempted: 0, success: 0, rate: null };
      const churn = churnMap.get(id) || { atRisk: 0, activePt: 0, rate: null };
      const logRate = logRateMap.get(id) || { written: 0, total: 0, rate: null };
      const cnt = memberCounts.get(id) || { all: 0, pt: 0 };
      // ⚠️ 세션소진 분모 = status 기준 활성 PT(cnt.pt). churn.activePt(활성계약 PT)와 다름 — 혼동 방지.
      const burn = cnt.pt > 0 ? (sessMonth.get(id) || 0) / cnt.pt : null;
      const pay = payForScheme(resolveScheme(schemes, id), {
        monthRevenue: rev.total, sessionCount: sessCount.get(id) || 0, sessionPriceSum: sessPriceSum.get(id) || 0,
      });
      const run = runs.find((r) => r.ym === ym && r.trainer_id === id) || null;
      return { id, name: nameOf(id), rev, close, rereg, churn, logRate, cnt, burn, pay, run };
    });
    // 순위 = 매출 내림차순(항상). 메달은 매출>0 상위3에만.
    const byRev = [...list].sort((a, b) => b.rev.total - a.rev.total);
    const rankOf = new Map(byRev.map((r, i) => [r.id, i + 1]));
    for (const r of list) r.rank = rankOf.get(r.id);
    return list;
  }, [trainers, revMap, closeMap, reregMap, churnMap, logRateMap, memberCounts, sessMonth, sessCount, sessPriceSum, schemes, runs, ym]);

  const sorted = useMemo(() => {
    const nz = (v) => (v == null ? -Infinity : v);
    const arr = [...rows];
    if (sortKey === "rev") arr.sort((a, b) => b.rev.total - a.rev.total);
    else if (sortKey === "r1") arr.sort((a, b) => nz(b.close.r1.rate) - nz(a.close.r1.rate));
    else if (sortKey === "r2") arr.sort((a, b) => nz(b.close.r2.rate) - nz(a.close.r2.rate));
    else if (sortKey === "rereg") arr.sort((a, b) => nz(b.rereg.rate) - nz(a.rereg.rate));
    else if (sortKey === "burn") arr.sort((a, b) => nz(b.burn) - nz(a.burn));
    else if (sortKey === "churn") arr.sort((a, b) => nz(b.churn.rate) - nz(a.churn.rate)); // 문제 큰 순
    return arr;
  }, [rows, sortKey]);

  if (rows.length === 0) {
    return <div className="rounded-2xl border border-line bg-card p-5 text-xs text-muted">트레이너 데이터가 없습니다.</div>;
  }

  const gradesOf = (t) => ({
    r1: grade(t.close.r1.rate, t.close.r1.attempted, TH.closing),
    r2: grade(t.close.r2.rate, t.close.r2.attempted, TH.closing),
    re: grade(t.rereg.rate, t.rereg.attempted, TH.rereg),
    burn: grade(t.burn, t.cnt.pt, TH.burn),
    log: grade(t.logRate.rate, t.logRate.total, TH.logWrite),
    churn: grade(t.churn.rate, t.churn.activePt, TH.churn),
  });

  return (
    <div>
      <p className="mb-3 text-[12px] leading-relaxed text-sub">
        트레이너 성적표 — 누가 <b className="text-ink">등록·관리·매출</b>을 잘 내는지 한눈에.
      </p>
      {/* 정렬 토글(표·카드 공용) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-muted">정렬</span>
        {SORTS.map((s) => (
          <button key={s.key} onClick={() => setSortKey(s.key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${sortKey === s.key ? "border-primary bg-primary-soft text-primary-strong" : "border-line bg-card text-sub hover:border-primary/40"}`}>
            {s.label}
          </button>
        ))}
        {sortKey === "churn" && <span className="text-[10px] text-muted">· 이탈위험 높은 순</span>}
      </div>

      {/* 데스크톱(sm+) — 표 */}
      <div className="hidden sm:block">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="bg-elevate text-[11px] tracking-label-ko text-muted">
                <th className="px-2.5 py-2.5 text-left font-semibold">#</th>
                <th className="px-2.5 py-2.5 text-left font-semibold">트레이너</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">담당</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">1차 등록</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">2차 등록</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">재등록</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">출석</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">일지</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">이탈위험</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">이달매출</th>
                <th className="px-2.5 py-2.5 text-right font-semibold">성과급</th>
                <th className="px-2.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const g = gradesOf(t);
                const open = expandedId === t.id;
                const medal = t.rank <= 3 && t.rev.total > 0;
                return (
                  <Fragment key={t.id}>
                    <tr className="border-t border-line hover:bg-elevate/60">
                      <td className="px-2.5 py-2.5 text-left"><RankBadge rank={t.rank} medal={medal} /></td>
                      <td className="px-2.5 py-2.5 text-left font-semibold text-ink">{t.name}</td>
                      <td className="px-2.5 py-2.5 text-right text-sub">{t.cnt.all}<span className="text-[10px] text-muted"> (PT {t.cnt.pt})</span></td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.r1]}`}>{pct(t.close.r1.rate)}</td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.r2]}`}>{pct(t.close.r2.rate)}</td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.re]}`}>{pct(t.rereg.rate)}</td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.burn]}`}>{burnText(t.burn)}</td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.log]}`}>{pct(t.logRate.rate)}</td>
                      <td className={`px-2.5 py-2.5 text-right font-mono font-semibold ${GRADE_TEXT[g.churn]}`}>{pct(t.churn.rate)}</td>
                      <td className="px-2.5 py-2.5 text-right font-mono font-bold text-primary-strong">{won(t.rev.total)}</td>
                      <td className="px-2.5 py-2.5 text-right font-mono text-ink">
                        {payText(t)}{t.run?.final_total != null && <span className="ml-1 text-[9px] text-cyan-700">✓</span>}
                      </td>
                      <td className="px-2.5 py-2.5 text-right">
                        <button onClick={() => setExpandedId(open ? null : t.id)} aria-label="상세" className="text-muted transition hover:text-ink">
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-line bg-elevate/30">
                        <td colSpan={12} className="px-3 py-3">
                          <ExpandDetail rev={t.rev} id={t.id} ym={ym} pay={t.pay} run={t.run} onSaveRun={onSaveRun} onGoPayroll={onGoPayroll} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
          1차·2차 등록 = OT 상담 후 실제 PT 등록 비율 · 출석 = 회원 1인당 이달 수업 수 · 이탈위험 = 14일 이상 안 온 회원 비율 · <span className="text-cyan-700">파랑=우수</span> <span className="text-danger-text">빨강=주의</span> · &ldquo;—&rdquo;는 아직 데이터 부족.
        </p>
      </div>

      {/* 모바일(<sm) — 트레이너별 카드 */}
      <div className="space-y-3 sm:hidden">
        {sorted.map((t) => {
          const g = gradesOf(t);
          const open = expandedId === t.id;
          const medal = t.rank <= 3 && t.rev.total > 0;
          return (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RankBadge rank={t.rank} medal={medal} />
                  <span className="text-sm font-semibold text-ink">{t.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] tracking-label-ko text-muted">이달매출</div>
                  <div className="font-mono text-lg font-bold text-primary-strong">{won(t.rev.total)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricTile label="담당" value={`${t.cnt.all} · PT ${t.cnt.pt}`} />
                <MetricTile label="1차 등록률" value={pct(t.close.r1.rate)} g={g.r1} />
                <MetricTile label="2차 등록률" value={pct(t.close.r2.rate)} g={g.r2} />
                <MetricTile label="재등록" value={pct(t.rereg.rate)} g={g.re} />
                <MetricTile label="출석(월 수업)" value={burnText(t.burn)} g={g.burn} />
                <MetricTile label="일지 작성" value={pct(t.logRate.rate)} g={g.log} />
                <MetricTile label="이탈위험" value={pct(t.churn.rate)} g={g.churn} />
                <MetricTile label="성과급" value={payText(t)} />
              </div>
              <button onClick={() => setExpandedId(open ? null : t.id)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-line bg-elevate py-2 text-[12px] font-semibold text-sub transition hover:border-primary/40">
                {open ? "접기" : "상세 · 급여 확정"} {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {open && <div className="mt-3"><ExpandDetail rev={t.rev} id={t.id} ym={ym} pay={t.pay} run={t.run} onSaveRun={onSaveRun} onGoPayroll={onGoPayroll} /></div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
