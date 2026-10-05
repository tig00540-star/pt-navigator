"use client";

/* =========================================================================
   PT 재등록 탭 (2026-10-02 개편 · OT 회원 화면과 같은 모양)
   ① 회차 = 계약. 재등록 대화는 '끝나 가는 계약'에 붙는다(lib/memberStatus reregRound).
      예전엔 최신 계약(latestContract)에 붙어서, 미리 재등록하면 브리핑·결과가 새 계약으로 옮겨 가 버렸다.
      두 번째 계약부터는 위에 '첫 재등록 · 2번째 재등록' 알약이 생기고, 지난 회차 리포트·결과를 다시 볼 수 있다.
   ② 회원 만족도는 리포트와 따로 바로 저장(report.reg_satisfaction · 누를 때/입력칸을 벗어날 때).
   ③ 리포트 = OT와 같은 한 장 문서(PrepReport kind="reregister" · 맨 위 30초 요약).
   ④ 2번째 이상 재등록은 '지난 재등록 이후 이번 계약 기간' 숫자 + 지난번에 약속한 다음 단계를 AI에 함께 넘긴다.
   session_log만 건드림(report는 저장 직전에 다시 읽어 병합 · 서버가 저장한 리포트를 덮지 않게).
   회원 전환 리셋은 부모가 key로 리마운트.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Check, Eye, Heart, RefreshCw, Flag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { remainingSessions, reregisterDue, reregRound } from "@/lib/memberStatus";
import { buildExerciseSeries } from "@/lib/workout";
import { INBODY_FIELDS, REG_REASON_OPTS } from "@/lib/labels";
import RegSalesbookView from "@/components/views/RegSalesbookView";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import PrepReport from "@/components/ot/PrepReport";
import { markPending, clearPending, usePendingResult, isNewerThan } from "@/lib/aiPending";

const SAT_OPTS = [
  { value: "very", label: "아주 만족" },
  { value: "good", label: "만족" },
  { value: "neutral", label: "보통" },
  { value: "low", label: "아쉬워함" },
];

// 결과 — 저장 값(reg_result)은 그대로, 화면 글만 해요체(ObservationTab과 같은 모양).
const RESULTS = [
  { value: "success", label: "재등록했어요", hint: "새 계약은 자료남기기에서 등록해요" },
  { value: "hold", label: "생각해 본대요", hint: "다시 물어볼 날을 정하면 '오늘'에 떠요" },
  { value: "fail", label: "이번엔 안 하기로 했어요", hint: "이유를 남기면 다음 리포트가 참고해요" },
  { value: "none", label: "아직 이야기 안 했어요", hint: "" },
];

const roundLabel = (i) => (i <= 0 ? "첫 재등록" : `${i + 1}번째 재등록`);
const dayOf = (l) => String(l.session_at ?? l.created_at ?? "").slice(0, 10);
const realDone = (l) => l && !l.voided && l.source !== "noshow"; // '진행 수업' = voided·노쇼 제외(CLAUDE.md 숫자 기준)

function Chip({ on, onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`min-h-[36px] rounded-full border px-3 text-[13px] transition disabled:opacity-60 ${on ? "border-ink bg-ink font-semibold text-white" : "border-line bg-card font-normal text-sub hover:border-line-strong hover:text-ink"}`}>
      {children}
    </button>
  );
}

// 인바디 첫↔최신(지표별). rows는 measured_at 오름차순. since(YYYY-MM-DD)가 있으면 '그날 기준'부터:
//   기준값 = 그날 이전 마지막 측정(없으면 기간 안 첫 측정), 최신값 = 기간 안 마지막 측정.
function inbodyChange(rows, since = null) {
  return INBODY_FIELDS.map((f) => {
    const withVal = rows.filter((r) => r[f.key] != null);
    let base, last;
    if (since) {
      const before = withVal.filter((r) => String(r.measured_at ?? "").slice(0, 10) < since);
      const inside = withVal.filter((r) => String(r.measured_at ?? "").slice(0, 10) >= since);
      base = before.at(-1) || inside[0];
      last = inside.at(-1);
    } else {
      base = withVal[0];
      last = withVal.at(-1);
    }
    const first = base?.[f.key] ?? null;
    const latest = last?.[f.key] ?? null;
    return (base && last && base !== last && first != null && latest != null && first !== latest)
      ? { key: f.key, label: f.label, unit: f.unit, goodDir: f.goodDir, first, latest } : null;
  }).filter(Boolean);
}

const weightChange = (logs) => buildExerciseSeries(logs)
  .map((s) => ({ exercise: s.exercise, first: s.points[0]?.topWeight ?? null, latest: s.points.at(-1)?.topWeight ?? null }))
  .filter((e) => e.first != null && e.latest != null && e.first !== e.latest)
  .slice(0, 5);

export default function PtReRegTab({ member, contracts, setContracts, logs }) {
  const { toast, showToast } = useToast();
  const [packages, setPackages] = useState([]); // 본인 active PT 패키지(recommended_program 재료)
  const [inbodyRows, setInbodyRows] = useState([]); // 인바디 이력(변화량 재료)

  // 회차 — 기본은 지금 끝나 가는 계약. 알약으로 지난 회차를 고를 수 있다.
  const { ordered, target, index: targetIdx } = reregRound(contracts, logs);
  const [selId, setSelId] = useState(null);
  const cur = (selId && ordered.find((c) => c.id === selId)) || target;
  const curIdx = cur ? ordered.findIndex((c) => c.id === cur.id) : -1;
  const isCurrent = Boolean(cur && target && cur.id === target.id);

  // 이 회차 상태(폼·캐시) — cur가 바뀔 때만 그 행에서 시드.
  const [regResult, setRegResult] = useState("none");
  const [regReason, setRegReason] = useState("");
  const [regReapproachAt, setRegReapproachAt] = useState("");
  const [regSaving, setRegSaving] = useState(false);
  const [regBrief, setRegBrief] = useState(null);
  const [regBriefMeta, setRegBriefMeta] = useState(null);
  const [regGenerating, setRegGenerating] = useState(false);
  const [regAiError, setRegAiError] = useState("");
  const [regSb, setRegSb] = useState(null);
  const [sbGenerating, setSbGenerating] = useState(false);
  const [sbErr, setSbErr] = useState("");
  const [sbOpen, setSbOpen] = useState(false);
  const [satLevel, setSatLevel] = useState("");
  const [satQuote, setSatQuote] = useState("");
  const [satSaving, setSatSaving] = useState(false);

  // 세일즈북 탭에서 '발표'로 들어오면(?sb=1) 준비되는 대로 바로 연다(렌더 중 1회 조정).
  const wantSb = useSearchParams().get("sb") === "1";
  const [autoOpened, setAutoOpened] = useState(false);
  if (wantSb && regSb && !autoOpened) { setAutoOpened(true); setSbOpen(true); }

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

  // 인바디 이력 로드(measured_at 오름차순 = 첫→최신).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) setInbodyRows([]); return; }
      const { data } = await supabase.from("inbody_log").select("*").eq("user_id", member.id).order("measured_at", { ascending: true });
      if (!cancelled) setInbodyRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegResult(cur?.reg_result ?? "none");
    setRegReason(cur?.reg_reason ?? "");
    setRegReapproachAt(cur?.reg_reapproach_at ?? "");
    setRegBrief(cur?.report?.reg_brief ?? null);
    setRegBriefMeta(cur?.report?.regBriefMeta ?? null);
    setRegSb(cur?.report?.reg_salesbook ?? null);
    setSatLevel(cur?.report?.reg_satisfaction?.level ?? "");
    setSatQuote(cur?.report?.reg_satisfaction?.quote ?? "");
    setRegAiError("");
    setSbErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  // ── 숫자(앱 계산 · AI는 인용만) ──

  const rem = remainingSessions(cur, logs);
  const due = isCurrent && reregisterDue(cur, logs, { contracts });
  const done = logs.filter(realDone).sort((a, b) => new Date(a.session_at ?? a.created_at) - new Date(b.session_at ?? b.created_at)); // 오래된 순
  const usedOnCur = cur ? logs.filter((l) => l.contract_id === cur.id && !l.voided).length : 0;
  // 미리 재등록(다음 계약이 기다리는 중) — 지금 회차 결과를 아직 안 남겼으면 '재등록했어요'를 권한다.
  const queued = isCurrent ? ordered.slice(curIdx + 1).filter((c) => remainingSessions(c, logs).total > 0) : [];

  // 첫 수업 → 지금(세일즈북 표 · 브리핑 공용).
  const changeData = (() => {
    const dts = done.map((l) => new Date(l.session_at ?? l.created_at)).filter((x) => !isNaN(+x));
    let months = null, weekly = null;
    if (dts.length >= 2) {
      const spanW = (Math.max(...dts) - Math.min(...dts)) / (1000 * 60 * 60 * 24 * 7);
      months = Math.max(1, Math.round(spanW / 4.345));
      if (spanW > 0) weekly = Number((done.length / spanW).toFixed(1));
    }
    return {
      journey: { months, sessions_done: done.length, weekly_frequency: weekly, remaining_paid: rem.paid, remaining_service: rem.service },
      inbody: inbodyChange(inbodyRows),
      exercises: weightChange(logs),
    };
  })();
  const hasChange = changeData.inbody.length > 0 || changeData.exercises.length > 0;

  // 이번 계약 기간(지난 재등록 이후) — 2번째 이상 재등록에서만 AI에 넘긴다.
  const periodLogs = cur ? done.filter((l) => l.contract_id === cur.id) : [];
  const periodStart = periodLogs[0] ? dayOf(periodLogs[0]) : String(cur?.started_at ?? "").slice(0, 10);
  const thisPeriod = curIdx >= 1 ? {
    started: periodStart || null,
    sessions_done: periodLogs.length,
    inbody_change: periodStart ? inbodyChange(inbodyRows, periodStart).map((c) => ({ label: c.label, first: c.first, latest: c.latest, unit: c.unit })) : [],
    weight_change: weightChange(periodLogs),
  } : null;
  const prev = curIdx >= 1 ? ordered[curIdx - 1] : null;
  const prevRereg = prev ? {
    result: prev.reg_result || null,
    satisfaction: prev.report?.reg_satisfaction || null,
    next_roadmap: prev.report?.reg_brief?.why_now?.next_roadmap || null,
    future_change: prev.report?.reg_brief?.why_now?.future_change || null,
  } : null;

  // report 병합 저장 — 저장 직전에 다시 읽어 합친다(서버가 방금 저장한 리포트·다른 칸을 덮지 않게).
  const patchReport = async (patch) => {
    const { data: row, error: re } = await supabase.from("session_log").select("id, report").eq("id", cur.id).maybeSingle();
    if (re || !row) return null;
    const { data, error } = await supabase.from("session_log").update({ report: { ...(row.report || {}), ...patch } }).eq("id", cur.id).select();
    if (error || !data || data.length === 0) return null;
    setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
    return data[0];
  };

  // 회원 만족도 — 리포트와 따로 바로 저장.
  const satNext = useRef(null);   // 저장 중에 또 바뀐 값 — 끝나면 이어서 저장(예전엔 버려져 앞 값이 남았다 · 2026-10-06)
  const saveSat = async (level, quote, force = false) => {
    if (!cur) return;
    if (satSaving) { satNext.current = [level, quote]; return; }
    const q = (quote || "").trim();
    const val = level || q ? { level: level || null, quote: q || null } : null;
    const saved = cur.report?.reg_satisfaction || null;
    if (!force && (saved?.level || null) === (val?.level || null) && (saved?.quote || null) === (val?.quote || null)) return;
    if (!supabase) {
      setContracts((p) => p.map((c) => (c.id === cur.id ? { ...c, report: { ...(c.report || {}), reg_satisfaction: val } } : c)));
      return;
    }
    setSatSaving(true);
    try {
      const row = await patchReport({ reg_satisfaction: val });
      if (!row) { console.error("만족도 저장 실패(0행)"); showToast("만족도를 저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); }
      else showToast("만족도를 저장했어요");
    } catch (e) {
      console.error(e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSatSaving(false);
      const n = satNext.current; satNext.current = null;
      if (n) setTimeout(() => saveSat(n[0], n[1], true), 0);
    }
  };

  // 재등록 결과 — 이 회차 계약 행에 reg_*만 UPDATE(+.select() 하드닝).
  const saveReg = async () => {
    if (regSaving || !cur) return;
    setRegSaving(true);
    const payload = {
      reg_result: regResult,
      reg_reason: regResult === "hold" || regResult === "fail" ? regReason || null : null,
      reg_reapproach_at: regResult === "hold" ? regReapproachAt || null : null,
    };
    if (!supabase) {
      setContracts((p) => p.map((c) => (c.id === cur.id ? { ...c, ...payload } : c)));
      showToast("재등록 결과를 저장했어요(데모)");
      setRegSaving(false);
      return;
    }
    try {
      const { data, error } = await supabase.from("session_log").update(payload).eq("id", cur.id).select();
      if (error || !data || data.length === 0) {
        console.error("재등록 결과 저장 실패", error);
        showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
        return;
      }
      setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
      showToast("재등록 결과를 저장했어요");
    } catch (e) {
      console.error(e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setRegSaving(false);
    }
  };

  // 재등록 리포트 — /api/ot-brief phase:"reregister". 저장은 서버가 끝까지(화면 이동·창 닫기에도).
  const pendingKey = isCurrent && cur?.id ? `rereg:${cur.id}` : null;
  const generateReReg = async () => {
    if (regGenerating || !isCurrent) return;
    setRegGenerating(true);
    setRegAiError("");
    if (pendingKey) markPending(pendingKey);
    try {
      const recentFirst = [...done].reverse();
      const satisfaction = satLevel || satQuote.trim() ? { level: satLevel || null, quote: satQuote.trim() || null } : null;
      // 목표 로드맵(트레이너가 만든 것 · 회원에게 보이든 아니든) — 리포트가 '지금 N단계 → 다음 단계'로 회원이 본 그림과 맞추게.
      let roadmap = null;
      if (supabase) {
        const { data: rmRow } = await supabase.from("member_roadmap").select("title, stages, current, visible").eq("member_id", member.id).maybeSingle();
        if (rmRow && Array.isArray(rmRow.stages) && rmRow.stages.length) roadmap = { title: rmRow.title || null, stages: rmRow.stages.map((s) => s.title), current: rmRow.current ?? 0, visible: Boolean(rmRow.visible) };
      }
      const ptContext = {
        roadmap,
        contract_count: ordered.length,
        round: curIdx + 1,
        remaining: { paid: rem.paid, service: rem.service },
        sessions_done: done.length,
        weekly_frequency: changeData.journey.weekly_frequency,
        recent_logs: recentFirst.filter((l) => l.ai_summary).slice(0, 5).map((l) => l.ai_summary),
        journey: {
          first_session: done[0] ? dayOf(done[0]) : null,
          months: changeData.journey.months,
          noshows: logs.filter((l) => !l.voided && l.source === "noshow").length,
        },
        first_logs: done.filter((l) => l.ai_summary).slice(0, 2).map((l) => l.ai_summary),
        inbody_change: changeData.inbody.map((c) => ({ label: c.label, first: c.first, latest: c.latest, unit: c.unit, better: c.goodDir })),
        weight_change: changeData.exercises,
        satisfaction,
        this_period: thisPeriod,
        prev_rereg: prevRereg,
      };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "reregister", member, ptContext, packages, ...(cur?.id ? { save: { kind: "contract", contractId: cur.id, satisfaction } } : {}) }),
      });
      // 서버가 답을 준 순간에만 '만드는 중' 표시를 지운다 — 끊긴 경우엔 남겨 두고 돌아왔을 때 이어 받는다.
      if (pendingKey) clearPending(pendingKey);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error("재등록 리포트 실패", d);
        setRegAiError(d.error || "리포트를 만들지 못했어요. 다시 시도해 주세요.");
        return;
      }
      const data = await res.json();
      setRegBrief(data);
      setRegBriefMeta({ generatedAt: new Date().toISOString(), model: res.headers.get("x-ai-model") || "" });
      if (supabase && cur?.id) {
        if (!res.headers.get("x-saved-row")) setRegAiError("리포트를 저장하지 못했어요. 지금은 이 화면에서만 보여요.");
        const { data: row } = await supabase.from("session_log").select("*").eq("id", cur.id).maybeSingle();
        if (row) setContracts((p) => p.map((c) => (c.id === row.id ? row : c)));
      }
    } catch {
      setRegAiError("인터넷 연결을 확인하고 다시 시도해 주세요. (다른 화면에 다녀와도 만들던 리포트는 이어서 저장돼요)");
    } finally {
      setRegGenerating(false);
    }
  };

  // 돌아왔을 때 이어 받기.
  const regWaiting = usePendingResult(pendingKey, async (since) => {
    const { data: row } = await supabase.from("session_log").select("*").eq("id", cur.id).maybeSingle();
    return isNewerThan(row?.report?.regBriefMeta?.generatedAt, since) ? row : null;
  }, (row) => {
    setContracts((p) => p.map((c) => (c.id === row.id ? row : c)));
    setRegBrief(row.report.reg_brief);
    setRegBriefMeta(row.report.regBriefMeta);
  });

  // 재등록 세일즈북 — phase:"reg_salesbook". 숫자는 changeData(앱 계산)로 렌더 · AI는 텍스트만.
  const generateRegSalesbook = async () => {
    if (sbGenerating || !cur || !isCurrent) return;
    setSbGenerating(true); setSbErr("");
    try {
      const rp = regBrief?.recommended_program || null;
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
      if (!res.ok) { const d = await res.json().catch(() => ({})); console.error("재등록 세일즈북 실패", d); setSbErr(d.error || "세일즈북을 만들지 못했어요. 다시 시도해 주세요."); return; }
      const data = await res.json();
      setRegSb(data);
      if (supabase) {
        const row = await patchReport({ reg_salesbook: data, regSalesbookMeta: { generatedAt: new Date().toISOString() } });
        if (!row) setSbErr("세일즈북을 저장하지 못했어요. 지금은 이 화면에서만 보여요.");
      }
    } catch (e) {
      console.error(e);
      setSbErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSbGenerating(false);
    }
  };

  if (!cur) {
    return (
      <Card className="text-center">
        <RefreshCw className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <p className="mt-3 text-[15px] font-semibold text-ink">아직 계약이 없어요</p>
        <p className="mt-1 text-[13px] text-sub">자료남기기 탭에서 계약을 먼저 등록해 주세요.</p>
        <Link href={`/pt/${member.id}/write`} className="mt-3 inline-flex min-h-[40px] items-center rounded-lg px-3 text-[13px] font-semibold text-primary-strong hover:bg-primary-soft">자료남기기로 가기</Link>
      </Card>
    );
  }

  const savedResult = cur.reg_result && cur.reg_result !== "none" ? cur.reg_result : null;
  const resultDirty = regResult !== (cur.reg_result ?? "none") || (regReason || "") !== (cur.reg_reason ?? "") || (regReapproachAt || "") !== (cur.reg_reapproach_at ?? "");

  return (
    <div className="space-y-5 break-keep text-pretty">
      {/* 회차 — 두 번째 계약부터. 지난 회차 리포트·결과를 다시 본다. */}
      {targetIdx >= 1 && (
        <div className="flex overflow-x-auto">
          <nav className="flex gap-1 rounded-full bg-elevate p-[3px]" aria-label="재등록 회차">
            {ordered.slice(0, targetIdx + 1).map((c, i) => {
              const on = c.id === cur.id;
              return (
                <button key={c.id} type="button" onClick={() => setSelId(c.id === target.id ? null : c.id)} aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full px-3.5 text-[13px] transition ${on ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
                  {roundLabel(i)}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* 이 회차 한 줄 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">{roundLabel(curIdx)}</span>
        <span className="text-[13px] text-sub">
          {isCurrent
            ? `이번 계약 ${cur.sessions_total ?? 0}회${cur.service_sessions ? ` + 서비스 ${cur.service_sessions}회` : ""} 중 ${usedOnCur}회 진행 · 남은 ${rem.total}회`
            : `${String(cur.started_at ?? "").slice(0, 10).replaceAll("-", ".")} 시작한 계약 · ${cur.sessions_total ?? 0}회`}
        </span>
        {due && <span className="rounded-full bg-pt-soft px-2 py-0.5 text-[11.5px] font-semibold text-pt-text">재등록 타이밍</span>}
      </div>
      {queued.length > 0 && !savedResult && (
        <p className="rounded-xl bg-elevate px-3.5 py-2.5 text-[13px] leading-relaxed text-sub">
          다음 계약이 이미 등록돼 있어요. 아래 결과에서 <b className="font-semibold text-ink">재등록했어요</b>를 저장해 두면 재등록률에 들어가요.
        </p>
      )}

      {/* 1. 회원 만족도 — 리포트의 근거. 누르면 바로 저장. */}
      <Card as="section">
        <SectionTitle icon={Heart} aside={satSaving ? "저장 중…" : null}>회원 만족도</SectionTitle>
        <p className="-mt-1.5 mb-3 text-[13px] text-sub">리포트가 이걸 근거로 &lsquo;왜 더 해야 하는지&rsquo;를 짜요.</p>
        <div className="flex flex-wrap gap-1.5">
          {SAT_OPTS.map((o) => (
            <Chip key={o.value} on={satLevel === o.value} disabled={satSaving}
              onClick={() => { const v = satLevel === o.value ? "" : o.value; setSatLevel(v); saveSat(v, satQuote); }}>
              {o.label}
            </Chip>
          ))}
        </div>
        <input value={satQuote} onChange={(e) => setSatQuote(e.target.value)} onBlur={() => saveSat(satLevel, satQuote)}
          className="mt-2.5 w-full rounded-lg border border-line bg-elevate px-3 py-2.5 text-[14px] text-ink outline-none focus:border-primary"
          placeholder="회원이 한 말 · 좋았던 점이나 아쉬운 점 (예: 허리 안 아파서 출근이 편해요)" />
        {isCurrent && hasChange && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
            함께 넘기는 변화: {[...changeData.inbody.slice(0, 2).map((c) => `${c.label} ${c.first}→${c.latest}${c.unit}`), ...changeData.exercises.slice(0, 2).map((e) => `${e.exercise} ${e.first}→${e.latest}kg`)].join(" · ")}
          </p>
        )}
      </Card>

      {/* 2. 재등록 사전 준비 리포트 — OT와 같은 한 장 문서 */}
      {(isCurrent || regBrief) && (
        <AIBriefBlock
          bare
          status={regGenerating || regWaiting ? "loading" : regBrief ? "ready" : "idle"}
          title="재등록 사전 준비 리포트"
          generateLabel="재등록 리포트 만들기"
          idleDescription={`${member.name} 회원의 ${curIdx >= 1 ? "지난 재등록 이후 이번 계약 기간과 " : ""}첫 수업부터 지금까지의 변화(인바디 · 운동 무게 · 출석)와 위 만족도를 근거로, 오늘 수업에서 재등록까지 잇는 리포트를 만들어요. 맨 위 30초 요약, 그다음 변화 · 오늘 수업 흐름 · 클로징 · 거절 대응 순서예요.`}
          waitingHint="1~2분 걸려요. 다른 화면에 다녀와도 괜찮아요. 만들던 리포트는 저장돼 있다가 돌아오면 바로 떠요."
          onGenerate={isCurrent ? generateReReg : undefined}
          onRegenerate={isCurrent ? generateReReg : undefined}
          notice={regAiError || undefined}
          meta={regBrief && regBriefMeta?.generatedAt && (
            <span>{new Date(regBriefMeta.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}에 만들었어요</span>
          )}
        >
          {regBrief && <PrepReport kind="reregister" data={regBrief} packages={packages} highlightReason={regReason} />}
        </AIBriefBlock>
      )}

      {!isCurrent && !regBrief && !regSb && (
        <p className="px-1 text-[13px] text-muted">이 회차엔 만든 리포트 · 세일즈북이 없어요.</p>
      )}

      {/* 3. 재등록 세일즈북(회원에게 보여주기) */}
      {(isCurrent || regSb) && (
        <Card as="section">
          <SectionTitle icon={BookOpen} aside={regSb ? "준비됐어요" : null}>재등록 세일즈북</SectionTitle>
          <p className="-mt-1.5 text-[13px] leading-relaxed text-sub">
            {sbGenerating ? "그동안의 변화를 정리하고 있어요…"
              : regSb ? "수업 중이나 끝나고 회원에게 그대로 보여 주세요. 홈의 세일즈북에서도 열 수 있어요."
              : hasChange ? "인바디 · 운동 기록을 근거로 회원에게 보여 줄 세일즈북을 만들어요."
              : "아직 변화 기록(인바디 · 종목 세트)이 적어요. 그래도 만들 수 있지만, 인바디를 한 번 기록하면 표가 확 살아나요."}
          </p>
          {sbErr && <p className="mt-2 text-[12.5px] text-danger-text">{sbErr}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {regSb && (
              <Button variant="primary" size="sm" onClick={() => setSbOpen(true)}>
                <Eye className="h-3.5 w-3.5" /> 회원에게 보여주기
              </Button>
            )}
            {isCurrent && (
              <Button variant={regSb ? "ghost" : "primary"} size="sm" onClick={generateRegSalesbook} disabled={sbGenerating}>
                <RefreshCw className={`h-3.5 w-3.5 ${sbGenerating ? "animate-spin" : ""}`} />
                {sbGenerating ? "만드는 중…" : regSb ? "다시 만들기" : "세일즈북 만들기"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* 4. 재등록 결과(수업 후) */}
      <Card as="section">
        <SectionTitle icon={Flag}>오늘 어떻게 끝났나요?</SectionTitle>
        <div className="grid gap-2">
          {RESULTS.map((r) => {
            const on = regResult === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setRegResult(r.value)} aria-pressed={on} disabled={regSaving}
                className={`flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition ${on ? "border-primary bg-primary-soft" : "border-line bg-card hover:border-line-strong"}`}>
                <span>
                  <span className={`block text-[15px] ${on ? "font-bold text-primary-strong" : "font-semibold text-ink"}`}>{r.label}</span>
                  {r.hint && isCurrent && <span className="block text-[12px] text-muted">{r.hint}</span>}
                </span>
                {on && <Check className="h-5 w-5 shrink-0 text-primary-strong" strokeWidth={3} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {(regResult === "hold" || regResult === "fail") && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold text-ink">망설인 이유</p>
            <div className="flex flex-wrap gap-1.5">
              {REG_REASON_OPTS.map((o) => (
                <Chip key={o.value} on={regReason === o.value} disabled={regSaving} onClick={() => setRegReason(regReason === o.value ? "" : o.value)}>{o.label}</Chip>
              ))}
            </div>
          </div>
        )}
        {regResult === "hold" && (
          <div className="mt-4"><ReapproachDateField value={regReapproachAt} onChange={setRegReapproachAt} /></div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[12px] leading-relaxed text-muted">
            {regResult === "success" && isCurrent && queued.length === 0
              ? <>결과만 남는 거예요. 새 계약은 <Link href={`/pt/${member.id}/write`} className="font-semibold text-ink underline underline-offset-2">자료남기기</Link>의 &lsquo;재등록&rsquo;으로 등록해요.</>
              : savedResult ? "저장된 결과를 바꿀 수 있어요." : "수업이 끝나면 남겨 주세요."}
          </p>
          <Button variant="primary" size="sm" onClick={saveReg} disabled={regSaving || !resultDirty} className="shrink-0">
            {regSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Card>

      {sbOpen && regSb && (
        <RegSalesbookView
          regSalesbook={regSb}
          member={member}
          trainer={null}
          packages={packages}
          recommendedProgram={regBrief?.recommended_program || null}
          change={changeData}
          startPresent={wantSb}
          onClose={() => setSbOpen(false)}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
