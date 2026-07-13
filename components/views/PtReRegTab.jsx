"use client";

/* =========================================================================
   PT 재등록 탭 — PTView 재등록 결과기록 <details>를 자기완결 탭으로 이관.
   최신 계약 행 session_log.reg_* UPDATE(성공≠자동갱신 · 기록만) + 재등록 AI 브리핑(캐시).
   session_log만 건드림(setLogs 불필요). 회원전환 리셋은 부모가 key로 리마운트.
   ========================================================================= */

import { useState, useEffect } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { activeContract, remainingSessions, reregisterDue, latestContract } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import RegBriefView from "@/components/views/RegBriefView";
import { REG_RESULT_OPTS, REG_REASON_OPTS } from "@/lib/labels";

export default function PtReRegTab({ member, contracts, setContracts, logs }) {
  // 재등록 결과 기록(④ 작업4-1) — 최신 계약 행 session_log.reg_* UPDATE. 성공≠자동갱신(기록만).
  const [regResult, setRegResult] = useState("none");
  const [regReason, setRegReason] = useState("");
  const [regReapproachAt, setRegReapproachAt] = useState("");
  const [regSaving, setRegSaving] = useState(false);
  // 재등록 AI 브리핑(④ 작업4-2c) — latest.report.reg_brief 캐시, 재방문 재호출 0.
  const [regBrief, setRegBrief] = useState(null);
  const [regBriefMeta, setRegBriefMeta] = useState(null);
  const [regGenerating, setRegGenerating] = useState(false);
  const [regAiError, setRegAiError] = useState("");
  const { toast, showToast } = useToast();

  // 파생 — 렌더마다 계산(순수함수, 훅 불필요). active null이면 rem {0,0,0}·due false.
  const active = activeContract(contracts, logs);
  const rem = remainingSessions(active, logs);
  const due = reregisterDue(active, logs);
  const latest = latestContract(contracts); // 재등록 결과 기록 대상(잔여 무관 최신 계약)
  // 타임라인 — session_at ?? created_at 역순.
  const timeline = [...logs].sort(
    (a, b) => new Date(b.session_at ?? b.created_at ?? 0) - new Date(a.session_at ?? a.created_at ?? 0)
  );

  // 재등록 결과 폼 시드 — 대상 행(latest)이 바뀔 때만 그 행의 reg_* 반영.
  // 회원 전환·새 계약 추가로 latest가 바뀌면 재시드 / saveReg 낙관적 patch(같은 id)는 재시드 안 함(편집 중 안 튐).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegResult(latest?.reg_result ?? "none");
    setRegReason(latest?.reg_reason ?? "");
    setRegReapproachAt(latest?.reg_reapproach_at ?? "");
    setRegBrief(latest?.report?.reg_brief ?? null); // 캐시 시드(재방문 재호출 0)
    setRegBriefMeta(latest?.report?.regBriefMeta ?? null);
    setRegAiError("");
    // latest 객체는 매 렌더 새로 파생 → id만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  // 재등록 결과 기록 — 최신 계약 행에 reg_*만 UPDATE(+.select() 하드닝). report·타 컬럼 미포함(reg_brief 공존 보존).
  const saveReg = async () => {
    if (regSaving || !latest) return;
    setRegSaving(true);
    const payload = {
      reg_result: regResult,
      // 이유는 보류·실패에만, 재접근일은 보류에만(성공/미시도는 그 필드 안 건드림).
      ...(regResult === "hold" || regResult === "fail" ? { reg_reason: regReason || null } : {}),
      ...(regResult === "hold" ? { reg_reapproach_at: regReapproachAt || null } : {}),
    };
    if (!supabase) {
      setContracts((p) => p.map((c) => (c.id === latest.id ? { ...c, ...payload } : c)));
      showToast("재등록 결과 저장됨(데모)");
      setRegSaving(false);
      return;
    }
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패(UPDATE 정책 없으면). .select() length>0로 확정.
    const { data, error } = await supabase
      .from("session_log")
      .update(payload)
      .eq("id", latest.id)
      .select();
    if (error || !data || data.length === 0) {
      showToast("저장 실패 — 다시 시도하세요");
      setRegSaving(false);
      return;
    }
    setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
    showToast("재등록 결과 저장됨");
    setRegSaving(false);
  };

  // 재등록 AI 브리핑 생성 — /api/ot-brief phase:"reregister" 호출 + latest.report 캐시(SecondOTTab generateBrief 미러).
  const generateReReg = async () => {
    if (regGenerating) return;
    setRegGenerating(true);
    setRegAiError("");
    try {
      const ptContext = {
        contract_count: contracts.length,
        remaining: { paid: rem.paid, service: rem.service },
        recent_logs: timeline.filter((l) => !l.voided && l.ai_summary).slice(0, 5).map((l) => l.ai_summary),
      };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "reregister", member, ptContext }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRegAiError(d.error || "AI 생성에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const meta = { generatedAt: new Date().toISOString(), model: "claude-sonnet-5" };
      setRegBrief(data);
      setRegBriefMeta(meta);
      // 캐시 — latest.report에 공존 저장(session_log UPDATE · .select() 하드닝). supabase·latest 있을 때만.
      if (supabase && latest?.id) {
        const nextReport = { ...(latest.report || {}), reg_brief: data, regBriefMeta: meta };
        const { data: up } = await supabase.from("session_log").update({ report: nextReport }).eq("id", latest.id).select();
        if (!up || up.length === 0) setRegAiError("브리핑 저장 실패 — 권한/정책 확인(0행). 이번 세션엔 표시됩니다.");
        else setContracts((p) => p.map((c) => (c.id === up[0].id ? up[0] : c)));
      }
    } catch (e) {
      setRegAiError("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setRegGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {latest ? (
        /* 재등록 결과 기록 (④ 작업4-1) — 최신 계약 행 reg_* UPDATE. 계약 있을 때만 노출. */
        <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <Eyebrow icon={RefreshCw}>재등록 결과 기록</Eyebrow>
            {due && (
              <span className="rounded-md border border-primary/40 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
                재등록 타이밍
              </span>
            )}
          </summary>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">결과</span>
              <select
                value={regResult}
                onChange={(e) => setRegResult(e.target.value)}
                disabled={regSaving}
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary disabled:opacity-50"
              >
                {REG_RESULT_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {(regResult === "hold" || regResult === "fail") && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">이유</span>
                <select
                  value={regReason}
                  onChange={(e) => setRegReason(e.target.value)}
                  disabled={regSaving}
                  className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">선택 안 함</option>
                  {REG_REASON_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            )}
            {regResult === "hold" && (
              <ReapproachDateField value={regReapproachAt} onChange={setRegReapproachAt} />
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] leading-relaxed text-muted">
                성공을 기록해도 자동 갱신되지 않습니다 — 새 계약은 잔여 카드의 &lsquo;재등록&rsquo;으로.
              </p>
              <Button variant="primary" size="sm" onClick={saveReg} disabled={regSaving} className="shrink-0">
                {regSaving ? "저장 중…" : "저장"}
              </Button>
            </div>

            {/* AI 지원 — 재등록 브리핑(생성·캐시). reg_reason 기록분을 강조. */}
            <div className="mt-1 border-t border-line pt-4">
              {!regBrief ? (
                <button
                  onClick={generateReReg}
                  disabled={regGenerating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-strong transition hover:bg-primary-soft active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> {regGenerating ? "생성 중…" : "AI 지원 — 재등록 브리핑"}
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">{regBriefMeta?.generatedAt ? `생성: ${new Date(regBriefMeta.generatedAt).toLocaleString("ko-KR")}` : "재등록 브리핑"}</span>
                  <Button variant="ghost" size="sm" onClick={generateReReg} disabled={regGenerating}>
                    <RefreshCw className="h-3 w-3" /> {regGenerating ? "생성 중…" : "재생성"}
                  </Button>
                </div>
              )}
              {regAiError && <p className="mt-2 text-[11px] text-amber-700">{regAiError}</p>}
              <RegBriefView brief={regBrief} highlightReason={regReason} />
            </div>
          </div>
        </details>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 shadow-sm text-center">
          <RefreshCw className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-sub">아직 계약이 없습니다.</p>
          <p className="mt-1 text-xs text-muted">&lsquo;운동일지&rsquo; 탭에서 계약을 먼저 등록하세요.</p>
        </div>
      )}
      <Toast message={toast} />
    </div>
  );
}
