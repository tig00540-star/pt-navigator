/* 필터·선택 칩 (토글 버튼) — 회원 목록 상태 필터, 내 회원/전체 등.
   규격 출처: DS components/core/Chip.prompt.md. 구현은 앱 Tailwind.

   ⚠️ 이름이 FilterChip인 이유:
   DS의 `Chip`은 '선택 가능한 필터 칩'인데, 앱에는 이미 다른 뜻의 `Chip`이 있다
   (components/ui/Chip.jsx = MBTI·통증 같은 값을 보여주는 정적 메타 태그, 상호작용 없음).
   같은 이름을 덮으면 10곳이 조용히 뜻이 바뀐다. 앱의 Chip을 MetaTag로 개명하는 게
   장기적으로는 맞지만 별개 작업이라, 여기서는 이름을 분리한다.

   ── 선택색은 브랜드 레드 ──
   OT/PT 필터 칩이어도 '선택됨' 표시는 레드다. 역할색(amber/sky)은 뱃지 쪽에서 표현한다.
   같은 화면에서 색 하나가 두 뜻(=흐름 구분 / 선택 상태)을 가지면 읽을 수 없다.

   ── 테두리는 ring ──
   border 두께가 상태에 따라 바뀌면 레이아웃이 1px씩 밀린다. ring-inset은 안 밀린다.

   purge-safe: 완성 클래스 정적 리터럴. */
const BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[13px] py-2 text-[13px] leading-none " +
  "ring-1 ring-inset transition-colors duration-[180ms] ease-[cubic-bezier(.22,.9,.28,1)] " +
  "active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:opacity-50 disabled:pointer-events-none";

const SELECTED = "bg-primary-soft text-primary-strong ring-primary font-bold";
const UNSELECTED = "bg-card text-sub ring-line font-medium hover:text-ink hover:ring-line-strong";

export default function FilterChip({
  selected = false,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${BASE} ${selected ? SELECTED : UNSELECTED} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
