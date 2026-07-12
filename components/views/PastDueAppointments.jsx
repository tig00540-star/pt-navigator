"use client";
/* =========================================================================
   기능2 할일 C3 — "미처리 예약": 지난 예약(booked·start_at 과거)을 완료/취소 안 함.
   판정=lib/memberStatus의 pastDueAppointments. appointment는 트레이너 스코프 RLS(내 예약만).
   선택 시 스케줄 탭으로. 빈배열이면 null.
   ========================================================================= */
import { useEffect, useState } from "react";
import { CalendarX, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { pastDueAppointments } from "@/lib/memberStatus";

function fmtDT(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function daysAgo(iso, nowMs) {
  return Math.floor((nowMs - new Date(iso).getTime()) / 86400000);
}

export default function PastDueAppointments({ members, uid, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!supabase || !uid) return;   // uid 없으면 스코프 불가 → 대기
    const nowISO = new Date().toISOString();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("appointment")
        .select("id, user_id, start_at, status, trainer_id")
        .eq("status", "booked")
        .eq("trainer_id", uid)
        .lt("start_at", nowISO);
      if (cancelled) return;
      setRows(pastDueAppointments(data || [], nowISO));
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!rows.length) return null;
  const nowMs = new Date().getTime(); // Date.now()는 react-hooks/purity 룰에 걸림 → 저장소 컨벤션(new Date().getTime()) 사용
  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";

  return (
    <section className="mb-4 rounded-2xl border border-zinc-400/25 bg-zinc-500/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarX className="h-4 w-4 text-sub" />
        <h3 className="text-sm font-semibold text-ink">미처리 예약</h3>
        <span className="rounded-full bg-elevate px-2 py-0.5 text-[10px] font-semibold text-sub">{rows.length}</span>
        <span className="text-[11px] text-muted">지난 예약 · 완료/취소 안 함</span>
      </div>
      <div className="grid gap-2">
        {rows.map((a) => {
          const ago = daysAgo(a.start_at, nowMs);
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.user_id)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-left shadow-sm transition hover:border-primary active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{nameOf(a.user_id)}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-sub">
                  <span className="font-mono">{fmtDT(a.start_at)}</span>
                  <span className="font-medium text-amber-600">{ago > 0 ? `${ago}일 지남` : "오늘 지남"}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted group-hover:text-primary-strong" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
