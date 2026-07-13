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
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function PasswordChange({ forced = false, onDone }) {
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
    // 비번 교체 + 강제 플래그 해제를 한 번에(자율 변경 때도 무해 — 이미 false면 그대로).
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_pw: false } });
    if (error) { showToast("변경 실패 — " + (error.message || "다시 시도")); setSaving(false); return; }
    setPw(""); setPw2("");
    showToast("비밀번호가 변경되었어요");
    setSaving(false);
    if (onDone) onDone(); // forced 게이트 → AuthGate가 세션 재조회해 앱 오픈
  };

  // 폼 본문 — forced 전체화면·자율 <details> 두 레이아웃이 공유.
  const FORM_BODY = (
    <>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">새 비밀번호</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={saving || !supabase} placeholder="6자 이상" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">새 비밀번호 확인</span>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={saving || !supabase} placeholder="다시 입력" className={inputCls} />
        </label>
        <Button variant="primary" size="md" fullWidth onClick={submit} disabled={saving || !supabase} className="gap-2">
          <KeyRound className="h-4 w-4" strokeWidth={2.5} /> {saving ? "변경 중…" : "비밀번호 변경"}
        </Button>
        <p className="text-[10px] leading-relaxed text-muted">
          {supabase
            ? "임시 비밀번호로 로그인한 경우 여기서 새 비밀번호로 바꾸세요. (6자 이상)"
            : "데모 모드 — Supabase 키를 설정하면 비밀번호 변경이 가능합니다."}
        </p>
      </div>
      <Toast message={toast} />
    </>
  );

  // forced — 임시비번 최초 로그인 강제 전체화면(접기 없음).
  if (forced) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
          <Eyebrow icon={KeyRound}>임시 비밀번호 변경</Eyebrow>
          <p className="mt-1 text-[12px] text-muted">보안을 위해 임시 비밀번호를 새 비밀번호로 바꿔야 계속할 수 있어요.</p>
          {FORM_BODY}
        </div>
      </div>
    );
  }

  // 자율 변경(기존) — 내 실적 탭 접이식 카드.
  return (
    <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <summary className="cursor-pointer list-none">
        <Eyebrow icon={KeyRound}>계정 · 비밀번호 변경</Eyebrow>
      </summary>
      {FORM_BODY}
    </details>
  );
}
