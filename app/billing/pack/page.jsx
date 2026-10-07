"use client";

// 추가 팩 결제창 성공 착지(2026-10-07) — paymentKey · orderId · amount를 서버(/api/billing/pack)로 넘겨 승인 · 팩 넣기.
// ⚠️ AuthGate는 /billing/* + 세션이면 그대로 통과(결제벽 · 읽기 전용 띠 없이 이 화면만).
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authHeader } from "@/lib/authHeader";
import Button from "@/components/ui/Button";

export const dynamic = "force-dynamic";

function PackConfirm() {
  const sp = useSearchParams();
  const [state, setState] = useState("confirming"); // confirming | done | error
  const [msg, setMsg] = useState("");
  const ran = useRef(false); // 새로고침 · StrictMode 두 번 실행 방지(서버도 같은 주문은 한 번만)

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const paymentKey = sp.get("paymentKey"), orderId = sp.get("orderId"), amount = Number(sp.get("amount"));
      if (!paymentKey || !orderId || !amount) { setState("error"); setMsg("결제 정보가 확인되지 않았어요."); return; }
      try {
        const res = await fetch("/api/billing/pack", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ action: "confirm", paymentKey, orderId, amount }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok) setState("done");
        else { setState("error"); setMsg(j.error || "결제를 마치지 못했어요."); }
      } catch {
        setState("error"); setMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
      }
    })();
  }, [sp]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        {state === "confirming" && <p className="m-0 text-[16px] font-semibold text-ink">결제를 확인하고 있어요…</p>}
        {state === "done" && (
          <>
            <p className="m-0 text-[18px] font-bold text-ink">추가 팩을 넣었어요</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">이번 달 말일까지 바로 쓸 수 있어요. 산 뒤 7일 안에 하나도 안 썼으면 구독 관리에서 환불할 수 있어요.</p>
          </>
        )}
        {state === "error" && (
          <>
            <p className="m-0 text-[18px] font-bold text-ink">결제를 마치지 못했어요</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">{msg}</p>
          </>
        )}
        {state !== "confirming" && (
          <Link href="/settings/me#subscription" className="mt-5 inline-block w-full">
            <Button variant="primary" size="md" fullWidth>구독 관리로 돌아가기</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function BillingPackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-bg text-[14px] text-muted">불러오는 중…</div>}>
      <PackConfirm />
    </Suspense>
  );
}
