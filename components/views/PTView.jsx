"use client";

/* =========================================================================
   PT 뷰 — §5 하이브리드. 본체 = '수업 확인서 겸 운동일지' 저장(손입력 기본 + 노쇼).
   저장 성공 = 세션 차감(잔여는 파생 — daily_workout_log 행이 꽂히면 곧 −1).
   잔여 "유료 N + 서비스 M"는 memberStatus 순수함수(activeContract·remainingSessions) 파생.
   음성 서브·카톡 복사·sent_at은 step3-1b, 계약 생성 금액입력은 별도 작업.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Dumbbell, NotebookPen, UserX } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { activeContract, remainingSessions, reregisterDue } from "@/lib/memberStatus";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function PTView({ member }) {
  const [contracts, setContracts] = useState([]); // session_log (계약)
  const [logs, setLogs] = useState([]); // daily_workout_log (수업로그)
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState(""); // 손입력 수업 내용/피드백
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

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

  // 공통 저장 경로 — 손입력(manual)·노쇼(noshow) 한 곳. 성공 = 차감(행 꽂힘).
  const saveLog = async (source) => {
    if (saving) return;
    setSaving(true);
    const payload = {
      user_id: member.id,
      ai_summary: source === "noshow" ? null : body.trim() || null,
      raw_voice_text: null, // 음성은 1b
      contract_id: active?.id ?? null, // 계약 없음/전소진이면 null(안전)
      session_at: new Date().toISOString(), // 기본 now (수정 UI는 후속)
      source,
      sent_at: null, // 카톡 복사는 1b
    };
    // 데모 가드 — DB 없이 낙관적 반영만.
    if (!supabase) {
      setLogs((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      showToast("저장됨(데모) · 차감 반영");
      setBody("");
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
    if (source === "manual") setBody("");
    showToast(source === "noshow" ? "노쇼 저장됨 · 차감 반영" : "저장됨 · 차감 반영");
    setSaving(false);
  };

  return (
    <div className="space-y-6">
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
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <Dumbbell className="h-4 w-4 shrink-0 text-zinc-600" />
              활성 계약 없음 — 등록/재등록이 필요합니다.
            </p>
          )}
        </div>

        {/* TODO(1b): 음성 STT → body 자동채움(서브). 최종 저장은 이 폼 하나로 공통. */}
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
            onClick={() => saveLog("manual")}
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

      <Toast message={toast} />
    </div>
  );
}
