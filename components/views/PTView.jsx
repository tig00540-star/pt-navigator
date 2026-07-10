"use client";

/* =========================================================================
   PT 뷰 — 얇은 셸. 공유 데이터(계약·수업로그) 로드 + 뒤로가기 + PT 서브탭 스위치.
   본체는 서브탭이 소유: 운동일지(PtWorkoutTab) · 재등록(PtReRegTab) · 인바디(PtInbodyTab).
   서브탭은 회원 전환 시 key={member.id}로 리마운트 → 폼 자동 리셋(서브탭에 리셋 effect 없음).
   ========================================================================= */

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import PtWorkoutTab from "@/components/views/PtWorkoutTab";
import PtReRegTab from "@/components/views/PtReRegTab";
import PtInbodyTab from "@/components/views/PtInbodyTab";

export default function PTView({ member, tab, onGoList, onMemberPatch }) {
  const [contracts, setContracts] = useState([]); // session_log (계약)
  const [logs, setLogs] = useState([]); // daily_workout_log (수업로그)
  const [loading, setLoading] = useState(false);

  // 회원 변경 시 계약·수업로그 로드. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) {
          setContracts([]);
          setLogs([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*").eq("user_id", member.id),
        supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
      ]);
      if (cancelled) return;
      setContracts(cs || []);
      setLogs(ls || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  return (
    <div className="space-y-6">
      {onGoList && (
        <button
          onClick={onGoList}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition hover:text-emerald-400"
        >
          <ChevronLeft className="h-4 w-4" /> 회원 목록
        </button>
      )}
      {tab === 11 ? (
        <PtReRegTab key={member.id} member={member} contracts={contracts} setContracts={setContracts} logs={logs} />
      ) : tab === 12 ? (
        <PtInbodyTab key={member.id} member={member} />
      ) : (
        <PtWorkoutTab
          key={member.id}
          member={member}
          onMemberPatch={onMemberPatch}
          contracts={contracts}
          setContracts={setContracts}
          logs={logs}
          setLogs={setLogs}
          loading={loading}
        />
      )}
    </div>
  );
}
