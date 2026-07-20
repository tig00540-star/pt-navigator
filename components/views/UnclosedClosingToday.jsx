"use client";
/* =========================================================================
   기능2 할일 C3 — "클로징 미마감": OT 회원 중 2차(round=2) 관찰만 하고 클로징 결과 미기록.
   판정=lib/memberStatus의 unclosedClosings(round=2·빈 결과·OT회원 교집합). 선택 시 2차 OT로.
   ReapproachToday 형제(원본 안 건드림). 빈배열이면 null. hold/success/fail은 제외(빈 결과만).
   ========================================================================= */
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { unclosedClosings, viewFor } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

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
    <ToneCard tone="rose">
      <SectionHeader
        tone="rose"
        icon={AlertCircle}
        title="클로징 미마감"
        count={rows.length}
        hint="2차까지 갔는데 결과 미기록"
      />
      <div className="grid gap-2">
        {rows.map((r) => (
          <ListRow
            key={r.user_id}
            tone="rose"
            name={nameOf(r.user_id)}
            onClick={() => onSelect(r.user_id)}
          >
            <div className="mt-0.5 text-[11px] text-sub">2차 클로징 결과 입력</div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
