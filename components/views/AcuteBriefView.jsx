"use client";

/* =========================================================================
   급한불(⑤) AI 결과 렌더 — 회원 급변 대처. safety-first.
   ⚠️ 상시 의료 배너는 PTView 쪽(AI 무관 상시 노출). 여기는 AI 출력만 렌더.
   숫자 처방 없음·방향/원리까지만(프롬프트 가드). null이면 아무것도 안 그림.
   ========================================================================= */

import { ShieldAlert, Ban, ArrowRightLeft, Lightbulb } from "lucide-react";

export default function AcuteBriefView({ brief }) {
  if (!brief) return null;
  const avoid = Array.isArray(brief.avoid) ? brief.avoid.filter(Boolean) : [];
  const alts = Array.isArray(brief.alternatives) ? brief.alternatives.filter(Boolean) : [];
  const gaps = Array.isArray(brief.data_gaps) ? brief.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];

  return (
    <div className="mt-3 space-y-3">
      {brief.safety && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
            <ShieldAlert className="h-3.5 w-3.5" /> 안전 먼저
          </div>
          <p className="text-sm leading-relaxed text-red-700">{brief.safety}</p>
        </div>
      )}

      {avoid.length > 0 && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
            <Ban className="h-3.5 w-3.5" /> 오늘 피할 움직임
          </div>
          <ul className="space-y-2">
            {avoid.map((a, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="font-medium">{a.movement}</span>
                {a.why && <span className="mt-0.5 block text-xs text-muted">{a.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alts.length > 0 && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary-strong">
            <ArrowRightLeft className="h-3.5 w-3.5" /> 접근 가능한 결
          </div>
          <p className="mb-2 text-[10px] text-muted">※ 의학적 확인 이후를 전제로 한 방향입니다(지금 대체 처방 아님).</p>
          <ul className="space-y-2">
            {alts.map((a, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="font-medium">{a.direction}</span>
                {a.why && <span className="mt-0.5 block text-xs text-muted">{a.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.principle && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-sub">
            <Lightbulb className="h-3.5 w-3.5" /> 원리
          </div>
          <p className="text-sm text-sub">{brief.principle}</p>
        </div>
      )}
      {brief.note && <p className="px-1 text-xs leading-relaxed text-muted">{brief.note}</p>}

      {gaps.length > 0 && (
        <ul className="space-y-1 px-1">
          {gaps.map((gap, i) => (
            <li key={i} className="text-[11px] text-muted">· {gap}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
