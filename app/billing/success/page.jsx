"use client";

// 토스 카드등록 성공 리다이렉트 착지 — authKey/customerKey를 받아 서버(confirm)로 넘겨
// 빌링키 발급 + 7일 무료체험 활성. ⚠️ AuthGate는 /billing/* + 세션이면 Paywall 우회(이 화면 렌더).
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";

export const dynamic = "force-dynamic"; // useSearchParams — 정적 프리렌더 회피

function Confirm() {
  const sp = useSearchParams();
  const [state, setState] = useState("confirming"); // confirming | done | error
  const [msg, setMsg] = useState("");
  const ran = useRef(false); // StrictMode 이중 실행/재요청 방지

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let alive = true;
    (async () => {
      const authKey = sp.get("authKey");
      const customerKey = sp.get("customerKey");
      const plan = sp.get("plan");
      if (!supabase) { if (alive) { setState("error"); setMsg("결제 설정이 준비 중입니다."); } return; }
      if (!authKey || !customerKey) { if (alive) { setState("error"); setMsg("결제 정보가 확인되지 않았어요."); } return; }
      const { data } = await supabase.auth.getSession();
      const tok = data?.session?.access_token;
      if (!tok) { if (alive) { setState("error"); setMsg("로그인이 필요합니다. 다시 로그인 후 시도해 주세요."); } return; }
      try {
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ authKey, customerKey, plan }),
        });
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setState("done");
        else { setState("error"); setMsg(body.error || "결제 처리에 실패했어요."); }
      } catch {
        if (alive) { setState("error"); setMsg("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요."); }
      }
    })();
    return () => { alive = false; };
  }, [sp]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        {state === "confirming" && (
          <>
            <div className="text-base font-semibold text-ink">결제 정보를 확인하고 있어요…</div>
            <p className="mt-2 text-sm text-muted">잠시만 기다려 주세요.</p>
          </>
        )}
        {state === "done" && (
          <>
            <div className="text-lg font-semibold text-ink">7일 무료 체험이 시작됐어요 🎉</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              카드가 등록됐고, 체험 기간 동안은 청구되지 않아요. 기간이 끝나면 등록하신 카드로 자동 결제됩니다(언제든 해지 가능).
            </p>
            <Link href="/" className="mt-5 inline-block w-full">
              <Button variant="primary" size="md" fullWidth>앱 시작하기</Button>
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <div className="text-lg font-semibold text-ink">결제를 완료하지 못했어요</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{msg}</p>
            <Link href="/" className="mt-5 inline-block w-full">
              <Button variant="primary" size="md" fullWidth>돌아가기</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-sm text-muted">불러오는 중…</div>}>
      <Confirm />
    </Suspense>
  );
}
