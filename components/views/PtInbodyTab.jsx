/* =========================================================================
   인바디 (PT 서브탭) — 자리(placeholder). 수기기록·2주추이는 우선순위 3에서 채움.
   지금은 빈 자리 + 안내만(오버빌드 방지 · 뼈대 먼저). 순수 표현 · state/DB/fetch 없음.
   ========================================================================= */

import { Scale } from "lucide-react";

export default function PtInbodyTab({ member }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
        <Scale className="mx-auto h-8 w-8 text-zinc-700" />
        <div className="mt-3 text-sm text-zinc-400">인바디 기록 — 준비 중</div>
        <div className="mt-1 text-xs text-zinc-600">
          2주마다 수기 입력 · 추이 그래프가 여기에 들어올 자리입니다. (우선순위 3)
        </div>
      </div>
    </div>
  );
}
