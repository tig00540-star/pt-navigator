"use client";

/* =========================================================================
   계정 · 비밀번호 변경 — 원장이 발급한 임시비번으로 로그인한 트레이너가 새 비번으로.
   Supabase Auth updateUser(로그인 세션이 인증 = 현재 비번 재입력 불필요 · 파일럿 단순화).
   자기완결 · 데모 가드 · useToast (PtPricingSettings 패턴). SMTP/메일 불필요.
   ========================================================================= */

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function PasswordChange() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  const submit = async () => {
    if (saving) return;
    if (!supabase) return showToast("데모 모드 — 키 설정 시 사용 가능");
    if (pw.length < 6) return showToast("비밀번호는 6자 이상이어야 해요");
    if (pw !== pw2) return showToast("확인이 일치하지 않아요");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw }); // 로그인 세션이 인증 = 현재 비번 재입력 불필요
    if (error) { showToast("변경 실패 — " + (error.message || "다시 시도")); setSaving(false); return; }
    setPw(""); setPw2("");
    showToast("비밀번호가 변경되었어요");
    setSaving(false);
  };

  return (
    <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <summary className="cursor-pointer list-none">
        <Eyebrow icon={KeyRound}>계정 · 비밀번호 변경</Eyebrow>
      </summary>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">새 비밀번호</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={saving || !supabase} placeholder="6자 이상" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">새 비밀번호 확인</span>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={saving || !supabase} placeholder="다시 입력" className={inputCls} />
        </label>
        <button
          onClick={submit}
          disabled={saving || !supabase}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" strokeWidth={2.5} /> {saving ? "변경 중…" : "비밀번호 변경"}
        </button>
        <p className="text-[10px] leading-relaxed text-muted">
          {supabase
            ? "임시 비밀번호로 로그인한 경우 여기서 새 비밀번호로 바꾸세요. (6자 이상)"
            : "데모 모드 — Supabase 키를 설정하면 비밀번호 변경이 가능합니다."}
        </p>
      </div>
      <Toast message={toast} />
    </details>
  );
}
