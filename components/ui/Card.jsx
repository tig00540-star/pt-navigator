/* =========================================================================
   Card — 앱의 기본 컨테이너(흰 면 · 얕은 그림자 · 14px 라운드).
   규격 출처: DS components/core/Card.prompt.md.

   ── 이름을 이 컴포넌트가 가져간 이유 ──
   기존 `Card`는 톤 기반 틴트 위젯(amber/rose/zinc 배경 + 테두리)이었고 11곳에서 쓰였다.
   반면 손수 만든 흰 카드 셸은 82곳이다. 다수이자 "카드"라는 말에서 기대되는 쪽이
   이름을 갖는 게 맞다고 판단해, 기존 것을 ToneCard로 개명했다(하는 일이 이름에 더 정확해졌다).
   FilterChip 때와 반대 방향인데, 거기선 DS Chip이 소수(필터칩)이고 앱 Chip이 다수였다.

   ── 그림자는 한 종류 ──
   위계는 그림자가 아니라 배경 명도로 만든다(page #f1f2f6 < card #fff).
   카드에 shadow-lg를 얹지 않는다. 1단계에서 --shadow-sm을 DS 2단 값으로 재정의해뒀다.

   ── shadow-card / rounded-card 유틸은 앱에 없다 ──
   1단계에서 Tailwind 기본값(--shadow-sm·--radius-2xl)을 DS 값으로 덮어썼으므로
   shadow-sm·rounded-2xl을 쓰면 DS 규격이 그대로 나온다. AIBriefBlock과 같은 원칙.

   purge-safe: 완성 클래스 정적 리터럴(동적 조립 금지).
   ========================================================================= */

const PAD = {
  md: "p-5",      // 기본 (--pad-card 20px)
  sm: "p-4",
  lg: "p-6",
  none: "p-0",    // 분할 리스트 셸 — 행이 직접 여백을 갖는다
};

export default function Card({
  as: Tag = "div",
  interactive = false,
  selected = false,
  elevated = true,
  padding = "md",
  className = "",
  children,
  ...rest
}) {
  /* 분할 리스트(padding="none")는 overflow-hidden이 필수다 —
     행 배경(선택 하이라이트·구분선)이 라운드 모서리를 넘어 삐져나온다. */
  const clip = padding === "none" ? " overflow-hidden" : "";

  return (
    <Tag
      className={
        "rounded-2xl border transition-[box-shadow,border-color] duration-[180ms] ease-[cubic-bezier(.22,.9,.28,1)] " +
        (selected ? "border-primary bg-primary-soft " : "border-line bg-card ") +
        (elevated ? "shadow-sm " : "") +
        (interactive ? "cursor-pointer hover:border-line-strong " : "") +
        (PAD[padding] || PAD.md) +
        clip +
        (className ? " " + className : "")
      }
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* 분할 리스트의 한 행 — 첫 행만 구분선이 없다.
   82곳 중 상당수가 이 형태(예약 목록·패키지 목록·트레이너 실적 표)라 같이 둔다. */
export function CardRow({ first = false, className = "", children, ...rest }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-[13px] ${first ? "" : "border-t border-line"}${
        className ? " " + className : ""
      }`}
      {...rest}
    >
      {children}
    </div>
  );
}
