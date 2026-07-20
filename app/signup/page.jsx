"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

export default function SignupPage() {
  const router = useRouter();
  const [type, setType] = useState("solo");     // 'solo' | 'center'
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [displayName, setDisplayName] = useState("");   // 내 이름(트레이너/원장 실명)
  const [accountName, setAccountName] = useState("");   // 센터명(center만)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);              // 이메일 인증 대기 화면

  const submit = async () => {
    if (busy) return;
    if (!supabase) { setErr("Supabase 미설정 — 가입은 키 설정 후 가능합니다."); return; }
    if (!email.trim() || !pw || !displayName.trim()) { setErr("이메일·비밀번호·이름은 필수입니다."); return; }
    if (type === "center" && !accountName.trim()) { setErr("센터명을 입력하세요."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: {
        data: {
          account_type: type,                                  // 트리거가 읽어 account 생성
          display_name: displayName.trim(),
          account_name: type === "center" ? accountName.trim() : displayName.trim(),
        },
      },
    });
    setBusy(false);
    if (error) { setErr("가입 실패 — " + (error.message || "다시 시도하세요")); return; }
    if (data?.session) { router.replace("/"); return; }        // 이메일 인증 OFF → 즉시 로그인 → 앱으로
    setSent(true);                                             // 인증 ON → 메일 확인 안내
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-ink">메일함을 확인하세요</div>
          <p className="mt-2 text-sm text-muted">{email}로 보낸 확인 링크를 누르면 가입이 완료됩니다.</p>
          <Link href="/" className="mt-4 inline-block text-xs font-semibold text-primary-strong hover:underline">로그인으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-5 text-center">
          <div className="text-lg font-semibold text-ink">새 계정 만들기</div>
          <div className="mt-1 text-sm text-muted">개인 트레이너 또는 센터 원장으로 시작</div>
        </div>

        {/* 유형 선택 */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[{ k: "solo", l: "개인 트레이너" }, { k: "center", l: "센터 원장" }].map((o) => (
            <button key={o.k} onClick={() => setType(o.k)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                type === o.k ? "border border-primary/30 bg-primary-soft text-primary-strong" : "border border-line bg-elevate text-muted hover:text-ink"}`}>
              {o.l}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input type="email" inputMode="email" autoComplete="email" placeholder="이메일"
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" autoComplete="new-password" placeholder="비밀번호"
            value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
          <input type="text" placeholder="이름(실명)"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
          {type === "center" && (
            <input type="text" placeholder="센터명"
              value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
          <Button variant="primary" size="md" fullWidth onClick={submit} disabled={busy}>
            {busy ? "가입 중…" : "가입하기"}
          </Button>
        </div>

        <div className="mt-4 text-center text-[11px] text-muted">
          이미 계정이 있으신가요? <Link href="/" className="font-semibold text-primary-strong hover:underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}
