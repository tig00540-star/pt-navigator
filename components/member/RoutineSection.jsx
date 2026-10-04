"use client";

/* 회원 전용 페이지 '오늘 할 개인운동'(2026-10-04) — 트레이너가 확정하고 '보이기'를 켠 루틴(member_routine_view · 최근 4주 안 PT가 있을 때만).
   · 오늘 할 루틴 = 지난번 다음 순서(어제 · 오늘 PT와 같은 부위면 겹치지 않는 루틴 먼저 · lib/routine pickDayIndex). 다른 루틴도 고를 수 있다.
   · 숫자는 미리 채워져 있고(lib/routine nextValues · 회원 기록으로 계산), 하면서 +/−로 실제 한 대로 바꾼 뒤 '했어요'.
     무게 +는 오늘 한 칸까지 · 상한까지(그 위는 "다음 PT 때 트레이너와"). 트레이너가 고정한 무게는 못 바꾼다(횟수 · 세트만).
   · '아파서 멈췄어요' = 그 종목 진도 멈춤 + 트레이너 카드에 알림.
   · 저장: member_routine_log(본인만) + schedule_check(kind 'personal' · 오운완 집계).
   문구는 법무 점검(2026-10-04) 수정안 — 안전 보장 표현 금지 · 부위 이름 대신 '트레이너가 고정한 무게'. 표 없으면 숨김. */

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Dumbbell, Lock, Minus, Plus } from "lucide-react";
import { nextValues, latestPtTop, pickDayIndex } from "@/lib/routine";

const r2 = (x) => Math.round(x * 100) / 100;
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const mdKo = (ymd) => (ymd ? `${Number(String(ymd).slice(5, 7))}/${Number(String(ymd).slice(8, 10))}` : "");

function Step({ label, value, onDec, onInc, decOff, incOff, unit }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" onClick={onDec} disabled={decOff} aria-label={`${label} 줄이기`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Minus className="h-4 w-4" /></button>
      <span className="min-w-[3.4rem] text-center text-[15px] font-bold text-ink">{value}{unit}</span>
      <button type="button" onClick={onInc} disabled={incOff} aria-label={`${label} 늘리기`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Plus className="h-4 w-4" /></button>
    </span>
  );
}

