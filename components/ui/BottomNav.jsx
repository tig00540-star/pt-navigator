"use client";
import { Home, CalendarDays, Users, Award, Settings } from "lucide-react";

// 하단바 = 홈(허브) + 글로벌 4탭. 숫자 id는 기존 TABS와 동일, 허브만 "hub".
export const NAV_ITEMS = [
  { id: "hub", label: "홈",      Icon: Home },
  { id: 9,     label: "오늘",    Icon: CalendarDays },
  { id: 0,     label: "회원",    Icon: Users },
  { id: 8,     label: "내 실적", Icon: Award },
  { id: 7,     label: "설정",    Icon: Settings },
];

// 현재 tab → 활성 섹션. 워크플로우 탭(1,5,2,10,11,12)·회원목록(0) 전부 '회원' 섹션(0)으로.
export const sectionOf = (tab) =>
  tab === "hub" ? "hub" : tab === 9 ? 9 : tab === 8 ? 8 : tab === 7 ? 7 : 0;

// 폰 전용 — 태블릿·PC(md 768px~)는 왼쪽 세로 메뉴(components/app/SideNav)가 대신한다.
export default function BottomNav({ tab, onTab }) {
  const active = sectionOf(tab);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="주요 메뉴"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={on ? "page" : undefined}
              /* 터치 영역 최소 52px — 수업 중 한 손으로 누르는 자리라 작으면 오탭이 난다. */
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 py-1.5 text-[10.5px] font-semibold transition active:scale-95 ${
                on ? "text-primary-strong" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
