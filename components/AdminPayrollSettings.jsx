"use client";

/* =========================================================================
   페이롤 C1 — 원장용 "계정 기본 급여 스킴"(pay_scheme, trainer_id=null) 편집기.
   docs/v2-페이롤-스펙-확장가능급여.md §3. 스타일·하드닝은 PtPricingSettings 패턴 재사용
   (inputCls·.select() 하드닝(교훈1)·데모 가드·Eyebrow·Toast·useToast).
   account_id·trainer_id는 DB DEFAULT/명시. 밴드 자동 vs 수동(원장 월별 입력) 2모드.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Wallet, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import { payForScheme } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const PAYOUT_OPTS = [
  { value: "pct_of_price", label: "판매가 %" },
  { value: "flat_per_session", label: "회당 정액" },
  { value: "fixed", label: "고정액" },
];
const INCENTIVE_OPTS = [
  { value: "none", label: "없음" },
  { value: "pct", label: "판매가 %" },
  { value: "flat", label: "정액" },
];
const emptyBand = () => ({ min: "", payout_type: "pct_of_price", payout_value: "", incentive_type: "none", incentive_value: "" });

export default function AdminPayrollSettings() {
  const [scheme, setScheme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("banded");      // 'banded' | 'manual'
  const [bandBasis, setBandBasis] = useState("revenue"); // 'revenue' | 'session_count'
  const [bands, setBands] = useState([]);
  // 라이브 미리보기 입력(예시 매출·수업수·수업료합)
  const [sRev, setSRev] = useState("");
  const [sCnt, setSCnt] = useState("");
  const [sSum, setSSum] = useState("");
  const { toast, showToast } = useToast();

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  // 마운트 1회 로드 — 계정 기본 스킴(trainer_id=null) 한 행.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase.from("pay_scheme").select("*").is("trainer_id", null).maybeSingle();
      if (cancelled) return;
      if (data) {
        setScheme(data);
        setType(data.type || "banded");
        setBandBasis(data.band_basis || "revenue");
        setBands(Array.isArray(data.bands) ? data.bands.map((b) => ({
          min: b.min == null ? "" : String(b.min),
          payout_type: b.payout_type || "pct_of_price",
          payout_value: b.payout_value == null ? "" : String(b.payout_value),
          incentive_type: b.incentive_type || "none",
          incentive_value: b.incentive_value == null ? "" : String(b.incentive_value),
        })) : []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const addBand = () => setBands((p) => [...p, emptyBand()]);
  const updateBand = (i, patch) => setBands((p) => p.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeBand = (i) => setBands((p) => p.filter((_, idx) => idx !== i));

  // 문자 입력 → 숫자 밴드(미리보기·저장 공용). 빈칸은 0.
  const numericBands = () => bands.map((b) => ({
    min: b.min === "" ? 0 : Number(b.min),
    payout_type: b.payout_type,
    payout_value: b.payout_value === "" ? 0 : Number(b.payout_value),
    incentive_type: b.incentive_type,
    incentive_value: b.incentive_value === "" ? 0 : Number(b.incentive_value),
  }));

  // 라이브 미리보기 — payForScheme 그대로.
  const preview = payForScheme(
    { type, band_basis: bandBasis, bands: numericBands() },
    { monthRevenue: Number(sRev) || 0, sessionCount: Number(sCnt) || 0, sessionPriceSum: Number(sSum) || 0 }
  );

  const payoutUnit = (t) => (t === "pct_of_price" ? "%" : t === "flat_per_session" ? "원/회" : "원");

  const save = async () => {
    if (saving) return;
    const payload = {
      type,
      band_basis: type === "banded" ? bandBasis : null,
      bands: type === "banded" ? numericBands() : [],
      trainer_id: null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    if (!supabase) {
      setScheme((p) => ({ ...(p || {}), ...payload, id: p?.id || `demo-${Date.now()}` }));
      showToast("저장됨(데모)");
      setSaving(false);
      return;
    }
    if (scheme?.id) {
      // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 확정.
      const { data, error } = await supabase.from("pay_scheme").update(payload).eq("id", scheme.id).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setScheme(data[0]);
    } else {
      const { data, error } = await supabase.from("pay_scheme").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setScheme(data[0]);
    }
    showToast("급여 스킴이 저장되었어요");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Eyebrow icon={Wallet}>급여 정책 설정 · 계정 기본</Eyebrow>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            {/* 방식 */}
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-muted">지급 방식</span>
              <div className="flex gap-2">
                {[{ k: "banded", l: "밴드 자동" }, { k: "manual", l: "수동(월별 입력)" }].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setType(o.k)}
                    disabled={saving}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      type === o.k
                        ? "border border-primary/30 bg-primary-soft text-primary-strong"
                        : "border border-line bg-elevate text-muted hover:text-ink"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {type === "manual" ? (
              <p className="rounded-lg border border-line bg-elevate px-3 py-2.5 text-[12px] leading-relaxed text-sub">
                매월 확정 화면에서 원장이 최종 급여액을 직접 입력합니다. (자동 계산 없음)
              </p>
            ) : (
              <>
                {/* 밴드 기준 */}
                <div>
                  <span className="mb-1.5 block text-[11px] font-medium text-muted">밴드 기준</span>
                  <div className="flex gap-2">
                    {[{ k: "revenue", l: "매출 기준" }, { k: "session_count", l: "수업수 기준" }].map((o) => (
                      <button
                        key={o.k}
                        onClick={() => setBandBasis(o.k)}
                        disabled={saving}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                          bandBasis === o.k
                            ? "border border-primary/30 bg-primary-soft text-primary-strong"
                            : "border border-line bg-elevate text-muted hover:text-ink"
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 밴드 리스트 */}
                <div className="space-y-3">
                  {bands.length === 0 ? (
                    <p className="text-[12px] text-muted">밴드가 없습니다. 아래 &lsquo;밴드 추가&rsquo;로 구간을 만드세요.</p>
                  ) : (
                    bands.map((b, i) => (
                      <div key={i} className="rounded-xl border border-line bg-elevate p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-sub">구간 {i + 1}</span>
                          <button onClick={() => removeBand(i)} disabled={saving} className="text-muted transition hover:text-rose-600 disabled:opacity-50" aria-label="구간 삭제">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-medium text-muted">
                              {bandBasis === "session_count" ? "수업 ○개 이상" : "매출 ○원 이상"}
                            </span>
                            <input type="number" inputMode="numeric" value={b.min} onChange={(e) => updateBand(i, { min: e.target.value })} disabled={saving} placeholder="0" className={inputCls} />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-medium text-muted">지급 유형</span>
                            <select value={b.payout_type} onChange={(e) => updateBand(i, { payout_type: e.target.value })} disabled={saving} className={inputCls}>
                              {PAYOUT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-medium text-muted">지급 값 ({payoutUnit(b.payout_type)})</span>
                            <input type="number" inputMode="numeric" value={b.payout_value} onChange={(e) => updateBand(i, { payout_value: e.target.value })} disabled={saving} placeholder="0" className={inputCls} />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-medium text-muted">인센티브</span>
                            <select value={b.incentive_type} onChange={(e) => updateBand(i, { incentive_type: e.target.value })} disabled={saving} className={inputCls}>
                              {INCENTIVE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                          {b.incentive_type !== "none" && (
                            <label className="col-span-2 block">
                              <span className="mb-1 block text-[10px] font-medium text-muted">인센티브 값 ({b.incentive_type === "pct" ? "%" : "원"})</span>
                              <input type="number" inputMode="numeric" value={b.incentive_value} onChange={(e) => updateBand(i, { incentive_value: e.target.value })} disabled={saving} placeholder="0" className={inputCls} />
                            </label>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <button onClick={addBand} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-xs font-semibold text-sub transition hover:border-primary hover:text-ink disabled:opacity-50">
                    <Plus className="h-4 w-4" /> 밴드 추가
                  </button>
                </div>

                {/* 라이브 미리보기 */}
                <div className="rounded-xl border border-primary/30 bg-primary-soft p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">예상 급여 미리보기</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 매출</span>
                      <input type="number" inputMode="numeric" value={sRev} onChange={(e) => setSRev(e.target.value)} placeholder="0" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 수업수</span>
                      <input type="number" inputMode="numeric" value={sCnt} onChange={(e) => setSCnt(e.target.value)} placeholder="0" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 수업료합</span>
                      <input type="number" inputMode="numeric" value={sSum} onChange={(e) => setSSum(e.target.value)} placeholder="0" className={inputCls} />
                    </label>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-[11px] text-muted">
                      {preview.computed === 0 && !preview.band ? "해당 밴드 없음" : `기본 ${won(preview.base)}${preview.incentive > 0 ? ` + 인센 ${won(preview.incentive)}` : ""}`}
                    </span>
                    <span className="font-mono text-xl font-bold text-primary-strong">
                      예상 급여 {won(preview.computed ?? 0)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 저장 */}
            <button
              onClick={save}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" strokeWidth={2.5} /> {saving ? "저장 중…" : "급여 스킴 저장"}
            </button>
          </div>
        )}
      </section>

      <Toast message={toast} />
    </div>
  );
}
