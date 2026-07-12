"use client";
/* 다이얼로그 셸 — 백드롭 + 카드. 내부(헤더·본문·버튼)는 소비처가 children으로.
   variant: center(기본·max-w-md) | sheet(모바일 하단시트+blur·max-w-lg 스크롤).
   dismissable=true → 배경 클릭 시 onClose(카드는 stopPropagation). false → 강제(게이트, 배경 클릭 무시). */
const BACKDROP = {
  center: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
  sheet:  "fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4",
};
const CARD = {
  center: "w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl",
  sheet:  "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-xl sm:rounded-2xl",
};
export default function Modal({ variant = "center", dismissable = true, onClose, className = "", children }) {
  return (
    <div className={BACKDROP[variant] || BACKDROP.center} onClick={dismissable ? onClose : undefined}>
      <div className={`${CARD[variant] || CARD.center} ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
