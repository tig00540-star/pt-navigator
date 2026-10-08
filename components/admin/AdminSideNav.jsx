"use client";

/* =========================================================================
   AdminSideNav — 대표 화면의 태블릿·PC(md 768px~) 왼쪽 세로 메뉴(2026-10-02 · 넓은 화면).
   폰은 기존 상단 가로 탭 그대로. 트레이너 쪽 SideNav와 같은 치수·동작(md 아이콘 / xl 넓게) — 같은 앱으로 읽히게.
   메뉴 = admin의 AGROUPS(홈·보고서·매출·정산·트레이너·등록·이탈·운영). 묶음 안 세부 탭은 상단 칩이 맡는다.
   ========================================================================= */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BrandMark from "@/components/ui/BrandMark";

export default function AdminSideNav({ groups, activeGroup, onPick, centerName }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[84px] flex-col border-r border-line bg-card md:flex xl:w-56" aria-label="대표 화면 메뉴">
      <div className="flex items-center gap-2.5 px-3 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] xl:px-5">
        <BrandMark accent="admin" title="오직 트레이너 대표 화면" className="mx-auto h-9 w-9 shrink-0 rounded-lg xl:mx-0" />
        <span className="hidden min-w-0 xl:block">
          <span className="block truncate text-[16px] font-extrabold leading-none tracking-[-0.04em] text-ink">{centerName || "내 센터"}</span>
          <span className="mt-1 block text-[12px] font-medium leading-none text-fuchsia-700">대표 · 총괄 경영</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 xl:px-3">
        {groups.map((g) => {
          const on = g.id === activeGroup;
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              onClick={() => onPick(g.tabs[0])}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[12px] leading-tight transition xl:min-h-[44px] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-left xl:text-[14px] ${
                on ? "bg-admin-soft font-semibold text-admin-text" : "text-sub hover:bg-elevate hover:text-ink"
              }`}
            >
              {Icon && <Icon className="h-[22px] w-[22px] shrink-0 xl:h-5 xl:w-5" strokeWidth={on ? 2.5 : 2} />}
              {g.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line px-2 py-3 xl:px-3">
        <Link href="/" className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] text-sub transition hover:bg-elevate hover:text-ink xl:min-h-[40px] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-[14px]">
          <ArrowLeft className="h-5 w-5 shrink-0" />
          트레이너 화면
        </Link>
      </div>
    </aside>
  );
}
