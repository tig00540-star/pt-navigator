"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);   // 초기 세션 조회 완료 여부
  const [session, setSession] = useState(null);

  // 로그인 폼 로컬 상태
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // 키 없으면(데모 모드) 게이트를 건너뛰고 그대로 앱을 보여준다(개발 편의).
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });
    setBusy(false);
    if (error) setErr("로그인 실패 — 이메일/비밀번호를 확인하세요.");
    // 성공 시 onAuthStateChange가 session을 채워 자동 전환.
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  // 초기 세션 조회 전 — 깜빡임 방지용 최소 화면
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">
        불러오는 중…
      </div>
    );
  }

  // 데모 모드(supabase null) or 로그인됨 → 앱 렌더
  if (!supabase || session) {
    return (
      <>
        {supabase && session && (
          <div className="fixed bottom-4 right-4 z-40">
            <button
              onClick={signOut}
              className="text-[11px] px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200"
            >
              로그아웃
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  // 미로그인 → 로그인 폼
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold text-zinc-100">PT 내비게이터</div>
          <div className="mt-1 text-sm text-zinc-500">트레이너 로그인</div>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") signIn();
            }}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
          />
          {err && <div className="text-xs text-red-400">{err}</div>}
          <button
            onClick={signIn}
            disabled={busy}
            className="w-full rounded-lg bg-lime-500 text-zinc-950 font-medium py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </div>
        <div className="mt-4 text-center text-[11px] text-zinc-600">
          계정은 관리자 초대로 발급됩니다.
        </div>
      </div>
    </div>
  );
}
