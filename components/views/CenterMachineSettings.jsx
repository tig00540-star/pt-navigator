"use client";
/* 보유 장비 — 머신·덤벨·프리웨이트 CRUD(설정탭). center_machine(account 스코프).
   대표(owner)·solo만 편집, 소속 트레이너는 열람. account_id=DB DEFAULT(auth_account_id)라 insert 미포함.
   AI 루틴(ot-brief)이 이 목록을 '있는 장비'로 참조. */
import { useEffect, useState } from "react";
import { Dumbbell, Plus, Trash2, Pencil, X, Sparkles } from "lucide-react";
import { authHeader } from "@/lib/authHeader";
import { supabase } from "@/lib/supabaseClient";
import { useAccount } from "@/lib/useAccount";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const KINDS = [
  { v: "machine", label: "머신" },
  { v: "free_weight", label: "프리웨이트" },
  { v: "bodyweight", label: "맨몸/도구" },
];
const KIND_LABEL = { machine: "머신", free_weight: "프리웨이트", bodyweight: "맨몸/도구" };

export default function CenterMachineSettings() {
  const { isOwner } = useAccount();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [kind, setKind] = useState("machine");
  const [spec, setSpec] = useState("");
  const [cues, setCues] = useState("");        // 줄 = 큐 1개
  const [cueLoading, setCueLoading] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase.from("center_machine").select("*")
        .order("kind", { ascending: true }).order("name", { ascending: true });
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => { setName(""); setBrand(""); setKind("machine"); setSpec(""); setCues(""); setEditingId(null); };

  // 머신별 실행 큐 AI 초안 — /api/machine-cues(생성만). 기존 입력에 덧붙이고 트레이너가 다듬어 저장.
  const genCues = async () => {
    if (cueLoading) return;
    if (!name.trim()) return showToast("먼저 장비 이름을 입력하세요");
    setCueLoading(true);
    try {
      const res = await fetch("/api/machine-cues", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ name: name.trim(), brand: brand.trim(), kind, spec: spec.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.cues) || !data.cues.length) showToast(data.error || "초안 생성 실패");
      else { setCues((p) => (p.trim() ? p.trim() + "\n" : "") + data.cues.join("\n")); showToast("초안 생성됨 — 다듬어 저장하세요"); }
    } catch { showToast("초안 생성 실패 — 네트워크 확인"); }
    setCueLoading(false);
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return showToast("장비 이름을 입력하세요");
    const cueArr = cues.split("\n").map((s) => s.trim()).filter(Boolean);
    const payload = { name: name.trim(), brand: brand.trim() || null, kind, spec: spec.trim() || null, cues: cueArr.length ? cueArr : null };
    setSaving(true);
    if (!supabase) {
      if (editingId) setRows((p) => p.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      else setRows((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      resetForm(); showToast("저장됨(데모)"); setSaving(false); return;
    }
    try {
    if (editingId) {
      const { data, error } = await supabase.from("center_machine").update(payload).eq("id", editingId).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 권한(대표만)·정책 확인"); setSaving(false); return; }
      setRows((p) => p.map((r) => (r.id === data[0].id ? data[0] : r)));
      showToast("수정됨");
    } else {
      const { data, error } = await supabase.from("center_machine").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 권한(대표만)·정책 확인"); setSaving(false); return; }
      setRows((p) => [...p, data[0]]);
      showToast("추가됨");
    }
    resetForm(); setSaving(false);
    } catch {
      showToast("저장 실패 — 권한(대표만)·정책 확인");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r) => { setEditingId(r.id); setName(r.name ?? ""); setBrand(r.brand ?? ""); setKind(r.kind ?? "machine"); setSpec(r.spec ?? ""); setCues(Array.isArray(r.cues) ? r.cues.join("\n") : ""); setConfirmId(null); };

  const remove = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    if (!supabase) { setRows((p) => p.filter((r) => r.id !== id)); setConfirmId(null); showToast("삭제됨(데모)"); return; }
    const { data, error } = await supabase.from("center_machine").delete().eq("id", id).select();
    if (error || !data || data.length === 0) { showToast("삭제 실패 — 권한/정책 확인"); setConfirmId(null); return; }
    setRows((p) => p.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
    setConfirmId(null); showToast("삭제됨");
  };

  const groups = {};
  for (const r of rows) { const k = KIND_LABEL[r.kind] || "미분류"; (groups[k] ||= []).push(r); }
  const cats = Object.keys(groups);
  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  return (
    <div className="space-y-4">
      <Eyebrow icon={Dumbbell}>보유 장비</Eyebrow>

      {isOwner ? (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">장비 이름 *</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="레그프레스 · 덤벨 세트 …" className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">종류</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={saving} className={inputCls}>
                  {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">브랜드 <span className="text-muted">(선택)</span></span>
                <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={saving} placeholder="테크노짐 …" className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">규격·중량 <span className="text-muted">(선택)</span></span>
              <input type="text" value={spec} onChange={(e) => setSpec(e.target.value)} disabled={saving} placeholder="예: 덤벨 2.5~40kg (덤벨은 한 항목으로)" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted">실행 큐 <span className="text-muted">(한 줄 = 큐 1개)</span></span>
                <button type="button" onClick={genCues} disabled={saving || cueLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-elevate px-2 py-1 text-[11px] font-semibold text-primary-strong transition hover:border-primary disabled:opacity-50">
                  <Sparkles className="h-3.5 w-3.5" /> {cueLoading ? "생성 중…" : "AI 초안 생성"}
                </button>
              </span>
              <textarea value={cues} onChange={(e) => setCues(e.target.value)} disabled={saving} rows={5}
                placeholder={"예:\n의자 높이 맞춰 발바닥 전체 밀착\n손잡이 강하게 당겨 가슴 세운 상태 유지"} className={inputCls} />
            </label>
            <div className="flex gap-2">
              <Button variant="primary" size="md" onClick={save} disabled={saving} className="flex-1 gap-2">
                {editingId ? <Pencil className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                {saving ? "저장 중…" : editingId ? "수정 저장" : "장비 추가"}
              </Button>
              {editingId && (
                <Button variant="ghost" size="md" onClick={resetForm} disabled={saving}><X className="h-4 w-4" /> 취소</Button>
              )}
            </div>
            <p className="text-[10px] leading-relaxed text-muted">여기 등록한 장비를 AI가 1·2차 OT·재등록 루틴에 &lsquo;있는 장비&rsquo;로 반영합니다. 덤벨·바벨은 종류를 &lsquo;프리웨이트&rsquo;로.</p>
          </div>
        </section>
      ) : (
        <p className="text-[11px] text-muted">장비는 대표가 관리합니다. (열람 전용)</p>
      )}

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={Dumbbell}>등록된 장비</Eyebrow>
        {loading ? (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 등록된 장비가 없어요.{isOwner ? " 위에서 보유 머신·덤벨을 등록하면 AI 루틴에 반영됩니다." : ""}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {cats.map((cat) => (
              <div key={cat}>
                <div className="flex items-center gap-1.5 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{cat}</span>
                  <span className="rounded-full bg-elevate px-1.5 py-0.5 text-[10px] font-semibold text-sub">{groups[cat].length}</span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {groups[cat].map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-2.5 py-1.5">
                      <span className="text-sm text-ink">{[r.brand, r.name].filter(Boolean).join(" ")}{r.spec ? ` · ${r.spec}` : ""}</span>
                      {r.cues?.length > 0 && <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">큐 {r.cues.length}</span>}
                      {isOwner && (confirmId === r.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => remove(r.id)} className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">삭제?</button>
                          <button onClick={() => setConfirmId(null)} className="text-[10px] text-muted">취소</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <button onClick={() => startEdit(r)} className="text-muted hover:text-primary-strong" aria-label="수정"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirmId(r.id)} className="text-muted hover:text-rose-600" aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <Toast message={toast} />
    </div>
  );
}
