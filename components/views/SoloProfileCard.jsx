"use client";

/* 개인 트레이너 설정 '일하는 방식 · 상호'(2026-10-06 · 개인 계정만).
   센터 소속 = 내 실적 맨 위가 예상 급여 · 프리랜서 = 매출 · 지출 · 순이익(장부).
   상호(소속 센터)는 회원 전용 페이지 · OT 신청서에 나오는 이름 — 비우면 'OOO 트레이너'.
   저장은 rpc set_solo_profile(개인 계정 주인만 · 이 두 칸만 · account UPDATE 정책은 열지 않음). */

import { useState } from "react";
import { Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAccount, ACCOUNT_CHANGED } from "@/lib/useAccount";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

const MODES = [
  { k: "employed", l: "센터 소속", d: "센터에서 급여 · 수수료를 받아요" },
  { k: "freelance", l: "프리랜서", d: "회원비를 직접 받아요(대관 · 개인 스튜디오 · 출장)" },
];

export default function SoloProfileCard() {
  const acc = useAccount();
  if (!acc.isSolo || acc.loading) return null;
  return <SoloProfileForm key={`${acc.workMode}|${acc.brandName}`} initMode={acc.workMode || "employed"} initBrand={acc.brandName || ""} trainerName={acc.trainerName} />;
}

function SoloProfileForm({ initMode, initBrand, trainerName }) {
  const { toast, showToast } = useToast();
  const [mode, setMode] = useState(initMode);
  const [brand, setBrand] = useState(initBrand);
  const [busy, setBusy] = useState(false);
  const dirty = mode !== initMode || brand.trim() !== initBrand;

  const save = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_solo_profile", { p_mode: mode, p_brand: brand.trim() });
    setBusy(false);
    if (error) { console.error("일하는 방식 저장 실패", error); showToast("저장하지 못했어요. 다시 시도해 주세요."); return; }
    showToast("저장했어요");
    window.dispatchEvent(new Event(ACCOUNT_CHANGED));
  };

  const shown = brand.trim() ? `${brand.trim()} · ${trainerName || ""} 트레이너` : `${trainerName || ""} 트레이너`;
  return (
    <Card>
      <SectionTitle icon={Briefcase}>일하는 방식</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((o) => (
          <button key={o.k} type="button" onClick={() => setMode(o.k)} aria-pressed={mode === o.k}
            className={`min-h-[56px] rounded-xl border px-3.5 py-2.5 text-left transition ${mode === o.k ? "border-primary bg-primary-soft" : "border-line bg-card hover:border-line-strong"}`}>
            <span className={`block text-[15px] font-semibold ${mode === o.k ? "text-primary-strong" : "text-ink"}`}>{o.l}</span>
            <span className="block text-[13px] text-sub">{o.d}</span>
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted">
        {mode === "freelance" ? "내 실적 맨 위에 매출 · 지출 · 남은 돈이 나오고, 장부를 적을 수 있어요." : "내 실적 맨 위에 이달 예상 급여가 나와요. 급여 방식은 설정 › 가격 · 급여에서 정해요."}
      </p>
      <label htmlFor="solo-brand" className="mt-4 block text-[14px] font-semibold text-ink">{mode === "freelance" ? "상호" : "소속 센터"} <span className="font-normal text-muted">(선택)</span></label>
      <input id="solo-brand" type="text" maxLength={40} value={brand} onChange={(e) => setBrand(e.target.value)}
        placeholder={mode === "freelance" ? "예: 홍길동 PT 스튜디오" : "예: 강남 ○○짐"} className={`${inputCls} mt-1.5`} />
      <p className="m-0 mt-1.5 text-[13px] text-sub">회원 전용 페이지 · OT 신청서에 <b className="text-ink">{shown}</b>(으)로 나와요.</p>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="md" onClick={save} disabled={!dirty || busy}>{busy ? "저장 중…" : "저장"}</Button>
      </div>
      <Toast message={toast} />
    </Card>
  );
}
