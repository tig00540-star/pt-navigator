"use client";
/* =========================================================================
   기능1 공지 C — 원장용 공지 작성·목록. docs/v2-공지-스펙-필수확인.md §5.
   원장→트레이너 단방향. 강도(must_ack: 필수확인 게이트 / 일반 벨), 대상(전체/지정), 핀.
   쓰기 RLS=원장만(auth_is_owner()) — 0행이면 "게시 실패". 읽음현황=announcement_read 집계.
   .select() 하드닝(교훈1) · 데모 가드 · 인라인 2단 삭제확인(브라우저 confirm 금지). admin fuchsia 톤.
   ========================================================================= */
import { useEffect, useState } from "react";
import { Megaphone, Pin, Users, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";

export default function AdminAnnouncements({ trainers = [] }) {
  const [anns, setAnns] = useState([]);
  const [readCount, setReadCount] = useState(new Map()); // announcement_id → 읽음 수
  const [loading, setLoading] = useState(true);
  // 작성/수정 폼
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetMode, setTargetMode] = useState("all"); // all | specific
  const [targetIds, setTargetIds] = useState([]);
  const [mustAck, setMustAck] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-fuchsia-500/50 disabled:opacity-50";
  const nameOf = (id) => trainers.find((t) => t.id === id)?.name || "트레이너";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; } // 데모: 로컬만
      const [a, r] = await Promise.all([
        supabase.from("announcement").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("announcement_read").select("announcement_id"),
      ]);
      if (cancelled) return;
      setAnns(a.data || []);
      const m = new Map();
      for (const row of r.data || []) m.set(row.announcement_id, (m.get(row.announcement_id) || 0) + 1);
      setReadCount(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setEditingId(null); setTitle(""); setBody(""); setTargetMode("all");
    setTargetIds([]); setMustAck(false); setPinned(false); setErr("");
  };

  const toggleTarget = (id) =>
    setTargetIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // 목록 정렬 — 핀 먼저, 그 안 최신순(로드·낙관적 갱신 후 일관 유지).
  const sorted = [...anns].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1;
  });

  const post = async () => {
    if (posting) return;
    if (!title.trim() || !body.trim()) { setErr("제목과 본문을 입력하세요"); return; }
    if (targetMode === "specific" && targetIds.length === 0) { setErr("지정할 트레이너를 선택하세요"); return; }
    setErr("");
    // 전체=null(인덱스·의미 명확) · 지정=선택 id 배열. account_id·author_id는 DB DEFAULT.
    const payload = {
      title: title.trim(),
      body: body.trim(),
      target_trainer_ids: targetMode === "specific" && targetIds.length ? targetIds : null,
      must_ack: mustAck,
      pinned,
    };
    setPosting(true);
    if (!supabase) {
      if (editingId) setAnns((p) => p.map((x) => (x.id === editingId ? { ...x, ...payload } : x)));
      else setAnns((p) => [{ ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }, ...p]);
      resetForm(); setPosting(false); return;
    }
    if (editingId) {
      const { data, error } = await supabase.from("announcement").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId).select();
      if (error || !data || data.length === 0) { setErr("게시 실패 — 권한/정책 확인"); setPosting(false); return; }
      setAnns((p) => p.map((x) => (x.id === data[0].id ? data[0] : x)));
    } else {
      const { data, error } = await supabase.from("announcement").insert(payload).select();
      if (error || !data || data.length === 0) { setErr("게시 실패 — 원장 아님/정책"); setPosting(false); return; }
      setAnns((p) => [data[0], ...p]);
    }
    resetForm(); setPosting(false);
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setTitle(a.title || "");
    setBody(a.body || "");
    const t = a.target_trainer_ids;
    if (Array.isArray(t) && t.length) { setTargetMode("specific"); setTargetIds(t); }
    else { setTargetMode("all"); setTargetIds([]); }
    setMustAck(a.must_ack === true);
    setPinned(a.pinned === true);
    setErr(""); setConfirmId(null);
  };

  const togglePin = async (a) => {
    const nextPinned = !a.pinned;
    if (!supabase) { setAnns((p) => p.map((x) => (x.id === a.id ? { ...x, pinned: nextPinned } : x))); return; }
    const { data, error } = await supabase.from("announcement").update({ pinned: nextPinned, updated_at: new Date().toISOString() }).eq("id", a.id).select();
    if (error || !data || data.length === 0) { setErr("핀 변경 실패 — 정책 확인"); return; }
    setAnns((p) => p.map((x) => (x.id === data[0].id ? data[0] : x)));
  };

  const remove = async (a) => {
    setConfirmId(null);
    if (!supabase) { setAnns((p) => p.filter((x) => x.id !== a.id)); return; }
    const { data, error } = await supabase.from("announcement").delete().eq("id", a.id).select();
    if (error || !data || data.length === 0) { setErr("삭제 실패 — 정책 확인"); return; }
    setAnns((p) => p.filter((x) => x.id !== a.id));
    if (editingId === a.id) resetForm();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700">
        <Megaphone className="h-3.5 w-3.5" /> 공지 (원장 → 트레이너)
      </div>

      {/* 작성/수정 폼 */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={posting} placeholder="제목" className={inputCls} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={posting} rows={3} placeholder="본문" className={inputCls + " resize-none"} />

          {/* 대상 */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted">대상</div>
            <div className="flex gap-2">
              {[{ k: "all", l: "전체 트레이너" }, { k: "specific", l: "특정 지정" }].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setTargetMode(o.k)}
                  disabled={posting}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    targetMode === o.k
                      ? "border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700"
                      : "border border-line bg-elevate text-muted hover:text-ink"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {targetMode === "specific" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trainers.length === 0 ? (
                  <span className="text-[11px] text-muted">트레이너가 없어요.</span>
                ) : (
                  trainers.map((t) => {
                    const on = targetIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTarget(t.id)}
                        disabled={posting}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                          on
                            ? "border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700"
                            : "border border-line bg-elevate text-sub hover:text-ink"
                        }`}
                      >
                        {t.name || "이름없음"}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 강도 + 핀 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-sub">
              <input type="checkbox" checked={mustAck} onChange={(e) => setMustAck(e.target.checked)} disabled={posting} className="h-4 w-4 accent-fuchsia-500" />
              필수확인 (앱 열 때 확인 요구)
              <span className="text-[10px] text-muted">· 드물게 · 꼭 봐야 할 것만</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-sub">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} disabled={posting} className="h-4 w-4 accent-fuchsia-500" />
              고정(핀)
            </label>
          </div>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600">{err}</div>}

          <div className="flex gap-2">
            <Button variant="primary" accent="owner" size="md" onClick={post} disabled={posting} className="flex-1 gap-2">
              <Megaphone className="h-4 w-4" strokeWidth={2.5} /> {posting ? "게시 중…" : editingId ? "수정 저장" : "게시"}
            </Button>
            {editingId && (
              <Button variant="ghost" accent="owner" size="md" onClick={resetForm} disabled={posting}>
                <X className="h-4 w-4" /> 취소
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 목록 */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">게시한 공지</div>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted">아직 게시한 공지가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((a) => {
              const n = readCount.get(a.id) || 0;
              const targeted = Array.isArray(a.target_trainer_ids) && a.target_trainer_ids.length;
              const m = targeted ? a.target_trainer_ids.length : trainers.filter((t) => t.id !== a.author_id).length;
              return (
                <li key={a.id} className="rounded-xl border border-line bg-elevate p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.pinned && <Pin className="h-3.5 w-3.5 text-fuchsia-700" />}
                        <span className="text-sm font-semibold text-ink">{a.title}</span>
                        {a.must_ack ? (
                          <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">필수확인</span>
                        ) : (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">일반</span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-sub">{a.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {targeted ? (
                          a.target_trainer_ids.map((tid) => (
                            <span key={tid} className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{nameOf(tid)}</span>
                          ))
                        ) : (
                          <span className="flex items-center gap-1 rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">
                            <Users className="h-3 w-3" /> 전체
                          </span>
                        )}
                        <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">{n}/{m} 읽음</span>
                      </div>
                    </div>
                    {confirmId === a.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => remove(a)} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-500/20">삭제?</button>
                        <button onClick={() => setConfirmId(null)} className="rounded-md border border-line px-2 py-1 text-[10px] font-medium text-sub transition hover:text-ink">취소</button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => togglePin(a)} className={`transition ${a.pinned ? "text-fuchsia-700" : "text-muted hover:text-fuchsia-700"}`} aria-label="핀 토글">
                          <Pin className="h-4 w-4" />
                        </button>
                        <button onClick={() => startEdit(a)} className="text-muted transition hover:text-fuchsia-700" aria-label="수정">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmId(a.id)} className="text-muted transition hover:text-rose-600" aria-label="삭제">
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
      </section>
    </div>
  );
}
