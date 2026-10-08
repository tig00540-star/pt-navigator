"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PasswordChange from "@/components/views/PasswordChange";
import Button from "@/components/ui/Button";
import Wordmark, { Slogan } from "@/components/ui/Wordmark";
import { PLANS, planAmount, SEAT_AI } from "@/lib/plans";
import LandingPage from "@/app/lp/page";

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);   // 초기 세션 조회 완료 여부
  const [session, setSession] = useState(null);
  // 층1 구독 게이트 — my_account_status() 결과(null=조회 전/중). acctReady=조회 완료 여부.
  const [acct, setAcct] = useState(null);
  const [acctReady, setAcctReady] = useState(false);
  // 초기 세션 조회가 오래 걸릴 때(응답 없음) 표시 — 무한 스피너 방지용.
  const [stalled, setStalled] = useState(false);
  // 읽기 전용 기간에 '카드 등록하고 다시 쓰기'를 누르면 결제벽을 연다(돌아가기로 닫힘)
  const [payOpen, setPayOpen] = useState(false);

  // 로그인 폼 로컬 상태
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pathname = usePathname(); // /signup 등 공개 경로 판정
  const router = useRouter();

  useEffect(() => {
    // 키 없으면(데모 모드) 게이트를 건너뛰고 그대로 앱을 보여준다(개발 편의).
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    let alive = true;

    /* ⚠️ 고착 방어 — getSession()이 '거부'되면 아래 catch가 받지만,
       '응답이 아예 안 오는' 경우(오프라인·네트워크 정체·토큰 갱신 실패)는 아무도 안 받는다.
       그러면 ready가 영영 false라 앱 전체가 "불러오는 중…"에 영구 정지한다.
       현장에서는 "앱이 안 켜져요"로 나타나고 원인 파악이 어렵다.
       → 8초 뒤에도 안 끝나면 '지연' 상태로 전환해 사용자에게 상황과 재시도를 준다.
       자동으로 로그아웃 취급하지 않는다 — 느린 네트워크가 늦게 성공할 수 있고,
       그때는 아래 then이 정상적으로 ready를 세운다. */
    const stallTimer = setTimeout(() => { if (alive) setStalled(true); }, 8000);

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      clearTimeout(stallTimer);
      setSession(data.session ?? null);
      setReady(true);
    }).catch(() => {
      if (!alive) return;
      clearTimeout(stallTimer);
      setSession(null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => {
      alive = false;
      clearTimeout(stallTimer);
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

  // 로그인 상태로 /login 에 있으면 앱 루트로 정리(로그인 직후 착지·직접 진입 모두).
  useEffect(() => {
    if (supabase && session && pathname === "/login") router.replace("/");
  }, [session, pathname, router]);

  const signIn = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });
    setBusy(false);
    if (error) setErr("로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.");
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

  // 공개 마케팅 랜딩(/lp 트레이너용 · /center 센터 대표용)·설치안내(/download)도 게이트를 완전 우회 — 누구나 본다.
  // 광고·공유·토스 심사 도착지라 세션 조회를 기다리지 않고 즉시 그린다(스피너 없이 빠른 페인트).
  const isPublicMarketing =
    pathname === "/lp" || pathname === "/center" || pathname === "/download" || pathname.startsWith("/legal")
    || pathname.startsWith("/join/")   // OT 신청서(QR · 링크 · 로그인 없음 · 2026-10-06)
    || pathname === "/try"               // 기능 체험(로그인 없음 · 이 화면 안에서만 움직임 · 2026-10-06)
    || pathname === "/check";            // 1분 진단(로그인 없음 · 답은 화면 안에서만 · 2026-10-08)
  if (isPublicMarketing) return <>{children}</>;

  // 초기 세션 조회 전 — 깜빡임 방지용 최소 화면
  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <span className="text-sm text-muted">불러오는 중…</span>
        {stalled && (
          <>
            <p className="max-w-xs text-[13px] leading-relaxed text-sub">
              네트워크가 느리거나 연결이 끊긴 것 같아요. 잠시 뒤에도 그대로면 다시 시도해 주세요.
            </p>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
          </>
        )}
      </div>
    );
  }

  // /signup 등 공개 경로는 로그아웃 상태에서도 통과(게이트 우회). 로그인 상태면 아래 앱 렌더로 흐름.
  const isPublicRoute = pathname === "/signup";
  if (isPublicRoute && !session) return <>{children}</>;

  // 결제 리다이렉트 착지(/billing/*) — 로그인 상태면 Paywall 대신 결제 처리 화면을 렌더
  // (착지 후 confirm이 계정을 활성화하므로, 잠긴 상태에서도 이 경로는 통과시켜야 함).
  if (pathname.startsWith("/billing") && session) return <>{children}</>;
  // 센터 합류 초대(/join-center/*) — 개인 구독이 끝나 잠겼어도 합류는 할 수 있어야 한다(2026-10-07)
  if (pathname.startsWith("/join-center/") && session) return <>{children}</>;
  // 개인 계정으로 이어 쓰기(/leave-center) — 센터 구독이 끝나 잠긴 트레이너도 열 수 있어야 한다(2026-10-07)
  if (pathname === "/leave-center" && session) return <>{children}</>;

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
    } else if (gating && acct && acct.access === false && acct.mode === "read_only" && !payOpen) {
      // 기간이 끝난 뒤 30일 — 볼 수만(2026-10-07 · 쓰기는 DB가 막음) · 위에 띠 · 내려받기 · 카드 다시 등록
      inner = <ReadOnlyShell status={acct} uid={session.user?.id} onPay={() => setPayOpen(true)}>{children}</ReadOnlyShell>;
    } else if (gating && acct && acct.access === false) {
      inner = <Paywall status={acct} onSignOut={signOut} uid={session.user?.id} onBack={acct.mode === "read_only" ? () => setPayOpen(false) : null} />;
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

  // 로그아웃 방문자가 루트("/")로 오면 공개 랜딩(홈)을 그대로 노출 — URL "/" 유지.
  // 광고·명함·토스 심사가 도메인만 쳐도 서비스 소개가 보이게. 앱은 로그인 필요라
  // 랜딩의 "앱 열기"는 /login 으로 → 로그인 후 앱 루트로 자동 복귀(위 effect).
  if (pathname === "/") return <LandingPage />;

  // 미로그인 → 로그인 폼(/login·/admin 등 보호 경로)
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
          트레이너는 대표 초대로 참여합니다 ·{" "}
          <a href="/signup" className="font-semibold text-primary-strong hover:underline">새 계정 만들기</a>
        </div>
      </div>
    </div>
  );
}

