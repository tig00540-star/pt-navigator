"use client";

/* 트레이너 설정 '회원 예약 요청'(2026-10-06) — 회원 전용 페이지에서 새 수업 · 변경 · 취소 요청을 받을지,
   변경 · 취소를 수업 몇 시간 전까지 받을지(기본 12). 표 trainer_booking_pref(본인만). DB 함수가 같은 값으로 막는다. */

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const HOURS = [3, 6, 12, 24, 48];

export default function BookingPrefCard() {
  const { toast, showToast } = useToast();
  const [uid, setUid] = useState(null);
  const [pref, setPref] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const id = au?.user?.id;
      if (!id) return;
      const { data, error } = await supabase.from("trainer_booking_pref").select("accept, cutoff_hours").eq("trainer_id", id).maybeSingle();
      if (error) { console.error("예약 규칙 읽기 실패", error); return; }
      if (alive) { setUid(id); setPref(data || { accept: true, cutoff_hours: 12 }); }
    })();
    return () => { alive = false; };
  }, []);
  if (!uid || !pref) return null;

  const save = async (next) => {
    const prev = pref;
    setPref(next);
    const { data, error } = await supabase.from("trainer_booking_pref")
      .upsert({ trainer_id: uid, accept: next.accept, cutoff_hours: next.cutoff_hours, updated_at: new Date().toISOString() }).select("trainer_id");
    if (error || !data?.length) { console.error("예약 규칙 저장 실패", error); setPref(prev); showToast("저장하지 못했어요. 다시 시도해 주세요."); }
    else showToast("저장했어요");
  };

  return (
    <Card>
      <SectionTitle icon={CalendarClock}>회원 예약 요청</SectionTitle>
      <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3">
        <span className="text-[15px] text-ink">회원 전용 페이지에서 예약 · 변경 · 취소 요청 받기</span>
        <input type="checkbox" checked={pref.accept} onChange={(e) => save({ ...pref, accept: e.target.checked })} className="h-5 w-5 shrink-0 accent-primary" />
      </label>
      {pref.accept && (
        <>
          <p className="m-0 mt-2 text-[14px] font-semibold text-sub">변경 · 취소는 수업 몇 시간 전까지 받을까요?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HOURS.map((h) => (
              <button key={h} type="button" aria-pressed={pref.cutoff_hours === h} onClick={() => save({ ...pref, cutoff_hours: h })}
                className={`min-h-[40px] rounded-full border px-3.5 text-[14px] ${pref.cutoff_hours === h ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>{h}시간 전</button>
            ))}
          </div>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted">이 시간이 지나면 회원 화면에 &ldquo;트레이너와 직접 이야기해 주세요&rdquo;가 떠요. 새 수업 요청도 이 시간 뒤부터 고를 수 있어요. 요청은 내가 승인해야 예약에 반영돼요.</p>
        </>
      )}
      <Toast message={toast} />
    </Card>
  );
}
