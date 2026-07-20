"use client";
/* =========================================================================
   기능2 할일 C3 — "미처리 예약": 지난 예약(booked·start_at 과거)을 완료/취소 안 함.
   판정=lib/memberStatus의 pastDueAppointments. appointment는 트레이너 스코프 RLS(내 예약만).
   선택 시 스케줄 탭으로. 빈배열이면 null.
   ========================================================================= */
import { useEffect, useState } from "react";
import { CalendarX } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { pastDueAppointments } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

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
  const knownName = (id) => members?.find((m) => m.id === id)?.name || "";
  // 명단 밖(숨김·환불) 회원은 muted "이름 미상". 컴포넌트 아닌 JSX 반환 헬퍼(nested-component lint 회피).
  const nameOfEl = (id) => {
    const n = knownName(id);
    return n ? n : <span className="font-normal not-italic text-muted">이름 미상</span>;
  };

  return (
    <ToneCard tone="zinc">
      <SectionHeader
        tone="zinc"
        icon={CalendarX}
        title="미처리 예약"
        count={rows.length}
        hint="지난 예약 · 완료/취소 안 함"
      />
      <div className="grid gap-2">
        {rows.map((a) => {
          const ago = daysAgo(a.start_at, nowMs);
          return (
            <ListRow
              key={a.id}
              tone="zinc"
              name={nameOfEl(a.user_id)}
              onClick={() => onSelect(a.user_id)}
            >
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-sub">
                <span className="font-mono">{fmtDT(a.start_at)}</span>
                <span className="font-medium text-amber-600">{ago > 0 ? `${ago}일 지남` : "오늘 지남"}</span>
              </div>
            </ListRow>
          );
        })}
      </div>
    </ToneCard>
  );
}
