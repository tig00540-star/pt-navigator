"use client";
import { useEffect } from "react";
export default function Error({ error, reset }) {
  // 서버 로그와 대조할 열쇠 확보 — 프로덕션은 메시지가 마스킹되고 digest만 남는다.
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <p className="text-lg font-bold text-ink">문제가 발생했어요</p>
      <p className="text-sm text-sub">잠시 후 다시 시도해 주세요. 계속되면 새로고침해 주세요.</p>
      {error?.digest && <p className="text-xs text-muted">오류 코드: {error.digest}</p>}
      <div className="flex gap-2">
        <button onClick={() => reset()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">다시 시도</button>
        <button onClick={() => (window.location.href = "/")} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-sub">처음으로</button>
      </div>
    </div>
  );
}
