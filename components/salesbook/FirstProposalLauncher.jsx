"use client";

/* =========================================================================
   1차 제안(2026-10-02 대표 결정) — 1차 OT 클로징 직전에 2~3분 보여주는 짧은 세일즈북.
   2차 세일즈북(관찰 근거 · AI 작성)과 성격이 다르다: "같은 목표였던 회원이 이렇게 됐어요(가능성)".
     장: 표지 → 목표 → 같은 목표 회원 사례(보관함) → 추천 플랜·가격 → (혜택) → 약속
   AI 호출 0 · 기다림 0 — 회원 정보 + 1차 준비 리포트의 추천 프로그램 + 내 패키지 + 사례 보관함으로 바로 만든다.
   사례는 회원 목표와 같은 목적에서 최근 담은 순으로 2개 자동(장 구성에서 바꿀 수 있음).
   트레이너가 고친 것(장 구성·약속 문장)은 1차 ot_log 행 report.first_proposal에 저장(다른 키 보존).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SalesbookView from "@/components/views/SalesbookView";
import { useSalesbookAssets } from "@/components/salesbook/DeckLauncher";
import { loadMyCases } from "@/components/salesbook/caseData";
import { guessCategory } from "@/lib/salesCase";
import { hasVal } from "@/lib/format";

export const FIRST_SLIDES = ["cover", "goal", "plans", "closing"];

// 같은 목적 사례 자동 고르기 — 종류가 겹치지 않게(사진 → 인바디 → 운동 → 후기 순으로 하나씩).
export function pickFirstCases(cases, category, n = 2) {
  const same = (cases || []).filter((c) => category && c.data?.category === category);
  const out = [];
  for (const kind of ["photo", "inbody", "lift", "review"]) {
    const c = same.find((x) => x.kind === kind);
    if (c) out.push(c.id);
    if (out.length >= n) break;
  }
  return out;
}

export function buildFirstProposal({ member, report, packages, cases, saved }) {
  const m = member || {};
  const rp = report?.first_assist?.data?.recommended_program || {};
  const goal = hasVal(m.goal) && m.goal !== "미설정" ? m.goal : "나에게 맞는 운동 시작";
  const valid = (n) => Number.isInteger(n) && n >= 0 && n < (packages || []).length;
  const pick = valid(rp.pick_ref) ? packages[rp.pick_ref] : (packages || [])[0] || null;
  const alt = valid(rp.alt_ref) ? packages[rp.alt_ref] : null;
  const plans = [
    pick && { ref: valid(rp.pick_ref) ? rp.pick_ref : 0, name: pick.name, meta: pick.duration_label || "", sessions_label: pick.sessions ? `${pick.sessions}회` : "", recommended: true, why: rp.why_fit || "", includes: [] },
    alt && { ref: rp.alt_ref, name: alt.name, meta: alt.duration_label || "", sessions_label: alt.sessions ? `${alt.sessions}회` : "", recommended: false, why: rp.alt_why || "", includes: [] },
  ].filter(Boolean);
  const body = [hasVal(m.goal_deadline) && `목표 시점: ${m.goal_deadline}`, hasVal(m.member_note) && m.member_note].filter(Boolean).join(" · ")
    || "오늘 OT에서 지금 상태를 함께 봤어요. 여기서부터 시작해요.";
  return {
    cover: saved?.cover || { subtitle: `${goal}, 오늘부터 이렇게 시작해요` },
    goal: saved?.goal || { headline: goal, body, current_issues: hasVal(m.pain) ? [m.pain] : [] },
    plans,
    closing: saved?.closing || { services: [], vow: `${m.name || "회원"}님 목표까지, 매 수업 기록하고 함께 확인하겠습니다.` },
    deck: saved?.deck || { cases: pickFirstCases(cases, guessCategory(m.goal)) },
  };
}

export default function FirstProposalLauncher({ member, editable = false, startPresent = true, onClose, showToast }) {
  const { packages, trainer } = useSalesbookAssets();
  const [row1, setRow1] = useState(undefined); // undefined=불러오는 중 · null=1차 기록 없음
  const [cases, setCases] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) { setRow1(null); setCases([]); } return; }
      const { data: au } = await supabase.auth.getUser();
      const [{ data: rows }, { data: mine }] = await Promise.all([
        supabase.from("ot_log").select("id, report").eq("user_id", member.id).eq("ot_round", 1)
          .order("created_at", { ascending: false }).limit(1),
        loadMyCases(au?.user?.id),
      ]);
      if (!cancelled) { setRow1(rows?.[0] || null); setCases(mine || []); }
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const sb = useMemo(() => (row1 === undefined || cases == null ? null
    : buildFirstProposal({ member, report: row1?.report, packages, cases, saved: row1?.report?.first_proposal })),
  [row1, cases, member, packages]);

  const save = async (edited) => {
    if (!supabase || !member?.id) { showToast?.("데모 모드라 저장할 수 없어요."); return false; }
    const patch = { first_proposal: { deck: edited.deck || null, closing: edited.closing || null, cover: edited.cover || null, goal: edited.goal || null, editedAt: new Date().toISOString() } };
    try {
      if (row1?.id) {
        const { data: fresh } = await supabase.from("ot_log").select("report").eq("id", row1.id).maybeSingle();
        const next = { ...(fresh?.report || {}), ...patch };
        const { data, error } = await supabase.from("ot_log").update({ report: next }).eq("id", row1.id).select("id, report");
        if (error || !data?.length) { showToast?.("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
        setRow1(data[0]);
      } else {
        const { data, error } = await supabase.from("ot_log").insert({
          user_id: member.id, ot_round: 1, report: patch,
          goal_type: "appearance", goal_identified: false, closing_result: "none", closing_approach: "other",
        }).select("id, report");
        if (error || !data?.length) { showToast?.("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
        setRow1(data[0]);
      }
      showToast?.("1차 제안을 저장했어요");
      return true;
    } catch {
      showToast?.("저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return false;
    }
  };

  if (!sb) return null;
  return (
    <SalesbookView
      salesbook={sb}
      member={member}
      trainer={trainer}
      packages={packages}
      recommendedProgram={row1?.report?.first_assist?.data?.recommended_program || null}
      benefits={trainer?.salesbook_benefits?.enabled ? (trainer.salesbook_benefits.items || []) : []}
      // 패키지가 없으면 플랜 장은 비어 보이니 뺀다(설정 › 가격에 패키지를 등록하면 들어간다).
      slideKeys={sb.plans.length ? FIRST_SLIDES : FIRST_SLIDES.filter((k) => k !== "plans")}
      caseAnchor={sb.plans.length ? "plans" : "closing"}
      editable={editable}
      startPresent={startPresent && !editable}
      onSave={save}
      onClose={onClose}
    />
  );
}
