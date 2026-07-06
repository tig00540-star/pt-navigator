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
  const [confirming, setConfirming] = useState(false); // 중앙 확인 모달 open (확정 앞단 게이트)
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

  // 모달 [확정]에서만 실행 — 기존 toPtActive·.select() 하드닝·상태 전이는 부모(onConfirm) 그대로.
  const doConfirm = async () => {
    setBusy(true);
    await onConfirm();
    if (mounted.current) {
      setBusy(false);
      setConfirming(false); // 성공 시엔 언마운트라 도달 안 함(실패 롤백 때만 닫기)
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-emerald-100">
        <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" />
        <span>
          <b className="text-emerald-300">클로징 성공</b> 기록됨 — 결제 확정되면 PT 등록을 확정하세요.
          <span className="text-emerald-400/70"> (성공을 기록해도 자동으로 등록되진 않아요)</span>
        </span>
      </div>
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-3.5 py-1.5 text-sm font-bold text-zinc-950 transition active:scale-95"
      >
        PT 등록 확정
      </button>
      </div>

      {/* 중앙 확인 모달 — 확정 앞단 게이트. 취소·바깥 클릭은 닫힘만(동작 없음), 확정은 명시 버튼으로만. */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <h3 className="text-base font-bold text-zinc-100">PT 등록 확정</h3>
            </div>
            <p className="mb-1 text-sm text-zinc-200">
              <b className="text-emerald-300">{member?.name || "회원"}</b>님을 PT 등록으로 확정할까요?
            </p>
            <p className="mb-5 text-xs text-zinc-500">
              확정하면 PT 회원으로 전환됩니다. 결제가 끝난 뒤 진행하세요.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 active:scale-95 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={doConfirm}
                disabled={busy}
                className="rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
              >
                {busy ? "확정 중…" : "확정"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
