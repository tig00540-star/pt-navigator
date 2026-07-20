"use client";
/* 이달 목표매출 설정 — trainer_goal(월별 1행 · upsert). 자기완결(설정 탭).
   달성률 표시는 '내 실적'(MyStats)에 있음 — 여기선 목표값 편집만. */
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import NumberInput from "@/components/ui/NumberInput";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function TrainerGoalSetter() {
  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7); // KST 이번달
  const [uid, setUid] = useState(null);
  const [current, setCurrent] = useState(null);   // 저장된 목표(원) or null
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const id = au?.user?.id ?? null;
        const { data } = await supabase.from("trainer_goal").select("target_revenue")
          .eq("trainer_id", id).eq("ym", ym).maybeSingle();
        if (cancelled) return;
        setUid(id);
        if (data?.target_revenue != null) { setCurrent(data.target_revenue); setValue(String(data.target_revenue)); }
      } catch {
        /* 조회 실패 → 빈 상태 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const save = async () => {
    if (saving) return;
    if (value === "" || isNaN(Number(value)) || Number(value) <= 0) return showToast("목표 금액을 입력하세요");
    const payload = { trainer_id: uid, ym, target_revenue: Number(value), updated_at: new Date().toISOString() };
    setSaving(true);
    if (!supabase) { setCurrent(Number(value)); showToast("저장됨(데모)"); setSaving(false); return; }
    try {
      const { data, error } = await supabase.from("trainer_goal").upsert(payload, { onConflict: "trainer_id,ym" }).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setCurrent(data[0].target_revenue);
      showToast("이달 목표 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";
  return (
    <div className="space-y-4">
      <Card as="section">
        <Eyebrow icon={Target}>이달 목표매출</Eyebrow>
        <div className="mt-2 text-[11px] text-muted">{ym} · {loading ? "불러오는 중…" : current != null ? `현재 목표 ${won(current)}` : "목표 미설정"}</div>
        <div className="mt-3 flex gap-2">
          <NumberInput value={value} onValueChange={setValue} disabled={saving} placeholder="목표 순매출(원)" className={inputCls} />
          <Button variant="primary" size="md" onClick={save} disabled={saving} className="shrink-0">
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted">달성률은 &lsquo;내 실적&rsquo;에서 확인돼요.</p>
      </Card>
      <Toast message={toast} />
    </div>
  );
}
