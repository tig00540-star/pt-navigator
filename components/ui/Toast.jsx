import { CheckCircle2 } from "lucide-react";

// 화면 하단 중앙에 떠오르는 토스트. message가 비어 있으면 렌더 안 함.
export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-xl border border-lime-500/30 bg-zinc-900 px-4 py-3 text-sm font-medium text-lime-300 shadow-xl">
        <CheckCircle2 className="h-4 w-4 text-lime-400" />
        {message}
      </div>
    </div>
  );
}
