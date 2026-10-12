"use client";

// /reset-password — 비밀번호 찾기 메일의 링크가 여는 화면(2026-10-12).
//   메일 링크를 누르면 supabase-js가 주소의 열쇠로 '복구 세션'을 만든다(detectSessionInUrl) → 새 비밀번호를 정하면 앱으로.
//   링크가 만료됐거나 이미 썼으면(주소에 error_code · 세션 없음) 다시 요청하라고 안내한다.
//   AuthGate는 이 주소를 게이트 없이 통과시킨다(결제벽 · 읽기 전용이어도 비밀번호는 바꿀 수 있게).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PasswordChange from "@/components/views/PasswordChange";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState("checking");   // checking | ready | expired

  useEffect(() => {
    if (!supabase) { setState("expired"); return undefined; } // eslint-disable-line react-hooks/set-state-in-effect
    let alive = true;
    const hash = typeof window !== "undefined" ? window.location.hash + window.location.search : "";
    if (/error_code=|error=access_denied/.test(hash)) { setState("expired"); return undefined; }
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (!alive) return;
      if (s && (e === "PASSWORD_RECOVERY" || e === "SIGNED_IN" || e === "INITIAL_SESSION")) setState("ready");
    });
    supabase.auth.getSession().then(({ data }) => { if (alive && data.session) setState("ready"); });
    // 주소의 열쇠를 읽는 데 잠깐 걸린다 — 8초 안에 세션이 안 생기면 만료로 본다
    const t = setTimeout(() => { if (alive) setState((v) => (v === "checking" ? "expired" : v)); }, 8000);
    return () => { alive = false; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  if (state === "ready") {
    return (
      <PasswordChange
        forced
        title="새 비밀번호 정하기"
        desc="새 비밀번호를 정하면 바로 앱으로 들어가요."
        onDone={() => router.replace("/")}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        {state === "checking" ? (
          <p className="m-0 text-sm text-muted">링크를 확인하는 중…</p>
        ) : (
          <>
            <p className="m-0 text-[16px] font-bold text-ink">링크가 만료됐거나 이미 쓴 링크예요</p>
            <p className="m-0 mt-2 text-[13px] leading-relaxed text-sub">비밀번호 찾기 메일의 링크는 한 번만, 1시간 안에만 쓸 수 있어요. 다시 요청해 주세요.</p>
            <a href="/login?forgot=1" className="mt-4 flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-bold text-white">비밀번호 찾기 다시 하기</a>
          </>
        )}
      </div>
    </div>
  );
}
