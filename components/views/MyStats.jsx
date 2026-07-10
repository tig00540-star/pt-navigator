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
import PtPricingSettings from "@/components/views/PtPricingSettings";

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

      <p className="text-[10px] text-muted">※ 예상 급여 = 이달 완료 수업(회당단가) 기준 · 구간%는 이달 총매출로 결정. 실지급과 다를 수 있음.</p>
        </>
      )}

      {/* 내 PT 가격 설정 — 자체 loading, 통계와 독립. 항상 렌더. */}
      <PtPricingSettings />
    </div>
  );
}
