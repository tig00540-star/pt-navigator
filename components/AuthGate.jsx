"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PasswordChange from "@/components/views/PasswordChange";
import Button from "@/components/ui/Button";
import Wordmark, { Slogan } from "@/components/ui/Wordmark";

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);   // 초기 세션 조회 완료 여부
  const [session, setSession] = useState(null);
  // 층1 구독 게이트 — my_account_status() 결과(null=조회 전/중). acctReady=조회 완료 여부.
  const [acct, setAcct] = useState(null);
  const [acctReady, setAcctReady] = useState(false);

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
    }).catch(() => { if (alive) { setSession(null); setReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 로그인되면 구독 상태 조회(층1 잠금 분기). 데모/미로그인은 스킵. setState는 async 안에서(set-state-in-effect 회피).
  useEffect(() => {
    if (!supabase || !session) return;
    let alive = true;
    (async () => {
      setAcctReady(false);
      try {
        const { data, error } = await supabase.rpc("my_account_status");
        if (!alive) return;
        // 에러/0행 → 계정 미확인으로 보고 잠금(접근 차단이 안전측). 정상 행이면 그 상태 사용.
        setAcct(error ? { has_account: false, access: false } : (data?.[0] ?? { has_account: false, access: false }));
      } catch {
        if (alive) setAcct({ has_account: false, access: false }); // 에러 → 잠금(안전측)
      } finally {
        if (alive) setAcctReady(true); // 무한 스피너 방지
      }
    })();
    return () => { alive = false; };
  }, [session]);

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
    // 층1 게이트는 실DB 로그인 + 비번변경 아님일 때만 판정(데모는 통과).
    const gating = Boolean(supabase && session) && !mustChange;

    let inner;
    if (mustChange) {
      inner = <PasswordChange forced onDone={refreshSession} />;
    } else if (gating && !acctReady) {
      // 구독 상태 조회 중 — 깜빡임 방지 스피너.
      inner = (
        <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
          불러오는 중…
        </div>
      );
    } else if (gating && acct && acct.access === false) {
      inner = <Paywall status={acct} onSignOut={signOut} />;
    } else {
      inner = children;
    }

    return (
      <>
        {/* 로그아웃은 설정 → 내 정보로 이관(SettingsView). 전 화면 우하단 플로팅은 스케줄 그리드·할일 카드 등을
            상시 가려서 제거함. signOut은 Paywall이 계속 쓰므로 정의는 유지. */}
        {inner}
      </>
    );
  }

  // 미로그인 → 로그인 폼
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/icons/icon-192.png" alt="오직 트레이너" width={56} height={56} priority className="mb-3 h-14 w-14 rounded-2xl shadow-sm" />
          <Wordmark className="text-xl font-extrabold" />
          <Slogan className="mt-1.5 text-[10px] font-semibold" />
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

// 층1 결제벽 — 미활성/만료/계정미확인 계정. 베타는 '문의' CTA(결제 버튼은 B4). 기존 토큰 재사용.
function Paywall({ status, onSignOut }) {
  const noAccount = status?.has_account === false;
  const expired = status?.is_expired === true;
  const title = noAccount ? "계정을 준비 중이에요" : expired ? "무료 체험이 종료됐어요" : "구독이 필요해요";
  const desc = noAccount
    ? "계정 정보를 불러오지 못했어요. 잠시 후 다시 로그인해 주세요."
    : expired
    ? "무료 체험 기간이 끝났어요. 계속 이용하려면 담당자에게 문의해 이용을 연장해 주세요."
    : "아직 이용이 활성화되지 않았어요. 담당자에게 문의해 이용을 시작해 주세요.";
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <div className="mb-4 flex flex-col items-center">
          <Image src="/icons/icon-192.png" alt="오직 트레이너" width={56} height={56} priority className="mb-3 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="text-lg font-semibold text-ink">{title}</div>
        </div>
        <p className="text-sm leading-relaxed text-muted">{desc}</p>
        <div className="mt-5">
          <Button variant="primary" size="md" fullWidth onClick={onSignOut}>다시 로그인</Button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          문의는 담당자에게 연락 주세요. 결제 연동은 준비 중입니다.
        </p>
      </div>
    </div>
  );
}
