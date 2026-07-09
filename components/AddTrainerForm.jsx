"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function AddTrainerForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const inputCls = "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-fuchsia-500/50";

  const submit = async () => {
    if (!supabase || busy) return;
    if (!email.trim() || !name.trim()) { setErr("이메일과 이름을 입력하세요."); return; }
    setBusy(true); setErr(""); setResult(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/create-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token || ""}` },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "추가 실패"); return; }
      setResult({ email: d.email, pw: d.tempPassword });
      setEmail(""); setName("");
    } catch (e) {
      setErr("오류: " + (e?.message || "unknown"));
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <UserPlus className="h-3.5 w-3.5" /> 트레이너 추가
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="text" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <button onClick={submit} disabled={busy}
          className="rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "추가 중…" : "추가"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      {result && (
        <div className="mt-3 rounded-lg border border-lime-500/30 bg-lime-500/5 p-3 text-sm">
          <div className="font-semibold text-lime-400">계정 생성 완료 — 이 트레이너에게 전달</div>
          <div className="mt-1 text-zinc-200">이메일: <span className="font-mono">{result.email}</span></div>
          <div className="text-zinc-200">임시 비번: <span className="font-mono text-lime-300">{result.pw}</span></div>
          <div className="mt-1 text-[11px] text-zinc-500">⚠️ 이 화면에서만 보여요. 트레이너는 로그인 후 이 비번으로 접속합니다.</div>
        </div>
      )}
    </div>
  );
}
