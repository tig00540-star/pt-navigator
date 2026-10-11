"use client";

/* 현재 방향 · 목표 — PT 살아있는 상태축(③ 작업3-2 · OT 때 적은 goal 스냅샷과 별개 · 관리하며 갱신).
   2026-10-11 자료남기기 → 케어 탭으로 옮김(목표 로드맵 · 개인운동 루틴과 한곳에). 저장 = user_table.pt_direction
   UPDATE + .select() 하드닝(교훈1) · 성공하면 회원 배열도 반영(onMemberPatch).
   2026-10-11 숫자 목표(lib/ptGoal): 트레이너는 글만 적는다 → 아래에 '앱이 읽은 목표'가 뜨고 [맞아요]를 눌러야
   숫자 목표(user_table.pt_goal)가 된다. 잘못 읽었으면 [고치기](칩으로 지표 · 숫자 · 기간). 숫자 없는 글은 글만.
   회원 전용 페이지엔 '회원에게 보이기'를 켰을 때만(member_goal_view).
   2026-10-11 대표 "목표는 케어 탭 한 곳": 재등록 때(재등록 타이밍이거나 숫자 목표를 이뤘을 때) 이 카드 안에 '다음 목표'가 뜬다
   (앱 추천 = lib/ptGoal suggestNextGoal · 규칙 · 트레이너가 글로 고침 · 숫자 없는 글도 됨) → [이걸로 바꾸기] = 바로 지금 목표가 된다:
   끝나 가는 계약 행(reregRound target) report.goal_result(그때까지 결과 · 한 번만) + report.next_goal{text, goal, set_at, applied_at}
   + pt_direction / pt_goal(시작 값 = 지금 기록). 재등록 대본은 goal_result(이번 결과) · next_goal(다음 목표)을 말한다. */

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Eye, EyeOff, Pencil, Target, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildExerciseSeries } from "@/lib/workout";
import { GOAL_METRICS, GOAL_MONTHS, parseGoal, buildGoal, describeGoal, goalProgress, goalLabel, goalContext, suggestNextGoal } from "@/lib/ptGoal";
import { activeContract, reregisterDue, reregRound } from "@/lib/memberStatus";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const chip = (on) => `min-h-[36px] rounded-full px-3 text-[13px] transition ${on ? "bg-ink font-semibold text-white" : "bg-elevate text-sub hover:text-ink"}`;

