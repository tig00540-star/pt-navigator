"use client";
/* =========================================================================
   기능2 할일 C3 — "클로징 미마감": OT 회원 중 2차(round=2) 관찰만 하고 클로징 결과 미기록.
   판정=lib/memberStatus의 unclosedClosings(round=2·빈 결과·OT회원 교집합). 선택 시 2차 OT로.
   ReapproachToday 형제(원본 안 건드림). 빈배열이면 null. hold/success/fail은 제외(빈 결과만).
   ========================================================================= */
import { useEffect, useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { unclosedClosings, viewFor } from "@/lib/memberStatus";

export default function UnclosedClosingToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);
  const otKey = (members || []).filter((m) => viewFor(m) === "ot").map((m) => m.id).join(",");

  useEffect(() => {
    if (!supabase || !otKey) return;
    const ids = otKey.split(",");
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ot_log")
        .select("user_id, ot_round, closing_result")
        .eq("ot_round", 2)
        .in("user_id", ids);
      if (cancelled) return;
      setRows(unclosedClosings(data || [], new Set(ids)));
    })();
    return () => { cancelled = true; };
  }, [otKey]);

  if (!rows.length) return null;
  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";

  return (
    <section className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-rose-700">클로징 미마감</h3>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{rows.length}</span>
        <span className="text-[11px] text-muted">2차까지 갔는데 결과 미기록</span>
      </div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <button
            key={r.user_id}
            onClick={() => onSelect(r.user_id)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-card px-3 py-2.5 text-left shadow-sm transition hover:border-rose-400/50 active:scale-[0.99]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{nameOf(r.user_id)}</div>
              <div className="mt-0.5 text-[11px] text-sub">2차 클로징 결과 입력</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-rose-500/50 group-hover:text-rose-600" />
          </button>
        ))}
      </div>
    </section>
  );
}
