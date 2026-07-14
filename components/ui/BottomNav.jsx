"use client";
import { CalendarDays, Users, Award, Settings } from "lucide-react";

// 하단바 = 글로벌 4탭(아이콘 포함). id는 기존 TABS와 동일.
const ITEMS = [
  { id: 9, label: "오늘",    Icon: CalendarDays },
  { id: 0, label: "회원",    Icon: Users },
  { id: 8, label: "내 실적", Icon: Award },
  { id: 7, label: "설정",    Icon: Settings },
];

// 현재 tab → 활성 섹션. 워크플로우 탭(1,5,2,10,11,12)·회원목록(0) 전부 '회원' 섹션(0)으로.
const sectionOf = (tab) => (tab === 9 ? 9 : tab === 8 ? 8 : tab === 7 ? 7 : 0);

export default function BottomNav({ tab, onTab }) {
  const active = sectionOf(tab);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      aria-label="주요 메뉴"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-4">
        {ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition active:scale-95 ${
                on ? "text-primary-strong" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={on ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
