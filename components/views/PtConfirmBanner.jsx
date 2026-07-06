"use client";

/* =========================================================================
   ② '수동 PT 등록 확정' 배너. 게이트: status==='ot_active' 이고
   (round1 or round2 closing_result==='성공'). 성공 기록 ≠ 자동 PT(§1) — 트레이너 수동 확정.
   1차 성공(ObservationTab 저장분)·2차 성공 both 잡는다. update+하드닝은 부모(onConfirm)가 실행.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function PtConfirmBanner({ member, onConfirm, closingVersion }) {
  const [rounds, setRounds] = useState({ round1: null, round2: null });
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // 선택 회원의 ot_log 1·2차 closing_result 조회(성공 판정용). demo/미설정 시 스킵.
  useEffect(() => {
    if (!supabase || !member?.id) {
      setRounds({ round1: null, round2: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ot_log")
        .select("ot_round, closing_result")
        .eq("user_id", member.id)
        .in("ot_round", [1, 2]);
      if (cancelled) return;
      const rows = data || [];
      setRounds({
        round1: rows.find((r) => r.ot_round === 1) || null,
        round2: rows.find((r) => r.ot_round === 2) || null,
      });
    })();
    return () => {
      cancelled = true;
    };
    // closingVersion: 클로징 저장(1·2차) 직후 부모가 증가 → 재조회(같은 회원이라 member.id 안 바뀌는 stale 방지).
  }, [member?.id, closingVersion]);

  // ⚠️ 값은 CLOSING_RESULT_OPTS 영문('success') — 저장 경로와 동일(한글 아님).
  const success =
    rounds.round1?.closing_result === "success" || rounds.round2?.closing_result === "success";
  // 게이트: ot_active + 성공(both round). pt_active면 안 뜸(§1 성공≠PT).
  if (member?.status !== "ot_active" || !success) return null;

  const click = async () => {
    setBusy(true);
    await onConfirm();
    if (mounted.current) setBusy(false); // 성공 시 언마운트되므로 실패로 남았을 때만
  };

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-emerald-100">
        <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" />
        <span>
          <b className="text-emerald-300">클로징 성공</b> 기록됨 — 결제 확정되면 PT 등록을 확정하세요.
          <span className="text-emerald-400/70"> (성공을 기록해도 자동으로 등록되진 않아요)</span>
        </span>
      </div>
      <button
        onClick={click}
        disabled={busy}
        className="shrink-0 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-3.5 py-1.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
      >
        {busy ? "확정 중…" : "PT 등록 확정"}
      </button>
    </div>
  );
}
