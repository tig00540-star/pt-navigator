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
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
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

// DB 밴드 행 → 폼 문자열 밴드(로드·스코프 전환 공용). 모듈 스코프라 effect 의존성 안전.
const bandsFromRow = (row) => (Array.isArray(row?.bands) ? row.bands.map((b) => ({
  min: b.min == null ? "" : String(b.min),
  payout_type: b.payout_type || "pct_of_price",
  payout_value: b.payout_value == null ? "" : String(b.payout_value),
  incentive_type: b.incentive_type || "none",
  incentive_value: b.incentive_value == null ? "" : String(b.incentive_value),
})) : []);

export default function AdminPayrollSettings({ trainers = [], solo = false }) {
  const [schemes, setSchemes] = useState([]);        // 전체 pay_scheme 행(계정 기본 + override)
  const [scope, setScope] = useState(null);          // null=계정 기본 · trainerId=그 트레이너 override
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

  // 스코프 행 → 폼 프리필(없으면 기본값). scope 전환·로드 공용.
  const loadForm = (row) => {
    setType(row?.type || "banded");
    setBandBasis(row?.band_basis || "revenue");
    setBands(bandsFromRow(row));
  };

  // 스코프 전환 — 그 스코프의 override 행(없으면 null)을 폼에 로드.
  const selectScope = (s) => {
    setScope(s);
    loadForm(schemes.find((r) => (r.trainer_id ?? null) === (s ?? null)) || null);
  };

  // 마운트 1회 로드 — 전체 스킴(계정 기본 + override). 계정 기본(trainer_id=null)을 폼에 프리필.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase.from("pay_scheme").select("*");
      if (cancelled) return;
      const all = data || [];
      const base = all.find((s) => s.trainer_id == null) || null;
      setSchemes(all);
      setType(base?.type || "banded");
      setBandBasis(base?.band_basis || "revenue");
      setBands(bandsFromRow(base));
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

  // 현재 스코프 행(없으면 계정 기본을 따르는 중) · 트레이너 override 존재 표식.
  const currentRow = schemes.find((s) => (s.trainer_id ?? null) === (scope ?? null)) || null;
  const hasOverride = (tid) => schemes.some((s) => s.trainer_id === tid);
  const scopeBtnCls = (active) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
      active
        ? "border border-primary/30 bg-primary-soft text-primary-strong"
        : "border border-line bg-elevate text-muted hover:text-ink"
    }`;

  const save = async () => {
    if (saving) return;
    const payload = {
      type,
      band_basis: type === "banded" ? bandBasis : null,
      bands: type === "banded" ? numericBands() : [],
      trainer_id: scope ?? null, // 계정 기본=null · override=trainerId. account_id는 DB DEFAULT.
      updated_at: new Date().toISOString(),
    };
    // 현재 스코프의 기존 행(update 대상). ⚠️ override insert는 pay_scheme.account_id DEFAULT 보정에 의존.
    const existing = schemes.find((s) => (s.trainer_id ?? null) === (scope ?? null));
    setSaving(true);
    if (!supabase) {
      const row = { ...(existing || {}), ...payload, id: existing?.id || `demo-${Date.now()}` };
      setSchemes((p) => (existing ? p.map((s) => (s.id === existing.id ? row : s)) : [...p, row]));
      showToast("저장됨(데모)");
      setSaving(false);
      return;
    }
    try {
    if (existing?.id) {
      // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 확정.
      const { data, error } = await supabase.from("pay_scheme").update(payload).eq("id", existing.id).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setSchemes((p) => p.map((s) => (s.id === data[0].id ? data[0] : s)));
    } else {
      const { data, error } = await supabase.from("pay_scheme").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setSchemes((p) => [...p, data[0]]);
    }
    showToast("급여 스킴이 저장되었어요");
    setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };

  // override 삭제 — 이 트레이너 전용 정책을 지워 계정 기본을 따르게. 계정 기본(null)엔 없음.
  const removeOverride = async () => {
    if (saving || scope == null) return;
    const row = schemes.find((s) => (s.trainer_id ?? null) === (scope ?? null));
    if (!row) return;
    setSaving(true);
    if (!supabase) {
      setSchemes((p) => p.filter((s) => s.id !== row.id));
      selectScope(null);
      showToast("삭제됨(데모)");
      setSaving(false);
      return;
    }
    try {
      const { data, error } = await supabase.from("pay_scheme").delete().eq("id", row.id).select();
      if (error || !data || data.length === 0) { showToast("삭제 실패 — 권한/정책을 확인하세요"); setSaving(false); return; }
      setSchemes((p) => p.filter((s) => s.id !== row.id));
      selectScope(null);
      showToast("이 트레이너 정책 삭제 — 계정 기본을 따릅니다");
      setSaving(false);
    } catch {
      showToast("삭제 실패 — 권한/정책을 확인하세요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Eyebrow icon={Wallet}>{solo ? "내 급여 방식" : `급여 정책 설정 · ${scope == null ? "계정 기본" : (trainers.find((t) => t.id === scope)?.name || "트레이너")}`}</Eyebrow>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        {/* 스코프 선택 — 계정 기본 + 트레이너별 override. solo면 대상이 본인 1명뿐이라 숨김(scope=null 유지). */}
        {!solo && (
        <div className="mb-4">
          <span className="mb-1.5 block text-[11px] font-medium text-muted">적용 대상</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => selectScope(null)} disabled={saving} className={scopeBtnCls(scope == null)}>
              계정 기본
            </button>
            {trainers.map((t) => (
              <button key={t.id} onClick={() => selectScope(t.id)} disabled={saving} className={scopeBtnCls(scope === t.id)}>
                {t.name || "이름없음"}
                {hasOverride(t.id) && <span className="ml-1 text-primary-strong">●</span>}
              </button>
            ))}
          </div>
          {!loading && scope != null && !currentRow && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              이 트레이너는 계정 기본을 따르는 중 — 저장하면 전용 정책이 생겨요.
            </p>
          )}
        </div>
        )}

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
                            <NumberInput value={b.min} onValueChange={(v) => updateBand(i, { min: v })} disabled={saving} placeholder="0" className={inputCls} />
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
                  <Button variant="ghost" accent="owner" size="sm" onClick={addBand} disabled={saving}>
                    <Plus className="h-4 w-4" /> 밴드 추가
                  </Button>
                </div>

                {/* 라이브 미리보기 */}
                <div className="rounded-xl border border-primary/30 bg-primary-soft p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">예상 급여 미리보기</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 매출</span>
                      <NumberInput value={sRev} onValueChange={setSRev} placeholder="0" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 수업수</span>
                      <NumberInput value={sCnt} onValueChange={setSCnt} placeholder="0" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-muted">예시 수업료합</span>
                      <NumberInput value={sSum} onValueChange={setSSum} placeholder="0" className={inputCls} />
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
            <Button variant="primary" size="md" fullWidth onClick={save} disabled={saving} className="gap-2">
              <Wallet className="h-4 w-4" strokeWidth={2.5} /> {saving ? "저장 중…" : "급여 스킴 저장"}
            </Button>

            {/* override 삭제 — 트레이너 스코프이고 전용 정책이 있을 때만(계정 기본은 못 지움) */}
            {scope != null && currentRow && (
              <Button variant="danger" size="sm" fullWidth onClick={removeOverride} disabled={saving}>
                이 트레이너 정책 삭제 (계정 기본 따름)
              </Button>
            )}
          </div>
        )}
      </section>

      <Toast message={toast} />
    </div>
  );
}
