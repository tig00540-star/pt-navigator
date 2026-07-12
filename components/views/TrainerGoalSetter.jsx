"use client";
/* 이달 목표매출 설정 + 달성률(progress) — trainer_goal(월별 1행 · upsert onConflict).
   MyStats가 goals 소유(리포트에도 전달) → 이 컴포넌트는 편집 UX만, 저장 후 onSaved(row)로 상위 반영.
   PtPricingSettings 패턴(데모 가드·.select() 하드닝·Toast). */
import { useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

// props: uid(트레이너 id) · ym('YYYY-MM') · target(현재 목표 or null) · revTotal(이달 순매출) · onSaved(row)
export default function TrainerGoalSetter({ uid, ym, target, revTotal, onSaved }) {
  const [value, setValue] = useState(target == null ? "" : String(target));
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();
  const pct = target ? Math.round((revTotal / target) * 100) : null;

  const save = async () => {
    if (saving) return;
    // 0·음수·빈값 차단(0이면 달성률 나눗셈 위험).
    if (value === "" || isNaN(Number(value)) || Number(value) <= 0) return showToast("목표 금액을 입력하세요");
    const payload = { trainer_id: uid, ym, target_revenue: Number(value), updated_at: new Date().toISOString() };
    setSaving(true);
    if (!supabase) { onSaved?.({ ...payload }); showToast("저장됨(데모)"); setSaving(false); return; }
    // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id,ym → upsert.
    const { data, error } = await supabase.from("trainer_goal")
      .upsert(payload, { onConflict: "trainer_id,ym" }).select();
    if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
    onSaved?.(data[0]);
    showToast("이달 목표 저장됨");
    setSaving(false);
  };

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <Target className="h-3.5 w-3.5" /> 이달 목표매출 · {ym}
      </div>
      {target != null && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-sub">달성률</span>
            <span className="tabular-nums font-bold text-ink">{pct}% <span className="text-[11px] font-normal text-muted">({won(revTotal)} / {won(target)})</span></span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-elevate">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input type="number" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} placeholder="목표 순매출(원)" className={inputCls} />
        <button onClick={save} disabled={saving}
          className="shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50">
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
      <Toast message={toast} />
    </section>
  );
}