export default function RoutineSection({ supabase, me, ptLogs = [], onSaved }) {
  const [routine, setRoutine] = useState(undefined);
  const [rlogs, setRlogs] = useState([]);
  const [pick, setPick] = useState(null);       // 회원이 고른 루틴 index(없으면 자동)
  const [vals, setVals] = useState({});         // name → { weight, reps, sets, done, pain }
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedToday, setSavedToday] = useState(false);
  const [showOther, setShowOther] = useState(false);

  const load = async () => {
    const [r, l] = await Promise.all([
      supabase.from("member_routine_view").select("*").maybeSingle(),
      supabase.from("member_routine_log").select("*").order("created_at", { ascending: true }),
    ]);
    if (r.error) { console.error("루틴 조회 실패", r.error); setRoutine(null); return; }
    setRoutine(r.data || null);
    setRlogs(l.error ? [] : l.data || []);
  };
  useEffect(() => { let alive = true; (async () => { if (!supabase) return; if (alive) await load(); })(); return () => { alive = false; }; }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayKst();
  const days = useMemo(() => (Array.isArray(routine?.days) ? routine.days : []), [routine]);
  const auto = useMemo(() => pickDayIndex(days, rlogs, ptLogs, today), [days, rlogs, ptLogs, today]);
  const idx = pick ?? auto.index;
  const day = days[idx] || null;
  const conf = routine?.confirmed_at || routine?.updated_at || null;
  const after = useMemo(() => rlogs.filter((l) => String(l.created_at) > String(conf)), [rlogs, conf]);
  const plan = useMemo(() => (day?.items || []).map((it) => ({ it, nv: nextValues(it, after, latestPtTop(ptLogs, it.name), conf) })), [day, after, ptLogs, conf]);

  if (!routine || !day) return null;

  const v = (it, nv) => vals[it.name] || { weight: nv.weight, reps: nv.reps, sets: nv.sets, done: false, pain: false };
  const setV = (it, nv, patch) => setVals((m) => ({ ...m, [it.name]: { ...v(it, nv), ...patch } }));
  const doneCount = plan.filter(({ it, nv }) => v(it, nv).done).length;

  const save = async () => {
    if (!doneCount || saving) return;
    setSaving(true); setMsg("");
    try {
      const items = plan.filter(({ it, nv }) => v(it, nv).done).map(({ it, nv }) => {
        const x = v(it, nv);
        return { name: it.name, weight: x.weight, reps: x.reps, sets: x.sets, done: true, ...(x.pain ? { pain: true } : {}) };
      });
      const { data, error } = await supabase.from("member_routine_log").insert({ user_id: me.id, performed_on: today, day_key: day.key, items }).select("id");
      if (error || !data?.length) { console.error("개인운동 기록 실패", error); setMsg("기록하지 못했어요. 다시 시도해 주세요."); return; }
      await supabase.from("schedule_check").insert({ user_id: me.id, on_date: today, kind: "personal", note: `개인운동 루틴 · ${day.label}` }).select("id");
      setSavedToday(true); setVals({}); setPick(null);
      await load();
      onSaved?.();
    } catch (e) {
      console.error(e); setMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setSaving(false); }
  };

  const last = [...rlogs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

  return (
    <section className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm break-keep text-pretty">
      <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
        <Dumbbell className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 오늘 할 개인운동 · {day.label}
      </h2>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {last ? `지난번 ${mdKo(last.performed_on)} ${days.find((d) => d.key === last.day_key)?.label || ""}` : "첫 개인운동이에요"}
        {auto.reason === "recovery" && pick == null ? " · 최근에 한 부위는 쉬고 이 루틴부터예요" : ""}
      </p>
      {savedToday && <p className="mt-2 rounded-lg bg-primary-soft px-3 py-2 text-[13px] font-semibold text-primary-strong">오늘 개인운동을 기록했어요. 다음 루틴이 준비됐어요.</p>}

      <ol className="m-0 mt-3 list-none space-y-2.5 p-0">
        {plan.map(({ it, nv }) => {
          const x = v(it, nv);
          const step = it.step || 5;
          const maxW = it.locked ? it.weight : Math.min(nv.cap, r2(nv.weight + step));   // 오늘 한 칸까지 · 상한까지
          const atCap = !it.locked && x.weight >= nv.cap;
          return (
            <li key={it.name} className={`rounded-xl px-3.5 py-3 ${x.done ? "bg-primary-soft" : "bg-elevate"}`}>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{it.name}</span>
                {it.locked && <span className="inline-flex items-center gap-0.5 text-[12px] text-sub"><Lock className="h-3 w-3" /> 트레이너가 고정한 무게</span>}
              </div>
              {it.warmup && <p className="mt-0.5 text-[12.5px] text-sub">워밍업 {r2(it.warmup.weight)}kg × {it.warmup.reps}회 × 1세트 먼저</p>}
              {it.note && <p className="mt-0.5 text-[12.5px] text-sub">&ldquo;{it.note}&rdquo;</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {it.locked || x.weight === 0 ? (
                  <span className="min-w-[3.4rem] text-[15px] font-bold text-ink">{x.weight ? `${r2(x.weight)}kg` : "맨몸"}</span>
                ) : (
                  <Step label="무게" unit="kg" value={r2(x.weight)} onDec={() => setV(it, nv, { weight: r2(Math.max(0, x.weight - step)) })} onInc={() => setV(it, nv, { weight: r2(x.weight + step) })} decOff={x.weight - step < 0} incOff={x.weight + step > maxW + 1e-9} />
                )}
                <Step label="횟수" unit="회" value={x.reps} onDec={() => setV(it, nv, { reps: Math.max(1, x.reps - 1) })} onInc={() => setV(it, nv, { reps: Math.min(30, x.reps + 1) })} decOff={x.reps <= 1} incOff={x.reps >= 30} />
                <Step label="세트" unit="세트" value={x.sets} onDec={() => setV(it, nv, { sets: Math.max(1, x.sets - 1) })} onInc={() => setV(it, nv, { sets: Math.min(4, x.sets + 1) })} decOff={x.sets <= 1} incOff={x.sets >= 4} />
              </div>
              {(atCap || nv.capReached) && !it.locked && <p className="mt-1.5 text-[12.5px] text-sub">혼자서는 여기까지예요. 더 무거운 건 다음 PT 때 트레이너와 올려요.</p>}
              {nv.painStop && <p className="mt-1.5 text-[12.5px] text-sub">지난번 아파서 멈춘 종목이에요. 트레이너가 확인할 때까지 무게가 그대로예요.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setV(it, nv, { done: !x.done, pain: false })} aria-pressed={x.done && !x.pain}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3.5 text-[14px] font-semibold ${x.done && !x.pain ? "bg-primary text-white" : "border border-line bg-card text-ink"}`}>
                  <Check className="h-4 w-4" aria-hidden="true" /> 했어요
                </button>
                <button type="button" onClick={() => setV(it, nv, { done: !x.pain, pain: !x.pain })} aria-pressed={x.pain}
                  className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-[13px] font-semibold ${x.pain ? "bg-rose-600 text-white" : "text-danger-text"}`}>
                  아파서 멈췄어요
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {msg && <p className="mt-2 text-[13px] text-danger-text">{msg}</p>}
      <button type="button" onClick={save} disabled={!doneCount || saving}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-40">
        {saving ? "기록하는 중…" : doneCount ? `오늘 운동 기록하기 (${doneCount}개)` : "한 종목씩 '했어요'를 눌러 주세요"}
      </button>

      {days.filter((d) => d.items?.length).length > 1 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowOther((s) => !s)} className="inline-flex min-h-[36px] items-center gap-1 text-[13px] font-semibold text-sub">
            다른 루틴 보기 <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOther ? "rotate-180" : ""}`} />
          </button>
          {showOther && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {days.map((d, i) => d.items?.length ? (
                <button key={d.key} type="button" onClick={() => { setPick(i); setVals({}); setShowOther(false); }}
                  className={`min-h-[36px] rounded-full border px-3 text-[13px] ${i === idx ? "border-ink bg-ink font-semibold text-white" : "border-line bg-card text-sub"}`}>{d.label}</button>
              ) : null)}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-elevate px-3.5 py-3 text-[12.5px] leading-relaxed text-sub">
        이 루틴은 {me?.trainer_name ? `${me.trainer_name} 트레이너님이` : "담당 트레이너님이"} PT 기록을 보고 정했어요. 그날 무겁게 느껴지면 무게를 낮춰도 괜찮아요.
        운동 중에 아프거나 찌릿하거나 어지러우면 바로 멈추고 트레이너에게 알려 주세요. 병원 치료 중이거나 몸이 좋지 않은 날은 쉬고, 트레이너와 먼저 상의해 주세요.
      </div>
    </section>
  );
}
