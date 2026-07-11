"use client";
/* 재등록 브리핑 렌더(순수 · ④ 작업4-2c). route.js phase:"reregister" 출력 스키마 표시.
   상태·supabase 없음. highlightReason = 기록된 reg_reason(있으면 그 이유 강조). */
import { labelOf, REG_REASON_OPTS } from "@/lib/labels";

const F = [["proven_in_pt","확인된 것"],["risk_if_stop","멈추면"],["next_roadmap","앞으로"],["closing_logic","논리"]];
const CLOSE = [["enter","진입"],["paint","그림"],["land","착지"],["hold","침묵"]];

export default function RegBriefView({ brief, highlightReason }) {
  if (!brief) return null;
  const b = brief.briefing || {};
  const arc = Array.isArray(brief.arc) ? brief.arc : [];
  const objections = Array.isArray(brief.objections) ? brief.objections : [];
  const c = brief.closing || {};
  const gaps = Array.isArray(brief.data_gaps) ? brief.data_gaps : [];
  return (
    <div className="mt-3 space-y-4 text-sm">
      <div className="rounded-xl border border-line bg-elevate p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary-strong">등록 당위성</div>
        <dl className="space-y-1.5">
          {F.map(([k, lbl]) => (b[k] ? (
            <div key={k}><dt className="text-[11px] font-medium text-muted">{lbl}</dt><dd className="text-sub">{b[k]}</dd></div>
          ) : null))}
        </dl>
      </div>
      {arc.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sub">대화 흐름</div>
          <ol className="space-y-1.5">
            {arc.map((a, i) => (
              <li key={i} className="rounded-lg border border-line bg-elevate p-2.5">
                <div className="text-[11px] font-semibold text-primary-strong">{a.when}</div>
                <div className="text-sub">{a.direction}</div>
                {a.example && <div className="mt-1 text-[12px] italic text-muted">예) {a.example}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {objections.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sub">이유별 대처</div>
          <div className="space-y-1.5">
            {objections.map((o, i) => {
              const on = highlightReason && o.reason === highlightReason;
              return (
                <div key={i} className={`rounded-lg border p-2.5 ${on ? "border-primary bg-primary-soft" : "border-line bg-elevate"}`}>
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${on ? "bg-primary-soft text-primary-strong" : "bg-card text-sub"}`}>{labelOf(REG_REASON_OPTS, o.reason)}</span>
                    {o.customer_says && <span className="text-[12px] text-muted">&ldquo;{o.customer_says}&rdquo;</span>}
                  </div>
                  <div className="text-sub"><span className="font-semibold text-sub">공감 · </span>{o.reframe_direction}</div>
                  {o.sales_move && (
                    <div className="mt-1 text-[13px] text-sub"><span className="font-semibold text-sub">세일즈 · </span>{o.sales_move}</div>
                  )}
                  {o.example && (
                    <div className="mt-1 rounded-md bg-primary-soft px-2 py-1 text-[12px] leading-relaxed text-ink">
                      <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>
                      &ldquo;{o.example}&rdquo;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(c.enter || c.paint || c.land || c.hold) && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary-strong">클로징 4단계</div>
          <dl className="space-y-1.5">
            {CLOSE.map(([k, lbl]) => (c[k] ? (
              <div key={k}><dt className="text-[11px] font-medium text-muted">{lbl}</dt><dd className="text-sub">{k === "hold" ? c[k] : <>&ldquo;{c[k]}&rdquo;</>}</dd></div>
            ) : null))}
          </dl>
        </div>
      )}
      {gaps.length > 0 && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="mb-1 text-[11px] font-medium text-muted">더 관찰하면 브리핑이 좋아지는 점</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-muted">
            {gaps.map((gp, i) => <li key={i}>{gp}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
