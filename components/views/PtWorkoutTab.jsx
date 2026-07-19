"use client";

/* =========================================================================
   PT 운동일지 탭 — PTView 본체(수업 확인서·운동일지·방향·급한불·타임라인·계약)를
   자기완결 탭으로 이관. 공유 데이터(contracts/logs/loading)만 props, 나머지는 자기 소유.
   회원전환 리셋은 부모가 key로 리마운트(자동). 재등록 결과·브리핑은 PtReRegTab 소관.
   ========================================================================= */

import { useState, useEffect } from "react";
import { ChevronDown, ClipboardList, Compass, Dumbbell, Flame, History, LineChart, Minus, NotebookPen, RefreshCw, TrendingDown, TrendingUp, UserX } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { activeContract, remainingSessions, reregisterDue, buildContract } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import VoiceLogTab from "@/components/tabs/VoiceLogTab";
import ContractAmountFields from "@/components/views/ContractAmountFields";
import AcuteBriefView from "@/components/views/AcuteBriefView";
import { SOURCE_OPTS, labelOf } from "@/lib/labels";
import { hasVal } from "@/lib/format";
import SetsEditor from "@/components/views/SetsEditor";
import Sparkline from "@/components/ui/Sparkline";
import { cleanStructured, buildExerciseSeries } from "@/lib/workout";
import MemberCardioSummary from "@/components/views/MemberCardioSummary";
import MemberPhotoSummary from "@/components/views/MemberPhotoSummary";
import MemberScheduleSummary from "@/components/views/MemberScheduleSummary";

