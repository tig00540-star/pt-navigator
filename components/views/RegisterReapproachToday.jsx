"use client";
/* =========================================================================
   작업4-1c reader — 홈 "재등록 재접근" 파생 리스트.
   PTView saveReg가 채운 session_log의 reg_result='hold' + reg_reapproach_at(도래분)을 today 주입해 렌더.
   판정은 lib/memberStatus의 reregisterReapproachToday 하나로(회원별 '최신 계약'만 · 도래+경과, 미도래·null 제외).
   ReapproachToday(OT)의 재등록 대칭 · 원본 안 건드리고 형제. 선택 시 onSelect(user_id) → PTView.
   ========================================================================= */
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { reregisterReapproachToday, viewFor } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

function todayISOLocal() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}
function daysOverdue(dateISO, todayISO) {
  const a = new Date(`${dateISO}T00:00:00`);
  const b = new Date(`${todayISO}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export default function RegisterReapproachToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);
  const today = todayISOLocal();
  // PT 회원 id 집합을 안정 문자열 키로(members 배열 ref 변화에 과다 refetch 방지 · inactive 제외).
  const ptKey = (members || []).filter((m) => viewFor(m) === "pt").map((m) => m.id).join(",");

  useEffect(() => {
    if (!supabase || !ptKey) return; // 데모·PT 0명: [] 유지 → 미표시(라이브 전용)
    const ptIds = ptKey.split(",");
    let cancelled = false;
    (async () => {
      // 회원별 최신 계약 판정 위해 reg 필터 없이 계약 전부 당김(hold가 최신인지 알아야 함).
      const { data } = await supabase
        .from("session_log")
        .select("user_id, started_at, reg_result, reg_reapproach_at")
        .in("user_id", ptIds);
      if (cancelled) return;
      setRows(reregisterReapproachToday(data || [], today));
    })();
    return () => {
      cancelled = true;
    };
  }, [today, ptKey]);

  if (!rows.length) return null;

  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";
  const list = [...rows].sort((a, b) => (a.reg_reapproach_at < b.reg_reapproach_at ? -1 : 1));

  return (
    <ToneCard tone="emerald">
      <SectionHeader
        tone="emerald"
        icon={CalendarClock}
        title="재등록 재접근"
        count={list.length}
        hint="재등록 보류 후 예정일 도래분"
      />
      <div className="grid gap-2">
        {list.map((r) => {
          const over = daysOverdue(r.reg_reapproach_at, today);
          return (
            <ListRow
              key={r.user_id}
              tone="emerald"
              name={nameOf(r.user_id)}
              onClick={() => onSelect(r.user_id)}
            >
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-sub">
                <span className="font-mono">{r.reg_reapproach_at}</span>
                <span className={over > 0 ? "font-medium text-amber-600" : "font-medium text-primary-strong"}>
                  {over > 0 ? `${over}일 경과` : "오늘"}
                </span>
                <span className="text-muted">· 재등록 보류</span>
              </div>
            </ListRow>
          );
        })}
      </div>
    </ToneCard>
  );
}
