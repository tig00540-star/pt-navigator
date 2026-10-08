"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { inputClsOwner as inputCls } from "@/components/ui/Field";

// seatLimit·seatUsed는 안내용 — 진짜 관문은 서버(create-trainer)가 409로 막는다.
export default function AddTrainerForm({ seatLimit = null, seatUsed = 0, onCreated }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const full = seatLimit != null && seatUsed >= seatLimit;
  const fullMsg = seatLimit === 0
    ? "개인 요금제는 트레이너를 추가할 수 없어요. 센터 요금제로 바꾸면 트레이너 3명까지 함께 쓸 수 있어요."
    : `트레이너 자리 ${seatLimit}개를 모두 쓰고 있어요. 설정 › 구독 관리에서 1명 더할 수 있어요.`;
  const submit = async () => {
    if (!supabase || busy) return;
    if (!email.trim() || !name.trim()) { setErr("이메일과 이름을 입력해 주세요."); return; }
    if (full) { setErr(fullMsg); return; }
    setBusy(true); setErr(""); setResult(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/create-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token || ""}` },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "트레이너를 추가하지 못했어요. 다시 시도해 주세요."); return; }
      setResult({ email: d.email, pw: d.tempPassword });
      onCreated?.({ id: d.id, name: name.trim(), role: "trainer", active: true }); // 좌석 표시 즉시 반영
      setEmail(""); setName("");
    } catch (e) {
      console.error("트레이너 추가 실패", e);
      setErr("트레이너를 추가하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex items-center gap-2 text-[12px] font-semibold tracking-label-ko text-muted">
        <UserPlus className="h-3.5 w-3.5" /> 트레이너 추가
        {seatLimit != null && seatLimit > 0 && (
          <span className={`ml-auto font-mono ${full ? "text-danger-text" : "text-muted"}`}>
            좌석 {seatUsed} / {seatLimit}
          </span>
        )}
      </div>
      {full && <p className="mt-2 text-[12px] leading-relaxed text-sub">{fullMsg}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="text" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <Button variant="primary" accent="owner" size="md" onClick={submit} disabled={busy || full}>
          {busy ? "추가 중…" : "추가"}
        </Button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
      {result && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">
          <div className="font-semibold text-primary-strong">계정을 만들었어요. 이 트레이너에게 전달해 주세요</div>
          <div className="mt-1 text-ink">이메일: <span className="font-mono">{result.email}</span></div>
          <div className="text-ink">임시 비번: <span className="font-mono text-primary-strong">{result.pw}</span></div>
          <div className="mt-1 text-[12px] text-muted">⚠️ 이 화면에서만 보여요. 트레이너는 로그인 후 이 비번으로 접속해요.</div>
        </div>
      )}
    </Card>
  );
}
