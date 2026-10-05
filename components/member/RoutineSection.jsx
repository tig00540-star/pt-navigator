"use client";

/* 회원 전용 페이지 '오늘 할 개인운동'(2026-10-04) — '기록 남기기' 맨 위.
   · 루틴이 없으면: [루틴 요청하기](member_routine_request) → 트레이너 홈 · 오늘에 요청 카드 → 트레이너가 만들고 보이기를 켜면 처리됨.
   · 보이기는 켜졌는데 지켜보는 조건(최근 28일 안 PT · 오래 쉬다 돌아오면 재확정)을 못 맞추면: "트레이너님이 다시 확인하고 있어요"(숫자 없음 · 뷰가 days를 비움).
   · 루틴이 있으면: 오늘 할 덩어리 = '가장 오래 안 한 부위'(PT + 개인운동 기록 · 48시간 안에 한 건 뒤로 · lib/routine pickDayIndex).
     다른 부위도 고를 수 있다(며칠 전에 했는지 · 최근이면 '쉬어요'). 전신 루틴은 어제 · 오늘 PT에서 한 부위 종목에 표시.
   · 숫자 미리 채움(nextValues) → +/−로 실제 한 대로(무게 +는 오늘 한 칸 · 상한까지 · 트레이너가 고정한 무게는 못 바꿈) → '했어요' / '아파서 멈췄어요'
     → member_routine_log + schedule_check(personal · 오운완).
   문구는 법무 점검(2026-10-04) 수정안 — 안전 보장 표현 금지 · 부위 이름(불편 부위) 대신 '트레이너가 고정한 무게'. 표 없으면 숨김.
   2026-10-06: ① 세트별로 적기(setRows · 진도는 lib/routine effectiveSet '본 세트') ② 오늘 못 함(이유 칩 · done:false, skip)
   ③ 루틴에 없는 운동 추가(extra:true · 앱이 숫자를 추천하지 않음 · 진도 계산 밖) ④ 트레이너 한마디(routine.message · 비면 안 보임). */

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Dumbbell, Hand, Lock, MessageCircle, Minus, Plus, X } from "lucide-react";
import { nextValues, latestPtTop, pickDayIndex, recentPtGroups, effectiveSet } from "@/lib/routine";
import { notifyPush } from "@/lib/pushClient";

const r2 = (x) => Math.round(x * 100) / 100;
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const ago = (iso) => { if (!iso) return "아직 안 했어요"; const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? "오늘 했어요" : d === 1 ? "어제 했어요" : `${d}일 전에 했어요`; };
const agoShort = (iso) => { if (!iso) return "안 함"; const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? "오늘" : d === 1 ? "어제" : `${d}일 전`; };

const SKIP_REASONS = [["no_space", "자리 없음"], ["no_time", "시간 없음"], ["broken", "기구 고장"], ["etc", "기타"]];
const skipLabel = (k) => SKIP_REASONS.find((x) => x[0] === k)?.[1] || "기타";
const wTxt = (w) => (w ? `${r2(w)}kg` : "맨몸");
// 세트별 줄 → "20kg×12 · 25kg×10"
const rowsTxt = (rows) => rows.map((x) => `${wTxt(x.weight)}×${x.reps}`).join(" · ");

// 작은 ± — 세트 한 줄(번호 · 무게 · 횟수 · 지우기)이 폰 폭(약 300px)에 한 줄로 들어가게.
function MiniStep({ label, value, unit, onDec, onInc, decOff, incOff, wide }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <button type="button" onClick={onDec} disabled={decOff} aria-label={`${label} 줄이기`} className="flex h-8 w-7 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
      <span className={`${wide ? "w-[3.3rem]" : "w-[2.2rem]"} text-center text-[14px] font-bold tabular-nums text-ink`}>{value}<span className="text-[11px] font-semibold text-sub">{unit}</span></span>
      <button type="button" onClick={onInc} disabled={incOff} aria-label={`${label} 늘리기`} className="flex h-8 w-7 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
    </span>
  );
}

