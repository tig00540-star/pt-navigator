"use client";

/* =========================================================================
   1차 세일즈북(1차 제안) — 1차 OT 클로징 요청 직전에 2~3분 보여주는 자료.
   2026-10-02 개편(대표: "너무 부실하다") — AI가 쓴 1차 세일즈북(report.first_salesbook)으로 채운다.
     장: 표지 → 당신의 목표(문진) → 오늘 해본 운동(4칸의 이유·느낌) → 같은 목표 회원 사례 → 로드맵 → 추천 플랜·가격 → 혜택 → 약속
   - 2차 세일즈북(관찰 근거)과 다르다: 1차 = 목표·오늘 한 운동의 이유·앞으로의 길(관찰 단정 없음).
   - 1차 준비 리포트를 만들 때 서버가 이어서 만들어 둔다(ot-brief follow). 없으면 처음 열 때 한 번 만든다(약 1분).
   - 사례는 회원 목표와 같은 목적에서 2개 자동(장 구성에서 바꿈). 트레이너가 고친 것은 report.first_proposal.
   - AI 세일즈북을 못 만들면 회원 정보만으로 만든 짧은 판(표지·목표·플랜·약속)으로 대신한다.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import SalesbookView from "@/components/views/SalesbookView";
import { useSalesbookAssets } from "@/components/salesbook/DeckLauncher";
import { loadMyCases } from "@/components/salesbook/caseData";
import { guessCategory } from "@/lib/salesCase";
import { hasVal } from "@/lib/format";

const AI_SLIDES = ["cover", "goal", "today", "roadmap", "plans", "closing"];
const LIGHT_SLIDES = ["cover", "goal", "plans", "closing"];

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

// AI 세일즈북이 없을 때의 짧은 판(회원 정보 + 추천 패키지).
function lightProposal(m, rp, packages) {
  const goal = hasVal(m.goal) && m.goal !== "미설정" ? m.goal : "나에게 맞는 운동 시작";
  const valid = (n) => Number.isInteger(n) && n >= 0 && n < (packages || []).length;
  const fits = valid(rp.pick_ref);
  const pick = fits ? packages[rp.pick_ref] : (packages || [])[0] || null;
  return {
    cover: { subtitle: `${goal}, 오늘부터 이렇게 시작해요` },
    goal: {
      headline: goal,
      body: hasVal(m.goal_deadline) ? `목표 시점: ${m.goal_deadline}. 여기서부터 함께 시작해요.` : "여기서부터 함께 시작해요.",
      current_issues: hasVal(m.pain) ? [m.pain] : [],
    },
    plans: pick ? [{ ref: fits ? rp.pick_ref : 0, name: pick.name, meta: pick.duration_label || "", sessions_label: pick.sessions ? `${pick.sessions}회` : "", recommended: true, why: fits ? rp.why_fit || "" : "", includes: [] }] : [],
    closing: { services: [], vow: `${m.name || "회원"}님 목표까지, 매 수업 기록하고 함께 확인하겠습니다.` },
  };
}

export default function FirstProposalLauncher({ member, editable = false, startPresent = true, onClose, showToast }) {
  const { packages, trainer, ready } = useSalesbookAssets();
  const [row1, setRow1] = useState(undefined); // undefined=불러오는 중 · null=1차 기록 없음
  const [cases, setCases] = useState(null);
  const [gen, setGen] = useState("idle"); // idle | running | failed
  const started = useRef(false); // 생성은 한 번만(상태가 바뀌어 effect가 다시 돌아도 요청을 끊지 않는다)
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) { setRow1(null); setCases([]); } return; }
      // 읽기가 실패해도(네트워크 · 권한) '불러오는 중'에 멈추지 않게 — 1차 기록 없음 · 사례 없음으로 이어 간다(2026-10-06).
      try {
        const { data: au } = await supabase.auth.getUser();
        const [{ data: rows, error: e1 }, { data: mine }] = await Promise.all([
          supabase.from("ot_log").select("id, report").eq("user_id", member.id).eq("ot_round", 1)
            .order("created_at", { ascending: false }).limit(1),
          loadMyCases(au?.user?.id).catch(() => ({ data: [] })),
        ]);
        if (e1) console.error("1차 기록 읽기 실패", e1);
        if (!cancelled) { setRow1(rows?.[0] || null); setCases(mine || []); }
      } catch (e) {
        console.error("1차 세일즈북 불러오기 실패", e);
        if (!cancelled) { setRow1(null); setCases([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const fa = row1?.report?.first_assist?.data || null;
  const fsb = row1?.report?.first_salesbook?.data || null;

  // 1차 세일즈북이 아직 없으면 처음 열 때 한 번 만든다(서버가 1차 행에 저장 · 화면을 닫아도 끝까지).
  useEffect(() => {
    if (row1 === undefined || !ready || fsb || started.current || !supabase || !member?.id) return;
    started.current = true;
    (async () => {
      setGen("running");
      // 2분 넘게 답이 없으면 끊고 짧은 판으로(서버는 끝까지 만들어 저장 · 다음에 열면 AI 판이 뜬다).
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 120000);
      try {
        const res = await fetch("/api/ot-brief", {
          signal: ctl.signal,
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            phase: "first_salesbook", member, report: fa, recommendedProgram: fa?.recommended_program || null, packages,
            save: { kind: "ot", memberId: member.id, round: 1, meta: {} },
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!alive.current) return;
        setRow1((r) => ({ id: r?.id ?? res.headers.get("x-saved-row"), report: { ...(r?.report || {}), first_salesbook: { data } } }));
        setGen("idle");
      } catch (e) {
        console.error("1차 세일즈북 생성 실패", e);
        if (alive.current) setGen("failed");
      } finally {
        clearTimeout(timer);
      }
    })();
  }, [row1, ready, fsb, member, fa, packages]);

  const rp = useMemo(() => fa?.recommended_program || {}, [fa]);
  const validRef = (n) => Number.isInteger(n) && n >= 0 && n < packages.length;
  const sb = useMemo(() => {
    if (row1 === undefined || cases == null || !ready) return null;
    if (!fsb && gen !== "failed") return null; // 만드는 중
    const saved = row1?.report?.first_proposal || null;
    const base = fsb ? { ...fsb, plans: packages.length ? fsb.plans || [] : [] } : lightProposal(member || {}, rp, packages);
    return {
      ...base,
      cover: saved?.cover || base.cover,
      goal: saved?.goal || base.goal,
      closing: saved?.closing || base.closing,
      deck: saved?.deck || { cases: pickFirstCases(cases, guessCategory(member?.goal)) },
    };
  }, [row1, cases, ready, fsb, gen, packages, member, rp]);

  const save = async (edited) => {
    if (!supabase || !member?.id) { showToast?.("데모 모드라 저장할 수 없어요."); return false; }
    const patch = { first_proposal: { deck: edited.deck || null, closing: edited.closing || null, cover: edited.cover || null, goal: edited.goal || null, editedAt: new Date().toISOString() } };
    try {
      const { data: rows } = await supabase.from("ot_log").select("id, report").eq("user_id", member.id).eq("ot_round", 1)
        .order("created_at", { ascending: false }).limit(1);
      const cur = rows?.[0];
      const q = cur
        ? supabase.from("ot_log").update({ report: { ...(cur.report || {}), ...patch } }).eq("id", cur.id).select("id, report")
        : supabase.from("ot_log").insert({ user_id: member.id, ot_round: 1, report: patch, goal_type: "appearance", goal_identified: false, closing_result: "none", closing_approach: "other" }).select("id, report");
      const { data, error } = await q;
      if (error || !data?.length) { showToast?.("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
      setRow1(data[0]);
      showToast?.("1차 세일즈북을 저장했어요");
      return true;
    } catch {
      showToast?.("저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return false;
    }
  };

  if (!sb) {
    // 만드는 중 — 세일즈북과 같은 어두운 전체 화면(닫기 가능 · 닫아도 서버가 끝까지 만들어 저장).
    return (
      <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 bg-[rgb(19_21_27/0.86)] px-6 text-center text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="1차 세일즈북 만드는 중">
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/20"><div className="h-full w-1/3 animate-[ot-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-white" /></div>
        <p className="m-0 text-[16px] font-semibold">{gen === "running" ? "1차 세일즈북을 만들고 있어요" : "불러오는 중이에요"}</p>
        {gen === "running" && <p className="m-0 max-w-[36ch] text-[13px] text-white/75">처음 한 번만 1분쯤 걸려요. 닫아도 계속 만들어져서 다음에 열면 바로 떠요.</p>}
        <button type="button" onClick={onClose} className="mt-2 rounded-lg bg-white/15 px-4 py-2 text-[13px] font-semibold hover:bg-white/25">닫기</button>
      </div>
    );
  }

  return (
    <SalesbookView
      salesbook={sb}
      member={member}
      trainer={trainer}
      packages={packages}
      recommendedProgram={validRef(rp.pick_ref) ? rp : null}
      benefits={trainer?.salesbook_benefits?.enabled ? (trainer.salesbook_benefits.items || []) : []}
      slideKeys={(fsb ? AI_SLIDES : LIGHT_SLIDES).filter((k) => k !== "plans" || (sb.plans || []).length)}
      caseAnchor={fsb ? "roadmap" : (sb.plans || []).length ? "plans" : "closing"}
      editable={editable}
      startPresent={startPresent && !editable}
      onSave={save}
      onClose={onClose}
    />
  );
}
