"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PasswordChange from "@/components/views/PasswordChange";
import Button from "@/components/ui/Button";

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);   // 초기 세션 조회 완료 여부
  const [session, setSession] = useState(null);

  // 로그인 폼 로컬 상태
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pathname = usePathname(); // /signup 등 공개 경로 판정

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

  // 세션 재조회 — forced 비번 변경 완료(onDone) 후 갱신된 user_metadata 반영 → 게이트 오픈.
  const refreshSession = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
  };

  // 회원 라우트(/m)는 자체 인증(끝4 → 세션) — 트레이너 게이트를 완전 우회.
  // 훅 선언 뒤·ready 판정 앞(Rules of Hooks). 로딩·로그인폼·강제 비번변경과 무관하게 children만.
  const isMemberRoute = pathname === "/m" || pathname.startsWith("/m/");
  if (isMemberRoute) return <>{children}</>;

  // 초기 세션 조회 전 — 깜빡임 방지용 최소 화면
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        불러오는 중…
      </div>
    );
  }

  // /signup 등 공개 경로는 로그아웃 상태에서도 통과(게이트 우회). 로그인 상태면 아래 앱 렌더로 흐름.
  const isPublicRoute = pathname === "/signup";
  if (isPublicRoute && !session) return <>{children}</>;

  // 데모 모드(supabase null) or 로그인됨 → 앱 렌더
  if (!supabase || session) {
    // 임시비번 최초 로그인 플래그면 강제 비번 변경(신규 트레이너만 — 기존은 플래그 없음).
    const mustChange = Boolean(supabase && session && session.user?.user_metadata?.must_change_pw === true);
    return (
      <>
        {supabase && session && (
          <div className="fixed bottom-20 right-4 z-40">
            <button
              onClick={signOut}
              className="text-[11px] px-2 py-1 rounded-md border border-line bg-card/80 text-sub shadow-sm hover:text-ink"
            >
              로그아웃
            </button>
          </div>
        )}
        {mustChange ? <PasswordChange forced onDone={refreshSession} /> : children}
      </>
    );
  }

  // 미로그인 → 로그인 폼
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/icons/icon-192.png" alt="오직 트레이너" width={56} height={56} priority className="mb-3 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="text-lg font-semibold text-ink">오직 트레이너</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-muted">Only for Trainer</div>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-elevate border border-line px-3 py-2.5 text-sm text-ink placeholder-muted outline-none focus:border-primary"
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
            className="w-full rounded-lg bg-elevate border border-line px-3 py-2.5 text-sm text-ink placeholder-muted outline-none focus:border-primary"
          />
          {err && <div className="text-xs text-red-600">{err}</div>}
          <Button variant="primary" size="md" fullWidth onClick={signIn} disabled={busy}>
            {busy ? "로그인 중…" : "로그인"}
          </Button>
        </div>
        <div className="mt-4 text-center text-[11px] text-muted">
          트레이너는 원장 초대로 참여합니다 ·{" "}
          <a href="/signup" className="font-semibold text-primary-strong hover:underline">새 계정 만들기</a>
        </div>
      </div>
    </div>
  );
}
