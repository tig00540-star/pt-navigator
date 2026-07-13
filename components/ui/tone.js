/* =========================================================================
   할일/파생 위젯 시맨틱 톤 — Card · SectionHeader · ListRow 공용 단일 출처.
   purge-safe 정적 리터럴만(동적 클래스 조립 금지 · MemberBadge VIEW_META 컨벤션).
   값 = 마이그레이션 전 각 위젯의 기존 클래스를 '픽셀 동일'하게 복제한 것(겉모습 불변).
   톤: amber(재접근) · zinc(미처리/중립) · rose(위험/미마감) · emerald(재등록/성공).
   ========================================================================= */
export const WIDGET_TONE = {
  amber: {
    card:         "border-amber-500/25 bg-amber-500/[0.06]",
    icon:         "text-amber-600",
    title:        "text-amber-700",
    countBadge:   "bg-amber-500/15 text-amber-700",
    rowBorder:    "border-amber-500/20",
    rowHover:     "hover:border-amber-400/50",
    chevron:      "text-amber-500/50",
    chevronHover: "group-hover:text-amber-600",
  },
  zinc: {
    card:         "border-zinc-400/25 bg-zinc-500/[0.06]",
    icon:         "text-sub",
    title:        "text-ink",
    countBadge:   "bg-elevate text-sub",
    rowBorder:    "border-line",
    rowHover:     "hover:border-primary",
    chevron:      "text-muted",
    chevronHover: "group-hover:text-primary-strong",
  },
  rose: {
    card:         "border-rose-500/25 bg-rose-500/[0.06]",
    icon:         "text-rose-600",
    title:        "text-rose-700",
    countBadge:   "bg-rose-500/15 text-rose-700",
    rowBorder:    "border-rose-500/20",
    rowHover:     "hover:border-rose-400/50",
    chevron:      "text-rose-500/50",
    chevronHover: "group-hover:text-rose-600",
  },
  emerald: {
    card:         "border-red-500/25 bg-red-500/[0.06]",
    icon:         "text-primary-strong",
    title:        "text-primary-strong",
    countBadge:   "bg-primary-soft text-primary-strong",
    rowBorder:    "border-red-500/20",
    rowHover:     "hover:border-primary",
    chevron:      "text-red-500/50",
    chevronHover: "group-hover:text-primary-strong",
  },
};

export function widgetTone(tone) {
  return WIDGET_TONE[tone] || WIDGET_TONE.zinc;
}
