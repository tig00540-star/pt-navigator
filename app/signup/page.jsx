"use client";

import { authErrorKo } from "@/lib/authError";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import { PLANS } from "@/lib/plans";
import { won } from "@/lib/format";

export default function SignupPage() {
  const router = useRouter();
  const [type, setType] = useState("solo");     // 'solo' | 'center'
  const [planChoice, setPlanChoice] = useState(""); // 홈페이지에서 고른 요금제(basic | solo · 개인만)
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [displayName, setDisplayName] = useState("");   // 내 이름(트레이너/원장 실명)
  const [accountName, setAccountName] = useState("");   // 센터명(center만)
  // 개인 트레이너: 일하는 방식(센터 소속 = 급여 · 수수료 / 프리랜서 = 회원비 직접) + 소속 센터 또는 상호(선택) · 2026-10-06
  const [workMode, setWorkMode] = useState("");
  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);              // 이메일 인증 대기 화면

  // 센터 대표용 랜딩(/center)에서 오면 '센터 대표'를 미리 선택(?type=center).
  // useSearchParams 대신 location — 정적 프리렌더에 Suspense 경계를 요구하지 않게.
  // (InstallAppButton과 같은 패턴 — 효과 본문에서 동기 setState를 피한다.)
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      if (q.get("type") === "center") setType("center");
      // 홈페이지 가격 카드에서 고른 요금제(basic | solo) — 결제 화면에서 미리 골라 둔다(2026-10-07)
      const pc = q.get("plan");
      if (pc === "basic" || pc === "solo") setPlanChoice(pc);
    })();
  }, []);

  const submit = async () => {
    if (busy) return;
    if (!supabase) { setErr("데모 모드라 가입할 수 없어요. 키를 설정한 뒤 다시 시도해 주세요."); return; }
    if (!email.trim() || !pw || !displayName.trim()) { setErr("이메일·비밀번호·이름은 필수입니다."); return; }
    if (pw.length < 6) { setErr("비밀번호를 6자 이상으로 입력해 주세요."); return; }
    if (type === "center" && !accountName.trim()) { setErr("센터명을 입력해 주세요."); return; }
    if (type === "solo" && !workMode) { setErr("어떻게 일하시는지 골라 주세요."); return; }
    setBusy(true); setErr("");
    if (type === "solo" && planChoice) { try { localStorage.setItem("ot.planChoice", planChoice); } catch { /* 저장 안 돼도 결제 화면에서 고르면 됨 */ } }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: {
        data: {
          account_type: type,                                  // 트리거가 읽어 account 생성
          display_name: displayName.trim(),
          account_name: type === "center" ? accountName.trim() : displayName.trim(),
          ...(type === "solo" ? { work_mode: workMode, brand_name: brand.trim().slice(0, 40), ...(planChoice ? { plan_choice: planChoice } : {}) } : {}),
        },
      },
    });
    setBusy(false);
    if (error) { console.error("가입 실패", error); setErr("가입하지 못했어요. " + authErrorKo(error)); return; }
    if (data?.session) { router.replace("/"); return; }        // 이메일 인증 OFF → 즉시 로그인 → 앱으로
    setSent(true);                                             // 인증 ON → 메일 확인 안내
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-ink">메일함을 확인해 주세요</div>
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
          <div className="mt-1 text-sm text-muted">개인 트레이너 또는 센터 대표로 시작</div>
        </div>

        {/* 유형 선택 */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[{ k: "solo", l: "개인 트레이너" }, { k: "center", l: "센터 대표" }].map((o) => (
            <button key={o.k} onClick={() => setType(o.k)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                type === o.k ? "border border-primary/30 bg-primary-soft text-primary-strong" : "border border-line bg-elevate text-muted hover:text-ink"}`}>
              {o.l}
            </button>
          ))}
        </div>

        {type === "solo" && planChoice && PLANS[planChoice] && (
          <p className="-mt-1 mb-4 rounded-lg bg-elevate px-3 py-2 text-center text-[13px] text-sub break-keep">
            고른 요금제 <b className="text-ink">{PLANS[planChoice].name} · 월 {won(PLANS[planChoice].amount)}</b> · 결제 화면에서 바꿀 수 있어요
          </p>
        )}

        <div className="space-y-3">
          <input type="email" inputMode="email" autoComplete="email" placeholder="이메일"
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" autoComplete="new-password" placeholder="비밀번호(6자 이상)"
            value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
          <input type="text" placeholder="이름(실명)"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
          {type === "center" && (
            <input type="text" placeholder="센터명"
              value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
          )}
          {type === "solo" && (
            <>
              <fieldset className="mx-0 border-0 p-0">
                <legend className="mb-1.5 text-[13px] font-semibold text-ink">어떻게 일하세요?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[{ k: "employed", l: "센터 소속", d: "급여 · 수수료를 받아요" }, { k: "freelance", l: "프리랜서", d: "회원비를 직접 받아요" }].map((o) => (
                    <button key={o.k} type="button" onClick={() => setWorkMode(o.k)} aria-pressed={workMode === o.k}
                      className={`rounded-lg px-3 py-2 text-left transition ${workMode === o.k ? "border border-primary/40 bg-primary-soft" : "border border-line bg-elevate hover:border-line-strong"}`}>
                      <span className={`block text-[13px] font-semibold ${workMode === o.k ? "text-primary-strong" : "text-ink"}`}>{o.l}</span>
                      <span className="block text-[12px] text-sub">{o.d}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <input type="text" maxLength={40} placeholder={workMode === "freelance" ? "상호 (선택 · 예: 홍길동 PT 스튜디오)" : "소속 센터 (선택 · 예: 강남 ○○짐)"}
                value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
              <p className="-mt-1 text-[12px] leading-relaxed text-muted">회원 전용 페이지와 OT 신청서에 이 이름이 나와요. 나중에 설정에서 바꿀 수 있어요.</p>
            </>
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
          <Button variant="primary" size="md" fullWidth onClick={submit} disabled={busy}>
            {busy ? "가입 중…" : "가입하기"}
          </Button>
        </div>

        <div className="mt-4 text-center text-[12px] text-muted">
          이미 계정이 있으신가요? <Link href="/" className="font-semibold text-primary-strong hover:underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}
