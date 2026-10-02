"use client";

/* PT 회원 화면 탭(2026-10-02 · OT 회원 화면과 같은 모양) — 화면 안 알약 탭: 대시보드 | 자료남기기 | 재등록.
   주소·탭 번호 계약은 그대로(logs=10 · write=12 · renewal=11 · lib/nav PT_STEPS). 헤더의 작은 하늘색 탭은 없앴다. */

import Link from "next/link";
import { PT_STEPS } from "@/lib/nav";

export default function PtTabs({ memberId, tab }) {
  const pill = (on) => `inline-flex min-h-[40px] shrink-0 items-center rounded-full px-4 text-[14px] transition ${
    on ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"}`;
  return (
    <div className="mb-4 flex overflow-x-auto">
      <nav className="flex gap-1 rounded-full bg-elevate p-[3px]" aria-label="PT 회원 화면">
        {PT_STEPS.map((s) => (
          <Link key={s.step} href={`/pt/${memberId}/${s.step}`} aria-current={s.tab === tab ? "page" : undefined} className={pill(s.tab === tab)}>
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
