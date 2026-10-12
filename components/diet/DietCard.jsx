"use client";

/* =========================================================================
   식단 — PT 케어 탭 카드(2026-10-11 · 1단계 · 설계 '식단 관리 1단계').
   꺼짐: [식단 관리 켜기] → 창: 목적(회원 목표에서 골라 둠) · 기간 · 목표 kg → 목표량 미리 보기(lib/diet dietTargets) ·
         빠듯하면 "N개월이면 안전해요" · 질환이 적힌 회원은 숫자 없이 기록 관리만 · 대회 준비는 숫자 직접.
         건강정보 동의한 PT 회원만(DB 트리거가 막음 · 화면은 미리 안내).
   켜짐: 목표량 · 주차 · 체중 변화 · 예시 식단(AI · 회원에게 보임) · 요청(열린 것) · 최근 7일(피드백 상태) · [숫자 고치기] [끄기].
   AI 표시는 트레이너에게만('AI가 보냈어요').
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Salad, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { DIET_PURPOSES, DIET_MONTHS, purposeLabel, purposeFromGoal, defaultGoalKg, dietTargets, diseaseOf, dietToday, addDays, dayLabel, timeLabel, DIET_AUTO_AFTER_MIN, DIET_AUTO_SEQ } from "@/lib/diet";
import { refreshAiQuota } from "@/lib/useAiQuota";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Toast from "@/components/ui/Toast";
import { inputCls } from "@/components/ui/Field";
import { useToast } from "@/hooks/useToast";
import { DietDayModal, DietRequestModal } from "@/components/diet/DietPanels";

const chip = (on) => `min-h-[36px] rounded-full px-3 text-[13px] transition ${on ? "bg-ink font-semibold text-white" : "bg-elevate text-sub hover:text-ink"}`;
const fmtK = (n) => (n == null ? "-" : Number(n).toLocaleString());

export default function DietCard({ member }) {
  const { toast, showToast } = useToast();
  const [state, setState] = useState(null);     // null=읽는 중 · {missing} · {plan, consent, inbody, days, meals, reqs}
  const [sheet, setSheet] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);
  const [reqOpen, setReqOpen] = useState(null);
  const jumped = useRef(false);
  const [exOpen, setExOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => new Date().getTime());
  const today = dietToday();

  const memberId = member?.id;
  const load = useCallback(async () => {
    if (!supabase || !memberId) return;
    const { data: plan, error } = await supabase.from("diet_plan").select("*").eq("member_id", memberId).maybeSingle();
    if (error) { setState({ missing: true }); return; }
    const from = addDays(today, -6);
    const [c, ib, d, m, r] = await Promise.all([
      supabase.from("member_consent").select("agreed").eq("member_id", memberId).eq("kind", "health").order("created_at", { ascending: false }).limit(1),
      supabase.from("inbody_log").select("measured_at, weight, skeletal_muscle, body_fat_pct, bmr").eq("user_id", memberId).order("measured_at", { ascending: false }).limit(1),
      supabase.from("diet_day").select("day, closed_at, feedback, feedback_at, ai").eq("user_id", memberId).gte("day", from),
      supabase.from("diet_meal").select("day, created_at").eq("user_id", memberId).gte("day", from),
      supabase.from("diet_request").select("*").eq("user_id", memberId).gte("day", addDays(today, -1)).order("created_at", { ascending: false }),
    ]);
    setState({ plan: plan || null, consent: Boolean(c.data?.[0]?.agreed), inbody: ib.data?.[0] || null, days: d.data || [], meals: m.data || [], reqs: r.data || [] });
  }, [memberId, today]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);
  // '오늘' 탭 식단 카드에서 누르고 들어왔으면 그 요청 · 그 날 창을 바로(2026-10-12 · 케어 탭에서 다시 찾지 않게)
  useEffect(() => {
    if (!state || state.missing || jumped.current) return;
    jumped.current = true;
    try {
      const j = JSON.parse(sessionStorage.getItem("ot.dietOpen") || "null");
      sessionStorage.removeItem("ot.dietOpen");
      if (!j || j.member !== member.id || new Date().getTime() - (j.at || 0) > 60000) return;
      const q = j.reqId ? (state.reqs || []).find((x) => x.id === j.reqId) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (q) setReqOpen(q); else if (j.day) setDayOpen(j.day);
    } catch { /* 없으면 그냥 카드 */ }
  }, [state, member.id]);

  if (!state || state.missing) return null;
  const { plan, consent, inbody } = state;
  const on = Boolean(plan?.enabled);

  // 최근 7일 — 끼니가 있거나 피드백이 있는 날
  const dayRows = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, -i);
    const n = state.meals.filter((x) => x.day === day).length;
    const d = state.days.find((x) => x.day === day);
    if (n || d?.feedback) dayRows.push({ day, n, d });
  }
  const openReqs = state.reqs.filter((q) => q.status === "open");
  const recentAnswered = state.reqs.filter((q) => q.status !== "open" && q.status !== "withdrawn").slice(0, 2);
  const weekNo = plan?.started_on ? Math.max(1, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${plan.started_on}T00:00:00Z`)) / (7 * 86400000)) + 1) : null;
  const totalWeeks = plan?.months ? Math.round(plan.months * 4.345) : null;
  const wDelta = plan?.base_weight && inbody?.weight ? Math.round((inbody.weight - plan.base_weight) * 10) / 10 : null;

  const turnOff = async () => {
    if (busy || !window.confirm("식단 관리를 끌까요? 회원 화면에서 식단 칸이 사라져요. 지난 기록은 남아요.")) return;
    setBusy(true);
    const { data, error } = await supabase.from("diet_plan").update({ enabled: false }).eq("member_id", member.id).select("member_id");
    setBusy(false);
    if (error || !data?.length) { showToast("끄지 못했어요. 다시 시도해 주세요."); return; }
    showToast("식단 관리를 껐어요"); load();
  };
  const remakeExamples = async () => {
    setBusy(true);
    const res = await fetch("/api/diet", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action: "examples", memberId: member.id }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false); refreshAiQuota();
    if (!res.ok) { showToast(d.error || "예시 식단을 만들지 못했어요. 다시 시도해 주세요."); return; }
    showToast("예시 식단을 만들었어요"); load();
  };

  return (
    <Card as="section">
      <SectionTitle icon={Salad} aside={on ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[12px] font-semibold text-sky-700">켜짐</span> : null}>
        식단{on ? ` · ${purposeLabel(plan.purpose)}${plan.goal_kg ? ` ${plan.months}개월 ${plan.goal_kg > 0 ? "+" : "−"}${Math.abs(plan.goal_kg)}kg` : ""}` : ""}
      </SectionTitle>

      {!on ? (
        <>
          <p className="-mt-1.5 text-[13px] leading-relaxed text-sub">회원이 먹은 것을 사진으로 올리면 하루 한 번 피드백을 보내요. 바쁘면 AI가 트레이너 이름으로 대신 보내요.</p>
          {consent ? (
            <Button variant="primary" className="mt-3" onClick={() => setSheet(true)}>식단 관리 켜기</Button>
          ) : (
            <p className="m-0 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-800">회원이 건강정보 수집에 동의해야 켤 수 있어요. 회원 전용 페이지 맨 아래에서 동의하거나, 정보 수정에서 &lsquo;동의 받았어요&rsquo;를 체크해 주세요.</p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {plan.no_numbers ? (
            <p className="m-0 rounded-xl bg-elevate px-3 py-2 text-[13px] text-sub">숫자 목표 없이 기록 관리만 해요(질환이 적혀 있어요).</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">운동 없는 날</span><b className="text-ink">{fmtK(plan.kcal_rest)}kcal</b></div>
              <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">운동한 날</span><b className="text-ink">{fmtK(plan.kcal_pt)}kcal</b></div>
              <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">탄 · 단 · 지</span><b className="text-ink">{plan.carb_g ?? "-"} · {plan.protein_g ?? "-"} · {plan.fat_g ?? "-"}g</b></div>
              <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">진행</span><b className="text-ink">{weekNo}주차{totalWeeks ? ` / ${totalWeeks}주` : ""}{wDelta != null ? ` · ${wDelta > 0 ? "+" : wDelta < 0 ? "−" : ""}${Math.abs(wDelta)}kg` : ""}</b></div>
            </div>
          )}

          {/* 요청 */}
          {openReqs.length > 0 && (
            <div className="space-y-1.5">
              <p className="m-0 text-[12px] font-semibold text-muted">식단 요청</p>
              {openReqs.map((q) => {
                const left = q.seq <= DIET_AUTO_SEQ ? Math.max(0, Math.ceil((Date.parse(q.created_at) + DIET_AUTO_AFTER_MIN * 60000 - nowMs) / 60000)) : null;
                return (
                  <button key={q.id} type="button" onClick={() => setReqOpen(q)} className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{q.scope === "today" ? "오늘 남은 끼니" : "이번 주"}</span>
                      <span className="block truncate text-[12px] text-muted">{q.situations?.join(", ") || "상황 없음"} · {q.seq}번째 · {timeLabel(q.created_at)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${left == null ? "bg-primary-soft text-primary-strong" : "bg-amber-50 text-amber-700"}`}>{left == null ? "직접 답하기" : left > 0 ? `${left}분 뒤 AI` : "곧 AI"}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 최근 7일 */}
          <div className="space-y-1.5">
            <p className="m-0 text-[12px] font-semibold text-muted">최근 식단</p>
            {dayRows.length === 0 ? <p className="m-0 text-[13px] text-muted">아직 올린 식단이 없어요.</p> : dayRows.map(({ day, n, d }) => (
              <button key={day} type="button" onClick={() => setDayOpen(day)} className="flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-elevate px-3 py-2 text-left">
                <span className="min-w-0 flex-1 text-[14px] text-ink">{day === today ? "오늘" : dayLabel(day)} <span className="text-[12px] text-muted">· {n}끼{d?.closed_at ? " · 회원이 끝 누름" : day === today ? " · 올리는 중" : ""}</span></span>
                <span className={`shrink-0 text-[12px] font-semibold ${d?.feedback ? (d.ai ? "text-amber-700" : "text-sky-700") : d?.closed_at ? "text-primary-strong" : "text-muted"}`}>
                  {d?.feedback ? (d.ai ? "AI가 보냈어요" : "보냈어요") : d?.closed_at ? "피드백 보내 주세요" : day === today ? "오전 6시 AI" : "곧 AI"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </button>
            ))}
            {recentAnswered.map((q) => (
              <button key={q.id} type="button" onClick={() => setReqOpen(q)} className="flex min-h-[40px] w-full items-center gap-2 px-1 text-left text-[13px] text-sub">
                <span className="flex-1">식단 요청 · {q.scope === "today" ? "오늘 남은 끼니" : "이번 주"}</span>
                <span className={`text-[12px] font-semibold ${q.ai ? "text-amber-700" : "text-sky-700"}`}>{q.status === "skipped" ? "넘김" : q.ai ? "AI가 보냈어요" : "보냈어요"}</span>
              </button>
            ))}
          </div>

          {/* 예시 식단 */}
          <div>
            <button type="button" onClick={() => setExOpen((v) => !v)} aria-expanded={exOpen} className="min-h-[36px] text-[13px] font-semibold text-sub hover:text-ink">
              예시 식단 {plan.examples?.list?.length ? `${plan.examples.list.length}가지(회원에게 보여요)` : "없음"} {exOpen ? "접기" : "보기"}
            </button>
            {exOpen && (
              <div className="mt-1 space-y-2">
                {(plan.examples?.list || []).map((e, i) => (
                  <div key={i} className="rounded-xl bg-elevate px-3 py-2 text-[13px]">
                    <p className="m-0 font-semibold text-ink">{e.title}{e.total ? <span className="ml-1 font-normal text-muted">{e.total}</span> : null}</p>
                    {(e.meals || []).map((x, j) => <p key={j} className="m-0 text-sub"><b className="font-semibold text-ink">{x.when}</b> {x.menu}</p>)}
                  </div>
                ))}
                <Button size="sm" onClick={remakeExamples} disabled={busy}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? "만드는 중…" : plan.examples ? "다시 만들기" : "만들기"}</Button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSheet(true)}>숫자 고치기</Button>
            <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy}>끄기</Button>
          </div>
        </div>
      )}

      {sheet && <DietSetupSheet member={member} plan={plan} inbody={inbody} onClose={() => setSheet(false)} onSaved={(msg) => { showToast(msg); load(); }} />}
      {dayOpen && <DietDayModal member={member} day={dayOpen} onClose={() => setDayOpen(null)} onSent={load} showToast={showToast} />}
      {reqOpen && <DietRequestModal member={member} req={reqOpen} onClose={() => setReqOpen(null)} onSent={load} showToast={showToast} />}
      <Toast message={toast} />
    </Card>
  );
}

