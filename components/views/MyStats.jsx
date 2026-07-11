"use client";

/* =========================================================================
   내 실적 (트레이너 본인) — 이달 매출·예상 급여·클로징률.
   session_log는 RLS로 본인 계약만. ot_log는 본인 회원(members)으로 필터.
   admin과 동일 함수 재사용(revenueByTrainer·sessionPriceSumByTrainer·closingStats·payForMonth).
   ========================================================================= */

import { useEffect, useState } from "react";
import { Award, Dumbbell, Target, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import { revenueByTrainer, sessionPriceSumByTrainer, closingStats, payForMonth, sessionsByMemberInMonth, revenueContractsInMonth } from "@/lib/memberStatus";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import PasswordChange from "@/components/views/PasswordChange";

export default function MyStats({ members = [] }) {
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [otRows, setOtRows] = useState([]);
  const [policy, setPolicy] = useState([]);
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setLoading(false); return; }
      const { data: au } = await supabase.auth.getUser();
      const [c, l, o, pp] = await Promise.all([
        supabase.from("session_log").select("*"),        // RLS: 본인 계약
        supabase.from("daily_workout_log").select("*"),
        supabase.from("ot_log").select("*"),
        supabase.from("pay_policy").select("*"),
      ]);
      if (cancelled) return;
      setUid(au?.user?.id ?? null);
      setContracts(c.data || []);
      setLogs(l.data || []);
      setOtRows(o.data || []);
      setPolicy(pp.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const memberIds = new Set(members.map((m) => m.id));
  const myOt = otRows.filter((r) => r && memberIds.has(r.user_id));
  const rev = revenueByTrainer(contracts, ym).find((r) => r.trainer_id === uid) || { newRev: 0, reRev: 0, total: 0, cntNew: 0, cntRe: 0 };
  const priceSum = sessionPriceSumByTrainer(logs, contracts, ym).get(uid) || 0;
  const closing = closingStats(myOt);
  const pay = payForMonth(rev.total, priceSum, policy);
  const rate = closing.rate == null ? "—" : Math.round(closing.rate * 100) + "%";
  // P2 — drill-down 파생. memberIds·ym·uid·logs·contracts·members는 이미 있음.
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const sessionRows = sessionsByMemberInMonth(logs, memberIds, ym);   // [{user_id, count}]
  const totalSessions = sessionRows.reduce((s, r) => s + r.count, 0);
  const revRows = revenueContractsInMonth(contracts, uid, ym);        // session_log 행[]

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-10 text-center text-sm text-muted">불러오는 중…</div>
      ) : (
        <>
      <Eyebrow icon={Award}>내 실적 · {ym}</Eyebrow>

      {/* 예상 급여 (헤드라인) */}
      <div className="rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
          <Wallet className="h-3.5 w-3.5" /> 이달 예상 급여
        </div>
        <div className="mt-2 font-mono text-4xl font-extrabold text-primary-strong">{won(pay.total)}</div>
        <div className="mt-1 text-xs text-muted">
          구간 {pay.band ? pay.band.base_pct + "%" : "—"} · 이달 수업료 {won(pay.base)}
          {pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}
        </div>
      </div>

      {/* 매출 · 클로징 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-muted">이달 매출(내 등록)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink">{won(rev.total)}</div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-sub">
            <span>신규 <b className="text-ink">{won(rev.newRev)}</b> · {rev.cntNew}건</span>
            <span>재등록 <b className="text-sky-700">{won(rev.reRev)}</b> · {rev.cntRe}건</span>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
            <Target className="h-3.5 w-3.5" /> 클로징률
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink">{rate}</div>
          <div className="mt-2 text-[11px] text-muted">시도 {closing.attempted}명 중 {closing.success} 성공</div>
        </div>
      </div>

      {/* 이번달 수업 — 누르면 회원별 (P2) */}
      <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Dumbbell className="h-3.5 w-3.5" /> 이번달 수업
          </span>
          <span className="font-mono text-lg font-bold text-ink">{totalSessions}회</span>
        </summary>
        {sessionRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">이번달 수업 기록이 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {sessionRows.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between rounded-lg border border-line bg-elevate px-3 py-2 text-sm">
                <span className="text-ink">{nameById.get(r.user_id) || "(알 수 없음)"}</span>
                <span className="font-mono font-semibold text-sub">{r.count}회</span>
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
          <span className="font-mono text-lg font-bold text-ink">{won(rev.total)}</span>
        </summary>
        {revRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">이번달 매출이 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {revRows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevate px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="text-ink">{nameById.get(c.user_id) || "(알 수 없음)"}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.kind === "reregister" ? "bg-sky-500/10 text-sky-700" : "bg-primary-soft text-primary-strong"}`}>
                    {c.kind === "reregister" ? "재등록" : "신규"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono font-semibold text-ink">{won(c.amount_total ?? 0)}</span>
                  <span className="text-[11px] text-muted">{new Date(c.started_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      <p className="text-[10px] text-muted">※ 예상 급여 = 이달 완료 수업(회당단가) 기준 · 구간%는 이달 총매출로 결정. 실지급과 다를 수 있음.</p>
        </>
      )}

      {/* 내 PT 가격 설정 — 자체 loading, 통계와 독립. 항상 렌더. */}
      <PtPricingSettings />

      {/* 계정 · 비밀번호 변경 — 자기완결. */}
      <PasswordChange />
    </div>
  );
}
