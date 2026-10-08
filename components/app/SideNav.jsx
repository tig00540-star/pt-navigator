"use client";

/* =========================================================================
   SideNav — 태블릿·PC(md 768px~)의 왼쪽 세로 메뉴(2026-10-02 · 넓은 화면 개편 미리보기).
   폰은 하단바(BottomNav) 그대로. 메뉴 항목·활성 판단은 하단바와 같은 출처(BottomNav의 ITEMS·sectionOf).
   md~(태블릿): 아이콘 + 작은 이름(좁게) · xl(PC 1280px~): 로고·이름 가로 배치(넓게).
   ========================================================================= */

import Link from "next/link";
import { Bell, ShieldCheck } from "lucide-react";
import { NAV_ITEMS, sectionOf } from "@/components/ui/BottomNav";
import BrandMark from "@/components/ui/BrandMark";
import Wordmark from "@/components/ui/Wordmark";

export default function SideNav({ tab, onTab, trainerName, unreadCount = 0, onBell, showAdmin, showBell = true }) {
  const active = sectionOf(tab);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[84px] flex-col border-r border-line bg-card md:flex xl:w-56" aria-label="주요 메뉴">
      <Link href="/" aria-label="홈으로" className="flex items-center gap-2.5 px-3 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] xl:px-5">
        <BrandMark accent="trainer" title="오직 트레이너" className="mx-auto h-9 w-9 shrink-0 rounded-lg xl:mx-0" />
        <span className="hidden min-w-0 xl:block">
          <Wordmark className="block text-[17px] font-extrabold leading-none tracking-[-0.04em]" />
          <span className="mt-1 block truncate text-[12px] font-medium leading-none text-muted">{trainerName || "트레이너"}</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-2 xl:px-3">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] transition xl:min-h-[44px] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-[14px] ${
                on ? "bg-primary-soft font-semibold text-primary-strong" : "text-sub hover:bg-elevate hover:text-ink"
              }`}
            >
              <Icon className="h-[22px] w-[22px] shrink-0 xl:h-5 xl:w-5" strokeWidth={on ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line px-2 py-3 xl:px-3">
        {showBell && <button onClick={onBell} className="relative flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] text-sub transition hover:bg-elevate hover:text-ink xl:min-h-[40px] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-[14px]">
          <Bell className="h-5 w-5 shrink-0" />
          공지
          {unreadCount > 0 && (
            <span className="absolute right-3 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white xl:static xl:ml-auto">
              {unreadCount}
            </span>
          )}
        </button>}
        {showAdmin && (
          <a href="/admin" className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] text-fuchsia-700 transition hover:bg-fuchsia-500/10 xl:min-h-[40px] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-[14px]">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            대표 화면
          </a>
        )}
      </div>
    </aside>
  );
}
