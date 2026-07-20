/* 상태·강도 pill — 신규/재등록/환불/선택됨/필수확인 등. purge-safe 정적 톤맵.
   base: rounded px-1.5 py-0.5 text-[10px] font-semibold + 톤 색. className으로 여백(ml-2 등) 주입. */
const BADGE_TONE = {
  primary: "bg-primary-soft text-primary-strong",  // 신규·선택됨·핀·일반
  sky:     "bg-sky-500/10 text-sky-700",           // 재등록
  rose:    "bg-rose-500/10 text-rose-700",          // 환불·위험
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-700",    // 필수확인(admin)
  amber:   "bg-amber-500/15 text-amber-700",        // 스테일·주의(AI 브리핑 재생성 권장)
  zinc:    "bg-elevate text-muted",                 // 중립·데모 라벨
};
export default function Badge({ tone = "primary", className = "", children }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONE[tone] || BADGE_TONE.primary} ${className}`}>
      {children}
    </span>
  );
}
