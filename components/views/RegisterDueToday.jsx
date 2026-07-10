"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract, remainingSessions, reregisterDue } from "@/lib/memberStatus";

export default function RegisterDueToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!supabase) return; // 데모: [] 유지 → 카드 미표시(라이브 전용, ReapproachToday와 결 동일)
    const ptIds = (members || []).filter((m) => viewFor(m) === "pt").map((m) => m.id);
    let cancelled = false;
    (async () => {
      // setState는 전부 IIFE 안에서만(ReapproachToday 골격 = 동기 setState 0 → set-state-in-effect 회피).
      if (!ptIds.length) { if (!cancelled) setRows([]); return; }
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*").in("user_id", ptIds),
        supabase.from("daily_workout_log").select("user_id, contract_id, voided").in("user_id", ptIds),
      ]);
      if (cancelled) return;
      const contracts = cs || [];
      const logs = ls || [];
      const out = [];
      for (const id of ptIds) {
        const mContracts = contracts.filter((c) => c.user_id === id);
        const mLogs = logs.filter((l) => l.user_id === id);
        const active = activeContract(mContracts, mLogs);
        if (!active) continue; // 계약없음/전소진 = 재등록 카드 아님(전소진은 다른 신호)
        if (!reregisterDue(active, mLogs)) continue;
        const rem = remainingSessions(active, mLogs);
        out.push({ user_id: id, paid: rem.paid, service: rem.service });
      }
      setRows(out);
    })();
    return () => { cancelled = true; };
  }, [members]);

  if (!rows.length) return null;

  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";
  // 잔여 유료 적은 순(급한 순)으로 위에.
  const list = [...rows].sort((a, b) => a.paid - b.paid);

  return (
    <section className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-primary-strong" />
        <h3 className="text-sm font-semibold text-primary-strong">재등록 타이밍</h3>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
          {list.length}
        </span>
        <span className="text-[11px] text-muted">잔여 임계 도래분</span>
      </div>
      <div className="grid gap-2">
        {list.map((r) => (
          <button
            key={r.user_id}
            onClick={() => onSelect(r.user_id)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-card px-3 py-2.5 text-left shadow-sm transition hover:border-primary active:scale-[0.99]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{nameOf(r.user_id)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-sub">
                <span>잔여 유료 <b className="text-primary-strong">{r.paid}</b></span>
                <span className="text-muted">· 서비스 {r.service}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-emerald-500/50 group-hover:text-primary-strong" />
          </button>
        ))}
      </div>
    </section>
  );
}
