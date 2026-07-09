"use client";

/* =========================================================================
   내 실적 (트레이너 본인) — 이달 매출·예상 급여·클로징률.
   session_log는 RLS로 본인 계약만. ot_log는 본인 회원(members)으로 필터.
   admin과 동일 함수 재사용(revenueByTrainer·sessionPriceSumByTrainer·closingStats·payForMonth).
   ========================================================================= */

import { useEffect, useState } from "react";
import { Award, Target, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import { revenueByTrainer, sessionPriceSumByTrainer, closingStats, payForMonth } from "@/lib/memberStatus";

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

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">불러오는 중…</div>;

  return (
    <div className="space-y-4">
      <Eyebrow icon={Award}>내 실적 · {ym}</Eyebrow>

      {/* 예상 급여 (헤드라인) */}
      <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-5 shadow-lg shadow-lime-500/20">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
          <Wallet className="h-3.5 w-3.5" /> 이달 예상 급여
        </div>
        <div className="mt-2 font-mono text-4xl font-extrabold text-lime-400">{won(pay.total)}</div>
        <div className="mt-1 text-xs text-zinc-500">
          구간 {pay.band ? pay.band.base_pct + "%" : "—"} · 이달 수업료 {won(pay.base)}
          {pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}
        </div>
      </div>

      {/* 매출 · 클로징 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">이달 매출(내 등록)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-zinc-50">{won(rev.total)}</div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
            <span>신규 <b className="text-zinc-200">{won(rev.newRev)}</b> · {rev.cntNew}건</span>
            <span>재등록 <b className="text-cyan-400">{won(rev.reRev)}</b> · {rev.cntRe}건</span>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
            <Target className="h-3.5 w-3.5" /> 클로징률
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-zinc-50">{rate}</div>
          <div className="mt-2 text-[11px] text-zinc-500">시도 {closing.attempted}명 중 {closing.success} 성공</div>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">※ 예상 급여 = 이달 완료 수업(회당단가) 기준 · 구간%는 이달 총매출로 결정. 실지급과 다를 수 있음.</p>
    </div>
  );
}
