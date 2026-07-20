/* 파생 위젯 표준 컨테이너 — tone별 테두리+틴트 배경. 구조만 추출(픽셀 동일).
   기본 형태: mb-4 rounded-2xl border p-4 + 톤 색. shadow는 기본 없음(틴트 카드 결). */
import { widgetTone } from "@/components/ui/tone";

export default function ToneCard({ tone = "zinc", className = "", children }) {
  const t = widgetTone(tone);
  return (
    <section className={`mb-4 rounded-2xl border p-4 ${t.card} ${className}`}>
      {children}
    </section>
  );
}
