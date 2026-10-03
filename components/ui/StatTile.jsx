/* 라벨 + 큰 숫자 타일 — 내 실적·월간 리포트 공용. 6곳에서 쓰인다.
   label 앞 아이콘 선택. value = 큰 숫자(노드). children = 값 아래 보조 라인(소비처가 wrapper째).

   셸은 Card로 위임한다 — 손수 만든 `rounded-2xl border border-line bg-card p-5 shadow-sm`을
   직접 갖고 있었는데, 같은 문자열이 앱에 82곳 흩어져 있어 한 곳을 고쳐도 나머지가 안 따라왔다. */
import Card from "@/components/ui/Card";

export default function StatTile({ icon: Icon, label, value, children, className = "" }) {
  return (
    <Card className={className}>
      <div className="flex items-center gap-1.5 text-[13px] text-sub">
        {Icon && <Icon className="h-4 w-4 text-primary-strong" aria-hidden="true" />}
        {label}
      </div>
      <div className="mt-1 tabular-nums text-[22px] font-bold tracking-[-0.02em] text-ink">{value}</div>
      {children}
    </Card>
  );
}
