"use client";

/* =========================================================================
   InbodyAnalysis — 인바디 AI 분석 결과(회원 대면 카드).
   트레이너가 폰을 돌려 회원에게 보여주는 화면. '앱이 분석' 프레이밍 → 영업 부담↓.
   지표 해석 + 식습관·생활습관·운동 제안 + '그래서 지금부터' 종합. 의료 단정 없음.
   ========================================================================= */

import { Sparkles, Utensils, Moon, Dumbbell } from "lucide-react";

function Section({ icon: Icon, title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
        <Icon className="h-4 w-4 text-sub" /> {title}
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.filter(Boolean).map((t, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-sub">
            <span className="mt-0.5 text-primary-strong">•</span> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InbodyAnalysis({ data }) {
  if (!data) return null;
  const metrics = Array.isArray(data.metrics) ? data.metrics.filter(Boolean) : [];
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-strong">
        <Sparkles className="h-3.5 w-3.5" /> 인바디 분석 · 앱이 분석한 결과예요
      </div>

      {data.headline && <p className="text-[17px] font-bold leading-snug text-ink">{data.headline}</p>}

      {metrics.length > 0 && (
        <div className="space-y-2">
          {metrics.map((mt, i) => (
            <div key={i} className="rounded-xl border border-line bg-elevate p-3">
              <div className="text-[13px] font-bold text-ink">{mt.label}</div>
              {mt.state && <p className="mt-0.5 text-[13px] leading-relaxed text-sub">{mt.state}</p>}
              {mt.meaning && <p className="mt-1 text-[12px] leading-relaxed text-muted">{mt.meaning}</p>}
            </div>
          ))}
        </div>
      )}

      <Section icon={Utensils} title="식습관" items={data.diet} />
      <Section icon={Moon} title="생활습관" items={data.lifestyle} />
      <Section icon={Dumbbell} title="운동" items={data.exercise} />

      {data.why_now && (
        <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
          <div className="text-[11px] font-semibold tracking-label-ko text-primary-strong">그래서 — 지금부터</div>
          <p className="mt-1 text-[14px] font-medium leading-relaxed text-ink">{data.why_now}</p>
        </div>
      )}
    </div>
  );
}