// 층1 결제벽 — 미활성/만료 계정. 토스 카드등록(빌링) → 바로 첫 달 결제 · 첫 결제 7일 안 전액 환불(2026-10-07 · 체험 없앰). 대표만 결제 가능.
// ⚠️ 실제 활성화는 /billing/success 착지 → /api/billing/confirm(service_role)에서 일어남.
function Paywall({ status, onSignOut, uid, onBack = null }) {
  const noAccount = status?.has_account === false;
  const expired = status?.is_expired === true;
  const title = noAccount ? "계정을 준비 중이에요" : expired ? "이용 기간이 끝났어요" : "구독하고 시작하세요";
  const desc = noAccount
    ? "계정 정보를 불러오지 못했어요. 잠시 후 다시 로그인해 주세요."
    : expired
    ? "이용 기간이 끝났어요. 카드를 등록하면 바로 이어서 이용할 수 있어요."
    : "카드를 등록하면 바로 시작해요. 써 보고 마음에 안 들면 7일 안에 전액 환불해 드려요.";

  // 요금제 고르기(2026-10-07 개편) — 센터 계정 = 센터만 · 개인 계정 = 베이직 | 프로(기본). 서버(confirm)도 같은 규칙으로 검증.
  const [plan, setPlan] = useState(null);
  const [isCenterAcct, setIsCenterAcct] = useState(false);
  // 센터 소속 트레이너는 결제할 수 없다(서버가 거절) → 카드 등록 대신 '대표에게 알려 주세요'(2026-10-06 점검)
  const [staff, setStaff] = useState(false);
  const [noTrial, setNoTrial] = useState(false);   // 센터에서 독립한 개인 계정 = 체험 없이 바로 첫 결제(2026-10-07)
  const [extraSeats, setExtraSeats] = useState(0);  // 센터 추가 자리 — 결제 금액에 들어간다(2026-10-08 · 화면 = 결제 금액)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase || !uid) return;
      // 계정 종류는 서버에 묻는다 — 결제 전 계정은 account를 직접 못 읽는다(RLS · 2026-10-07 토스 심사 중 발견: 센터 계정에 개인 요금제가 떴음)
      const { data: ses0 } = await supabase.auth.getSession();
      let info = null;
      try {
        const r = await fetch("/api/billing/confirm", { headers: { Authorization: `Bearer ${ses0?.session?.access_token || ""}` } });
        if (r.ok) info = await r.json();
      } catch (e) { console.error("계정 종류 확인 실패", e); }
      if (!info) {
        const { data } = await supabase.from("trainer").select("role, account:account_id(type, no_trial)").eq("id", uid).maybeSingle();
        info = { role: data?.role ?? null, type: data?.account?.type ?? ses0?.session?.user?.user_metadata?.account_type ?? null, noTrial: Boolean(data?.account?.no_trial) };
      }
      if (!alive) return;
      const data = { role: info.role, account: { type: info.type, no_trial: info.noTrial } };
      setIsCenterAcct(data.account.type === "center");
      let pick = "solo";
      if (data.account.type === "center") pick = "center";
      else {
        // 홈페이지 가격 카드에서 고른 요금제(가입 때 저장 · 2026-10-07) — 없으면 프로
        const { data: ses } = await supabase.auth.getSession();
        let choice = ses?.session?.user?.user_metadata?.plan_choice;
        if (!choice) { try { choice = localStorage.getItem("ot.planChoice"); } catch { choice = null; } }
        if (choice === "basic" || choice === "solo") pick = choice;
      }
      if (!alive) return;
      setPlan(pick);
      setStaff(Boolean(data.role) && data.role !== "owner");
      setNoTrial(Boolean(data?.account?.no_trial));
      setExtraSeats(Math.max(0, Number(info.extraSeats) || 0));
    })();
    return () => { alive = false; };
  }, [uid]);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

  const startCheckout = async () => {
    setPayErr("");
    if (!clientKey) { setPayErr("결제가 곧 열립니다. 잠시만 기다려 주세요."); return; }
    if (!uid) { setPayErr("세션을 확인할 수 없어요. 다시 로그인해 주세요."); return; }
    setBusy(true);
    try {
      const { loadTossPayments } = await import("@tosspayments/payment-sdk");
      const toss = await loadTossPayments(clientKey);
      const origin = window.location.origin;
      // 카드 등록창 → 성공 시 successUrl로 리다이렉트(authKey·customerKey 부착).
      await toss.requestBillingAuth("카드", {
        customerKey: uid,
        successUrl: `${origin}/billing/success?plan=${plan}`,
        failUrl: `${origin}/billing/fail`,
      });
      // 정상 흐름은 여기서 페이지가 리다이렉트됨 — 아래는 예외 시에만 도달.
    } catch {
      setBusy(false);
      setPayErr("결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-center text-center">
          <Image src="/icons/icon-192.png" alt="오직 트레이너" width={56} height={56} priority className="mb-3 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="text-lg font-semibold text-ink">{staff ? "센터 이용 기간이 끝났어요" : noTrial && !expired ? "개인 계정 카드 등록" : title}</div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{staff ? "센터의 오직 트레이너 구독이 끝나서 지금은 쓸 수 없어요. 대표에게 알려 주세요. 같은 로그인으로 개인 계정을 이어 쓸 수도 있어요." : noTrial && !expired ? "센터에서 독립한 개인 계정이에요. 카드를 등록하면 바로 쓸 수 있어요." : desc}</p>
          {staff && <a href="/leave-center" className="mt-3 inline-flex min-h-[40px] items-center text-[14px] font-bold text-primary-strong underline-offset-2 hover:underline">개인 계정으로 이어 쓰기 →</a>}
        </div>

        {!noAccount && !staff && (
          <>
            <div className="mb-4 grid gap-2">
              {(isCenterAcct ? [PLANS.center] : [PLANS.solo, PLANS.basic]).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={plan === p.key}
                  onClick={() => setPlan(p.key)}
                  className={`rounded-xl border px-3.5 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                    plan === p.key ? "border-primary bg-primary-soft" : "border-line bg-elevate hover:border-line-strong"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-bold text-ink">{p.name}{p.key === "solo" && <span className="ml-1.5 text-[12px] font-bold text-primary-strong">추천</span>}</span>
                    <span className="text-[15px] font-black tabular-nums text-ink">{(planAmount(p.key, extraSeats) ?? p.amount).toLocaleString("ko-KR")}<span className="text-[12px] font-semibold text-muted">원/월</span></span>
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-sub">
                    {p.key === "basic" ? "기록 · 회원 관리 · 회원 전용 페이지 · AI는 기능마다 매달 3번"
                      : p.key === "solo" ? `베이직 전부 + 음성일지 월 ${p.ai.voice}건 · OT · 재등록 대본 월 ${p.ai.prep}번`
                      : `트레이너 ${3 + extraSeats}명 + 대표${extraSeats ? `(추가 ${extraSeats}명 포함)` : ""} · 센터 공용 음성일지 월 ${p.ai.voice + SEAT_AI.voice * extraSeats}건 · 대본 월 ${p.ai.prep + SEAT_AI.prep * extraSeats}번`}
                  </div>
                </button>
              ))}
            </div>
            {payErr && <div className="mb-2 text-xs font-semibold text-danger-text">{payErr}</div>}
            <Button variant="primary" size="md" fullWidth onClick={startCheckout} disabled={busy || !plan}>
              {busy ? "결제창 여는 중…" : expired ? "카드 등록하고 이어서 이용하기" : "카드 등록하고 시작하기"}
            </Button>
            <p className="mt-2 text-center text-[12px] leading-relaxed text-muted">
              {`부가세 포함 · 오늘 ${plan && PLANS[plan] ? planAmount(plan, extraSeats).toLocaleString("ko-KR") + "원" : "첫 달"} 결제 · 이후 매달 같은 날 자동결제 · ${expired ? "" : "7일 안 전액 환불 · "}언제든 해지`}
            </p>
          </>
        )}

        <div className="mt-4">
          {onBack
            ? <Button variant="ghost" size="sm" fullWidth onClick={onBack}>돌아가기(볼 수만 있는 화면)</Button>
            : <Button variant="ghost" size="sm" fullWidth onClick={onSignOut}>다시 로그인</Button>}
        </div>
      </div>
    </div>
  );
}

// 읽기 전용(기간 끝 ~ +30일 · 2026-10-07) — 앱은 그대로 열되 맨 위에 띠. 쓰기는 DB가 막아서 저장하면 '권한이 없거나 구독이 만료됐을 수 있어요'.
//   대표 = [내 데이터 내려받기] [카드 등록하고 다시 쓰기] · 센터 트레이너 = 대표에게 알려 주세요.
function ReadOnlyShell({ status, uid, onPay, children }) {
  const [owner, setOwner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase || !uid) return;
      const { data } = await supabase.from("trainer").select("role").eq("id", uid).maybeSingle();
      if (alive) setOwner(data?.role === "owner");
    })();
    return () => { alive = false; };
  }, [uid]);
  const until = status?.read_only_until ? (() => { const d = new Date(Date.parse(status.read_only_until) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; })() : "";
  const download = async () => {
    setBusy(true); setMsg("");
    try {
      const { downloadMyData } = await import("@/components/views/SubscriptionCard");
      await downloadMyData();
    } catch (e) {
      console.error("내려받기 실패", e);
      setMsg(e.message || "내려받지 못했어요. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };
  return (
    <>
      <div role="status" className="sticky top-0 z-[60] border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-[13.5px] leading-snug text-danger-text">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 flex-1">
            <b>이용 기간이 끝났어요.</b> {until ? `${until}까지 ` : ""}볼 수만 있고, 새 기록은 저장되지 않아요.
            {owner === false ? " 센터 대표에게 알려 주세요." : " 그 뒤엔 기록이 지워져요."}
          </span>
          {owner === false && (
            <a href="/leave-center" className="inline-flex min-h-[36px] shrink-0 items-center rounded-lg border border-rose-300 bg-card px-3 text-[13px] font-bold text-danger-text no-underline">개인 계정으로 이어 쓰기</a>
          )}
          {owner && (
            <span className="flex shrink-0 gap-1.5">
              <button type="button" onClick={download} disabled={busy}
                className="min-h-[36px] rounded-lg border border-rose-300 bg-card px-3 text-[13px] font-bold text-danger-text disabled:opacity-50">
                {busy ? "준비하는 중…" : "내 데이터 내려받기"}
              </button>
              <button type="button" onClick={onPay}
                className="min-h-[36px] rounded-lg bg-primary px-3 text-[13px] font-bold text-white">
                카드 등록하고 다시 쓰기
              </button>
            </span>
          )}
          {msg && <span className="w-full text-[12.5px]">{msg}</span>}
        </div>
      </div>
      {children}
    </>
  );
}
