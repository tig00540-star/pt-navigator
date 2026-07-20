/* 브랜드 심볼 — 링 + 침 + 중심점. public/icons/symbol.svg가 원본이고 여기가 인라인 사본이다.

   ── 왜 인라인 SVG인가 ──
   헤더는 PNG(/icons/icon-192.png)를 쓴다. PNG는 색을 못 바꾼다.
   관리자 화면에서 침만 다른 색으로 칠하려면 벡터여야 한다.

   ── 침 = 브랜드의 뜻 ──
   바늘이 하나뿐이고 한 곳만 가리키는 게 '오직/ONLY'의 시각화다.
   그래서 침은 이 마크에서 유일하게 색을 갖는 요소이고, 역할 색을 입히는 자리도 여기다.
   링과 중심점(ink)은 어느 화면에서든 그대로 둔다 — 이게 바뀌면 다른 마크가 된다.

   ── accent ──
   trainer = 브랜드 레드 · admin = 관리자 fuchsia(--color-admin).
   purge-safe: 정적 리터럴 맵(동적 조립 금지 — CLAUDE.md UI 규약).
   색은 SVG fill이라 Tailwind 클래스가 아닌 토큰 값을 직접 쓴다. */
const NEEDLE = {
  trainer: "#dc2626", // --color-primary
  admin: "#c026d3",   // --color-admin
};

export default function BrandMark({ accent = "trainer", className = "", title }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {/* 흰 바탕 — PNG 아이콘과 같은 인상(회색 배경 위 흰 타일)을 유지한다.
          투명하게 두면 헤더에서 링이 배경에 떠 보여 같은 마크로 안 읽힌다. */}
      <rect width="512" height="512" fill="#ffffff" />
      <g transform="translate(96,96) scale(5)">
        <circle cx="32" cy="32" r="27" fill="none" stroke="#13151b" strokeWidth="3.4" />
        <path d="M32 7 L37.5 33 L26.5 33 Z" fill={NEEDLE[accent] || NEEDLE.trainer} />
        <circle cx="32" cy="32" r="4.2" fill="#13151b" />
      </g>
    </svg>
  );
}
