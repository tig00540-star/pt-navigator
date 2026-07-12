/* 위젯 섹션 헤더 — 아이콘 + 제목 + (선택)카운트 배지 + (선택)힌트 한 줄. 픽셀 동일.
   icon = lucide 컴포넌트(소비처가 import해 넘김). count는 0도 표시(null/undefined만 생략). */
import { widgetTone } from "@/components/ui/tone";

export default function SectionHeader({ tone = "zinc", icon: Icon, title, count, hint }) {
  const t = widgetTone(tone);
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon className={`h-4 w-4 ${t.icon}`} />}
      <h3 className={`text-sm font-semibold ${t.title}`}>{title}</h3>
      {count != null && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.countBadge}`}>
          {count}
        </span>
      )}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}
