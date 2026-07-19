"use client";
/* 내 프로필 — 성향·강한 방향·세일즈 스타일·mbti·소개. trainer_profile(본인 1행 · upsert onConflict trainer_id).
   자기완결(PtPricingSettings 패턴: 마운트 fetch·데모 가드·.select() 하드닝·Toast). MyStats 통계와 독립.
   지금은 저장만 — 이후 AI 브리핑 개인화·배정 매칭의 재료(별도 스프린트). */
import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { CLOSING_APPROACH_OPTS, SALES_INTENSITY_OPTS } from "@/lib/labels";

export default function TrainerProfileSettings() {
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approaches, setApproaches] = useState([]);   // strong_approaches (다중)
  const [salesStyle, setSalesStyle] = useState("");   // sales_style (단일)
  const [mbti, setMbti] = useState("");
  const [bio, setBio] = useState("");
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const id = au?.user?.id ?? null;
        const { data } = await supabase.from("trainer_profile").select("*").eq("trainer_id", id).maybeSingle();
        if (cancelled) return;
        setUid(id);
        if (data) {
          setApproaches(Array.isArray(data.strong_approaches) ? data.strong_approaches : []);
          setSalesStyle(data.sales_style ?? "");
          setMbti(data.mbti ?? "");
          setBio(data.bio ?? "");
        }
      } catch {
        /* 조회 실패 → 빈 폼 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (v) => setApproaches((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const save = async () => {
    if (saving) return;
    const payload = {
      trainer_id: uid,
      strong_approaches: approaches,
      sales_style: salesStyle || null,
      mbti: mbti.trim() || null,
      bio: bio.trim() || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    if (!supabase) { showToast("저장됨(데모)"); setSaving(false); return; }
    try {
      // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id → upsert.
      const { data, error } = await supabase.from("trainer_profile")
        .upsert(payload, { onConflict: "trainer_id" }).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      showToast("프로필 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";
  const chip = (on) => `rounded-full px-3 py-1 text-xs font-medium transition ${on ? "bg-primary-soft text-primary-strong" : "bg-elevate text-sub hover:text-ink"}`;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={UserCircle}>내 프로필</Eyebrow>
        <p className="mb-4 mt-2 text-[11px] text-muted">여기 입력은 이후 AI 브리핑이 내 스타일에 맞추는 재료가 돼요(개인화·배정). 지금은 저장만 됩니다.</p>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-muted">자신있는 방향 <span className="text-muted">(다중)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {CLOSING_APPROACH_OPTS.map((o) => (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} disabled={saving} className={chip(approaches.includes(o.value))}>{o.label}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-muted">선호 세일즈 강도</span>
              <div className="flex flex-wrap gap-1.5">
                {SALES_INTENSITY_OPTS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setSalesStyle(salesStyle === o.value ? "" : o.value)} disabled={saving} className={chip(salesStyle === o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
            {/* 단일 항목이라 2열 grid로 감쌀 이유가 없었다(오른쪽 절반이 늘 빈칸). 4자 입력이라 폭도 제한. */}
            <label className="block sm:max-w-[12rem]">
              <span className="mb-1 block text-[11px] font-medium text-muted">MBTI <span className="text-muted">(선택)</span></span>
              <input type="text" value={mbti} onChange={(e) => setMbti(e.target.value)} disabled={saving} placeholder="ENFP" maxLength={4} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">성향·한줄 소개 <span className="text-muted">(선택)</span></span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} disabled={saving} rows={3} placeholder="예: 통증개선 특화, 공감형 상담, 초보자 편하게" className={inputCls} />
            </label>
            <Button variant="primary" size="md" fullWidth onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "프로필 저장"}
            </Button>
          </div>
        )}
      </section>
      <Toast message={toast} />
    </div>
  );
}
