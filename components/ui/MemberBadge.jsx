/* =========================================================================
   MemberBadge — viewFor(member) 결과(ot|pt|inactive) → 배지 + 아바타 색.
   page.jsx·ScheduleBoard 공유용 단일 출처(색 드리프트 방지 · Eyebrow/Toast 컨벤션).
   순수 표현 컴포넌트 — lucide/DB import 없음.
   ========================================================================= */

// purge-safe 정적 맵 (C 토큰 패턴 · 동적 클래스 조립 금지).
// 밝은테마 목업 팔레트: OT=파랑/sky · PT=초록/emerald · 보관=zinc.
const VIEW_META = {
  ot:       { label: "OT", badge: "bg-sky-500/15 text-sky-400",         avatar: "bg-sky-500/15 text-sky-400",         dot: "bg-sky-400" },
  pt:       { label: "PT", badge: "bg-emerald-500/15 text-emerald-400", avatar: "bg-emerald-500/15 text-emerald-400", dot: "bg-emerald-400" },
  inactive: { label: "보관", badge: "bg-zinc-700/50 text-zinc-400",     avatar: "bg-zinc-800 text-zinc-500",          dot: "bg-zinc-500" },
};

export function viewMeta(view) {
  return VIEW_META[view] || VIEW_META.ot;
}

export default function MemberBadge({ view, className = "" }) {
  const meta = viewMeta(view);
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge} ${className}`}>
      {meta.label}
    </span>
  );
}
