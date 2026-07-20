/* =========================================================================
   할일/파생 위젯 시맨틱 톤 — ToneCard · SectionHeader · ListRow 공용 단일 출처.
   purge-safe 정적 리터럴만(동적 클래스 조립 금지 · MemberBadge VIEW_META 컨벤션).

   ── 톤 이름을 뜻으로 바꿨다 (DS TodoItem 명세) ──
   기존 이름은 색이었고(amber/zinc/rose/emerald), 그중 `emerald`는 레거시라
   정의가 red로 치환돼 있었다 — 이름과 실제 색이 어긋나 코드를 읽을 수 없었다.
   이제 이름이 '역할'이고 색은 역할색 토큰에서 온다.

   ── 배정이 명세와 반대였다 ──
   미확정 클로징이 rose(위험), 재등록이 red였는데 DS 규칙은 반대다:
     · unclosed(미확정 클로징)만 red — 클로징 통계·자기진화의 원천이라 우선순위 신호
     · renewal(재등록)은 PT 흐름이므로 sky
   위험색(rose)은 환불·손실에 쓰는 색이지 "아직 결과를 안 적었다"에 쓸 색이 아니다.

   색 이름은 하위호환 별칭으로 남긴다 — 소비처를 한 번에 다 바꿀 수 없으므로.
   ========================================================================= */
const ROLE_TONE = {
  /* 재접근 — OT 흐름 */
  reapproach: {
    card:         "border-amber-500/25 bg-amber-500/[0.06]",
    icon:         "text-ot-text",
    title:        "text-ot-text",
    countBadge:   "bg-ot-soft text-ot-text",
    rowBorder:    "border-amber-500/20",
    rowHover:     "hover:border-amber-400/50",
    chevron:      "text-amber-500/50",
    chevronHover: "group-hover:text-ot-text",
  },
  /* 재등록 — PT 흐름 */
  renewal: {
    card:         "border-sky-500/25 bg-sky-500/[0.06]",
    icon:         "text-pt-text",
    title:        "text-pt-text",
    countBadge:   "bg-pt-soft text-pt-text",
    rowBorder:    "border-sky-500/20",
    rowHover:     "hover:border-sky-400/50",
    chevron:      "text-sky-500/50",
    chevronHover: "group-hover:text-pt-text",
  },
  /* 브랜드 강조 — 급여 헤드라인처럼 "이 화면에서 가장 중요한 것" 하나.
     unclosed와 같은 붉은 톤이지만 뜻이 달라 이름을 나눈다. */
  brand: {
    card:         "border-red-500/25 bg-red-500/[0.06]",
    icon:         "text-primary-strong",
    title:        "text-primary-strong",
    countBadge:   "bg-primary-soft text-primary-strong",
    rowBorder:    "border-red-500/20",
    rowHover:     "hover:border-primary",
    chevron:      "text-red-500/50",
    chevronHover: "group-hover:text-primary-strong",
  },
  /* 미확정 클로징 — 할일 위젯 중 유일한 red. 우선순위 신호다. */
  unclosed: {
    card:         "border-red-500/25 bg-red-500/[0.06]",
    icon:         "text-primary-strong",
    title:        "text-primary-strong",
    countBadge:   "bg-primary-soft text-primary-strong",
    rowBorder:    "border-red-500/20",
    rowHover:     "hover:border-primary",
    chevron:      "text-red-500/50",
    chevronHover: "group-hover:text-primary-strong",
  },
  /* 미처리 예약 · 중립 */
  neutral: {
    card:         "border-zinc-400/25 bg-zinc-500/[0.06]",
    icon:         "text-sub",
    title:        "text-ink",
    countBadge:   "bg-elevate text-sub",
    rowBorder:    "border-line",
    rowHover:     "hover:border-primary",
    chevron:      "text-muted",
    chevronHover: "group-hover:text-primary-strong",
  },
  /* 위험 — 환불·손실 전용. 할일 위젯에는 쓰지 않는다. */
  danger: {
    card:         "border-rose-500/25 bg-rose-500/[0.06]",
    icon:         "text-danger-text",
    title:        "text-danger-text",
    countBadge:   "bg-rose-500/15 text-danger-text",
    rowBorder:    "border-rose-500/20",
    rowHover:     "hover:border-rose-400/50",
    chevron:      "text-rose-500/50",
    chevronHover: "group-hover:text-danger-text",
  },
};

/* 색 이름 별칭 — 기존 소비처 하위호환. 새 코드는 역할 이름을 쓸 것.
   ⚠️ emerald는 레거시(정의가 red였다) → unclosed가 아니라 renewal로 보낸다.
      재등록 위젯 2곳이 이 이름을 쓰고 있었고 그게 원래 의도였다. */
export const WIDGET_TONE = {
  ...ROLE_TONE,
  amber:   ROLE_TONE.reapproach,
  zinc:    ROLE_TONE.neutral,
  rose:    ROLE_TONE.danger,
  emerald: ROLE_TONE.renewal,
};

export function widgetTone(tone) {
  return WIDGET_TONE[tone] || WIDGET_TONE.neutral;
}
