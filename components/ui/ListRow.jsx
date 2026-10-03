/* 회원명 + 컨텍스트 + Chevron 탭 행(재접근·미처리예약·재등록 공통 꼴). 픽셀 동일.
   name = 노드 허용(문자열 또는 '이름 미상' muted span). onClick 필수.
   children = 이름 아래 메타 라인 '전체'를 소비처가 자기 wrapper째로 넘긴다
             (메타 wrapper가 위젯마다 미세하게 달라 여기서 고정하지 않음 — §6-c). */
import { ChevronRight } from "lucide-react";

export default function ListRow({ name, onClick, children }) { // tone은 받기만 한다(2026-10-03 · 줄은 역할 색 없이 회색 · 색은 카드 띠·아이콘이 맡음)
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl bg-elevate px-3.5 py-2.5 text-left transition hover:bg-line/60 active:scale-[0.99]"
    >
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-ink">{name}</div>
        {children}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:text-ink" aria-hidden="true" />
    </button>
  );
}
