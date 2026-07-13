"use client";
/* =========================================================================
   기능2 할일 C2 — 수동 메모(trainer_todo) CRUD. 트레이너 개인 스코프(RLS trainer_id=auth.uid()).
   추가·체크(done 토글)·삭제. 정책 없으면 update/delete가 조용히 실패 → .select()로 data.length 확인.
   데모(키 없음)는 로컬 상태만. 정렬: 미완료 먼저, 그 안에서 최신순(완료는 아래로).
   ========================================================================= */
import { useEffect, useState } from "react";
import { ListTodo, Plus, Check, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import EmptyState from "@/components/ui/EmptyState";

export default function TodoManual() {
  const [todos, setTodos] = useState([]);
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    if (!supabase) return; // 데모: 로컬만
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("trainer_todo")
        .select("id, body, done, due_date, created_at, done_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setTodos(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const add = async () => {
    const b = body.trim();
    if (!b || saving) return;
    setErr("");
    if (!supabase) {
      setTodos((t) => [{ id: `demo-${Date.now()}`, body: b, done: false, due_date: due || null, created_at: new Date().toISOString() }, ...t]);
      setBody(""); setDue(""); return;
    }
    setSaving(true);
    const payload = { body: b };
    if (due) payload.due_date = due;
    const { data, error } = await supabase.from("trainer_todo").insert(payload).select();
    setSaving(false);
    if (error || !data || data.length === 0) { setErr("추가 실패 — 저장 안 됨"); return; }
    setTodos((t) => [data[0], ...t]);
    setBody(""); setDue("");
  };

  const toggle = async (todo) => {
    const nextDone = !todo.done;
    if (!supabase) {
      setTodos((t) => t.map((x) => (x.id === todo.id ? { ...x, done: nextDone } : x)));
      return;
    }
    const patch = { done: nextDone, done_at: nextDone ? new Date().toISOString() : null };
    const { data, error } = await supabase.from("trainer_todo").update(patch).eq("id", todo.id).select();
    if (error || !data || data.length === 0) { setErr("반영 실패 — 정책 확인"); return; }
    setTodos((t) => t.map((x) => (x.id === todo.id ? data[0] : x)));
  };

  const remove = async (todo) => {
    setConfirmId(null);
    if (!supabase) { setTodos((t) => t.filter((x) => x.id !== todo.id)); return; }
    const { data, error } = await supabase.from("trainer_todo").delete().eq("id", todo.id).select();
    if (error || !data || data.length === 0) { setErr("삭제 실패 — 정책 확인"); return; }
    setTodos((t) => t.filter((x) => x.id !== todo.id));
  };

  const sorted = [...todos].sort((a, b) =>
    a.done === b.done ? (a.created_at < b.created_at ? 1 : -1) : a.done ? 1 : -1
  );
  const openCount = todos.filter((t) => !t.done).length;

  return (
    <section className="mb-4 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-primary-strong" />
        <h3 className="text-sm font-semibold text-ink">메모 할일</h3>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">{openCount}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="할 일 적기 (예: 3시 회원 인바디 재측정)"
          className="min-w-[180px] flex-1 rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-line bg-elevate px-2 py-2 text-xs text-sub outline-none focus:border-primary"
          aria-label="마감일(선택)"
        />
        <button
          onClick={add}
          disabled={saving || !body.trim()}
          className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-3 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> 추가
        </button>
      </div>

      {err && <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600">{err}</div>}

      {sorted.length === 0 ? (
        <EmptyState className="py-2 text-xs">적어둔 할 일이 없어요.</EmptyState>
      ) : (
        <div className="grid gap-1.5">
          {sorted.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line bg-elevate px-3 py-2">
              <button
                onClick={() => toggle(t)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${t.done ? "border-primary bg-primary-soft text-primary-strong" : "border-line bg-card text-transparent hover:border-primary"}`}
                aria-label={t.done ? "완료 취소" : "완료"}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <span className={`text-sm ${t.done ? "text-muted line-through" : "text-ink"}`}>{t.body}</span>
                {t.due_date && (
                  <span className="ml-2 rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">~{t.due_date}</span>
                )}
              </div>
              {confirmId === t.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => remove(t)} className="rounded px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-500/10">삭제</button>
                  <button onClick={() => setConfirmId(null)} className="rounded px-1.5 py-1 text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(t.id)} className="shrink-0 rounded p-1 text-muted transition hover:text-red-600" aria-label="삭제">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
