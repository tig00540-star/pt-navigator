"use client";

/* =========================================================================
   인바디 (PT 서브탭) — 수기 측정 입력 + 최근 요약(직전 대비 delta) + 이력.
   자기완결(inbody_log 스스로 fetch). PTView가 key={member.id}로 리마운트 → 회원전환 리셋 자동.
   account_id·trainer_id는 DB DEFAULT. 저장/삭제는 .select() 하드닝(교훈1) · 데모 가드.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Scale, Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { INBODY_FIELDS } from "@/lib/labels";

// KST(UTC+9) 오늘 YYYY-MM-DD. new Date는 클라 컴포넌트라 허용(순수 모듈 아님).
function kstToday() {
  return new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
// 입력 상태 초기값 — INBODY_FIELDS.key별 빈 문자열.
function emptyVals() {
  const o = {};
  for (const f of INBODY_FIELDS) o[f.key] = "";
  return o;
}
// purge-safe delta 색 맵(동적 클래스 조립 금지).
const DELTA_TONE = { good: "text-primary-strong", bad: "text-rose-600", flat: "text-muted" };

// 미니 스파크라인 — 지표 하나의 값 추이(오래된→최신, 좌→우). 값 2개 미만이면 안 그림.
// non-scaling-stroke로 가로 늘려도 선 두께 유지. 축·격자·호버 없음(수치는 이력 리스트가 담당).
function Sparkline({ values }) {
  const w = 100, h = 28, pad = 3;
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const stepX = w / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = i * stepX;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="mt-1 text-primary/70">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// 변화 방향 → 좋음/나쁨/중립. before·cur 하나라도 null이면 null(표시 안 함).
function deltaTone(field, cur, before) {
  if (cur == null || before == null) return null;
  const d = cur - before;
  if (d === 0 || !field.goodDir) return "flat";
  if ((d > 0 && field.goodDir === "up") || (d < 0 && field.goodDir === "down")) return "good";
  return "bad";
}

export default function PtInbodyTab({ member }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null); // 삭제 인라인 확인 대상
  const [measuredAt, setMeasuredAt] = useState(kstToday());
  const [note, setNote] = useState("");
  const [vals, setVals] = useState(emptyVals());
  const { toast, showToast } = useToast();

  // 회원 변경 시 인바디 이력 로드(measured_at 내림차순 = 최신 먼저).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("inbody_log")
        .select("*")
        .eq("user_id", member.id)
        .order("measured_at", { ascending: false });
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const latest = rows[0] ?? null;
  const prev = rows[1] ?? null;

  const resetForm = () => { setVals(emptyVals()); setNote(""); setMeasuredAt(kstToday()); };

  // 저장 — 측정일 필수 · 최소 1지표. account_id/trainer_id는 DB DEFAULT.
  const save = async () => {
    if (saving) return;
    if (!measuredAt) return;
    if (INBODY_FIELDS.every((f) => vals[f.key] === "")) {
      showToast("측정치를 하나 이상 입력하세요");
      return;
    }
    setSaving(true);
    const payload = { user_id: member.id, measured_at: measuredAt, note: note.trim() || null };
    for (const f of INBODY_FIELDS) payload[f.key] = vals[f.key] === "" ? null : Number(vals[f.key]);

    if (!supabase) {
      setRows((p) => [{ ...payload, id: `demo-${Date.now()}` }, ...p].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1)));
      resetForm();
      showToast("인바디 저장됨(데모)");
      setSaving(false);
      return;
    }
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 확정.
    const { data, error } = await supabase.from("inbody_log").insert(payload).select();
    if (error || !data || data.length === 0) {
      showToast("저장 실패 — 다시 시도하세요");
      setSaving(false);
      return;
    }
    setRows((p) => [data[0], ...p].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))); // measured_at 내림차순 — back-date 대비 재정렬
    resetForm();
    showToast("인바디 저장됨");
    setSaving(false);
  };

  // 삭제 — 1탭째 인라인 확인(오탭 방지), 확인 상태에서 재탭 시 실제 삭제.
  const remove = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    if (!supabase) {
      setRows((p) => p.filter((r) => r.id !== id));
      setConfirmId(null);
      showToast("삭제됨(데모)");
      return;
    }
    const { data, error } = await supabase.from("inbody_log").delete().eq("id", id).select();
    if (error || !data || data.length === 0) {
      showToast("삭제 실패 — 권한/정책을 확인하세요");
      setConfirmId(null);
      return;
    }
    setRows((p) => p.filter((r) => r.id !== id));
    setConfirmId(null);
    showToast("삭제됨");
  };

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";
  // delta 표시값 — ±값(소수 1자리 반올림) + 방향 아이콘.
  const fmtDelta = (d) => (d > 0 ? "+" : "") + (Math.round(d * 10) / 10);

  return (
    <div className="space-y-6">
      {/* 입력 카드 */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={Scale}>인바디 기록</Eyebrow>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">측정일</span>
            <input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} disabled={saving} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {INBODY_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">{f.label} <span className="text-muted">({f.unit})</span></span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={vals[f.key]}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  disabled={saving}
                  placeholder="–"
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">메모 <span className="text-muted">(선택)</span></span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} placeholder="측정 조건·특이사항" className={inputCls} />
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> {saving ? "저장 중…" : "측정 저장"}
          </button>
        </div>
      </section>

      {/* 최근 요약 (직전 대비 delta) */}
      {latest && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <Eyebrow icon={Scale}>최근 측정</Eyebrow>
            <span className="font-mono text-[11px] text-muted">{latest.measured_at}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {INBODY_FIELDS.map((f) => {
              const cur = latest[f.key];
              const before = prev?.[f.key];
              const tone = deltaTone(f, cur, before);
              const d = tone ? cur - before : 0;
              const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
              return (
                <div key={f.key} className="rounded-xl border border-line bg-elevate p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">{f.label}</div>
                  <div className="mt-1 font-mono text-lg font-bold text-ink">
                    {cur == null ? "–" : cur}
                    <span className="ml-1 text-xs font-normal text-muted">{f.unit}</span>
                  </div>
                  {tone && (
                    <div className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold ${DELTA_TONE[tone]}`}>
                      <Icon className="h-3 w-3" /> {fmtDelta(d)}{f.unit}
                    </div>
                  )}
                  <Sparkline values={[...rows].reverse().map((r) => r[f.key])} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 이력 리스트 */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={Scale}>지난 측정</Eyebrow>
        {loading ? (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 인바디 기록이 없습니다. 위에서 첫 측정을 입력하세요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-line bg-elevate p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-sub">{row.measured_at}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-sub">
                      {INBODY_FIELDS.map((f) => (
                        <span key={f.key}>
                          {f.label} <b className="text-ink">{row[f.key] == null ? "–" : row[f.key]}</b>
                          <span className="text-muted">{row[f.key] == null ? "" : f.unit}</span>
                        </span>
                      ))}
                    </div>
                    {row.note && <div className="mt-1 text-[11px] text-muted">{row.note}</div>}
                  </div>
                  {confirmId === row.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => remove(row.id)} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-500/20">삭제?</button>
                      <button onClick={() => setConfirmId(null)} className="rounded-md border border-line px-2 py-1 text-[10px] font-medium text-sub transition hover:text-ink">취소</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(row.id)} className="shrink-0 text-muted transition hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast message={toast} />
    </div>
  );
}
