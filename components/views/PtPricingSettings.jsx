"use client";

/* =========================================================================
   내 PT 가격 설정 — 트레이너 본인 pt_package CRUD.
   자기완결(본인 pt_package 스스로 fetch). account_id·trainer_id는 DB DEFAULT.
   저장/삭제는 .select() 하드닝(교훈1) · 데모 가드 · 인라인 삭제확인 (PtInbodyTab 미러).
   이 가격이 B(1차 OT AI) 프로그램 추천의 '내 실제 가격' 재료가 된다.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import Card from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";

export default function PtPricingSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null); // null=신규 · id=수정
  const [confirmId, setConfirmId] = useState(null);  // 삭제 인라인 확인 대상
  // 폼 필드
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [price, setPrice] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [sort, setSort] = useState("");
  const { toast, showToast } = useToast();

  // 마운트 1회 로드 — 본인 pt_package만(회원 의존 아님).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const uid = au?.user?.id ?? null;
        const { data } = await supabase
          .from("pt_package")
          .select("*")
          .eq("trainer_id", uid) // ★ RLS는 owner에게 전체 노출 → 내 것만 명시 필터
          .order("sort", { ascending: true })
          .order("created_at", { ascending: true });
        if (cancelled) return;
        setRows(data || []);
      } catch {
        /* 조회 실패 → 빈 목록 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const resetForm = () => {
    setName(""); setSessions(""); setDurationLabel(""); setPrice("");
    setListPrice(""); setNote(""); setActive(true); setSort("");
    setEditingId(null);
  };

  // measured_at 대신 sort→created_at 정렬(로드와 동일).
  const sortRows = (list) => [...list].sort((a, b) => {
    const s = (a.sort ?? 0) - (b.sort ?? 0);
    if (s !== 0) return s;
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
  });

  // 저장 — 신규=insert / 수정=update. account_id·trainer_id는 DB DEFAULT라 미포함.
  const save = async () => {
    if (saving) return;
    if (!name.trim()) return showToast("패키지명을 입력하세요");
    if (price === "" || isNaN(Number(price))) return showToast("금액을 입력하세요");
    const payload = {
      name: name.trim(),
      sessions: sessions === "" ? null : Number(sessions),
      duration_label: durationLabel.trim() || null,
      price: Number(price),
      list_price: listPrice === "" ? null : Number(listPrice),
      note: note.trim() || null,
      active,
      sort: sort === "" ? rows.length : Number(sort),
    };
    setSaving(true);

    if (!supabase) {
      if (editingId) {
        setRows((p) => sortRows(p.map((r) => (r.id === editingId ? { ...r, ...payload } : r))));
      } else {
        setRows((p) => sortRows([...p, { ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }]));
      }
      resetForm();
      showToast("저장됨(데모)");
      setSaving(false);
      return;
    }

    try {
    if (editingId) {
      // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 확정.
      const { data, error } = await supabase.from("pt_package").update(payload).eq("id", editingId).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setRows((p) => sortRows(p.map((r) => (r.id === data[0].id ? data[0] : r))));
      showToast("패키지 수정됨");
    } else {
      const { data, error } = await supabase.from("pt_package").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setRows((p) => sortRows([...p, data[0]]));
      showToast("패키지 추가됨");
    }
    resetForm();
    setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };

  // 수정 진입 — 행 값을 폼에 로드.
  const startEdit = (r) => {
    setEditingId(r.id);
    setName(r.name ?? "");
    setSessions(r.sessions == null ? "" : String(r.sessions));
    setDurationLabel(r.duration_label ?? "");
    setPrice(r.price == null ? "" : String(r.price));
    setListPrice(r.list_price == null ? "" : String(r.list_price));
    setNote(r.note ?? "");
    setActive(r.active !== false);
    setSort(r.sort == null ? "" : String(r.sort));
    setConfirmId(null);
  };

  // 삭제 — 1탭째 인라인 확인, 확인 상태에서 재탭 시 실제 삭제(PtInbodyTab remove 미러).
  const remove = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    if (!supabase) {
      setRows((p) => p.filter((r) => r.id !== id));
      setConfirmId(null);
      showToast("삭제됨(데모)");
      return;
    }
    const { data, error } = await supabase.from("pt_package").delete().eq("id", id).select();
    if (error || !data || data.length === 0) {
      showToast("삭제 실패 — 권한/정책을 확인하세요");
      setConfirmId(null);
      return;
    }
    setRows((p) => p.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
    setConfirmId(null);
    showToast("삭제됨");
  };

  return (
    <div className="space-y-4">
      {/* 입력 카드 (신규/수정 겸용) */}
      <Card as="section">
        <Eyebrow icon={Tag}>내 PT 가격 설정</Eyebrow>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">패키지명 *</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="3개월 집중" className={inputCls} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">세션수</span>
              <NumberInput value={sessions} onValueChange={setSessions} disabled={saving} placeholder="회 (비우면 기간제)" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">기간</span>
              <input type="text" value={durationLabel} onChange={(e) => setDurationLabel(e.target.value)} disabled={saving} placeholder="3개월·주2회" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">실판매가(원) *</span>
              <NumberInput value={price} onValueChange={setPrice} disabled={saving} placeholder="1200000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">정가(원) <span className="text-muted">(선택)</span></span>
              <NumberInput value={listPrice} onValueChange={setListPrice} disabled={saving} placeholder="할인 전 가격" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">설명 <span className="text-muted">(선택)</span></span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} placeholder="대상·특징" className={inputCls} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-sub">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={saving} className="h-4 w-4 accent-primary" />
              노출 (끄면 숨김)
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">표시 순서 <span className="text-muted">(선택)</span></span>
              <input type="number" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} disabled={saving} placeholder={String(rows.length)} className={inputCls} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="md" onClick={save} disabled={saving} className="flex-1 gap-2">
              {editingId ? <Pencil className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
              {saving ? "저장 중…" : editingId ? "수정 저장" : "패키지 추가"}
            </Button>
            {editingId && (
              <Button variant="ghost" size="md" onClick={resetForm} disabled={saving}>
                <X className="h-4 w-4" /> 취소
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 리스트 */}
      <Card as="section">
        <Eyebrow icon={Tag}>등록한 패키지</Eyebrow>
        {loading ? (
          <p className="mt-2 text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 등록한 PT 패키지가 없어요. 추가하면 1차 OT AI가 이 가격으로 프로그램을 추천해요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((r) => {
              const discounted = r.list_price != null && r.list_price > r.price;
              return (
                <li key={r.id} className={`rounded-xl border border-line bg-elevate p-3 ${r.active === false ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{r.name}</span>
                        {r.sessions != null && (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{r.sessions}회</span>
                        )}
                        {r.duration_label && (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{r.duration_label}</span>
                        )}
                        {r.active === false && (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted">숨김</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-mono text-lg font-bold text-ink">{won(r.price)}</span>
                        {discounted && (
                          <>
                            <span className="font-mono text-xs text-muted line-through">{won(r.list_price)}</span>
                            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">
                              -{Math.round((1 - r.price / r.list_price) * 100)}%
                            </span>
                          </>
                        )}
                        {r.sessions > 0 && (
                          <span className="text-[11px] text-muted">{won(Math.round(r.price / r.sessions))}/회</span>
                        )}
                      </div>
                      {r.note && <div className="mt-1 text-[11px] text-muted">{r.note}</div>}
                    </div>
                    {confirmId === r.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => remove(r.id)} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-500/20">삭제?</button>
                        <button onClick={() => setConfirmId(null)} className="rounded-md border border-line px-2 py-1 text-[10px] font-medium text-sub transition hover:text-ink">취소</button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => startEdit(r)} className="text-muted transition hover:text-primary-strong" aria-label="수정">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmId(r.id)} className="text-muted transition hover:text-rose-600" aria-label="삭제">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Toast message={toast} />
    </div>
  );
}
