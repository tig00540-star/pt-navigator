// 미니 스파크라인 — 값 추이(오래된→최신, 좌→우). 값 2개 미만이면 null.
// PtInbodyTab 패턴 공용화. 축·격자·호버 없음(수치는 리스트가 담당).
export default function Sparkline({ values }) {
  const w = 100, h = 28, pad = 3;
  const pts = (values || []).filter((v) => v != null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const stepX = w / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = i * stepX;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="mt-1 text-primary/70">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
