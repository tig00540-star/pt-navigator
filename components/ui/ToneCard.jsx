/* 파생 위젯 표준 컨테이너 — tone별 테두리+틴트 배경. 구조만 추출(픽셀 동일).
   기본 형태: mb-4 rounded-2xl border p-4 + 톤 색. shadow는 기본 없음(틴트 카드 결). */
import { widgetTone } from "@/components/ui/tone";

export default function ToneCard({ tone = "zinc", className = "", children }) {
  const t = widgetTone(tone);
  return (
    // 2026-10-03: 틴트 바탕 → 흰 카드(OT · PT 회원 화면과 같은 바탕). 역할 색(t.card)은 왼쪽 얇은 띠로만 남긴다.
    <section className={`relative mb-4 overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-sm ${className}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${t.bar}`} />
      {children}
    </section>
  );
}
