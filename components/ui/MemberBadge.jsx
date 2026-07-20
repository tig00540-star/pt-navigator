/* =========================================================================
   MemberBadge — viewFor(member) 결과(ot|pt|inactive) → 배지 + 아바타 색.
   page.jsx·ScheduleBoard 공유용 단일 출처(색 드리프트 방지 · Eyebrow/Toast 컨벤션).
   순수 표현 컴포넌트 — lucide/DB import 없음.
   ========================================================================= */

// purge-safe 정적 맵 (동적 클래스 조립 금지).
// 그룹탭 색과 정렬: OT=amber · PT=sky · 보관=중립.
// 색은 역할 토큰에서 온다 — 팔레트를 직접 쓰면 "이 amber가 OT라서인지"가 코드에 안 남는다.
// ⚠️ 상태색은 뱃지·아바타에만. 카드 면이나 본문 글자에 번지지 않게 한다(DS MemberCard 규율).
const VIEW_META = {
  ot:       { label: "OT", badge: "bg-ot-soft text-ot-text",   avatar: "bg-ot-soft text-ot-text",   dot: "bg-ot" },
  pt:       { label: "PT", badge: "bg-pt-soft text-pt-text",   avatar: "bg-pt-soft text-pt-text",   dot: "bg-pt" },
  inactive: { label: "보관", badge: "bg-elevate text-muted",     avatar: "bg-elevate text-muted",     dot: "bg-muted" },
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
