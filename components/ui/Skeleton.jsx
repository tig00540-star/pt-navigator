/* =========================================================================
   Skeleton — 내용이 들어올 자리를 미리 그려두는 회색 틀.

   ── 왜 스피너가 아닌가 ──
   빙빙 도는 원은 "기다려"만 말하고 무엇이 올지는 안 알려준다. 스켈레톤은 들어올 모양을
   먼저 보여줘서 화면이 갑자기 바뀌는 느낌(레이아웃 점프)을 줄인다. 앱처럼 보이는 요소다.

   animate-pulse는 Tailwind 기본 유틸이라 새 keyframe을 만들지 않는다.
   동작 줄이기(prefers-reduced-motion)를 켠 사용자는 Tailwind가 알아서 멈춘다.
   ========================================================================= */

export function SkeletonBar({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

/* 카드 한 장 모양 — 제목 한 줄 + 본문 두 줄. */
export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <SkeletonBar className="h-4 w-1/3" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBar key={i} className={i === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"} />
        ))}
      </div>
    </div>
  );
}

/* 화면 하나가 들어올 자리 — 제목 + 카드 몇 장. 회원 화면·탭 전환 공용. */
export default function SkeletonScreen({ cards = 3 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      <SkeletonBar className="h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} lines={i === 0 ? 3 : 2} />
        ))}
      </div>
    </div>
  );
}
