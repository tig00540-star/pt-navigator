/* 라벨 + 큰 숫자 타일 — 내 실적·월간 리포트 공용. 흰 카드 셸(p-5 shadow-sm).
   label 앞 아이콘 선택. value = 큰 숫자(노드). children = 값 아래 보조 라인(소비처가 wrapper째). */
export default function StatTile({ icon: Icon, label, value, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-5 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 tabular-nums text-2xl font-bold text-ink">{value}</div>
      {children}
    </div>
  );
}
