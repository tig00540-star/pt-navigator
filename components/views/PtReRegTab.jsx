"use client";

/* =========================================================================
   PT 재등록 준비 탭 — 2차 OT(SecondOTTab) 화면 골격 이식.
   생성 전 카드 → 생성 중 스켈레톤 → (완료) 단계 띠 · 메타 · 브리핑 · 결과 기록.
   최신 계약 행 session_log.reg_* UPDATE(성공≠자동갱신 · 기록만) + 재등록 AI 브리핑(캐시).
   session_log만 건드림. 회원전환 리셋은 부모가 key로 리마운트.
   ========================================================================= */

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { activeContract, remainingSessions, reregisterDue, latestContract } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import RegBriefView from "@/components/views/RegBriefView";
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import Badge from "@/components/ui/Badge";
import { REG_RESULT_OPTS, REG_REASON_OPTS } from "@/lib/labels";
import Card from "@/components/ui/Card";

export default function PtReRegTab({ member, contracts, setContracts, logs }) {
  // 재등록 결과 기록 — 최신 계약 행 session_log.reg_* UPDATE. 성공≠자동갱신(기록만).
  const [regResult, setRegResult] = useState("none");
  const [regReason, setRegReason] = useState("");
  const [regReapproachAt, setRegReapproachAt] = useState("");
  const [regSaving, setRegSaving] = useState(false);
  // 재등록 AI 브리핑 — latest.report.reg_brief 캐시, 재방문 재호출 0.
  const [regBrief, setRegBrief] = useState(null);
  const [regBriefMeta, setRegBriefMeta] = useState(null);
  const [regGenerating, setRegGenerating] = useState(false);
  const [regAiError, setRegAiError] = useState("");
  const { toast, showToast } = useToast();
  const [packages, setPackages] = useState([]); // 본인 active PT 패키지(recommended_program 재료)

  // 본인 active 패키지 로드(마운트 1회 · uid 기준 · 회원 무관).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const { data: pkgs } = await supabase.from("pt_package").select("*")
        .eq("trainer_id", uid).eq("active", true)
        .order("sort", { ascending: true }).order("created_at", { ascending: true });
      if (!cancelled) setPackages(pkgs || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // 파생 — 렌더마다 계산(순수함수). active null이면 rem {0,0,0}·due false.
  const active = activeContract(contracts, logs);
  const rem = remainingSessions(active, logs);
  const due = reregisterDue(active, logs);
  const latest = latestContract(contracts); // 재등록 결과 기록 대상(잔여 무관 최신 계약)
  // 타임라인 — session_at ?? created_at 역순.
  const timeline = [...logs].sort(
    (a, b) => new Date(b.session_at ?? b.created_at ?? 0) - new Date(a.session_at ?? a.created_at ?? 0)
  );

  // 결과 폼 시드 — 대상 행(latest)이 바뀔 때만 그 행의 reg_* 반영.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegResult(latest?.reg_result ?? "none");
    setRegReason(latest?.reg_reason ?? "");
    setRegReapproachAt(latest?.reg_reapproach_at ?? "");
    setRegBrief(latest?.report?.reg_brief ?? null); // 캐시 시드(재방문 재호출 0)
    setRegBriefMeta(latest?.report?.regBriefMeta ?? null);
    setRegAiError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  // 재등록 결과 기록 — 최신 계약 행에 reg_*만 UPDATE(+.select() 하드닝). report·타 컬럼 미포함(reg_brief 공존 보존).
  const saveReg = async () => {
    if (regSaving || !latest) return;
    setRegSaving(true);
    const payload = {
      reg_result: regResult,
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
    try {
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
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setRegSaving(false);
    }
  };

  // 재등록 AI 브리핑 생성 — /api/ot-brief phase:"reregister" 호출 + latest.report 캐시.
  const generateReReg = async () => {
    if (regGenerating) return;
    setRegGenerating(true);
    setRegAiError("");
    try {
      const doneLogs = timeline.filter((l) => !l.voided);
      const dts = doneLogs.map((l) => new Date(l.session_at ?? l.created_at)).filter((d) => !isNaN(+d));
      let weekly = null;
      if (dts.length >= 2) {
        const spanWeeks = (Math.max(...dts) - Math.min(...dts)) / (1000 * 60 * 60 * 24 * 7);
        if (spanWeeks > 0) weekly = (doneLogs.length / spanWeeks).toFixed(1);
      }
      const ptContext = {
        contract_count: contracts.length,
        remaining: { paid: rem.paid, service: rem.service },
        sessions_done: doneLogs.length,
        weekly_frequency: weekly,
        recent_logs: timeline.filter((l) => !l.voided && l.ai_summary).slice(0, 5).map((l) => l.ai_summary),
      };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "reregister", member, ptContext, packages }),
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
      // 캐시 — latest.report에 공존 저장(session_log UPDATE · .select() 하드닝).
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
      {!latest ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 shadow-sm text-center">
          <RefreshCw className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-sub">아직 계약이 없습니다.</p>
          <p className="mt-1 text-xs text-muted">&lsquo;운동일지&rsquo; 탭에서 계약을 먼저 등록하세요.</p>
        </div>
      ) : (
        <>
          {/* ── 재등록 준비 · 수업 전 ── */}
          <div className="rounded-lg border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-strong">
            재등록 준비 · 수업 전
          </div>

          {/* AI 재등록 브리핑 — 상태 4종은 AIBriefBlock이 관리한다.
             이 탭은 재등록 타이밍(due) 뱃지가 추가로 붙는다(meta 슬롯).
             stale은 쓰지 않는다 — 재등록 브리핑은 관찰이 아니라 계약·수업 실적 기반이라
             '무엇이 바뀌면 낡았는가'의 기준이 없다(2차 OT의 obsHash에 해당하는 게 없음). */}
          <AIBriefBlock
            status={regGenerating ? "loading" : regBrief ? "ready" : "idle"}
            title="재등록 AI 지원"
            generateLabel="AI 지원 준비 생성하기"
            idleDescription={`${member.name} 회원의 최근 PT 관리 데이터를 근거로 재등록 AI 지원(당위성·클로징·거절 대처)을 준비합니다. 수업 전에 한 번 생성하면, 이후 다시 열 때는 저장돼 바로 떠요.`}
            waitingHint="최대 1분 걸릴 수 있어요. 기다리는 동안 회원의 지난 수업 기록을 훑어보세요. (최초 1회만 · 이후는 저장된 걸 바로 보여드려요)"
            onGenerate={generateReReg}
            onRegenerate={generateReReg}
            notice={regAiError || undefined}
            meta={
              <span className="flex flex-wrap items-center gap-2">
                {regBriefMeta?.generatedAt && (
                  <span>생성: {new Date(regBriefMeta.generatedAt).toLocaleString("ko-KR")}</span>
                )}
                {due && <Badge tone="ot">재등록 타이밍</Badge>}
              </span>
            }
          >
            {regBrief && <RegBriefView brief={regBrief} highlightReason={regReason} packages={packages} />}
          </AIBriefBlock>

          {/* ── 재등록 결과 기록 · 수업 후 ── */}
          <div className="rounded-lg border border-line bg-elevate px-3 py-1.5 text-xs font-bold text-sub">
            재등록 결과 기록 · 수업 후
          </div>
          <Card as="section">
            <Eyebrow icon={RefreshCw}>재등록 결과 기록</Eyebrow>
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
            </div>
          </Card>
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
