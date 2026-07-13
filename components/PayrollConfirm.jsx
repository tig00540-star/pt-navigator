"use client";

/* =========================================================================
   페이롤 D — 예상 급여 → 최종액 확정(payroll_run). docs/v2-페이롤-스펙-확장가능급여.md §4.
   pay(payForScheme 결과)를 받아 예상액 표시 + 원장이 최종액 확정(update/insert).
   manual 스킴(computed=null)은 자동계산 없이 최종액 직접 입력. account_id는 DB DEFAULT.
   저장은 .select() 하드닝(교훈1) · 데모 가드.
   ========================================================================= */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";

export default function PayrollConfirm({ trainerId, ym, pay, run, onSaved }) {
  const isManual = pay?.computed == null;
  const confirmed = run?.final_total != null;
  const [final, setFinal] = useState(
    run?.final_total != null ? String(run.final_total)
    : pay?.computed != null ? String(pay.computed) : ""
  );
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const confirm = async () => {
    if (saving) return;
    if (final === "" || isNaN(Number(final))) return showToast("최종 급여액을 입력하세요");
    const payload = {
      trainer_id: trainerId, ym,
      computed_total: pay?.computed ?? null,
      final_total: Number(final),
      updated_at: new Date().toISOString(),
    }; // account_id는 DB DEFAULT
    setSaving(true);
    if (!supabase) { onSaved?.({ ...(run || {}), ...payload, id: run?.id || `demo-${Date.now()}` }); showToast("확정됨(데모)"); setSaving(false); return; }
    if (run?.id) {
      const { data, error } = await supabase.from("payroll_run").update(payload).eq("id", run.id).select();
      if (error || !data || data.length === 0) { showToast("확정 실패 — 다시 시도하세요"); setSaving(false); return; }
      onSaved?.(data[0]);
    } else {
      const { data, error } = await supabase.from("payroll_run").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("확정 실패 — 다시 시도하세요"); setSaving(false); return; }
      onSaved?.(data[0]);
    }
    showToast("급여 확정됨");
    setSaving(false);
  };

  const inputCls = "w-28 rounded-lg border border-line bg-elevate px-2.5 py-1.5 text-right font-mono text-sm text-ink outline-none focus:border-primary disabled:opacity-50";

  return (
    <div className="mt-3 rounded-xl border border-success/30 bg-success-soft p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-success-strong">
          {isManual ? "자동계산 없음 · 최종액 입력" : "예상 급여"}
        </div>
        {!isManual && <div className="font-mono text-lg font-bold text-success-strong">{won(pay.computed)}</div>}
      </div>
      {!isManual && (
        <div className="mt-0.5 text-[10px] text-muted">
          기본 {won(pay.base)}{pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="text-[11px] text-sub">최종</span>
        <input type="number" inputMode="numeric" value={final} onChange={(e) => setFinal(e.target.value)} disabled={saving} className={inputCls} />
        <span className="text-[11px] text-sub">원</span>
        <button onClick={confirm} disabled={saving} className="rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-1.5 text-xs font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50">
          {confirmed ? "재확정" : "확정"}
        </button>
      </div>
      {confirmed && <div className="mt-1 text-right text-[10px] text-success-strong">확정됨 · {won(run.final_total)}</div>}
      <Toast message={toast} />
    </div>
  );
}