// 날짜·시간 (session_at ?? created_at). 로컬 헬퍼 — fmt 의존 안 만듦(단일 파일 유지).
function fmtDT(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
// source 배지 정적 클래스 맵(Tailwind purge 안전 — 동적 조립 금지).
const SOURCE_TONE = {
  manual: "border-line bg-elevate text-sub",
  voice:  "border-sky-500/30 bg-sky-500/10 text-sky-700",
  noshow: "border-red-500/30 bg-red-500/10 text-red-600",
};

// 무게 delta 색(증가=good) — 공유 import 아니라 로컬 선언(purge-safe · 동적 조립 금지).
const DELTA_TONE = { good: "text-primary-strong", bad: "text-rose-600", flat: "text-muted" };
const weightTone = (d) => (d > 0 ? "good" : d < 0 ? "bad" : "flat");

export default function PtWorkoutTab({ member, onMemberPatch, contracts, setContracts, logs, setLogs, loading, mode, children }) {
  const [body, setBody] = useState(""); // 손입력 수업 내용/피드백
  const [rawText, setRawText] = useState(""); // 음성 STT 원본(voice일 때만 저장)
  const [usedVoice, setUsedVoice] = useState(false); // 음성으로 채웠나 → source 판정
  const [sets, setSets] = useState([]); // 저장 대기 구조화 세트(음성 자동채움/손입력)
  const [saving, setSaving] = useState(false);
  // 계약 등록 회복 모달(①/② 실패 회복 · ③ 재등록 씨앗) — 금액 4칸은 ContractAmountFields 재사용.
  const [showContract, setShowContract] = useState(false);
  const [cSessions, setCSessions] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cAmountEdited, setCAmountEdited] = useState("");
  const [cSvc, setCSvc] = useState("");
  const [cErr, setCErr] = useState("");
  const [cSaving, setCSaving] = useState(false);
  // 현재 방향/목표(③ 작업3-2) — goal(OT 스냅샷)과 별개, PT 관리 중 갱신되는 살아있는 축.
  const [direction, setDirection] = useState(member.pt_direction ?? "");
  const [editingDir, setEditingDir] = useState(false);
  const [dirSaving, setDirSaving] = useState(false);
  // 급한불(⑤) — 회원 급변 대처. 세션 전용(DB 무관·캐시 없음).
  const [acuteSituation, setAcuteSituation] = useState("");
  const [acuteBrief, setAcuteBrief] = useState(null);
  const [acuteMeta, setAcuteMeta] = useState(null);
  const [acuteGenerating, setAcuteGenerating] = useState(false);
  const [acuteError, setAcuteError] = useState("");
  const { toast, showToast } = useToast();
  // 센터 보유 머신 이름(세트 그리드 자동완성용). 데모면 빈 목록 = 기존처럼 자유 타이핑.
  const [machineOptions, setMachineOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return; // 데모면 빈 목록 = 자유 타이핑
      const { data } = await supabase.from("center_machine").select("name").order("name", { ascending: true });
      if (cancelled) return;
      const names = [...new Set((data || []).map((r) => (r.name || "").trim()).filter(Boolean))];
      setMachineOptions(names);
    })();
    return () => { cancelled = true; };
  }, []);

  // 파생 — 렌더마다 계산(순수함수, 훅 불필요). active null이면 rem {0,0,0}·due false.
  const active = activeContract(contracts, logs);
  const rem = remainingSessions(active, logs);
  const due = reregisterDue(active, logs);
  const isReReg = !!active; // 활성 계약 있는 상태의 계약 추가 = 재등록(FIFO 대기). 라벨·토스트 분기용.
  // 활성(FIFO 최고참) 외 잔여>0 계약 = 대기분. 미리 재등록 시 "안 늘었네?" 오해 방지용 표시.
  const pendingTotal = contracts
    .filter((c) => c.id !== active?.id && remainingSessions(c, logs).total > 0)
    .reduce((s, c) => s + remainingSessions(c, logs).total, 0);

  const cAuto = (Number(cSessions) || 0) * (Number(cPrice) || 0); // 총액 자동(수정 없으면)
  // 타임라인 — session_at ?? created_at 역순. 저장 시 append돼도 정렬이 최신을 위로.
  const timeline = [...logs].sort(
    (a, b) => new Date(b.session_at ?? b.created_at ?? 0) - new Date(a.session_at ?? a.created_at ?? 0)
  );
  // ③ 종목별 무게 추이 — logs 클라 집계(추가 쿼리 0). 무게 데이터 있는 종목만 그래프.
  const exerciseSeries = buildExerciseSeries(logs).filter((s) =>
    s.points.some((p) => p.topWeight != null)
  );

  // 음성 STT 결과 → textarea 채움(이후 손편집). 기존 body 덮어씀(녹음은 의도적 행위).
  const handleVoiceResult = (raw, summaryText, structured) => {
    setBody(summaryText || "");
    setRawText(raw || "");
    setUsedVoice(true);
    setSets(Array.isArray(structured) ? structured : []);
  };

  // 클립보드 복사 (VoiceLogTab 기존 패턴 재사용).
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }
  };

  // 공통 저장 경로 — 손입력(manual)·음성(voice)·노쇼(noshow) 한 곳. 성공 = 차감(행 꽂힘).
  const saveLog = async (source) => {
    if (saving) return;
    setSaving(true);
    // 비노쇼면 저장 전 body 카톡 복사(성공 시 sent_at 증거 프록시).
    let copied = false;
    let sentAt = null;
    if (source !== "noshow") {
      copied = await copyToClipboard(body);
      if (copied) sentAt = new Date().toISOString();
    }
    const payload = {
      user_id: member.id,
      ai_summary: source === "noshow" ? null : body.trim() || null,
      raw_voice_text: source === "voice" ? rawText || null : null,
      contract_id: active?.id ?? null, // 계약 없음/전소진이면 null(안전)
      session_at: new Date().toISOString(), // 기본 now (수정 UI는 후속)
      source,
      sent_at: sentAt,
      sets_structured:
        source === "noshow" ? null : (cleanStructured(sets).length ? cleanStructured(sets) : null),
    };
    const clearForm = () => {
      setBody("");
      setRawText("");
      setUsedVoice(false);
      setSets([]);
    };
    // 데모 가드 — DB 없이 낙관적 반영(복사는 위에서 이미 시도).
    if (!supabase) {
      setLogs((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      if (source !== "noshow") clearForm();
      showToast(
        source === "noshow"
          ? "노쇼 저장됨(데모) · 차감 반영"
          : copied
          ? "저장됨(데모) · 차감 · 카톡 복사됨"
          : "저장됨(데모) · 차감됨 (복사 실패 — 길게 눌러 복사)"
      );
      setSaving(false);
      return;
    }
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 성공 확정.
    try {
    const { data, error } = await supabase
      .from("daily_workout_log")
      .insert(payload)
      .select();
    if (error || !data || data.length === 0) {
      showToast("저장 실패 — 차감 안 됨. 다시 시도하세요");
      setSaving(false);
      return;
    }
    setLogs((p) => [...p, data[0]]); // 낙관적 → 잔여 즉시 −1
    if (source !== "noshow") clearForm();
    showToast(
      source === "noshow"
        ? "노쇼 저장됨 · 차감 반영"
        : copied
        ? "저장됨 · 차감 · 카톡 복사됨"
        : "저장됨 · 차감됨 (복사 실패 — 길게 눌러 복사)"
    );
      setSaving(false);
    } catch {
      showToast("저장 실패 — 차감 안 됨. 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };

  // 계약 등록 — buildContract INSERT + .select() 하드닝. 성공 시 contracts 낙관적 추가(잔여 즉시 반영).
  const saveContract = async () => {
    if (cSaving) return;
    if (!(Number(cSessions) > 0 && Number(cPrice) > 0)) {
      setCErr("세션수·회당단가를 입력하세요");
      return;
    }
    setCErr("");
    setCSaving(true);
    const payload = buildContract({
      userId: member.id,
      origin: member.origin,
      kind: isReReg ? "reregister" : "new",
      sessions_total: Number(cSessions),
      price_per_session: Number(cPrice),
      amount_total: cAmountEdited === "" ? cAuto : Number(cAmountEdited) || cAuto,
      service_sessions: cSvc === "" ? 0 : Number(cSvc) || 0,
    });
    if (!supabase) {
      setContracts((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      setShowContract(false);
      setCSaving(false);
      showToast(isReReg ? "재등록됨(데모) · 기존 잔여 소진 후 적용" : "계약 등록됨(데모)");
      return;
    }
    const { data, error } = await supabase.from("session_log").insert(payload).select();
    if (error || !data || data.length === 0) {
      setCErr("저장 실패 — 다시 시도하세요");
      setCSaving(false);
      return;
    }
    setContracts((p) => [...p, data[0]]); // 낙관적 → 잔여 즉시 반영
    setShowContract(false);
    setCSaving(false);
    showToast(isReReg ? "재등록됨 · 기존 잔여 소진 후 적용" : "계약 등록됨 · 잔여 반영");
  };

  // 현재 방향/목표 저장 — user_table UPDATE + .select() 하드닝(교훈1). 성공 시 page.jsx 회원배열도 반영.
  const saveDirection = async () => {
    if (dirSaving) return;
    setDirSaving(true);
    const next = direction.trim();
    if (!supabase) {
      onMemberPatch?.(member.id, { pt_direction: next });
      setEditingDir(false);
      setDirSaving(false);
      showToast("방향 저장됨(데모)");
      return;
    }
    const { data, error } = await supabase
      .from("user_table")
      .update({ pt_direction: next || null })
      .eq("id", member.id)
      .select();
    if (error || !data || data.length === 0) {
      showToast("방향 저장 실패 — 다시 시도하세요");
      setDirSaving(false);
      return;
    }
    onMemberPatch?.(member.id, { pt_direction: next });
    setEditingDir(false);
    setDirSaving(false);
    showToast("현재 방향 저장됨");
  };

  // 급한불(⑤) 생성 — /api/ot-brief phase:"acute". 세션 전용(캐시·DB write 없음).
  const generateAcute = async () => {
    if (acuteGenerating) return;
    const situation = acuteSituation.trim();
    if (!situation) return;
    setAcuteGenerating(true);
    setAcuteError("");
    try {
      const acuteContext = {
        situation,
        recent_logs: timeline.filter((l) => !l.voided && l.ai_summary).slice(0, 3).map((l) => l.ai_summary),
      };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "acute", member, acuteContext }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAcuteError(d.error || "AI 생성에 실패했습니다.");
        return;
      }
      const data = await res.json();
      setAcuteBrief(data);
      setAcuteMeta({ generatedAt: new Date().toISOString() });
    } catch (e) {
      setAcuteError("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setAcuteGenerating(false);
    }
  };

  const goalSet = hasVal(member.goal) && member.goal !== "미설정";

  return (
    <div className="space-y-6">
      {/* ═══ 회원자료(열람) ═══ */}

      {/* 회원 기본정보 (간단) */}
      {mode !== "record" && (
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <span className="inline-block rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-strong">
          PT 회원
        </span>
        <h1 className="mt-2 text-2xl font-bold text-ink">
          {member.name}
          {hasVal(member.age) && <span className="ml-2 font-mono text-base font-normal text-muted">{member.age}세</span>}
        </h1>
        <p className="mt-1 text-sm text-sub">
          {hasVal(member.job) && <>{member.job} · </>}목표{" "}
          {goalSet
            ? <span className="font-semibold text-primary-strong">{member.goal}</span>
            : <span className="text-muted">미설정</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-sub">
          {hasVal(member.residence) && <span className="rounded-md bg-elevate px-2 py-1">거주 {member.residence}</span>}
          {hasVal(member.mbti) && <span className="rounded-md bg-elevate px-2 py-1">MBTI {member.mbti}</span>}
          {hasVal(member.pain) && <span className="rounded-md bg-elevate px-2 py-1">불편 {member.pain}</span>}
        </div>
      </section>
      )}

      {/* 잔여 현황(읽기 전용) — 신규 */}
      {mode !== "record" && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <Eyebrow icon={Dumbbell}>잔여 현황</Eyebrow>
          {active ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-sub">잔여 유료 <b className="text-primary-strong">{rem.paid}</b> · 서비스 <b className="text-ink">{rem.service}</b></span>
              {due && <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">재등록 타이밍</span>}
              {pendingTotal > 0 && <span className="rounded-md border border-line bg-elevate px-2 py-0.5 text-[10px] font-semibold text-sub">다음 계약 {pendingTotal}회 대기</span>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">활성 계약 없음 — &lsquo;자료남기기&rsquo;에서 등록하세요.</p>
          )}
        </section>
      )}

      {/* 지난 수업 타임라인 (③ 작업3-1) — 렌더만. voided 무르기·session_at 수정은 후속(3-1b). */}
      {mode !== "record" && (
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={History}>지난 수업</Eyebrow>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted">아직 기록된 수업이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((log) => (
              <li
                key={log.id}
                className={`rounded-xl border border-line bg-elevate p-3 ${log.voided ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-sub">{fmtDT(log.session_at ?? log.created_at)}</span>
                  {log.source && (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[log.source] ?? "border-line bg-elevate text-sub"}`}>
                      {labelOf(SOURCE_OPTS, log.source)}
                    </span>
                  )}
                  {log.sent_at && (
                    <span className="rounded-md border border-primary/30 bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-strong">
                      카톡 전송
                    </span>
                  )}
                  {log.voided && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      취소됨
                    </span>
                  )}
                </div>
                {log.source === "noshow" ? (
                  <p className="mt-1.5 text-sm font-medium text-amber-700">노쇼 🚫</p>
                ) : log.ai_summary ? (
                  <details className="group mt-1.5">
                    {/* 힌트는 summary 안에 둔다 — 네이티브 details는 닫힘 시 summary 외 자식을 숨기므로. */}
                    <summary className={`cursor-pointer list-none group-open:hidden ${log.voided ? "line-through" : ""}`}>
                      <span className="text-sm text-sub line-clamp-3">
                        {log.ai_summary}
                      </span>
                      <span className="mt-1 block text-[10px] font-medium text-muted">더 보기</span>
                    </summary>
                    <p className={`hidden whitespace-pre-wrap text-sm text-sub group-open:block ${log.voided ? "line-through" : ""}`}>
                      {log.ai_summary}
                    </p>
                  </details>
                ) : (
                  <p className="mt-1.5 text-sm text-muted">본문 없음</p>
                )}
                {Array.isArray(log.sets_structured) && log.sets_structured.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {log.sets_structured.map((ex, i) => (
                      <span key={i} className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[10px] text-sub">
                        {ex.exercise} {ex.sets.map((s) => `${s.weight ?? "–"}${s.weight != null ? "kg" : ""}×${s.reps ?? "–"}`).join("·")}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* 종목별 무게 추이 (③ 작업3-2) — logs 클라 집계(추가 쿼리 0). 인바디 추이 패턴 재사용.
          무게 데이터 있는 종목만. 진행 지표 = 세션별 최고중량(topSetWeight). */}
      {mode !== "record" && (
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={LineChart}>종목별 무게 추이</Eyebrow>
        {exerciseSeries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">세트를 기록하면 종목별 무게 변화가 여기 표시됩니다.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {exerciseSeries.map((s) => {
              const wpts = s.points.map((p) => p.topWeight).filter((v) => v != null);
              const latest = wpts.length ? wpts[wpts.length - 1] : null;
              const prev = wpts.length > 1 ? wpts[wpts.length - 2] : null;
              const d = latest != null && prev != null ? latest - prev : 0;
              const tone = prev != null ? weightTone(d) : null;
              const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
              return (
                <div key={s.exercise} className="rounded-xl border border-line bg-elevate p-3">
                  <div className="truncate text-[11px] font-medium text-muted" title={s.exercise}>
                    {s.exercise}
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold text-ink">
                    {latest == null ? "–" : latest}
                    <span className="ml-1 text-xs font-normal text-muted">kg</span>
                  </div>
                  {tone && (
                    <div className={`mt-0.5 flex items-center gap-1 text-[12px] font-semibold ${DELTA_TONE[tone]}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {(d > 0 ? "+" : "") + Math.round(d * 10) / 10}kg
                    </div>
                  )}
                  <Sparkline values={wpts} />
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* 인바디 추이(children · 열람) */}
      {mode === "view" && children}

      {/* 회원 자가입력 기록(M1·M2·M3) — 트레이너 읽기 전용. 기본 접힘(운동일지 밀도↓).
          각 요약은 0건·데모면 자체 숨김. summary는 헤더 바(카드), 내부는 기존 섹션 카드 3개. */}
      {mode !== "record" && (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-line bg-card px-5 py-4 shadow-sm [&::-webkit-details-marker]:hidden">
          <Eyebrow icon={ClipboardList}>회원님 기록일지 · 개인운동 · 유산소 · 비포애프터</Eyebrow>
          <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-6">
          <MemberScheduleSummary member={member} />
          <MemberCardioSummary member={member} />
          <MemberPhotoSummary member={member} mode="list" />
        </div>
      </details>
      )}

      {/* ═══ 자료남기기(기록) ═══ */}

      {/* 현재 방향/목표 — PT 살아있는 상태축(③ 작업3-2). goal(OT 스냅샷)과 별개. */}
      {mode !== "view" && (
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <Eyebrow icon={Compass}>현재 방향 · 목표</Eyebrow>
          {!editingDir && (
            <button
              onClick={() => setEditingDir(true)}
              className="text-xs font-medium text-sub transition hover:text-primary-strong"
            >
              {direction ? "수정" : "설정"}
            </button>
          )}
        </div>
        {editingDir ? (
          <div className="mt-3">
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              disabled={dirSaving}
              rows={3}
              placeholder="이 회원 PT의 현재 방향·목표 (관리하며 갱신)"
              className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setDirection(member.pt_direction ?? ""); setEditingDir(false); }} disabled={dirSaving}>
                취소
              </Button>
              <Button variant="primary" size="sm" onClick={saveDirection} disabled={dirSaving}>
                {dirSaving ? "저장 중…" : "저장"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-sub">
            {direction || <span className="text-muted">아직 방향이 설정되지 않았습니다.</span>}
          </p>
        )}
      </section>
      )}

      {/* 수업 확인서 겸 운동일지 — 손입력 저장 = 차감 (③ step3-1a) */}
      {mode !== "view" && (
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={NotebookPen}>수업 확인서 · 운동일지</Eyebrow>

        {/* 잔여 카드 */}
        <div className="mb-4 rounded-xl border border-line bg-elevate p-4">
          {active ? (
            <div className="flex flex-wrap items-center gap-3">
              <Dumbbell className="h-4 w-4 shrink-0 text-primary-strong" />
              <span className="text-sm text-sub">
                잔여 유료 <b className="text-primary-strong">{rem.paid}</b> · 서비스{" "}
                <b className="text-ink">{rem.service}</b>
              </span>
              {due && (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  재등록 타이밍
                </span>
              )}
              {pendingTotal > 0 && (
                <span className="rounded-md border border-line bg-elevate px-2 py-0.5 text-[10px] font-semibold text-sub">
                  다음 계약 {pendingTotal}회 대기
                </span>
              )}
              <button
                onClick={() => setShowContract(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-strong transition hover:bg-primary-soft active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 재등록
              </button>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-sm text-sub">
                <Dumbbell className="h-4 w-4 shrink-0 text-muted" />
                활성 계약 없음 — 등록/재등록이 필요합니다.
              </p>
              <Button variant="primary" size="sm" onClick={() => setShowContract(true)} className="mt-3">
                <Dumbbell className="h-3.5 w-3.5" /> 계약 등록
              </Button>
            </div>
          )}
        </div>

        {/* 음성으로 채우기 (선택 · 서브) — 손입력이 주(主), 음성은 STT로 아래 칸을 채워주는 보조. 저장·차감은 아래 한 곳. */}
        <details className="mb-3 rounded-xl border border-line bg-elevate p-3">
          <summary className="cursor-pointer text-xs font-medium text-sub">
            🎙 음성으로 채우기 (선택)
          </summary>
          <div className="mt-3">
            <VoiceLogTab member={member} onResult={handleVoiceResult} />
          </div>
        </details>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={saving || loading}
          rows={4}
          placeholder="오늘 수업 내용·피드백 (저장하면 세션 1회 차감)"
          className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50"
        />
        <details className="mb-3 mt-3 rounded-xl border border-line bg-elevate p-3" open={sets.length > 0}>
          <summary className="cursor-pointer text-xs font-medium text-sub">
            🏋 종목·세트 기록 (그래프용 · 선택)
          </summary>
          <div className="mt-3">
            <SetsEditor value={sets} onChange={setSets} disabled={saving || loading} machineOptions={machineOptions} />
          </div>
        </details>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" size="md" onClick={() => saveLog(usedVoice ? "voice" : "manual")} disabled={saving || loading || !body.trim()} className="flex-1 gap-2">
            <NotebookPen className="h-4 w-4" strokeWidth={2.5} />
            {saving ? "저장 중…" : "저장 + 차감"}
          </Button>
          <Button variant="ghost" size="md" onClick={() => saveLog("noshow")} disabled={saving || loading} className="gap-2">
            <UserX className="h-4 w-4" /> 노쇼 차감
          </Button>
        </div>
      </section>
      )}

      {/* 인바디 입력 + 사진 업로드(children · 기록) */}
      {mode === "record" && children}

      {/* 급한불(⑤) — 회원 급변 대처(수업 전 준비). 세션 전용·DB 무관. 상시 의료 배너. */}
      {mode !== "view" && (
      <details className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <Eyebrow icon={Flame}>급한불 — 회원 급변 대처</Eyebrow>
        </summary>
        <div className="mt-4 space-y-3">
          {/* 상시 의료 배너 — AI 출력과 무관하게 항상 노출(이중 방어). */}
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
            <p className="text-[11px] leading-relaxed text-red-700">
              ⚠️ 진단·치료·처방 도구가 아닙니다. 부상·급성 통증은 <b>병원·의료진 판단이 우선</b>입니다.
              아래는 트레이너 판단을 돕는 &lsquo;방향&rsquo;일 뿐 의학적 지시가 아닙니다.
            </p>
          </div>
          <textarea
            value={acuteSituation}
            onChange={(e) => setAcuteSituation(e.target.value)}
            disabled={acuteGenerating}
            rows={2}
            placeholder="회원 급변 상황 한 줄 (예: 어제 데드리프트 후 허리 삐끗, 숙이면 찌릿)"
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">
              {acuteMeta?.generatedAt ? `분석: ${new Date(acuteMeta.generatedAt).toLocaleString("ko-KR")}` : "세션 전용 · 저장 안 됨"}
            </span>
            <button
              onClick={generateAcute}
              disabled={acuteGenerating || !acuteSituation.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
            >
              <Flame className="h-3.5 w-3.5" /> {acuteGenerating ? "분석 중…" : acuteBrief ? "다시 분석" : "급변 대처 분석"}
            </button>
          </div>
          {acuteError && <p className="text-[11px] text-amber-700">{acuteError}</p>}
          <AcuteBriefView brief={acuteBrief} />
        </div>
      </details>
      )}

      {/* 계약 등록 모달 — PtConfirmBanner 확인모달과 동일 톤. buildContract·ContractAmountFields 재사용. */}
      {showContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => !cSaving && setShowContract(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-elevate p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-5 w-5 shrink-0 text-primary-strong" />
              <h3 className="text-base font-bold text-ink">{isReReg ? "재등록" : "계약 등록"}</h3>
            </div>
            <p className="mb-4 text-xs text-muted">
              세션수·회당단가를 입력하면 총액이 자동 계산됩니다(할인이면 총액 수정).
              {isReReg && " 기존 잔여를 먼저 소진한 뒤 이 계약이 적용됩니다(FIFO)."}
            </p>

            <div className="mb-3">
              <ContractAmountFields
                sessions={cSessions} price={cPrice} amountEdited={cAmountEdited} svc={cSvc}
                autoAmount={cAuto} disabled={cSaving}
                onChange={(k, v) => {
                  if (k === "sessions") setCSessions(v);
                  else if (k === "price") setCPrice(v);
                  else if (k === "amountEdited") setCAmountEdited(v);
                  else if (k === "svc") setCSvc(v);
                }}
              />
            </div>

            {cErr && <p className="mb-3 text-xs font-medium text-red-600">{cErr}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setShowContract(false)} disabled={cSaving}>
                취소
              </Button>
              <Button variant="primary" size="md" onClick={saveContract} disabled={cSaving}>
                {cSaving ? (isReReg ? "재등록 중…" : "등록 중…") : (isReReg ? "재등록" : "등록")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
