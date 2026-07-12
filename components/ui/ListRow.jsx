/* 회원명 + 컨텍스트 + Chevron 탭 행(재접근·미처리예약·재등록 공통 꼴). 픽셀 동일.
   name = 노드 허용(문자열 또는 '이름 미상' muted span). onClick 필수.
   children = 이름 아래 메타 라인 '전체'를 소비처가 자기 wrapper째로 넘긴다
             (메타 wrapper가 위젯마다 미세하게 달라 여기서 고정하지 않음 — §6-c). */
import { ChevronRight } from "lucide-react";
import { widgetTone } from "@/components/ui/tone";

export default function ListRow({ tone = "zinc", name, onClick, children }) {
  const t = widgetTone(tone);
  return (
    <button
      onClick={onClick}
      className={`group flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99] ${t.rowBorder} ${t.rowHover}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{name}</div>
        {children}
      </div>
      <ChevronRight className={`h-4 w-4 shrink-0 ${t.chevron} ${t.chevronHover}`} />
    </button>
  );
}
