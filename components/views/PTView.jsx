"use client";

/* =========================================================================
   PT 뷰 — §5 하이브리드. 본체 = '수업 확인서 겸 운동일지' 저장(손입력 기본 + 노쇼).
   저장 성공 = 세션 차감(잔여는 파생 — daily_workout_log 행이 꽂히면 곧 −1).
   잔여 "유료 N + 서비스 M"는 memberStatus 순수함수(activeContract·remainingSessions) 파생.
   음성 서브·카톡 복사·sent_at은 step3-1b, 계약 생성 금액입력은 별도 작업.
   ========================================================================= */

import { useEffect, useState } from "react";
import { ChevronLeft, Dumbbell, NotebookPen, UserX } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { activeContract, remainingSessions, reregisterDue, buildContract } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import VoiceLogTab from "@/components/tabs/VoiceLogTab";
import ContractAmountFields from "@/components/views/ContractAmountFields";

export default function PTView({ member, onGoList }) {
  const [contracts, setContracts] = useState([]); // session_log (계약)
  const [logs, setLogs] = useState([]); // daily_workout_log (수업로그)
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState(""); // 손입력 수업 내용/피드백
  const [rawText, setRawText] = useState(""); // 음성 STT 원본(voice일 때만 저장)
  const [usedVoice, setUsedVoice] = useState(false); // 음성으로 채웠나 → source 판정
  const [saving, setSaving] = useState(false);
  // 계약 등록 회복 모달(①/② 실패 회복 · ③ 재등록 씨앗) — 금액 4칸은 ContractAmountFields 재사용.
  const [showContract, setShowContract] = useState(false);
  const [cSessions, setCSessions] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cAmountEdited, setCAmountEdited] = useState("");
  const [cSvc, setCSvc] = useState("");
  const [cErr, setCErr] = useState("");
  const [cSaving, setCSaving] = useState(false);
  const { toast, showToast } = useToast();

  // 회원 변경 시 계약 모달 상태 리셋 → 이전 회원값 오등록 방지. (early return 없어 위치 자유)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowContract(false);
    setCSessions("");
    setCPrice("");
    setCAmountEdited("");
    setCSvc("");
    setCErr("");
  }, [member?.id]);

  // 회원 변경 시 계약·수업로그 로드. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) {
          setContracts([]);
          setLogs([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*").eq("user_id", member.id),
        supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
      ]);
      if (cancelled) return;
      setContracts(cs || []);
      setLogs(ls || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  // 파생 — 렌더마다 계산(순수함수, 훅 불필요). active null이면 rem {0,0,0}·due false.
  const active = activeContract(contracts, logs);
  const rem = remainingSessions(active, logs);
  const due = reregisterDue(active, logs);
  const cAuto = (Number(cSessions) || 0) * (Number(cPrice) || 0); // 총액 자동(수정 없으면)

  // 음성 STT 결과 → textarea 채움(이후 손편집). 기존 body 덮어씀(녹음은 의도적 행위).
  const handleVoiceResult = (raw, summaryText) => {
    setBody(summaryText || "");
    setRawText(raw || "");
    setUsedVoice(true);
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
    };
    const clearForm = () => {
      setBody("");
      setRawText("");
      setUsedVoice(false);
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
      sessions_total: Number(cSessions),
      price_per_session: Number(cPrice),
      amount_total: cAmountEdited === "" ? cAuto : Number(cAmountEdited) || cAuto,
      service_sessions: cSvc === "" ? 0 : Number(cSvc) || 0,
    });
    if (!supabase) {
      setContracts((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      setShowContract(false);
      setCSaving(false);
      showToast("계약 등록됨(데모)");
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
    showToast("계약 등록됨 · 잔여 반영");
  };

  return (
    <div className="space-y-6">
      {onGoList && (
        <button
          onClick={onGoList}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition hover:text-emerald-400"
        >
          <ChevronLeft className="h-4 w-4" /> 회원 목록
        </button>
      )}
      {/* 회원 기본정보 (간단) */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
          PT 회원
        </span>
        <h1 className="mt-2 text-2xl font-bold text-zinc-50">
          {member.name}
          <span className="ml-2 font-mono text-base font-normal text-zinc-500">{member.age}세</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {member.job} · 목표 <span className="font-semibold text-emerald-400">{member.goal}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">거주 {member.residence}</span>
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">MBTI {member.mbti}</span>
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">불편 {member.pain}</span>
        </div>
      </section>

      {/* 수업 확인서 겸 운동일지 — 손입력 저장 = 차감 (③ step3-1a) */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <Eyebrow icon={NotebookPen}>수업 확인서 · 운동일지</Eyebrow>

        {/* 잔여 카드 */}
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          {active ? (
            <div className="flex flex-wrap items-center gap-3">
              <Dumbbell className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-sm text-zinc-300">
                잔여 유료 <b className="text-emerald-400">{rem.paid}</b> · 서비스{" "}
                <b className="text-zinc-100">{rem.service}</b>
              </span>
              {due && (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  재등록 타이밍
                </span>
              )}
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-sm text-zinc-400">
                <Dumbbell className="h-4 w-4 shrink-0 text-zinc-600" />
                활성 계약 없음 — 등록/재등록이 필요합니다.
              </p>
              <button
                onClick={() => setShowContract(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-1.5 text-xs font-bold text-zinc-950 transition active:scale-95"
              >
                <Dumbbell className="h-3.5 w-3.5" /> 계약 등록
              </button>
            </div>
          )}
        </div>

        {/* 음성으로 채우기 (선택 · 서브) — 손입력이 주(主), 음성은 STT로 아래 칸을 채워주는 보조. 저장·차감은 아래 한 곳. */}
        <details className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400">
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
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500/50 disabled:opacity-50"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => saveLog(usedVoice ? "voice" : "manual")}
            disabled={saving || loading || !body.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
          >
            <NotebookPen className="h-4 w-4" strokeWidth={2.5} />
            {saving ? "저장 중…" : "저장 + 차감"}
          </button>
          <button
            onClick={() => saveLog("noshow")}
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-red-500/50 hover:text-red-300 active:scale-95 disabled:opacity-50"
          >
            <UserX className="h-4 w-4" /> 노쇼 차감
          </button>
        </div>
      </section>

      {/* 계약 등록 모달 — PtConfirmBanner 확인모달과 동일 톤. buildContract·ContractAmountFields 재사용. */}
      {showContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !cSaving && setShowContract(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-5 w-5 shrink-0 text-emerald-400" />
              <h3 className="text-base font-bold text-zinc-100">계약 등록</h3>
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              세션수·회당단가를 입력하면 총액이 자동 계산됩니다(할인이면 총액 수정).
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

            {cErr && <p className="mb-3 text-xs font-medium text-red-400">{cErr}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowContract(false)}
                disabled={cSaving}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 active:scale-95 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={saveContract}
                disabled={cSaving}
                className="rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
              >
                {cSaving ? "등록 중…" : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
