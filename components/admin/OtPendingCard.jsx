"use client";

/* 대표 홈 '배정 대기' 알림(2026-10-06) — 센터 QR로 들어온 OT 신청이 배정을 기다리면 홈 맨 위에 한 줄.
   누르면 등록·이탈 탭의 'OT 신청 · 배정'. 없으면 숨김. */

import { useEffect, useState } from "react";
import { ChevronRight, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function OtPendingCard({ onGo }) {
  const [n, setN] = useState(0);
  const [hours, setHours] = useState(0);   // 가장 오래 기다린 신청 · 몇 시간
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("ot_application").select("created_at").eq("status", "pending").order("created_at").limit(100);
      if (error) { console.error("배정 대기 읽기 실패", error); return; }
      if (alive) { setN((data || []).length); setHours(data?.[0] ? Math.floor((Date.now() - Date.parse(data[0].created_at)) / 3600000) : 0); }
    })();
    return () => { alive = false; };
  }, []);
  if (!n) return null;
  return (
    <button type="button" onClick={onGo}
      className="mb-4 flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-4 py-3 text-left shadow-sm transition active:scale-[0.99]">
      <UserPlus className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">OT 신청 {n}건이 배정을 기다려요</span>
        <span className="block text-[13px] text-sub">{hours >= 1 ? `가장 오래된 신청 ${hours >= 24 ? `${Math.floor(hours / 24)}일` : `${hours}시간`} 전` : "방금 들어왔어요"} · 눌러서 트레이너를 정해 주세요</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