/* ── 켜기 · 숫자 고치기 창 ── */
function DietSetupSheet({ member, plan, inbody, onClose, onSaved }) {
  const disease = diseaseOf(member);
  const [purpose, setPurpose] = useState(plan?.purpose || purposeFromGoal(`${member.goal || ""} ${member.pt_direction || ""}`));
  const [months, setMonths] = useState(plan?.months || 3);
  const [goalKg, setGoalKg] = useState(plan?.goal_kg != null ? String(Math.abs(plan.goal_kg)) : String(Math.abs(defaultGoalKg(plan?.purpose || purposeFromGoal(member.goal)) || 0) || ""));
  const [manual, setManual] = useState({ kcalRest: plan?.manual ? plan.kcal_rest : "", kcalPt: plan?.manual ? plan.kcal_pt : "", carb: plan?.manual ? plan.carb_g : "", protein: plan?.manual ? plan.protein_g : "", fat: plan?.manual ? plan.fat_g : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const signedGoal = purpose === "bulk" ? Math.abs(Number(goalKg) || 0) : (purpose === "diet" || purpose === "bodyprofile") ? -Math.abs(Number(goalKg) || 0) : null;
  const isManual = purpose === "contest";
  const t = useMemo(() => dietTargets({ purpose, months, goalKg: signedGoal, inbody,
    manual: isManual ? { kcalRest: Number(manual.kcalRest) || null, kcalPt: Number(manual.kcalPt) || Number(manual.kcalRest) || null, carb: Number(manual.carb) || null, protein: Number(manual.protein) || null, fat: Number(manual.fat) || null } : null }),
    [purpose, months, signedGoal, inbody, isManual, manual]);

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const { data: au } = await supabase.auth.getUser();
      const noNumbers = Boolean(disease);
      const ends = new Date(); ends.setMonth(ends.getMonth() + (Number(months) || 3));
      const row = {
        member_id: member.id, enabled: true, purpose, months: purpose === "health" ? null : Number(months) || null,
        goal_kg: signedGoal || null, started_on: plan?.enabled ? plan.started_on : dietToday(), ends_on: purpose === "health" ? null : ends.toISOString().slice(0, 10),
        base_weight: plan?.enabled ? plan.base_weight : inbody?.weight ?? null, base_bmr: t.bmr ?? null, base_inbody_at: inbody?.measured_at ? String(inbody.measured_at).slice(0, 10) : null,
        kcal_rest: noNumbers ? null : t.kcalRest ?? null, kcal_pt: noNumbers ? null : t.kcalPt ?? null,
        carb_g: noNumbers ? null : t.carb ?? null, protein_g: noNumbers ? null : t.protein ?? null, fat_g: noNumbers ? null : t.fat ?? null,
        manual: isManual, no_numbers: noNumbers, updated_by: au?.user?.id || null,
      };
      const { data, error } = await supabase.from("diet_plan").upsert(row, { onConflict: "member_id" }).select("member_id");
      if (error || !data?.length) {
        console.error("식단 설정 저장 실패", error);
        setErr(/health_consent/.test(error?.message || "") ? "회원이 건강정보 수집에 동의해야 켤 수 있어요." : /pt_only/.test(error?.message || "") ? "PT 회원만 켤 수 있어요." : "저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
        return;
      }
      // 처음 켤 때 예시 식단(AI · 회원에게 보임) — 기다리지 않는다
      if (!plan?.enabled) fetch("/api/diet", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action: "examples", memberId: member.id }) }).then((r) => { refreshAiQuota(); if (r.ok) onSaved?.("예시 식단을 만들었어요"); }).catch(() => {});
      onSaved?.(plan?.enabled ? "식단 숫자를 고쳤어요" : "식단 관리를 켰어요. 예시 식단을 만들고 있어요");
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal variant="sheet" title={plan?.enabled ? "식단 숫자 고치기" : "식단 관리 켜기"} onClose={onClose}
      footer={<Button variant="primary" fullWidth onClick={save} disabled={busy || (isManual && !t.ok)}>{busy ? "저장 중…" : plan?.enabled ? "저장" : "켜기"}</Button>}>
      <div className="space-y-4 break-keep">
        <div>
          <p className="m-0 mb-1.5 text-[12px] font-semibold text-muted">목적 (회원 목표에서 골라 뒀어요)</p>
          <div className="flex flex-wrap gap-1.5">{DIET_PURPOSES.map((p) => <button key={p.key} type="button" onClick={() => setPurpose(p.key)} className={chip(purpose === p.key)}>{p.label}</button>)}</div>
        </div>
        {purpose !== "health" && (
          <div>
            <p className="m-0 mb-1.5 text-[12px] font-semibold text-muted">기간</p>
            <div className="flex flex-wrap gap-1.5">{DIET_MONTHS.map((n) => <button key={n} type="button" onClick={() => setMonths(n)} className={chip(Number(months) === n)}>{n}개월</button>)}</div>
          </div>
        )}
        {(purpose === "diet" || purpose === "bodyprofile" || purpose === "bulk") && (
          <label className="flex items-center gap-2 text-[13px] text-sub">목표 체중 {purpose === "bulk" ? "늘리기" : "줄이기"}
            <input type="number" inputMode="decimal" min="0" step="0.5" value={goalKg} onChange={(e) => setGoalKg(e.target.value)} className="min-h-[40px] w-24 rounded-lg border border-line bg-elevate px-3 text-[15px] text-ink" /> kg
          </label>
        )}
        {isManual && (
          <div className="grid grid-cols-2 gap-2">
            {[["kcalRest", "운동 없는 날 kcal"], ["kcalPt", "운동한 날 kcal"], ["carb", "탄수화물 g"], ["protein", "단백질 g"], ["fat", "지방 g"]].map(([k, l]) => (
              <label key={k} className="block text-[12px] text-muted">{l}
                <input type="number" inputMode="numeric" value={manual[k]} onChange={(e) => setManual((x) => ({ ...x, [k]: e.target.value }))} className={inputCls} />
              </label>
            ))}
          </div>
        )}

        {disease ? (
          <p className="m-0 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-800">회원 정보에 &lsquo;{disease}&rsquo;이 적혀 있어 숫자 목표 없이 기록 관리만 해요. 식단은 담당 의사 · 영양사와 상의하도록 안내해 주세요.</p>
        ) : !t.ok ? (
          <p className="m-0 rounded-xl bg-elevate px-3 py-2 text-[13px] text-sub">{isManual ? "목표 숫자를 직접 넣어 주세요." : "인바디를 먼저 재면 목표량이 나와요. 그래도 켜면 먹은 것 · 균형만 피드백해요."}</p>
        ) : (
          <div className="space-y-2">
            <p className="m-0 rounded-xl bg-sky-50 px-3 py-2 text-[13px] leading-relaxed text-ink">
              하루 약 <b>{fmtK(t.kcalRest)}kcal</b>(운동한 날 {fmtK(t.kcalPt)}) · 탄 {t.carb} · 단 {t.protein} · 지 {t.fat}g
              {t.bmr ? <span className="block text-[12px] text-muted">기초대사량 {fmtK(t.bmr)}kcal · 인바디 {inbody?.measured_at ? String(inbody.measured_at).slice(5, 10).replace("-", "/") : ""} 기준</span> : null}
            </p>
            {t.tight && t.safeMonths && (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-800">
                <b>이 회원에겐 빠듯해요.</b> 기초대사량 아래로 먹거나 한 주에 체중의 1%보다 많이 빼야 해요. <b>{t.safeMonths}개월이면 안전해요.</b>
                <button type="button" onClick={() => setMonths(t.safeMonths)} className="ml-1 min-h-[32px] font-semibold underline underline-offset-2">{t.safeMonths}개월로 바꾸기</button>
              </div>
            )}
          </div>
        )}
        {err && <p className="m-0 text-[13px] text-danger-text">{err}</p>}
      </div>
    </Modal>
  );
}
