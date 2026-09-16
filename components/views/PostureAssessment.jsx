"use client";

/* =========================================================================
   PostureAssessment — 체형평가(OT 신규 회원 세일즈 도구 · 인바디와 동일 패턴).
   항목별 상태 체크 → posture_assessment 저장 + 최근 프리필 + AI 분석(회원 대면).
   ⚠️ AI 분석은 '앱이 객관 분석' 톤(세일즈 표현 금지) — InbodyAnalysis 재사용(title="체형 분석").
   ⚠️ favorite/마이그레이션 전이면 저장/조회 실패 → 안내(비차단).
   ========================================================================= */

import { useEffect, useState } from "react";
import { PersonStanding, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";
import { authHeader } from "@/lib/authHeader";
import { POSTURE_ITEMS, POSTURE_STATES } from "@/lib/posture";
import InbodyAnalysis from "@/components/views/InbodyAnalysis";

function emptyFindings() {
  const o = {};
  for (const it of POSTURE_ITEMS) o[it.key] = "";
  return o;
}

export default function PostureAssessment({ member }) {
  const [findings, setFindings] = useState(emptyFindings());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [anaLoading, setAnaLoading] = useState(false);
  const [anaNotice, setAnaNotice] = useState("");

  // 최근 평가 프리필(회원 전환은 FirstOTTab이 최상위라 회원 id 바뀌면 재조회).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) return;
      const { data } = await supabase
        .from("posture_assessment")
        .select("*")
        .eq("user_id", member.id)
        .order("assessed_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0] || null;
      if (row?.findings) setFindings({ ...emptyFindings(), ...row.findings });
      if (row?.note) setNote(row.note);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const setF = (k, v) => setFindings((s) => ({ ...s, [k]: v }));
  const cleanFindings = () => {
    const c = {};
    for (const it of POSTURE_ITEMS) if (findings[it.key]) c[it.key] = findings[it.key];
    return c;
  };

  const save = async () => {
    if (saving) return;
    const clean = cleanFindings();
    if (Object.keys(clean).length === 0) { setMsg("항목을 하나 이상 평가하세요."); return; }
    if (!supabase) { setMsg("데모 모드 — 저장하려면 Supabase 키가 필요합니다."); return; }
    setSaving(true); setMsg("");
    const { data, error } = await supabase
      .from("posture_assessment")
      .insert({ user_id: member.id, findings: clean, note: note.trim() || null })
      .select();
    setSaving(false);
    if (error || !data || data.length === 0) {
      setMsg("저장 실패 — 체형평가 마이그레이션이 실행됐는지 확인하세요. " + (error?.message || ""));
      return;
    }
    setMsg("저장됐어요.");
  };

  const analyze = async () => {
    if (anaLoading) return;
    const clean = cleanFindings();
    if (Object.keys(clean).length === 0) { setAnaNotice("먼저 항목을 평가해 주세요."); return; }
    setAnaLoading(true); setAnaNotice("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "posture", member, posture: { findings: clean, note: note.trim() } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAnaNotice((d.error || "분석 생성에 실패했습니다.") + " (AI 키/구독 상태를 확인하세요)");
        return;
      }
      setAnalysis(await res.json());
    } catch (e) {
      setAnaNotice("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setAnaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card as="section">
        <Eyebrow icon={PersonStanding}>체형평가</Eyebrow>
        <div className="mt-3 space-y-2">
          {POSTURE_ITEMS.map((it) => (
            <div key={it.key} className="flex items-center gap-2">
              <span className="flex-1 text-[13px] text-ink">{it.label}</span>
              <select
                value={findings[it.key]}
                onChange={(e) => setF(it.key, e.target.value)}
                className="w-28 shrink-0 rounded-lg border border-line bg-elevate px-2 py-1.5 text-[13px] text-ink outline-none focus:border-primary"
                aria-label={it.label}
              >
                {POSTURE_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          ))}
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택) · 특이사항" className={`${inputCls} mt-1`} />
          {msg && <div className="text-[12px] text-sub">{msg}</div>}
          <div className="pt-1">
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> {saving ? "저장 중…" : "평가 저장"}
            </Button>
          </div>
        </div>
      </Card>

      <Card as="section">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow icon={Sparkles}>체형 분석 · 회원에게 보여주기</Eyebrow>
          <Button variant="primary" size="sm" onClick={analyze} disabled={anaLoading}>
            {anaLoading ? "분석 중…" : analysis ? "다시 분석" : "AI 분석"}
          </Button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          평가 항목 기준. 트레이너가 아니라 &lsquo;앱이 분석&rsquo;하는 톤이라 회원 부담이 적어요.
        </p>
        {anaNotice && <p className="mt-2 text-[12px] text-danger-text">{anaNotice}</p>}
        {analysis && <div className="mt-3"><InbodyAnalysis data={{ ...analysis, metrics: analysis.findings }} title="체형 분석" /></div>}
      </Card>
    </div>
  );
}