// 세트별 입력(2026-10-06 대표: 한 줄로 적기 없앰 · 세트마다 무게 · 횟수). 무게는 회원이 실제 든 그대로(상한을 넘겨도 기록 · 트레이너에게 표시 · 처방은 상한 안).
function SetRows({ rows, step, lockedWeight, onChange, maxSets = 8 }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="mt-2 space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1 rounded-lg bg-card/60 px-1 py-1">
          <span className="w-4 shrink-0 text-center text-[12.5px] font-bold text-sub">{i + 1}</span>
          {lockedWeight != null ? (
            <span className="w-[6.7rem] shrink-0 text-center text-[14px] font-bold text-ink">{wTxt(lockedWeight)}</span>
          ) : (
            <MiniStep label="무게" unit="kg" wide value={r2(r.weight)} onDec={() => set(i, { weight: r2(Math.max(0, r.weight - step)) })} onInc={() => set(i, { weight: r2(r.weight + step) })} decOff={r.weight <= 0} incOff={r.weight >= 300} />
          )}
          <MiniStep label="횟수" unit="회" value={r.reps} onDec={() => set(i, { reps: Math.max(1, r.reps - 1) })} onInc={() => set(i, { reps: Math.min(50, r.reps + 1) })} decOff={r.reps <= 1} incOff={r.reps >= 50} />
          {rows.length > 1 && (
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`${i + 1}세트 지우기`} className="ml-auto flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"><X className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {rows.length < maxSets && (
        <button type="button" onClick={() => onChange([...rows, { ...rows[rows.length - 1] }])} className="min-h-[34px] text-[13px] font-semibold text-sub">+ 세트 추가</button>
      )}
    </div>
  );
}

const Shell = ({ title, children }) => (
  <section className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm break-keep text-pretty">
    <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><Dumbbell className="h-4 w-4 text-primary-strong" aria-hidden="true" /> {title}</h2>
    {children}
  </section>
);

