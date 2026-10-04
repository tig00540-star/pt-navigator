"use client";

/* 등록 이력(2026-10-06 대표 요청) — 이 회원의 PT 계약을 처음부터 순서대로. PT 대시보드.
   계약 = session_log 행(재등록마다 새 행). 진행 수 = 그 계약에 붙은 취소 아닌 수업(노쇼 포함 · remainingSessions와 같은 규칙).
   상태: 진행 중(지금 수업이 빠지는 계약 · activeContract) · 대기(미리 재등록) · 끝남 · 인계 · 환불. 금액은 실제 계약이라 won. */

import { History } from "lucide-react";
import { activeContract, remainingSessions } from "@/lib/memberStatus";
import { won } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const ymdDot = (iso) => { if (!iso) return "—"; const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const KIND = { new: "신규", reregister: "재등록" };
const RESULT = { success: "재등록함", hold: "재등록 보류", fail: "재등록 안 함" };

export default function RegistrationHistory({ contracts = [], logs = [] }) {
  if (!contracts.length) return null;
  const ordered = [...contracts].sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
  const active = activeContract(contracts, logs);
  const paidTotal = ordered.filter((c) => c.counts_as_revenue !== false).reduce((s, c) => s + (c.amount_total || 0) - (c.refund_amount || 0), 0);

  return (
    <Card as="section" padding="none">
      <details className="group" open={ordered.length <= 3}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.02em] text-ink">
            <History className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 등록 이력
          </span>
          <span className="text-[13px] text-sub">{ordered.length}번 · 합계 {won(paidTotal)}</span>
        </summary>
        <ol className="divide-y divide-line border-t border-line">
          {ordered.map((c, i) => {
            const used = (logs || []).filter((l) => l && l.contract_id === c.id && !l.voided).length;
            const total = (c.sessions_total || 0) + (c.service_sessions || 0);
            const rem = remainingSessions(c, logs).total;
            const state = c.refunded_at ? ["환불", "danger"] : c.handed_over ? ["인계로 닫힘", "neutral"]
              : active?.id === c.id ? ["진행 중", "pt"] : rem > 0 ? ["대기", "neutral"] : ["끝남", "neutral"];
            return (
              <li key={c.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink">{i + 1}번째 · {KIND[c.kind] || (c.counts_as_revenue === false ? "인계 · 외부" : "등록")}</span>
                  <Badge tone={state[1]}>{state[0]}</Badge>
                  <span className="ml-auto text-[12.5px] text-muted">{ymdDot(c.started_at)}</span>
                </div>
                <div className="mt-1 text-[13px] text-sub">
                  {c.sessions_total}회{c.service_sessions ? ` + 서비스 ${c.service_sessions}` : ""}
                  {c.price_per_session ? ` · 회당 ${won(c.price_per_session)}` : ""}
                  {c.counts_as_revenue !== false && c.amount_total ? ` · ${won(c.amount_total)}` : ""}
                  {c.refund_amount ? ` · 환불 ${won(c.refund_amount)}` : ""}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevate">
                    <div className="h-full rounded-full bg-pt" style={{ width: `${total ? Math.min(100, Math.round((used / total) * 100)) : 0}%` }} />
                  </div>
                  <span className="shrink-0 font-mono text-[12px] text-sub">{used}/{total}</span>
                </div>
                {c.reg_result && c.reg_result !== "none" && RESULT[c.reg_result] && (
                  <div className="mt-1 text-[12.5px] text-muted">끝날 때 · {RESULT[c.reg_result]}{c.report?.reg_satisfaction?.quote ? ` · "${c.report.reg_satisfaction.quote}"` : ""}</div>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </Card>
  );
}
