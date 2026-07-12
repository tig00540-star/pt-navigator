"use client";
/* 내 라이브러리 — 카테고리별 참고 영상·링크 CRUD(자기완결 · PtPricingSettings 패턴).
   library_item(본인 것 · trainer_id 필터). 지금은 관리만 — 수업중 표시·회원 공유는 후속.
   account_id·trainer_id는 DB DEFAULT라 insert 시 미포함. .select() 하드닝·데모 가드·Toast. */
import { useEffect, useState } from "react";
import { BookMarked, Plus, Trash2, Pencil, X, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

// URL에서 출처 추정(배지·후속 필터용).
function detectSource(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  return "link";
}
const SOURCE_LABEL = { youtube: "YouTube", instagram: "Instagram", link: "링크" };

export default function TrainerLibrary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const { data } = await supabase.from("library_item").select("*")
        .eq("trainer_id", uid)                 // RLS는 owner 전체노출 → 내 것만 명시 필터(pt_package와 동일)
        .order("category", { ascending: true })
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => { setCategory(""); setTitle(""); setUrl(""); setNote(""); setEditingId(null); };

  const save = async () => {
    if (saving) return;
    if (!title.trim()) return showToast("제목을 입력하세요");
    if (!url.trim()) return showToast("링크를 입력하세요");
    const payload = {
      category: category.trim() || null,
      title: title.trim(),
      url: url.trim(),
      source: detectSource(url),
      note: note.trim() || null,
    };
    setSaving(true);
    if (!supabase) {
      if (editingId) setRows((p) => p.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      else setRows((p) => [...p, { ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }]);
      resetForm(); showToast("저장됨(데모)"); setSaving(false); return;
    }
    if (editingId) {
      const { data, error } = await supabase.from("library_item").update(payload).eq("id", editingId).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setRows((p) => p.map((r) => (r.id === data[0].id ? data[0] : r)));
      showToast("수정됨");
    } else {
      const { data, error } = await supabase.from("library_item").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setRows((p) => [...p, data[0]]);
      showToast("추가됨");
    }
    resetForm(); setSaving(false);
  };

  const startEdit = (r) => {
    setEditingId(r.id); setCategory(r.category ?? ""); setTitle(r.title ?? "");
    setUrl(r.url ?? ""); setNote(r.note ?? ""); setConfirmId(null);
  };

  const remove = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    if (!supabase) { setRows((p) => p.filter((r) => r.id !== id)); setConfirmId(null); showToast("삭제됨(데모)"); return; }
    const { data, error } = await supabase.from("library_item").delete().eq("id", id).select();
    if (error || !data || data.length === 0) { showToast("삭제 실패 — 권한/정책 확인"); setConfirmId(null); return; }
    setRows((p) => p.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
    setConfirmId(null); showToast("삭제됨");
  };

  // 카테고리별 그룹(빈 카테고리는 '기타'). datalist 제안용 기존 카테고리.
  const groups = {};
  for (const r of rows) { const k = r.category || "기타"; (groups[k] ||= []).push(r); }
  const cats = Object.keys(groups);
  const existingCats = [...new Set(rows.map((r) => r.category).filter(Boolean))];

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  return (
    <div className="space-y-4">
      <Eyebrow icon={BookMarked}>내 라이브러리</Eyebrow>
      {/* 입력(신규/수정 겸용) */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">카테고리 <span className="text-muted">(선택)</span></span>
            <input list="lib-cats" type="text" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving} placeholder="거북목 · 라운드숄더 …" className={inputCls} />
            <datalist id="lib-cats">{existingCats.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">제목 *</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} placeholder="거북목 교정 스트레칭" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">링크 *</span>
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={saving} placeholder="https://youtube.com/..." className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">메모 <span className="text-muted">(선택)</span></span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} placeholder="어떤 상황에 쓰는지" className={inputCls} />
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50">
              {editingId ? <Pencil className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
              {saving ? "저장 중…" : editingId ? "수정 저장" : "자료 추가"}
            </button>
            {editingId && (
              <button onClick={resetForm} disabled={saving} className="flex items-center justify-center gap-1 rounded-lg border border-line bg-elevate px-3 py-2.5 text-sm font-medium text-sub transition hover:border-primary disabled:opacity-50">
                <X className="h-4 w-4" /> 취소
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 리스트(카테고리별 그룹) */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={BookMarked}>저장한 자료</Eyebrow>
        {loading ? (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 저장한 자료가 없어요. 카테고리별로 영상·링크를 모아두면 수업 중 빠르게 꺼내 쓸 수 있어요.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {cats.map((cat) => (
              <div key={cat}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{cat}</div>
                <ul className="space-y-2">
                  {groups[cat].map((r) => (
                    <li key={r.id} className="rounded-xl border border-line bg-elevate p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-semibold text-ink hover:text-primary-strong">
                            <span className="truncate">{r.title}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
                          </a>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{SOURCE_LABEL[r.source] || "링크"}</span>
                            {r.note && <span className="text-[11px] text-muted">{r.note}</span>}
                          </div>
                        </div>
                        {confirmId === r.id ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => remove(r.id)} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-500/20">삭제?</button>
                            <button onClick={() => setConfirmId(null)} className="rounded-md border border-line px-2 py-1 text-[10px] font-medium text-sub transition hover:text-ink">취소</button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => startEdit(r)} className="text-muted transition hover:text-primary-strong" aria-label="수정"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setConfirmId(r.id)} className="text-muted transition hover:text-rose-600" aria-label="삭제"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </div>
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