export default function RoutineSection({ supabase, me, ptLogs = [], onSaved, healthOk = true }) {
  const [routine, setRoutine] = useState(undefined);  // undefined=불러오는 중 · null=없음 · false=표 없음
  const [rlogs, setRlogs] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [pick, setPick] = useState(null);
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedToday, setSavedToday] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [extras, setExtras] = useState([]);       // 루틴에 없는 운동 [{ key, name, weight, reps, sets, rows }]
  const [extraName, setExtraName] = useState("");
  const [nowISO] = useState(() => new Date().toISOString());

  const load = async () => {
    const [r, l, q] = await Promise.all([
      supabase.from("member_routine_view").select("*").maybeSingle(),
      supabase.from("member_routine_log").select("*").order("created_at", { ascending: true }),
      supabase.from("member_routine_request").select("*").eq("status", "open").order("created_at"),
    ]);
    if (r.error && q.error) { console.error("루틴 조회 실패", r.error); setRoutine(false); return; }
    setRoutine(r.error ? null : r.data || null);
    setRlogs(l.error ? [] : l.data || []);
    setReqs(q.error ? [] : q.data || []);
  };
  useEffect(() => { let alive = true; (async () => { if (!supabase) return; if (alive) await load(); })(); return () => { alive = false; }; }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => (Array.isArray(routine?.days) ? routine.days : []), [routine]);
  const auto = useMemo(() => pickDayIndex(days, rlogs, ptLogs, nowISO), [days, rlogs, ptLogs, nowISO]);
  const idx = pick ?? auto.index;
  const day = days[idx] || null;
  const conf = routine?.confirmed_at || routine?.updated_at || null;
  const after = useMemo(() => rlogs.filter((l) => String(l.created_at) > String(conf)), [rlogs, conf]);
  const plan = useMemo(() => (day?.items || []).map((it) => ({ it, nv: nextValues(it, after, latestPtTop(ptLogs, it.name), conf) })), [day, after, ptLogs, conf]);
  const recentPt = useMemo(() => recentPtGroups(ptLogs, nowISO), [ptLogs, nowISO]);

  if (routine === undefined || routine === false) return null;

  const request = async () => {
    setBusy(true); setMsg("");
    try {
      const { data, error } = await supabase.from("member_routine_request").insert({ user_id: me.id }).select("*");
      if (error || !data?.length) { console.error("루틴 요청 실패", error); setMsg("요청하지 못했어요. 다시 시도해 주세요."); return; }
      setReqs((x) => [...x, data[0]]);
      notifyPush(supabase.auth.getSession().then(({ data: s }) => (s?.session?.access_token ? { Authorization: `Bearer ${s.session.access_token}` } : {})), "routine_request", data[0].id);   // 담당 트레이너 폰으로
    } catch { setMsg("인터넷 연결을 확인하고 다시 시도해 주세요."); } finally { setBusy(false); }
  };
  const cancelReq = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from("member_routine_request").delete().in("id", reqs.map((x) => x.id)).select("id");
      // 0행 = 트레이너가 이미 처리했거나 지울 수 없는 상태 → 다시 읽어 실제 상태를 보여 준다
      if (error || !data?.length) { console.error("루틴 요청 취소 실패", error); setMsg("취소하지 못했어요. 이미 트레이너가 확인했을 수 있어요."); await load(); return; }
      setReqs([]);
    } catch { setMsg("인터넷 연결을 확인하고 다시 시도해 주세요."); } finally { setBusy(false); }
  };

  // ── 루틴 없음: 요청 ──
  if (!routine) {
    return (
      <Shell title="개인운동 루틴">
        {reqs.length ? (
          <>
            <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary-soft px-3.5 py-3 text-[14px] font-semibold text-primary-strong"><Hand className="h-4 w-4" aria-hidden="true" /> 요청했어요. 트레이너님이 만들면 여기에 보여요.</p>
            <button type="button" onClick={cancelReq} disabled={busy} className="mt-2 min-h-[36px] text-[13px] text-sub underline-offset-2 hover:underline">요청 취소</button>
          </>
        ) : (
          <>
            <p className="mt-1 text-[14px] leading-relaxed text-sub">혼자 운동하실 때 할 루틴이 필요하세요? 트레이너님이 PT 기록을 보고 만들어 드려요.</p>
            <button type="button" onClick={request} disabled={busy}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-50">
              <Hand className="h-4 w-4" aria-hidden="true" /> {busy ? "요청하는 중…" : "루틴 요청하기"}
            </button>
          </>
        )}
        {msg && <p className="mt-2 text-[13px] text-danger-text">{msg}</p>}
      </Shell>
    );
  }

  // 트레이너 한마디(선택 · 비면 안 보임)
  const bubble = routine?.message ? (
    <div className="mt-3 flex gap-2 rounded-xl bg-pt-soft px-3.5 py-3">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-pt-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-pt-text">{me?.trainer_name ? `${me.trainer_name} 트레이너님` : "트레이너님"} 한마디</p>
        <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{routine.message}</p>
      </div>
    </div>
  ) : null;

  // ── 다시 확인 중(오래 쉬었거나 최근 PT가 없음) ──
  if (!routine.ready || !day) {
    return (
      <Shell title="개인운동 루틴">
        <p className="mt-2 rounded-xl bg-elevate px-3.5 py-3 text-[14px] leading-relaxed text-sub">트레이너님이 루틴을 다시 확인하고 있어요. 확인이 끝나면 여기에 보여요.</p>
        {bubble}
      </Shell>
    );
  }

  const today = todayKst();
  const rowsOf = (it, nv) => Array.from({ length: Math.max(1, nv.sets || 1) }, () => ({ weight: it.locked ? it.weight : nv.weight, reps: nv.reps }));
  const v = (it, nv) => vals[it.name] || { weight: nv.weight, reps: nv.reps, sets: nv.sets, done: false, pain: false, skip: null, rows: rowsOf(it, nv) };
  const setV = (it, nv, patch) => setVals((m) => ({ ...m, [it.name]: { ...v(it, nv), ...patch } }));
  const extraDone = extras.filter((e) => e.name.trim());
  const doneCount = plan.filter(({ it, nv }) => v(it, nv).done).length + extraDone.length;
  // 세트별 줄을 한 줄 요약(weight · reps · sets)으로 — 예전 기록 · 진도 계산과 같은 모양을 유지
  const summarize = (x, planW, it) => {
    if (!x.rows?.length) return { weight: x.weight, reps: x.reps, sets: x.sets };
    const eff = effectiveSet({ setRows: x.rows }, planW, it || { repMin: 0 });
    return { weight: eff.weight, reps: eff.reps, sets: x.rows.length, setRows: x.rows };
  };
  const addExtra = () => {
    const n = extraName.trim();
    if (!n) return;
    setExtras((xs) => [...xs, { key: `${Date.now()}`, name: n.slice(0, 40), weight: 0, reps: 12, sets: 2, rows: [{ weight: 0, reps: 12 }, { weight: 0, reps: 12 }] }]);
    setExtraName("");
  };
  const setExtra = (key, patch) => setExtras((xs) => xs.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const age = auto.ages.find((a) => a.i === idx);

  const save = async () => {
    if (!doneCount || busy) return;
    setBusy(true); setMsg("");
    try {
      const items = [
        ...plan.filter(({ it, nv }) => v(it, nv).done).map(({ it, nv }) => {
          const x = v(it, nv);
          return { name: it.name, ...summarize(x, nv.weight, it), done: true, ...(x.pain ? { pain: true } : {}) };
        }),
        // 오늘 못 함 — 이유만 남긴다(진도 · '가장 오래 안 한 부위' 계산엔 안 셈)
        ...plan.filter(({ it, nv }) => !v(it, nv).done && v(it, nv).skip).map(({ it, nv }) => ({ name: it.name, done: false, skip: v(it, nv).skip })),
        // 루틴에 없는 운동 — 회원이 한 그대로(앱 추천 없음 · 진도 계산 밖)
        ...extraDone.map((e) => ({ name: e.name.trim(), ...summarize(e, e.weight, null), done: true, extra: true })),
      ];
      const { data, error } = await supabase.from("member_routine_log").insert({ user_id: me.id, performed_on: today, day_key: day.key, items }).select("id");
      if (error || !data?.length) { console.error("개인운동 기록 실패", error); setMsg("기록하지 못했어요. 다시 시도해 주세요."); return; }
      // 오운완 하루 체크 — 실패하면 알려 준다(루틴 기록은 이미 남음 · 다시 누르면 기록이 두 번 생기니 저장 버튼은 닫는다)
      // 개인운동 기록에도 실제로 한 내용(종목 · 무게 · 횟수 · 세트)을 채워 남긴다(2026-10-06) — '기록 남기기'에 따로 적지 않아도 되게.
      const detail = items.map((x) => x.done === false
        ? `${x.name} · 오늘 못 함(${skipLabel(x.skip)})`
        : `${x.extra ? "+ " : ""}${x.name} ${x.setRows?.length ? rowsTxt(x.setRows) : `${wTxt(x.weight)} × ${x.reps}회 × ${x.sets}세트`}${x.pain ? " (아파서 멈춤)" : ""}`).join("\n");
      const sc = await supabase.from("schedule_check").insert({ user_id: me.id, on_date: today, kind: "personal", note: `개인운동 루틴 · ${day.label}\n${detail}`.slice(0, 1000) }).select("id");
      if (sc.error || !sc.data?.length) { console.error("오운완 체크 실패", sc.error); setMsg("운동은 기록했어요. 오운완 체크는 '기록하기' 탭의 개인운동에서 한 번 더 눌러 주세요."); }
      setSavedToday(true); setVals({}); setPick(null); setExtras([]);
      await load();
      onSaved?.();
    } catch (e) {
      console.error(e); setMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  return (
    <Shell title={`오늘 할 개인운동 · ${day.label}`}>
      <p className="mt-0.5 text-[12.5px] text-muted">{days.filter((d) => d.items?.length).length > 1 ? ago(age?.last) : "올 때마다 이 루틴을 해요"}{auto.reason === "all_recent" && pick == null ? " · 모든 부위를 최근에 했어요. 오늘은 가볍게 해도 좋아요" : ""}</p>
      {bubble}
      {savedToday && <p className="mt-2 rounded-lg bg-primary-soft px-3 py-2 text-[13px] font-semibold text-primary-strong">오늘 개인운동을 기록했어요. 다음엔 가장 오래 안 한 부위가 먼저 나와요.</p>}

      <ol className="m-0 mt-3 list-none space-y-2.5 p-0">
        {plan.map(({ it, nv }) => {
          const x = v(it, nv);
          const step = it.step || 5;
          const ptRecent = days.length === 1 && recentPt.has(it.group);
          return (
            <li key={it.name} className={`rounded-xl px-3 py-3 ${x.done ? "bg-primary-soft" : x.skip ? "bg-elevate opacity-60" : "bg-elevate"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-bold text-ink">{it.name}</span>
                {it.locked && <span className="inline-flex items-center gap-0.5 text-[12px] text-sub"><Lock className="h-3 w-3" /> 트레이너가 고정한 무게</span>}
                {ptRecent && <span className="text-[12px] font-semibold text-ot-text">최근 PT에서 한 부위 · 빼거나 가볍게</span>}
              </div>
              {it.warmup && <p className="mt-0.5 text-[12.5px] text-sub">워밍업 {r2(it.warmup.weight)}kg × {it.warmup.reps}회 × 1세트 먼저</p>}
              {it.note && <p className="mt-0.5 text-[12.5px] text-sub">&ldquo;{it.note}&rdquo;</p>}
              {x.skip ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-sub">오늘 못 함 · {skipLabel(x.skip)}</span>
                  <button type="button" onClick={() => setV(it, nv, { skip: null })} className="min-h-[34px] text-[13px] font-semibold text-primary-strong">되돌리기</button>
                </div>
              ) : (<>
              <SetRows rows={x.rows || rowsOf(it, nv)} step={step} lockedWeight={it.locked ? it.weight : null} maxSets={6}
                onChange={(rows) => setV(it, nv, { rows: rows.length ? rows : rowsOf(it, nv) })} />
              {!it.locked && (x.rows || []).some((r) => r.weight > nv.cap + 1e-9) && (
                <p className="mt-1.5 text-[12.5px] text-sub">혼자 하는 상한({r2(nv.cap)}kg)보다 무거워요. 그대로 기록되고, 다음 PT 때 트레이너와 확인해요.</p>
              )}
              {nv.capReached && !it.locked && <p className="mt-1.5 text-[12.5px] text-sub">혼자서는 여기까지예요. 더 무거운 건 다음 PT 때 트레이너와 올려요.</p>}
              {nv.painStop && <p className="mt-1.5 text-[12.5px] text-sub">지난번 아파서 멈춘 종목이에요. 트레이너가 확인할 때까지 무게가 그대로예요.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setV(it, nv, { done: !(x.done && !x.pain), pain: false })} aria-pressed={x.done && !x.pain}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3.5 text-[14px] font-semibold ${x.done && !x.pain ? "bg-primary text-white" : "border border-line bg-card text-ink"}`}>
                  <Check className="h-4 w-4" aria-hidden="true" /> 했어요
                </button>
                {/* 통증 기록은 건강정보 — 건강정보 동의(2026-10-05)한 회원만 남긴다. 안 했으면 말로 알리게 안내만. */}
                {healthOk ? (
                <button type="button" onClick={() => setV(it, nv, { done: !x.pain, pain: !x.pain })} aria-pressed={x.pain}
                  className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-[13px] font-semibold ${x.pain ? "bg-rose-600 text-white" : "text-danger-text"}`}>
                  아파서 멈췄어요
                </button>
                ) : (
                  <span className="inline-flex min-h-[40px] items-center text-[12.5px] text-sub">아프면 바로 멈추고 트레이너에게 말해 주세요</span>
                )}
                {!x.done && (
                  <details className="w-full">
                    <summary className="inline-flex min-h-[36px] cursor-pointer list-none items-center text-[13px] font-semibold text-sub [&::-webkit-details-marker]:hidden">오늘 못 함</summary>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {SKIP_REASONS.map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setV(it, nv, { skip: k, done: false, pain: false })}
                          className="min-h-[34px] rounded-full border border-line bg-card px-3 text-[13px] text-sub">{l}</button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              </>)}
            </li>
          );
        })}
      </ol>

      {/* 루틴에 없는 운동 — 한 그대로 기록(앱은 숫자를 추천하지 않음) */}
      <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-3">
        <p className="text-[13.5px] font-semibold text-ink">루틴에 없는 운동도 했나요?</p>
        {extras.map((e) => (
          <div key={e.key} className="mt-2 rounded-lg bg-elevate px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-ink">+ {e.name}</span>
              <button type="button" onClick={() => setExtras((xs) => xs.filter((z) => z.key !== e.key))} aria-label="빼기" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted"><X className="h-4 w-4" /></button>
            </div>
            <SetRows rows={e.rows} step={2.5} lockedWeight={null} onChange={(rows) => setExtra(e.key, { rows: rows.length ? rows : [{ weight: 0, reps: 12 }] })} />
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <input value={extraName} onChange={(ev) => setExtraName(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") addExtra(); }} maxLength={40}
            placeholder="운동 이름 (예: 런지)" className="min-w-0 flex-1 rounded-lg border border-line bg-elevate px-3 py-2 text-[14px] text-ink placeholder-muted outline-none focus:border-primary" />
          <button type="button" onClick={addExtra} disabled={!extraName.trim()} className="shrink-0 rounded-lg bg-ink px-3.5 text-[14px] font-semibold text-white disabled:opacity-40">추가</button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">트레이너와 해 본 적 없는 운동은 가볍게 시작하고, 다음 PT 때 트레이너에게 보여 주세요.</p>
      </div>

      {msg && <p className="mt-2 text-[13px] text-danger-text">{msg}</p>}
      <button type="button" onClick={save} disabled={!doneCount || busy}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-40">
        {busy ? "기록하는 중…" : doneCount ? `오늘 운동 기록하기 (${doneCount}개)` : "한 종목씩 '했어요'를 눌러 주세요"}
      </button>

      {auto.ages.length > 1 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowOther((s) => !s)} className="inline-flex min-h-[36px] items-center gap-1 text-[13px] font-semibold text-sub">
            다른 부위 하기 <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOther ? "rotate-180" : ""}`} />
          </button>
          {showOther && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {auto.ages.map((a) => (
                <button key={a.key} type="button" onClick={() => { setPick(a.i); setVals({}); setShowOther(false); }}
                  className={`min-h-[36px] rounded-full border px-3 text-[13px] ${a.i === idx ? "border-ink bg-ink font-semibold text-white" : "border-line bg-card text-sub"}`}>
                  {a.label} · {agoShort(a.last)}{a.recent ? " (쉬어요)" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-elevate px-3.5 py-3 text-[12.5px] leading-relaxed text-sub">
        이 루틴은 {me?.trainer_name ? `${me.trainer_name} 트레이너님이` : "담당 트레이너님이"} PT 기록을 보고 정했어요. 그날 무겁게 느껴지면 무게를 낮춰도 괜찮아요.
        운동 중에 아프거나 찌릿하거나 어지러우면 바로 멈추고 트레이너에게 알려 주세요. 병원 치료 중이거나 몸이 좋지 않은 날은 쉬고, 트레이너와 먼저 상의해 주세요.
      </div>

      <div className="mt-3 text-right">
        {reqs.length ? (
          <span className="text-[12.5px] text-muted">새 루틴을 요청했어요</span>
        ) : (
          <button type="button" onClick={request} disabled={busy} className="min-h-[36px] text-[12.5px] font-semibold text-sub underline-offset-2 hover:underline">새 루틴 요청</button>
        )}
      </div>
    </Shell>
  );
}
