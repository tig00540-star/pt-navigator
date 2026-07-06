"use client";

/* =========================================================================
   inactive 뷰 — 종결된 회원. 간단 플레이스홀더. 재활성은 수동(백로그).
   ========================================================================= */

import { ChevronLeft, UserX } from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";

export default function InactiveView({ member, onGoList }) {
  return (
    <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-6">
      {onGoList && (
        <button
          onClick={onGoList}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition hover:text-emerald-400"
        >
          <ChevronLeft className="h-4 w-4" /> 회원 목록
        </button>
      )}
      <Eyebrow icon={UserX}>종결된 회원 (inactive)</Eyebrow>
      <h1 className="text-xl font-bold text-zinc-100">{member.name}</h1>
      {member.status_note && (
        <p className="mt-2 text-sm text-zinc-400">
          사유: <span className="text-zinc-300">{member.status_note}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        재활성은 수동(백로그). 상단 회원 선택으로 다른 회원으로 이동하세요.
      </p>
    </section>
  );
}