export default function DirectionCard({ member, contracts = [], logs = [], onMemberPatch, setContracts }) {
  const [direction, setDirection] = useState(member.pt_direction ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inbody, setInbody] = useState([]);
  const [fix, setFix] = useState(null);   // 숫자 목표 고치기 초안 { metric, exercise, dir, amount, months }
  const { toast, showToast } = useToast();
  const goal = member.pt_goal?.confirmed_at ? member.pt_goal : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) return;
      const { data } = await supabase.from("inbody_log").select("measured_at, weight, skeletal_muscle, body_fat_mass, body_fat_pct")
        .eq("user_id", member.id).order("measured_at", { ascending: true });
      if (!cancelled) setInbody(data || []);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const exNames = useMemo(() => buildExerciseSeries(logs).map((s) => s.exercise), [logs]);
  // 시작 값 = 이번 계약 시작 때 기록(2026-10-11 대표 · 이미 몇 달 한 회원도 '시작보다 +○kg'이 바로 나오게). 계약이 없으면 지금 기록.
  const since = useMemo(() => {
    const a = activeContract(contracts, logs) || [...contracts].sort((x, y) => String(y.started_at ?? "").localeCompare(String(x.started_at ?? "")))[0];
    return a?.started_at || null;
  }, [contracts, logs]);
  const saved = member.pt_direction ?? "";
  const proposal = useMemo(() => {
    const p = parseGoal(saved, exNames);
    return p ? { parsed: p, goal: buildGoal(p, { inbody, logs, text: saved, visible: Boolean(member.pt_goal?.visible), since }) } : null;
  }, [saved, exNames, inbody, logs, member.pt_goal?.visible, since]);
  const prog = useMemo(() => (goal ? goalProgress(goal, inbody, logs) : null), [goal, inbody, logs]);

  const saveDirection = async () => {
    if (saving) return;
    setSaving(true);
    const next = direction.trim();
    if (!supabase) {
      onMemberPatch?.(member.id, { pt_direction: next });
      setEditing(false); setSaving(false);
      showToast("현재 방향을 저장했어요(데모)");
      return;
    }
    try {
      const { data, error } = await supabase.from("user_table").update({ pt_direction: next || null }).eq("id", member.id).select("id");
      if (error || !data || data.length === 0) { showToast("방향을 저장하지 못했어요. 다시 시도해 주세요."); return; }
      onMemberPatch?.(member.id, { pt_direction: next });
      setEditing(false);
      showToast("현재 방향을 저장했어요");
    } catch {
      showToast("방향을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  // 숫자 목표 저장(null = 지우기) — 같은 user_table 경로(.select() 하드닝).
  const saveGoal = async (g, msg) => {
    if (saving) return;
    setSaving(true);
    const next = g ? { ...g, confirmed_at: g.confirmed_at || new Date().toISOString() } : null;
    try {
      if (supabase) {
        const { data, error } = await supabase.from("user_table").update({ pt_goal: next }).eq("id", member.id).select("id");
        if (error || !data || data.length === 0) { console.error("숫자 목표 저장 실패", error); showToast("목표를 저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      }
      onMemberPatch?.(member.id, { pt_goal: next });
      setFix(null);
      showToast(msg);
    } catch {
      showToast("목표를 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const openFix = () => {
    const base = goal || proposal?.goal || null;
    const p = proposal?.parsed;
    setFix({
      metric: base?.metric || p?.metric || "weight",
      exercise: base?.exercise || p?.exercise || exNames[0] || "",
      dir: base?.dir || p?.dir || "down",
      amount: base ? String(base.metric === "lift" ? base.target_value : Math.round(Math.abs(base.target_value - base.start_value) * 10) / 10) : p ? String(p.amount) : "",
      months: base?.months || p?.months || 3,
    });
  };
  const fixGoal = useMemo(() => {
    if (!fix || !Number(fix.amount)) return null;
    const lift = fix.metric === "lift";
    const parsed = { metric: fix.metric, exercise: lift ? fix.exercise : undefined, dir: lift ? "up" : fix.dir, amount: Number(fix.amount), mode: lift ? "to" : "delta", months: fix.months, period_label: `${fix.months}개월` };
    return buildGoal(parsed, { inbody, logs, text: saved, visible: Boolean(member.pt_goal?.visible), since });
  }, [fix, inbody, logs, saved, member.pt_goal?.visible, since]);

  const textChanged = goal && proposal?.goal && describeGoal(proposal.goal) !== describeGoal(goal) && (goal.text || "") !== saved;

  // ── 다음 목표(재등록 때) ──
  const round = useMemo(() => reregRound(contracts, logs).target || null, [contracts, logs]);
  const due = useMemo(() => {
    const a = activeContract(contracts, logs);
    return Boolean(a && reregisterDue(a, logs, { contracts }));
  }, [contracts, logs]);
  const switched = Boolean(round?.report?.next_goal?.applied_at);
  // 지금 목표가 있을 때만(목표를 아직 안 정한 회원에게 '다음 목표'가 먼저 뜨면 헷갈린다 · 실서비스 점검 2026-10-11)
  const showNext = !editing && !fix && !switched && Boolean(saved.trim()) && (due || Boolean(prog?.done));
  const suggestion = useMemo(() => (goal ? suggestNextGoal(goal, inbody, logs) : null), [goal, inbody, logs]);
  const [nextText, setNextText] = useState("");
  const [nextTouched, setNextTouched] = useState(false);
  const [nextSeeded, setNextSeeded] = useState(false);
  if (!nextSeeded && !nextTouched && suggestion) { setNextSeeded(true); setNextText(suggestion); }   // 인바디를 늦게 읽어도 한 번만 채움
  const nextGoal = useMemo(() => {
    const p = parseGoal(nextText, exNames);
    return p ? buildGoal(p, { inbody, logs, text: nextText.trim(), visible: Boolean(member.pt_goal?.visible) }) : null;
  }, [nextText, exNames, inbody, logs, member.pt_goal?.visible]);

  const switchGoal = async () => {
    const t = nextText.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const newGoal = nextGoal ? { ...nextGoal, confirmed_at: now } : null;
      if (supabase && round?.id) {
        // 계약 행 report — 저장 직전에 다시 읽어 합친다(서버가 막 저장한 대본 · 세일즈북을 덮지 않게)
        const { data: row } = await supabase.from("session_log").select("id, report").eq("id", round.id).maybeSingle();
        const rep = row?.report || {};
        const goalResult = !rep.goal_result && goal ? goalContext(goal, inbody, logs) : null;
        const next = { ...rep, next_goal: { text: t, goal: newGoal ? describeGoal(newGoal) : null, set_at: now, applied_at: now }, ...(goalResult ? { goal_result: goalResult } : {}) };
        const { data: up, error: ue } = await supabase.from("session_log").update({ report: next }).eq("id", round.id).select();
        if (ue || !up?.length) { console.error("다음 목표 기록 실패", ue); showToast("다음 목표를 저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
        setContracts?.((p) => p.map((c) => (c.id === up[0].id ? up[0] : c)));
      }
      if (supabase) {
        const { data, error } = await supabase.from("user_table").update({ pt_direction: t, pt_goal: newGoal }).eq("id", member.id).select("id");
        if (error || !data?.length) { console.error("다음 목표 → 지금 목표 저장 실패", error); showToast("목표를 바꾸지 못했어요. 다시 시도해 주세요."); return; }
      }
      onMemberPatch?.(member.id, { pt_direction: t, pt_goal: newGoal });
      setDirection(t);
      showToast("다음 목표로 바꿨어요");
    } catch (e) {
      console.error(e);
      showToast("목표를 바꾸지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Compass} className="mb-0">현재 방향 · 목표</SectionTitle>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="min-h-[36px] px-1 text-[13px] font-medium text-sub transition hover:text-primary-strong">
            {direction ? "수정" : "설정"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="예: 6개월 안에 근육량 2kg 늘리기 · 허리 편하게 아이 안기"
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDirection(member.pt_direction ?? ""); setEditing(false); }} disabled={saving}>취소</Button>
            <Button variant="primary" size="sm" onClick={saveDirection} disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-sub">
          {direction || <span className="text-muted">아직 방향을 정하지 않았어요. 기간과 숫자를 같이 적으면 숫자 목표로 만들어 드려요.</span>}
        </p>
      )}

      {/* 숫자 목표 */}
      {!editing && !fix && goal && (
        <div className="mt-3 rounded-xl bg-elevate px-3.5 py-3">
          <p className="m-0 flex items-center gap-1.5 text-[12px] font-semibold text-muted"><Target className="h-3.5 w-3.5" aria-hidden="true" /> 숫자 목표</p>
          <p className="m-0 mt-0.5 text-[15px] font-bold text-ink">{describeGoal(goal)}</p>
          {prog && <p className="m-0 mt-1 text-[13px] text-sub">{prog.line}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => saveGoal({ ...goal, visible: !goal.visible }, goal.visible ? "회원에게 안 보이게 했어요" : "회원 전용 페이지에 보이게 했어요")} disabled={saving}>
              {goal.visible ? <><EyeOff className="h-3.5 w-3.5" /> 회원에게 안 보이기</> : <><Eye className="h-3.5 w-3.5" /> 회원에게 보이기</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={openFix} disabled={saving}><Pencil className="h-3.5 w-3.5" /> 고치기</Button>
            <Button variant="ghost" size="sm" onClick={() => saveGoal(null, "숫자 목표를 지웠어요")} disabled={saving}><X className="h-3.5 w-3.5" /> 지우기</Button>
          </div>
          {textChanged && (
            <p className="m-0 mt-2 border-t border-line pt-2 text-[13px] leading-relaxed text-sub">
              글이 바뀌었어요. 앱이 읽은 목표는 <b className="font-semibold text-ink">{describeGoal(proposal.goal)}</b>예요.{" "}
              <button type="button" onClick={() => saveGoal({ ...proposal.goal, confirmed_at: null }, "숫자 목표를 바꿨어요")} disabled={saving} className="font-semibold text-primary-strong underline-offset-2 hover:underline">이걸로 바꾸기</button>
            </p>
          )}
        </div>
      )}

      {!editing && !fix && !goal && saved && (
        proposal?.goal ? (
          <div className="mt-3 rounded-xl border border-line px-3.5 py-3">
            <p className="m-0 text-[12px] font-semibold text-muted">앱이 읽은 목표</p>
            <p className="m-0 mt-0.5 text-[15px] font-bold text-ink">{describeGoal(proposal.goal)}</p>
            <p className="m-0 mt-0.5 text-[12px] text-muted">맞으면 숫자 목표로 저장해요. 시작 값은 이번 계약을 시작할 때 기록이에요.</p>
            <div className="mt-2 flex gap-1.5">
              <Button variant="primary" size="sm" onClick={() => saveGoal(proposal.goal, "숫자 목표를 정했어요")} disabled={saving}>맞아요</Button>
              <Button variant="ghost" size="sm" onClick={openFix} disabled={saving}>고치기</Button>
            </div>
          </div>
        ) : proposal?.parsed ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {proposal.parsed.metric === "lift" ? `${goalLabel(proposal.parsed)} 무게 기록이 생기면` : "인바디를 한 번 재면"} 숫자 목표를 만들 수 있어요.
          </p>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            숫자를 하나 넣으면 지금 숫자와 함께 보여 드려요. 예: 3개월 체중 4kg 빼기.{" "}
            <button type="button" onClick={openFix} className="font-semibold text-sub underline-offset-2 hover:text-ink hover:underline">숫자로 정하기</button>
          </p>
        )
      )}

      {/* 다음 목표(재등록 때) — 바꾸면 바로 지금 목표가 된다 */}
      {showNext && (
        <div className="mt-3 rounded-xl border border-pt/40 px-3.5 py-3">
          <p className="m-0 flex items-center gap-1.5 text-[13px] font-bold text-ink"><ArrowRight className="h-4 w-4 text-pt-text" aria-hidden="true" /> 다음 목표</p>
          <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-muted">
            {prog?.done ? "이번 목표를 이뤘어요. " : "재등록 때예요. "}{suggestion ? "지금 속도로 앱이 추천한 목표예요. 고쳐도 되고, 숫자 없이 글로만 적어도 돼요." : "다음에 할 목표를 적어 주세요. 숫자 없이 글로만 적어도 돼요."}
          </p>
          <textarea value={nextText} onChange={(e) => { setNextTouched(true); setNextText(e.target.value); }} rows={2} disabled={saving}
            placeholder="예: 4개월 안에 체지방률 3% 줄이기 · 일자목 교정하기"
            className="mt-2 w-full rounded-lg border border-line bg-elevate px-3 py-2 text-[14px] text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50" />
          {nextText.trim() && (
            <p className="m-0 mt-1 text-[13px] text-sub">{nextGoal ? <>숫자로 읽은 것 · <b className="font-semibold text-ink">{describeGoal(nextGoal)}</b></> : "숫자 없이 글로 정해요."}</p>
          )}
          <p className="m-0 mt-1 text-[12px] text-muted">바꾸면 바로 지금 목표가 되고, 이번 목표의 결과는 계약 기록에 남아요. 재등록 대본은 &lsquo;이번 결과 → 다음 목표&rsquo;로 말해요.</p>
          <div className="mt-2 flex justify-end">
            <Button variant="solid" size="sm" onClick={switchGoal} disabled={saving || !nextText.trim()}>{saving ? "바꾸는 중…" : "이걸로 바꾸기"}</Button>
          </div>
        </div>
      )}

      {/* 숫자 목표 고치기 — 칩으로(글은 그대로) */}
      {fix && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-line px-3.5 py-3">
          <p className="m-0 text-[12px] font-semibold text-muted">숫자 목표 고치기</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(GOAL_METRICS).filter(([k]) => k !== "lift" || exNames.length).map(([k, m]) => (
              <button key={k} type="button" onClick={() => setFix((f) => ({ ...f, metric: k }))} className={chip(fix.metric === k)}>{m.label}</button>
            ))}
          </div>
          {fix.metric === "lift" ? (
            <select value={fix.exercise} onChange={(e) => setFix((f) => ({ ...f, exercise: e.target.value }))}
              className="min-h-[40px] w-full rounded-lg border border-line bg-elevate px-3 text-[14px] text-ink">
              {exNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setFix((f) => ({ ...f, dir: "up" }))} className={chip(fix.dir === "up")}>늘리기</button>
              <button type="button" onClick={() => setFix((f) => ({ ...f, dir: "down" }))} className={chip(fix.dir === "down")}>줄이기</button>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-sub">
            {fix.metric === "lift" ? "목표 무게" : "얼마나"}
            <input type="number" inputMode="decimal" step="0.5" min="0" value={fix.amount} onChange={(e) => setFix((f) => ({ ...f, amount: e.target.value }))}
              className="min-h-[40px] w-24 rounded-lg border border-line bg-elevate px-3 text-[15px] text-ink" />
            {GOAL_METRICS[fix.metric].unit === "%" ? "%" : "kg"}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_MONTHS.map((n) => <button key={n} type="button" onClick={() => setFix((f) => ({ ...f, months: n }))} className={chip(fix.months === n)}>{n}개월</button>)}
          </div>
          <p className="m-0 text-[13px] text-ink">{fixGoal ? describeGoal(fixGoal) : fix.metric === "lift" ? "이 종목 무게 기록이 아직 없어요" : "인바디 기록이 있어야 시작 값을 잡을 수 있어요"}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFix(null)} disabled={saving}>취소</Button>
            <Button variant="primary" size="sm" onClick={() => saveGoal({ ...fixGoal, confirmed_at: null }, "숫자 목표를 정했어요")} disabled={saving || !fixGoal}>저장</Button>
          </div>
        </div>
      )}
      <Toast message={toast} />
    </Card>
  );
}
