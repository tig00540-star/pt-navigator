"use client";

/* =========================================================================
   내 실적 (트레이너 본인) — 이달 매출·예상 급여·클로징률.
   session_log는 RLS로 본인 계약만. ot_log는 본인 회원(members)으로 필터.
   admin과 동일 함수 재사용(revenueByTrainer·sessionPriceSumByTrainer·closingStats·payForScheme).
   ========================================================================= */

import { useEffect, useState } from "react";
import { Award, Dumbbell, FileText, Target, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import { revenueByTrainer, sessionPriceSumByTrainer, closingStats, resolveScheme, payForScheme, sessionCountByTrainer, sessionsByMemberInMonth, revenueContractsInMonth, refundsInMonth, remainingSessions, viewFor } from "@/lib/memberStatus";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import MonthlyReport from "@/components/views/MonthlyReport";

export default function MyStats({ members = [], isSolo = false }) {
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [otRows, setOtRows] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [uid, setUid] = useState(null);
  const [email, setEmail] = useState("");        // 리포트 헤더 폴백(실명 없을 때) · personName 가드
  const [trainerName, setTrainerName] = useState("");  // trainer.name(실명) · 없으면 email 폴백
  const [loading, setLoading] = useState(true);
  const [contractNames, setContractNames] = useState(new Map());
  const [reportOpen, setReportOpen] = useState(false);
  const [goals, setGoals] = useState([]);        // trainer_goal(월별 목표) — 달성률·리포트 전달

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setLoading(false); return; }
      try {
      const { data: au } = await supabase.auth.getUser();
      const myId = au?.user?.id ?? null;
      const [c, l, o, ps, pr, tr, tg] = await Promise.all([
        supabase.from("session_log").select("*"),        // RLS: 본인 계약
        supabase.from("daily_workout_log").select("*"),
        supabase.from("ot_log").select("*"),
        supabase.from("pay_scheme").select("*"),
        supabase.from("payroll_run").select("*"),
        // trainer RLS(id = auth.uid())로 본인 행 select 허용 · maybeSingle은 행 없어도 에러 아님.
        myId ? supabase.from("trainer").select("name").eq("id", myId).maybeSingle()
             : Promise.resolve({ data: null }),
        supabase.from("trainer_goal").select("*"),       // 월별 목표(본인 것 · RLS)
      ]);
      // hidden(소프트삭제) 회원 이름 폴백 — 계약에 등장하는 회원 id를 user_table에서 직접 조회.
      // members(활성 목록)엔 hidden이 빠져 있어 이름을 못 찾음. RLS 7c2a는 hidden 무관 본인 회원 조회 허용.
      const uids = [...new Set((c.data || []).map((r) => r.user_id).filter(Boolean))];
      let names = new Map();
      if (uids.length) {
        const { data: nrows } = await supabase.from("user_table").select("id, name").in("id", uids);
        names = new Map((nrows || []).map((r) => [r.id, r.name]));
      }
      if (cancelled) return;
      setUid(au?.user?.id ?? null);
      setEmail(au?.user?.email ?? "");
      setTrainerName(tr?.data?.name || au?.user?.email || "");
      setGoals(tg.data || []);
      setContracts(c.data || []);
      setLogs(l.data || []);
      setOtRows(o.data || []);
      setSchemes(ps.data || []);
      setRuns(pr.data || []);
      setContractNames(names);
      setLoading(false);
    } catch {
      // 조회 실패 — finally에서 로딩 해제(무한 스피너 방지). MyStats는 별도 에러 표시 없음(빈 통계로 degrade).
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
    return () => { cancelled = true; };
  }, []);

  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  // 내 회원만(원장이 남의 회원 수업/클로징까지 세던 버그 수정 — 급여 스코프와 일치).
  const memberIds = new Set(members.filter((m) => m.trainer_id === uid).map((m) => m.id));
  const myOt = otRows.filter((r) => r && memberIds.has(r.user_id));
  const rev = revenueByTrainer(contracts, ym).find((r) => r.trainer_id === uid) || { newRev: 0, reRev: 0, refund: 0, total: 0, cntNew: 0, cntRe: 0 };
  const goalRow = goals.find((g) => g.ym === ym) || null;
  const target = goalRow?.target_revenue ?? null;
  const priceSum = sessionPriceSumByTrainer(logs, contracts, ym).get(uid) || 0;
  const closing = closingStats(myOt);
  const sessionCount = sessionCountByTrainer(logs, contracts, ym).get(uid) || 0;
  const scheme = resolveScheme(schemes, uid);
  const pay = payForScheme(scheme, { monthRevenue: rev.total, sessionCount, sessionPriceSum: priceSum });
  const myRun = runs.find((r) => r.trainer_id === uid && r.ym === ym) || null;
  const confirmed = myRun?.final_total != null;
  const rate = closing.rate == null ? "—" : Math.round(closing.rate * 100) + "%";
  // P2 — drill-down 파생. memberIds·ym·uid·logs·contracts·members는 이미 있음.
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  // hidden 회원은 members에 없으니 계약 이름 조회(contractNames)로 폴백.
  const displayName = (id) => nameById.get(id) || contractNames.get(id) || "(알 수 없음)";
  const sessionRows = sessionsByMemberInMonth(logs, memberIds, ym);   // [{user_id, count}]
  const totalSessions = sessionRows.reduce((s, r) => s + r.count, 0);
  const revRows = revenueContractsInMonth(contracts, uid, ym);        // session_log 행[]
  const refundRows = refundsInMonth(contracts, uid, ym);              // 이달 처리 환불[]

  // #1 — 내 활성 PT 회원(pt_active) 전체의 총/잔여 수업 합. inactive·OT·남의 회원 제외.
  const ptMemberIds = new Set(
    members.filter((m) => m.trainer_id === uid && viewFor(m) === "pt").map((m) => m.id)
  );
  const ptContracts = contracts.filter((c) => ptMemberIds.has(c.user_id));
  const sessTotalAll = ptContracts.reduce(
    (s, c) => s + (c.sessions_total ?? 0) + (c.service_sessions ?? 0), 0
  );
  const remAll = ptContracts.reduce((a, c) => {
    const r = remainingSessions(c, logs);
    a.paid += r.paid; a.service += r.service; a.total += r.total; return a;
  }, { paid: 0, service: 0, total: 0 });
  const doneAll = sessTotalAll - remAll.total; // 진행+노쇼(차감분). 총 상한·음수 없음.

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-10 text-center text-sm text-muted">불러오는 중…</div>
      ) : (
        <>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow icon={Award}>내 실적 · {ym}</Eyebrow>
        <button onClick={() => setReportOpen(true)}
          className="mb-4 flex shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-sub hover:text-ink">
          <FileText className="h-3.5 w-3.5" /> 월간 리포트
        </button>
      </div>

      {/* 급여 (헤드라인) — 확정액 우선, 없으면 자동계산 예상, manual이면 확정 대기 */}
      <div className="rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
          <Wallet className="h-3.5 w-3.5" /> 이달 {isSolo ? "급여(자동계산)" : `${confirmed ? "확정" : "예상"} 급여`}
        </div>
        {confirmed ? (
          <>
            <div className="mt-2 tabular-nums text-4xl font-extrabold text-primary-strong">{won(myRun.final_total)}</div>
            <div className="mt-1 text-xs text-muted">원장 확정{pay.computed != null && pay.computed !== myRun.final_total ? ` · 자동계산 ${won(pay.computed)}` : ""}</div>
          </>
        ) : pay.computed != null ? (
          <>
            <div className="mt-2 tabular-nums text-4xl font-extrabold text-primary-strong">{won(pay.computed)}</div>
            <div className="mt-1 text-xs text-muted">미확정 · 기본 {won(pay.base)}{pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}</div>
          </>
        ) : (
          <>
            <div className="mt-2 text-2xl font-extrabold text-muted">{isSolo ? "급여 방식 미설정" : "원장 확정 대기"}</div>
            <div className="mt-1 text-xs text-muted">{isSolo ? "급여 방식을 설정하면 자동계산돼요" : "자동계산 없음(수동 급여)"}</div>
          </>
        )}
      </div>

      {/* 매출 · 클로징 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="이달 매출(내 등록)" value={won(rev.total)}>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-sub">
            <span>신규 <b className="text-ink">{won(rev.newRev)}</b> · {rev.cntNew}건</span>
            <span>재등록 <b className="text-sky-700">{won(rev.reRev)}</b> · {rev.cntRe}건</span>
            {rev.refund > 0 && (
              <span>환불 <b className="text-rose-600">-{won(rev.refund)}</b></span>
            )}
          </div>
        </StatTile>
        <StatTile icon={Target} label="클로징률" value={rate}>
          <div className="mt-2 text-[11px] text-muted">시도 {closing.attempted}명 중 {closing.success} 성공</div>
        </StatTile>
      </div>

      {/* 이달 목표 달성 (설정돼 있을 때만) */}
      {target != null && (
        <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <div className="flex items-baseline justify-between text-sm">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Target className="h-3.5 w-3.5" /> 이달 목표 달성</span>
            <span className="tabular-nums font-bold text-ink">{Math.round((rev.total / target) * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevate">
            <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${Math.min(100, Math.round((rev.total / target) * 100))}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted">{won(rev.total)} / 목표 {won(target)}</div>
        </div>
      )}

      {/* #1 — PT 수업 현황(내 활성 PT 회원 전체 합). 회원 없으면 숨김. */}
      {ptMemberIds.size > 0 && (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Dumbbell className="h-3.5 w-3.5" /> PT 수업 현황 · 활성 회원 {ptMemberIds.size}명
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="tabular-nums text-3xl font-extrabold text-primary-strong">{remAll.total}</span>
            <span className="text-sm text-muted">회 잔여</span>
          </div>
          <div className="mt-1 text-xs text-sub">
            완료 <b className="tabular-nums text-ink">{doneAll}</b> / 총{" "}
            <b className="tabular-nums text-ink">{sessTotalAll}</b>회
            <span className="ml-1 text-[11px] text-muted">(유료 {remAll.paid}·서비스 {remAll.service})</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevate">
            <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600"
              style={{ width: `${sessTotalAll ? Math.round((doneAll / sessTotalAll) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {/* 이번달 수업 — 누르면 회원별 (P2) */}
      <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Dumbbell className="h-3.5 w-3.5" /> 이번달 수업
          </span>
          <span className="tabular-nums text-lg font-bold text-ink">{totalSessions}회</span>
        </summary>
        {sessionRows.length === 0 ? (
          <EmptyState className="mt-3 text-sm">이번달 수업 기록이 없어요.</EmptyState>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {sessionRows.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between rounded-lg border border-line bg-elevate px-3 py-2 text-sm">
                <span className="text-ink">{nameById.get(r.user_id) || "(알 수 없음)"}</span>
                <span className="tabular-nums font-semibold text-sub">{r.count}회</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* 매출 내역 — 누구·얼마·언제 (P2) */}
      <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Wallet className="h-3.5 w-3.5" /> 매출 내역
          </span>
          <span className="tabular-nums text-lg font-bold text-ink">{won(rev.total)}</span>
        </summary>
        {revRows.length === 0 && refundRows.length === 0 ? (
          <EmptyState className="mt-3 text-sm">이번달 매출이 없어요.</EmptyState>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {revRows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevate px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="text-ink">{displayName(c.user_id)}</span>
                  <Badge tone={c.kind === "reregister" ? "sky" : "primary"} className="ml-2">
                    {c.kind === "reregister" ? "재등록" : "신규"}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-semibold text-ink">{won(c.amount_total ?? 0)}</span>
                  <span className="text-[11px] text-muted">{new Date(c.started_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                </div>
              </li>
            ))}
            {refundRows.map((c) => (
              <li key={"rf-" + c.id} className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="text-ink">{displayName(c.user_id)}</span>
                  <Badge tone="rose" className="ml-2">환불</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-semibold text-rose-600">-{won(c.refund_amount)}</span>
                  <span className="text-[11px] text-muted">{new Date(c.refunded_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      <p className="text-[10px] text-muted">{isSolo ? "※ 자동계산은 이달 완료 수업 기준입니다." : "※ 확정 전 예상 급여는 이달 완료 수업 기준 자동계산 · 실지급은 원장이 확정한 금액 기준입니다."}</p>
        </>
      )}

      {/* 월간 리포트 오버레이 (4-a) — 읽기 전용 재집계, MyStats 데이터 그대로 전달. */}
      {reportOpen && (
        <MonthlyReport
          onClose={() => setReportOpen(false)}
          data={{
            contracts, logs, otRows, schemes, runs, uid,
            memberIds,        // 내 회원 Set(파생) — 재집계 스코프
            members,
            contractNames,
            goals,            // 월별 목표 배열 — 리포트가 선택 ym으로 조회
            trainerName: trainerName || email, // 실명 우선(trainer.name), 없으면 이메일 폴백(personName이 @앞만)
          }}
        />
      )}
    </div>
  );
}
