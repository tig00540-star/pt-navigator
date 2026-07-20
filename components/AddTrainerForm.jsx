"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function AddTrainerForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-fuchsia-500/50";

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
    <Card>
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-label-ko text-muted">
        <UserPlus className="h-3.5 w-3.5" /> 트레이너 추가
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="text" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <Button variant="primary" accent="owner" size="md" onClick={submit} disabled={busy}>
          {busy ? "추가 중…" : "추가"}
        </Button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
      {result && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">
          <div className="font-semibold text-primary-strong">계정 생성 완료 — 이 트레이너에게 전달</div>
          <div className="mt-1 text-ink">이메일: <span className="font-mono">{result.email}</span></div>
          <div className="text-ink">임시 비번: <span className="font-mono text-primary-strong">{result.pw}</span></div>
          <div className="mt-1 text-[11px] text-muted">⚠️ 이 화면에서만 보여요. 트레이너는 로그인 후 이 비번으로 접속합니다.</div>
        </div>
      )}
    </Card>
  );
}
