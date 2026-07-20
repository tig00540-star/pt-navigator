/* =========================================================================
   Button 프리미티브 — 앱 전역 버튼 단일 출처(감사 P1-⑦).
   purge-safe: variant×accent(×size) → 완성 클래스 정적 리터럴(동적 조립 금지 · C/WIDGET_TONE 컨벤션).
   레드 브랜드: primary=레드 채움 · danger=아웃라인 rose(브랜드 채움과 fill/outline로 구분) · 초록 없음.
   아이콘은 children으로. as="a"=링크 버튼, fullWidth=폼 CTA(w-full), subtle=danger 저강도 트리거.
   ========================================================================= */

const BASE =
  "inline-flex items-center justify-center font-semibold transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none";

/* 치수 — DS Button 명세 정렬(2026-07).
   ⚠️ md 모서리를 rounded-xl(12px) → rounded-lg(10px)로 바꿨다. 65곳에 걸린 변경이다.
      근거: 브랜드 가이드라인 §06 "버튼·입력칸 10px · 카드 14~16px · 그 사이 값을
      임의로 만들지 않는다". 12px는 그 사이의 금지된 중간값이었다.
      1단계에서 --radius-lg를 DS control(10px)로 재정의해뒀으므로 rounded-lg가 곧 규격이다.
   gap도 크기별로 나눴다(기존엔 6px 고정) — 큰 버튼일수록 아이콘과 글자가 벌어져야 한다.
   ⚠️ lg(16px / 14×20)는 규격에는 있으나 도입하지 않는다 — 앱에 쓰임이 0이다.
      IconButton·ProgressBar와 같은 원칙: 앱에 없는 건 필요한 화면이 생길 때 넣는다. */
const SIZE = {
  sm: "rounded-lg px-3 py-[7px] text-[13px] gap-1.5",
  md: "rounded-lg px-4 py-[11px] text-[14.5px] gap-2",
};

// variant → 색. accent 있는 variant는 {trainer, owner}, 없는 것(danger)은 문자열.
const VARIANT = {
  primary: {
    trainer: "bg-gradient-to-br from-red-500 to-red-600 text-white",
    owner:   "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white",
  },
  solid: {
    trainer: "bg-primary-soft text-primary-strong ring-1 ring-inset ring-primary/30",
    owner:   "bg-fuchsia-500/10 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-500/30",
  },
  ghost: {
    trainer: "border border-line bg-elevate text-sub hover:border-primary hover:text-primary-strong",
    owner:   "border border-line bg-elevate text-sub hover:border-fuchsia-500/60 hover:text-fuchsia-700",
  },
  danger: "border border-rose-500/40 bg-rose-500/5 text-rose-700 hover:border-rose-500/70 hover:bg-rose-500/10",
};

const DANGER_SUBTLE = "text-rose-600 hover:bg-rose-500/10";

export default function Button({
  variant = "ghost",
  accent = "trainer",
  size = "md",
  subtle = false,
  fullWidth = false,
  as = "button",
  className = "",
  children,
  ...props
}) {
  const Tag = as;
  const v = VARIANT[variant] ?? VARIANT.ghost;
  const color =
    variant === "danger" && subtle
      ? DANGER_SUBTLE
      : (typeof v === "string" ? v : (v[accent] ?? v.trainer));
  const cls = `${BASE} ${SIZE[size] ?? SIZE.md} ${color}${fullWidth ? " w-full" : ""}${className ? " " + className : ""}`;
  return (
    <Tag className={cls} {...props}>
      {children}
    </Tag>
  );
}
