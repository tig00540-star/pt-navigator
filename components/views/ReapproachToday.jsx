"use client";

/* =========================================================================
   Step7 reader — 홈 "오늘 재접근" 파생 리스트.
   writer(ObservationTab 1차 · SecondOTTab 2차)가 채운 ot_log의
   closing_result='hold' + closing_reapproach_at(도래분)을 today 주입해 렌더.
   판정은 lib/memberStatus의 reapproachToday 하나로(both round · '오늘 이하' 도래+경과, 미도래·null 제외).
   회원명 + 예정일(+경과) + 선택 시 onSelect(user_id). 만기임박(pt_expiring)은 ③ 소관 — 여기 없음.
   ========================================================================= */

import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { reapproachToday } from "@/lib/memberStatus";

// 오늘(로컬 달력일) ISO. 컴포넌트는 now 읽어도 됨(순수 모듈 아님) — 순수 판정엔 이 값을 주입.
function todayISOLocal() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// 예정일 대비 경과일(오늘 기준). 0=오늘, 양수=경과.
function daysOverdue(dateISO, todayISO) {
  const a = new Date(`${dateISO}T00:00:00`);
  const b = new Date(`${todayISO}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export default function ReapproachToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);
  const today = todayISOLocal();
  const memberKey = (members || []).map((m) => m.id).join(",");

  useEffect(() => {
    if (!supabase || !memberKey) return; // 데모/무회원: 초기 [] 유지 → 카드 미표시(라이브 전용 위젯, 폴백 결 유지)
    let cancelled = false;
    (async () => {
      // both round의 hold 행만 당겨오고, 날짜(도래·null) 판정은 reapproachToday에 위임.
      const ids = memberKey.split(",");
      const { data } = await supabase
        .from("ot_log")
        .select("user_id, ot_round, closing_result, closing_reapproach_at")
        .eq("closing_result", "hold")
        .in("user_id", ids); // ★ 내 회원만
      if (cancelled) return;
      setRows(reapproachToday(data || [], today));
    })();
    return () => {
      cancelled = true;
    };
  }, [today, memberKey]);

  if (!rows.length) return null;

  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";
  // 오래 밀린(예정일 이른) 순으로 위에.
  const list = [...rows].sort((a, b) =>
    a.closing_reapproach_at < b.closing_reapproach_at ? -1 : 1
  );

  return (
    <section className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-200">오늘 재접근</h3>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          {list.length}
        </span>
        <span className="text-[11px] text-zinc-500">보류 후 예정일 도래분</span>
      </div>
      <div className="grid gap-2">
        {list.map((r) => {
          const over = daysOverdue(r.closing_reapproach_at, today);
          return (
            <button
              key={`${r.user_id}-${r.ot_round}`}
              onClick={() => onSelect(r.user_id)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-zinc-900/50 px-3 py-2.5 text-left transition hover:border-amber-400/50 active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-100">{nameOf(r.user_id)}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-400">
                  <span className="font-mono">{r.closing_reapproach_at}</span>
                  <span className={over > 0 ? "font-medium text-amber-400" : "font-medium text-emerald-400"}>
                    {over > 0 ? `${over}일 경과` : "오늘"}
                  </span>
                  <span className="text-zinc-600">· {r.ot_round}차 보류</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-500/50 group-hover:text-amber-400" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
