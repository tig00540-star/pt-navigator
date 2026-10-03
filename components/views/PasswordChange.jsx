"use client";

/* =========================================================================
   계정 · 비밀번호 변경 — 원장이 발급한 임시비번으로 로그인한 트레이너가 새 비번으로.
   Supabase Auth updateUser(로그인 세션이 인증 = 현재 비번 재입력 불필요 · 파일럿 단순화).
   자기완결 · 데모 가드 · useToast (PtPricingSettings 패턴). SMTP/메일 불필요.
   ========================================================================= */

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function PasswordChange({ forced = false, onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();


  const submit = async () => {
    if (saving) return;
    if (!supabase) return showToast("데모 모드라 쓸 수 없어요");
    if (pw.length < 6) return showToast("비밀번호는 6자 이상이어야 해요");
    if (pw !== pw2) return showToast("확인이 일치하지 않아요");
    setSaving(true);
    // 비번 교체 + 강제 플래그 해제를 한 번에(자율 변경 때도 무해 — 이미 false면 그대로).
    try {
      const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_pw: false } });
      if (error) { showToast("변경하지 못했어요: " + (error.message || "다시 시도")); setSaving(false); return; }
      setPw(""); setPw2("");
      showToast("비밀번호가 변경되었어요");
      setSaving(false);
    } catch {
      showToast("변경하지 못했어요. 다시 시도해 주세요.");
      return;
    } finally {
      setSaving(false);
    }
    if (onDone) onDone(); // forced 게이트 → AuthGate가 세션 재조회해 앱 오픈
  };

  // 폼 본문 — forced 전체화면·자율 <details> 두 레이아웃이 공유.
  const FORM_BODY = (
    <>
      <div className="mt-3 space-y-3">
        <Input
          id="pw-new"
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          disabled={saving || !supabase}
          placeholder="6자 이상"
          /* 입력 중 즉시 검증하지 않는다 — 6자 미만이라고 타이핑 도중 빨갛게 물들면
             아직 다 안 쳤을 뿐인데 틀렸다고 혼내는 꼴이다. 제출 시 토스트로 알린다. */
          hint="6자 이상"
        />
        <Input
          id="pw-confirm"
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          disabled={saving || !supabase}
          placeholder="다시 입력"
          error={pw2 && pw !== pw2 ? "확인이 일치하지 않아요" : undefined}
        />
        <Button variant="primary" size="md" fullWidth onClick={submit} disabled={saving || !supabase} className="gap-2">
          <KeyRound className="h-4 w-4" strokeWidth={2.5} /> {saving ? "변경 중…" : "비밀번호 변경"}
        </Button>
        <p className="text-[12px] leading-relaxed text-muted">
          {supabase
            ? "임시 비밀번호로 로그인한 경우 여기서 새 비밀번호로 바꾸세요. (6자 이상)"
            : "데모 모드예요. Supabase 키를 설정하면 비밀번호를 바꿀 수 있어요."}
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
          <SectionTitle icon={KeyRound}>임시 비밀번호 변경</SectionTitle>
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
        <SectionTitle icon={KeyRound}>비밀번호 변경</SectionTitle>
      </summary>
      {FORM_BODY}
    </details>
  );
}
