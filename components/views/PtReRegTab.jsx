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
import { buildExerciseSeries } from "@/lib/workout";
import { INBODY_FIELDS } from "@/lib/labels";
import RegSalesbookView from "@/components/views/RegSalesbookView";
import { BookOpen, Eye } from "lucide-react";
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
import { markPending, clearPending, usePendingResult, isNewerThan } from "@/lib/aiPending";

const SAT_OPTS = [
  { value: "very", label: "아주 만족" },
  { value: "good", label: "만족" },
  { value: "neutral", label: "보통" },
  { value: "low", label: "아쉬워함" },
];

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
  const [inbodyRows, setInbodyRows] = useState([]); // 인바디 이력(변화량 표 재료)
  const [regSb, setRegSb] = useState(null);         // 재등록 세일즈북 캐시(latest.report.reg_salesbook)
  const [sbGenerating, setSbGenerating] = useState(false);
  const [sbErr, setSbErr] = useState("");
  const [sbOpen, setSbOpen] = useState(false);
  // 회원 만족도(트레이너 입력 · 2026-10-02) — 재등록 브리핑의 근거. latest.report.reg_satisfaction에 브리핑과 함께 저장.
  const [satLevel, setSatLevel] = useState("");
  const [satQuote, setSatQuote] = useState("");

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

  // 인바디 이력 로드(변화량 표 재료 · measured_at 오름차순 = 첫→최신).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) setInbodyRows([]); return; }
      const { data } = await supabase.from("inbody_log").select("*").eq("user_id", member.id).order("measured_at", { ascending: true });
      if (!cancelled) setInbodyRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  // 파생 — 렌더마다 계산(순수함수). active null이면 rem {0,0,0}·due false.
  const active = activeContract(contracts, logs);
  const rem = remainingSessions(active, logs);
  const due = reregisterDue(active, logs);
  const latest = latestContract(contracts); // 재등록 결과 기록 대상(잔여 무관 최신 계약)
  // 타임라인 — session_at ?? created_at 역순.
  const timeline = [...logs].sort(
    (a, b) => new Date(b.session_at ?? b.created_at ?? 0) - new Date(a.session_at ?? a.created_at ?? 0)
  );

  // 변화량 데이터(세일즈북 표 · 렌더/AI 공용). 숫자는 여기서만 — AI는 창작 금지.
  const changeData = (() => {
    const done = timeline.filter((l) => !l.voided);
    const dts = done.map((l) => new Date(l.session_at ?? l.created_at)).filter((d) => !isNaN(+d));
    let months = null, weekly = null;
    if (dts.length >= 2) {
      const spanW = (Math.max(...dts) - Math.min(...dts)) / (1000 * 60 * 60 * 24 * 7);
      months = Math.max(1, Math.round(spanW / 4.345));
      if (spanW > 0) weekly = Number((done.length / spanW).toFixed(1));
    }
    // 인바디 첫↔최신(지표별 non-null 첫/마지막). inbodyRows는 measured_at 오름차순.
    const inbody = INBODY_FIELDS.map((f) => {
      const withVal = inbodyRows.filter((r) => r[f.key] != null);
      const first = withVal[0]?.[f.key] ?? null;
      const latest = withVal.at(-1)?.[f.key] ?? null;
      return (first != null && latest != null && withVal.length >= 2 && first !== latest)
        ? { key: f.key, label: f.label, unit: f.unit, goodDir: f.goodDir, first, latest } : null;
    }).filter(Boolean);
    // 대표 무게 첫↔최신(sets_structured 기반 · 변화 있는 상위 5종목).
    const exercises = buildExerciseSeries(logs)
      .map((s) => ({ exercise: s.exercise, first: s.points[0]?.topWeight ?? null, latest: s.points.at(-1)?.topWeight ?? null }))
      .filter((e) => e.first != null && e.latest != null && e.first !== e.latest)
      .slice(0, 5);
    return {
      journey: { months, sessions_done: done.length, weekly_frequency: weekly, remaining_paid: rem.paid, remaining_service: rem.service },
      inbody, exercises,
    };
  })();
  const hasChange = changeData.inbody.length > 0 || changeData.exercises.length > 0;

  // 결과 폼 시드 — 대상 행(latest)이 바뀔 때만 그 행의 reg_* 반영.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegResult(latest?.reg_result ?? "none");
    setRegReason(latest?.reg_reason ?? "");
    setRegReapproachAt(latest?.reg_reapproach_at ?? "");
    setRegBrief(latest?.report?.reg_brief ?? null); // 캐시 시드(재방문 재호출 0)
    setRegBriefMeta(latest?.report?.regBriefMeta ?? null);
    setRegSb(latest?.report?.reg_salesbook ?? null); // 재등록 세일즈북 캐시 시드
    setSatLevel(latest?.report?.reg_satisfaction?.level ?? "");
    setSatQuote(latest?.report?.reg_satisfaction?.quote ?? "");
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
      showToast("저장하지 못했어요. 다시 시도해 주세요.");
      setRegSaving(false);
      return;
    }
      setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
      showToast("재등록 결과를 저장했어요");
      setRegSaving(false);
    } catch {
      showToast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setRegSaving(false);
    }
  };

  // 재등록 AI 브리핑 생성 — /api/ot-brief phase:"reregister" 호출 + latest.report 캐시.
  // 생성·저장은 서버가 끝까지(다른 화면·창 닫기에도 안 끊김 · 2026-10-02). 돌아오면 저장된 걸 이어 받는다.
  const pendingKey = latest?.id ? `rereg:${latest.id}` : null;
  const generateReReg = async () => {
    if (regGenerating) return;
    setRegGenerating(true);
    setRegAiError("");
    if (pendingKey) markPending(pendingKey);
    try {
      const doneLogs = timeline.filter((l) => !l.voided);
      const dts = doneLogs.map((l) => new Date(l.session_at ?? l.created_at)).filter((d) => !isNaN(+d));
      let weekly = null;
      if (dts.length >= 2) {
        const spanWeeks = (Math.max(...dts) - Math.min(...dts)) / (1000 * 60 * 60 * 24 * 7);
        if (spanWeeks > 0) weekly = (doneLogs.length / spanWeeks).toFixed(1);
      }
      // 첫 수업 → 지금: 앱이 계산한 숫자(changeData)만 근거로 넘긴다(AI는 숫자 창작 금지).
      const oldestFirst = [...doneLogs].reverse();
      const satisfaction = satLevel || satQuote.trim() ? { level: satLevel || null, quote: satQuote.trim() || null } : null;
      const ptContext = {
        contract_count: contracts.length,
        remaining: { paid: rem.paid, service: rem.service },
        sessions_done: doneLogs.length,
        weekly_frequency: weekly,
        recent_logs: timeline.filter((l) => !l.voided && l.ai_summary).slice(0, 5).map((l) => l.ai_summary),
        journey: {
          first_session: oldestFirst[0] ? String(oldestFirst[0].session_at ?? oldestFirst[0].created_at).slice(0, 10) : null,
          months: changeData.journey.months,
          noshows: doneLogs.filter((l) => l.source === "noshow").length,
        },
        first_logs: oldestFirst.filter((l) => l.ai_summary && l.source !== "noshow").slice(0, 2).map((l) => l.ai_summary),
        inbody_change: changeData.inbody.map((c) => ({ label: c.label, first: c.first, latest: c.latest, unit: c.unit, better: c.goodDir })),
        weight_change: changeData.exercises,
        satisfaction,
      };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "reregister", member, ptContext, packages, ...(latest?.id ? { save: { kind: "contract", contractId: latest.id, satisfaction } } : {}) }),
      });
      // 서버가 답을 준 순간에만 '만드는 중' 표시를 지운다 — 화면 이동·창 닫기로 끊긴 경우엔 남겨 두고 돌아왔을 때 이어 받는다.
      if (pendingKey) clearPending(pendingKey);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRegAiError(d.error || "AI 생성에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const meta = { generatedAt: new Date().toISOString(), model: res.headers.get("x-ai-model") || "" };
      setRegBrief(data);
      setRegBriefMeta(meta);
      // 저장은 서버가 했다 — 최신 계약 행을 다시 읽어 화면 상태(contracts)를 맞춘다.
      if (supabase && latest?.id) {
        if (!res.headers.get("x-saved-row")) setRegAiError("브리핑을 저장하지 못했어요 — 지금은 이 화면에서만 보여요.");
        const { data: row } = await supabase.from("session_log").select("*").eq("id", latest.id).maybeSingle();
        if (row) setContracts((p) => p.map((c) => (c.id === row.id ? row : c)));
      }
    } catch {
      setRegAiError("인터넷 연결을 확인하고 다시 시도해 주세요. (다른 화면에 다녀와도 만들던 브리핑은 이어서 저장돼요)");
    } finally {
      setRegGenerating(false);
    }
  };

  // 돌아왔을 때 이어 받기.
  const regWaiting = usePendingResult(pendingKey, async (since) => {
    const { data: row } = await supabase.from("session_log").select("*").eq("id", latest.id).maybeSingle();
    return isNewerThan(row?.report?.regBriefMeta?.generatedAt, since) ? row : null;
  }, (row) => {
    setContracts((p) => p.map((c) => (c.id === row.id ? row : c)));
    setRegBrief(row.report.reg_brief);
    setRegBriefMeta(row.report.regBriefMeta);
  });

  // 재등록 세일즈북 생성 — phase:"reg_salesbook" + changeData·recommended_program·packages·photoLabels.
  //   숫자는 changeData(앱 계산)로 렌더 · AI는 텍스트만. latest.report.reg_salesbook 캐시(spread-write 하드닝).
  const generateRegSalesbook = async () => {
    if (sbGenerating || !latest) return;
    setSbGenerating(true); setSbErr("");
    try {
      const rp = regBrief?.recommended_program || null; // 재등록 브리핑의 추천 프로그램(작업 E) 재사용
      let photoLabels = [];
      if (supabase && member?.id) {
        const { data: ph } = await supabase.from("member_photo").select("label").eq("user_id", member.id);
        photoLabels = [...new Set((ph || []).map((p) => p.label).filter(Boolean))];
      }
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "reg_salesbook", member, change: changeData, recommendedProgram: rp, packages, photoLabels }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSbErr(d.error || "세일즈북 생성 실패"); return; }
      const data = await res.json();
      setRegSb(data);
      if (supabase && latest?.id) {
        const nextReport = { ...(latest.report || {}), reg_salesbook: data };
        const { data: up } = await supabase.from("session_log").update({ report: nextReport }).eq("id", latest.id).select();
        if (!up || up.length === 0) setSbErr("세일즈북 저장 실패(0행) — 이번 세션엔 표시됩니다.");
        else setContracts((p) => p.map((c) => (c.id === up[0].id ? up[0] : c)));
      }
    } catch (e) {
      setSbErr("네트워크 오류: " + (e?.message || "알 수 없는 오류"));
    } finally {
      setSbGenerating(false);
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

          {/* 회원 만족도 — 재등록 브리핑의 근거(변화 숫자는 앱이 계산해 함께 넘긴다). */}
          <Card as="section" padding="sm">
            <p className="text-[13px] font-semibold text-sub">회원 만족도 <span className="font-normal text-muted">브리핑이 이걸 근거로 &lsquo;왜 더 해야 하는지&rsquo;를 짜요</span></p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAT_OPTS.map((o) => (
                <button key={o.value} type="button" onClick={() => setSatLevel(satLevel === o.value ? "" : o.value)} aria-pressed={satLevel === o.value}
                  className={`min-h-[36px] rounded-full border px-3 text-[13px] transition ${satLevel === o.value ? "border-ink bg-ink font-semibold text-white" : "border-line bg-card text-sub hover:text-ink"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <input value={satQuote} onChange={(e) => setSatQuote(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              placeholder="회원이 한 말 · 좋았던 점/아쉬운 점 (예: 허리 안 아파서 출근이 편해요)" />
            {hasChange && (
              <p className="mt-2 text-[12px] text-muted">
                함께 넘기는 변화: {[...changeData.inbody.slice(0, 2).map((c) => `${c.label} ${c.first}→${c.latest}${c.unit}`), ...changeData.exercises.slice(0, 2).map((e) => `${e.exercise} ${e.first}→${e.latest}kg`)].join(" · ")}
              </p>
            )}
          </Card>

          {/* AI 재등록 브리핑 — 상태 4종은 AIBriefBlock이 관리한다.
             이 탭은 재등록 타이밍(due) 뱃지가 추가로 붙는다(meta 슬롯).
             stale은 쓰지 않는다 — 재등록 브리핑은 관찰이 아니라 계약·수업 실적 기반이라
             '무엇이 바뀌면 낡았는가'의 기준이 없다(2차 OT의 obsHash에 해당하는 게 없음). */}
          <AIBriefBlock
            status={regGenerating || regWaiting ? "loading" : regBrief ? "ready" : "idle"}
            title="재등록 AI 지원"
            generateLabel="AI 지원 준비 생성하기"
            idleDescription={`${member.name} 회원의 첫 수업부터 지금까지의 변화(인바디·운동 무게·출석)와 위 만족도를 근거로, 왜 더 해야 하는지·앞으로 무엇이 달라지는지·재등록 제안까지 준비해요. 한 번 만들면 저장돼서 다시 열 때 바로 떠요.`}
            waitingHint="1~2분 걸려요. 다른 화면에 다녀와도 괜찮아요 — 만들던 브리핑은 저장돼 있다가 돌아오면 바로 떠요."
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

          {/* ── 재등록 세일즈북(회원 대면) · 그동안의 변화 → 앞으로 ── */}
          <section className="rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Eyebrow icon={BookOpen}>재등록 세일즈북 (회원에게 보여주기)</Eyebrow>
              {regSb && <span className="rounded-md border border-primary/30 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">준비됨</span>}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              {sbGenerating ? "그동안의 변화를 정리하고 있어요…"
                : regSb ? "오늘 수업 중/후 회원에게 그대로 보여주세요 — 변화량·단계·앞으로의 방향."
                : hasChange ? "인바디·수업 기록을 근거로 회원 대면 세일즈북을 만듭니다."
                : "아직 변화 데이터(인바디/구조화 수업기록)가 얇아요. 그래도 만들 수 있지만, 인바디를 한 번 기록하면 표가 확 살아납니다."}
            </p>
            {sbErr && <p className="mt-2 text-[12px] text-danger-text">{sbErr}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {regSb && (
                <Button variant="primary" size="sm" onClick={() => setSbOpen(true)}>
                  <Eye className="h-3.5 w-3.5" /> 회원에게 보기
                </Button>
              )}
              <Button variant={regSb ? "ghost" : "primary"} size="sm" onClick={generateRegSalesbook} disabled={sbGenerating}>
                <RefreshCw className={`h-3.5 w-3.5 ${sbGenerating ? "animate-spin" : ""}`} />
                {sbGenerating ? "만드는 중…" : regSb ? "다시 만들기" : "세일즈북 만들기"}
              </Button>
            </div>
          </section>

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
      {sbOpen && regSb && (
        <RegSalesbookView
          regSalesbook={regSb}
          member={member}
          trainer={null}
          packages={packages}
          recommendedProgram={regBrief?.recommended_program || null}
          change={changeData}
          onClose={() => setSbOpen(false)}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
