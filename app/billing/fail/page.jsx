"use client";

// 토스 카드등록 실패/취소 리다이렉트 착지. 결제는 일어나지 않았고 계정은 그대로 잠김 상태.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";

export const dynamic = "force-dynamic";

function FailInner() {
  const sp = useSearchParams();
  const reason = sp.get("message"); // 토스가 실패 사유를 전달(있을 때만)
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <div className="text-lg font-semibold text-ink">카드 등록이 취소됐어요</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {reason || "결제가 완료되지 않았어요. 다시 시도하시거나 다른 카드로 등록해 주세요."}
        </p>
        <Link href="/" className="mt-5 inline-block w-full">
          <Button variant="primary" size="md" fullWidth>다시 시도</Button>
        </Link>
      </div>
    </div>
  );
}

export default function BillingFailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-sm text-muted">불러오는 중…</div>}>
      <FailInner />
    </Suspense>
  );
}
