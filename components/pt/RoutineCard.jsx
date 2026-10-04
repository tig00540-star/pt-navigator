"use client";

/* 개인운동 루틴 — PT 회원 대시보드 카드(2026-10-04). 회원 전용 페이지 '기록 남기기'의 '오늘 할 개인운동'을 여기서 만든다.
   숫자는 lib/routine 규칙(PT 탑 세트의 70% · 상한 85% · 한 칸 아래로 · 가벼운 고반복 예외). 트레이너는 확정 전에 전부 고칠 수 있다:
   종목 추가(PT에서 한 것 · 장비 목록 · 직접) · 빼기 · 순서 · 무게 · 횟수 · 세트 · 무게 고정 · 한 줄 설명.
   트레이너가 고친 무게: PT 종목은 상한 = max(85%, 트레이너 값) · PT 기록 없는 종목은 상한 = 트레이너 값(혼자서는 횟수 · 세트로만).
   저장 = 확정(confirmed_at = 회원 진도 계산 출발점) · '회원에게 보이기'를 켜야 회원에게 보인다(꺼진 채 시작).
   회원 기록(member_routine_log)은 여기서 읽어 '지난 PT 이후 개인운동'과 다음 숫자를 보여 준다.
   법무 점검(2026-10-04) 반영: PT 기록이 늘어도 자동으로 안 올림(→ '상한 다시 계산' 확인) · 회원 '아파서 멈췄어요' 알림 ·
   불편 부위가 있는 회원은 '확인했어요' 체크 없이는 보이기 불가 · 누가 확정 · 보이기 했는지 기록 · 설명 대사 표현 수정.
   표(SQL 2026-10-04-member-routine) 없으면 카드 숨김. */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Dumbbell, Eye, EyeOff, Lock, Minus, Pencil, Plus, RefreshCw, Trash2, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildExerciseSeries } from "@/lib/workout";
import { draftRoutine, itemFromSeries, inferStep, groupOf, machineFor, nextValues, latestPtTop, isRisky, breakSinceConfirm, SPLITS, GROUP_LABEL } from "@/lib/routine";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const r2 = (x) => Math.round(x * 100) / 100;
// 은/는 — 마지막 글자 받침으로('레그프레스는' · '레그컬은').
const eunNeun = (w) => { const c = String(w || "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "은" : "는"; };
const kg = (w) => `${r2(w)}kg`;
const mdKo = (iso) => { const t = Date.parse(iso || ""); if (Number.isNaN(t)) return ""; const k = new Date(t + 9 * 3600000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

function Stepper({ value, onChange, step = 1, min = 0, max = 999, unit = "", label }) {
  const dec = () => onChange(r2(Math.max(min, value - step)));
  const inc = () => onChange(r2(Math.min(max, value + step)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label}>
      <button type="button" onClick={dec} disabled={value <= min} aria-label={`${label} 줄이기`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
      <span className="min-w-[3.2rem] text-center text-[14px] font-semibold text-ink">{r2(value)}{unit}</span>
      <button type="button" onClick={inc} disabled={value >= max} aria-label={`${label} 늘리기`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-sub disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
    </span>
  );
}

export default function RoutineCard({ member, logs = [] }) {
  const { toast, showToast } = useToast();
  const [row, setRow] = useState(undefined);      // undefined=불러오는 중 · null=없음 · false=표 없음
  const [rlogs, setRlogs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [split, setSplit] = useState(2);
  const [edit, setEdit] = useState(null);         // { split, days }
  const [dayIdx, setDayIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [painOk, setPainOk] = useState(false);
  const hasPain = Boolean(member?.pain && member.pain !== "-" && String(member.pain).trim());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { setRow(false); return; }
      const [r, l, m] = await Promise.all([
        supabase.from("member_routine").select("*").eq("member_id", member.id).maybeSingle(),
        supabase.from("member_routine_log").select("*").eq("user_id", member.id).order("created_at", { ascending: true }),
        supabase.from("center_machine").select("name, kind, step_kg, cues"),
      ]);
      if (cancelled) return;
      if (r.error) { console.error("루틴 조회 실패", r.error); setRow(false); return; }
      setRow(r.data || null);
      setRlogs(l.error ? [] : l.data || []);
      setMachines(m.error ? [] : m.data || []);
      if (r.data?.split) setSplit(r.data.split);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  if (row === undefined || row === false) return null;

  const ptSeries = buildExerciseSeries(logs);
  const makeDraft = (sp) => {
    const d = draftRoutine({ logs, machines, split: sp, pain: member?.pain || "" });
    if (!d.days.some((x) => x.items.length)) { showToast("PT 운동일지에 '종목 · 세트 기록'이 2번 이상 있는 종목이 아직 없어요."); return null; }
    return d;
  };

  const save = async (next, msg) => {
    setBusy(true);
    try {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const now = new Date().toISOString();
      const visible = next.visible ?? row?.visible ?? false;
      const payload = {
        member_id: member.id, split: next.split, days: next.days, visible,
        confirmed_at: next.keepConfirmed ? row?.confirmed_at : now,
        confirmed_by: next.keepConfirmed ? row?.confirmed_by ?? null : uid,
        ...(visible && !row?.visible ? { visible_at: now, visible_by: uid } : {}),
        ...(next.painChecked ? { pain_checked_at: now } : {}),
        updated_at: now,
      };
      const { data, error } = await supabase.from("member_routine").upsert(payload, { onConflict: "member_id" }).select();
      if (error || !data?.length) { console.error("루틴 저장 실패", error); showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
      setRow(data[0]);
      if (msg) showToast(msg);
      return true;
    } catch (e) {
      console.error(e); showToast("인터넷 연결을 확인하고 다시 시도해 주세요."); return false;
    } finally { setBusy(false); }
  };

  // ── 편집 ──
  if (edit) {
    const day = edit.days[dayIdx] || edit.days[0];
    const setItems = (items) => setEdit((e) => ({ ...e, days: e.days.map((d, i) => (i === dayIdx ? { ...d, items } : d)) }));
    const setItem = (k, patch) => setItems(day.items.map((it, j) => {
      if (j !== k) return it;
      const nx = { ...it, ...patch };
      if ("weight" in patch) nx.cap = nx.source === "pt" ? Math.max(it.cap, nx.weight) : nx.weight;   // 트레이너 값 존중
      if ("reps" in patch) { nx.repMin = Math.min(nx.repMin, nx.reps); nx.repMax = Math.max(nx.repMax, nx.reps); }
      return nx;
    }));
    const move = (k, d) => { const a = [...day.items]; const j = k + d; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j], a[k]]; setItems(a); };
    const inRoutine = new Set(edit.days.flatMap((d) => d.items.map((i) => i.name)));
    const addItem = (it) => { setItems([...day.items, it]); setAdding(false); setCustom(""); };
    const newItem = (name, source) => {
      const m = machineFor(name, machines);
      const step = inferStep(name, [], m?.step_kg);
      return { name, group: groupOf(name), weight: step, reps: 12, sets: 2, repMin: 10, repMax: 12, cap: step, step, locked: false, light: false, warmup: null, note: Array.isArray(m?.cues) && m.cues[0] ? String(m.cues[0]) : "", source };
    };
    return (
      <Card as="section">
        <SectionTitle icon={Dumbbell}>개인운동 루틴 {row ? "고치기" : "만들기"}</SectionTitle>
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-elevate p-[3px]">
          {edit.days.map((d, i) => (
            <button key={d.key} type="button" onClick={() => setDayIdx(i)}
              className={`inline-flex min-h-[34px] shrink-0 items-center rounded-full px-3 text-[13px] ${i === dayIdx ? "bg-card font-semibold text-ink shadow-sm" : "text-sub"}`}>
              {d.key} {d.label} · {d.items.length}
            </button>
          ))}
        </div>
        {day.items.length === 0 && <p className="rounded-xl bg-elevate px-3.5 py-3 text-[13px] text-sub">이 루틴에 넣을 종목이 없어요. 아래 &lsquo;종목 추가&rsquo;로 넣어 주세요.</p>}
        <ol className="m-0 list-none space-y-2 p-0">
          {day.items.map((it, k) => (
            <li key={`${it.name}-${k}`} className="rounded-xl bg-elevate px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15px] font-semibold text-ink">{k + 1}. {it.name}</span>
                <span className="text-[12px] text-muted">{GROUP_LABEL[it.group]}{it.light ? " · 가벼운 고반복" : ""}{it.source !== "pt" ? " · PT 기록 없음" : ""}</span>
                {it.painHint && <span className="rounded-md bg-ot-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-ot-text">불편 부위 관련</span>}
                <span className="ml-auto flex items-center">
                  <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label="위로" className="flex h-8 w-8 items-center justify-center text-sub disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(k, 1)} disabled={k === day.items.length - 1} aria-label="아래로" className="flex h-8 w-8 items-center justify-center text-sub disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setItems(day.items.filter((_, j) => j !== k))} aria-label="빼기" className="flex h-8 w-8 items-center justify-center text-danger-text"><Trash2 className="h-4 w-4" /></button>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Stepper label="무게" value={it.weight} step={it.step} min={0} unit="kg" onChange={(v) => setItem(k, { weight: v })} />
                <Stepper label="횟수" value={it.reps} step={1} min={1} max={40} unit="회" onChange={(v) => setItem(k, { reps: v })} />
                <Stepper label="세트" value={it.sets} step={1} min={1} max={6} unit="세트" onChange={(v) => setItem(k, { sets: v })} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-sub">
                <span>혼자 상한 {kg(it.cap)}</span>
                <span>한 칸 {kg(it.step)}</span>
                {it.ptRef && <span>PT {kg(it.ptRef.weight)} × {it.ptRef.reps}회</span>}
                {it.ptRef && it.weight > it.ptRef.weight && <span className="font-semibold text-danger-text">PT에서 한 무게보다 무거워요</span>}
                {!it.ptRef && it.weight >= 40 && <span className="font-semibold text-danger-text">무게를 한 번 더 확인해 주세요</span>}
                {it.warmup && <span>워밍업 {kg(it.warmup.weight)} × {it.warmup.reps}회</span>}
                <button type="button" onClick={() => setItem(k, { locked: !it.locked })}
                  className={`ml-auto inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold ${it.locked ? "bg-ot-soft text-ot-text" : "text-sub"}`}>
                  {it.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {it.locked ? "무게 고정" : "무게 고정 안 함"}
                </button>
              </div>
              <input value={it.note || ""} onChange={(e) => setItem(k, { note: e.target.value })} maxLength={60}
                className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] text-ink outline-none focus:border-primary" placeholder="이것만 지키세요 한 줄 (회원이 읽어요)" />
            </li>
          ))}
        </ol>

        {adding ? (
          <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
            <p className="text-[13px] font-semibold text-ink">PT에서 한 종목</p>
            <div className="flex flex-wrap gap-1.5">
              {ptSeries.filter((s) => !inRoutine.has(s.exercise)).slice(0, 20).map((s) => (
                <button key={s.exercise} type="button" onClick={() => { const it = itemFromSeries(s, machines); if (it) addItem(it); }}
                  className="min-h-[34px] rounded-full border border-line bg-card px-3 text-[13px] text-ink">{s.exercise}{isRisky(s.exercise) ? " ⚠" : ""}</button>
              ))}
            </div>
            {machines.length > 0 && (
              <>
                <p className="pt-1 text-[13px] font-semibold text-ink">센터 장비</p>
                <div className="flex flex-wrap gap-1.5">
                  {machines.filter((m) => !inRoutine.has(m.name)).slice(0, 30).map((m) => (
                    <button key={m.name} type="button" onClick={() => addItem(newItem(m.name, "machine"))}
                      className="min-h-[34px] rounded-full border border-line bg-card px-3 text-[13px] text-ink">{m.name}</button>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={30} placeholder="직접 입력 (예: 덤벨 숄더프레스)"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[14px] outline-none focus:border-primary" />
              <button type="button" disabled={!custom.trim()} onClick={() => addItem(newItem(custom.trim(), "custom"))} className="min-h-[40px] rounded-lg bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-40">추가</button>
            </div>
            <p className="text-[12px] text-muted">PT 기록이 없는 종목은 정한 무게가 혼자 상한이에요(회원은 횟수 · 세트로만 늘려요).</p>
            <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-sub">닫기</button>
          </div>
        ) : day.items.length < 8 && (
          <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-[13px] font-semibold text-primary-strong"><Plus className="h-4 w-4" /> 종목 추가</button>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => { if (window.confirm("지금 고친 내용이 사라져요. 최신 PT 기록으로 다시 계산할까요?")) { const d = makeDraft(edit.split); if (d) { setEdit(d); setDayIdx(0); } } }}
            className="inline-flex min-h-[36px] items-center gap-1 text-[13px] text-sub hover:text-ink"><RefreshCw className="h-3.5 w-3.5" /> 최신 PT 기록으로 다시 계산</button>
          <span className="flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className="min-h-[40px] rounded-lg px-4 text-[14px] text-sub">취소</button>
            <button type="button" disabled={busy} onClick={async () => { if (await save(edit, "루틴을 확정했어요")) setEdit(null); }}
              className="min-h-[40px] rounded-lg bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-60">{busy ? "저장 중…" : "확정"}</button>
          </span>
        </div>
        <p className="mt-2 text-[12px] text-muted">확정해도 회원에게는 아직 안 보여요. 확정한 뒤 &lsquo;회원에게 보이기&rsquo;를 켜요.</p>
        <Toast message={toast} />
      </Card>
    );
  }

  // ── 아직 없음 ──
  if (!row) {
    return (
      <Card as="section">
        <SectionTitle icon={Dumbbell}>개인운동 루틴</SectionTitle>
        <p className="-mt-1.5 text-[13px] leading-relaxed text-sub">혼자 오는 날 할 루틴을 PT 기록으로 만들어 회원 전용 페이지에 보여 줘요. 회원이 한 대로 기록하면 다음 루틴이 조금씩 올라가요.</p>
        <p className="mb-1.5 mt-3 text-[13px] font-semibold text-ink">혼자 주 몇 번 오세요?</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" onClick={() => setSplit(n)} aria-pressed={split === n}
              className={`min-h-[36px] rounded-full border px-3 text-[13px] ${split === n ? "border-ink bg-ink font-semibold text-white" : "border-line bg-card text-sub"}`}>
              {n}번 · {SPLITS[n].map((d) => d.label.split(" ")[0]).join(" / ")}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { const d = makeDraft(split); if (d) { setEdit(d); setDayIdx(0); } }}
          className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white">
          <Dumbbell className="h-4 w-4" aria-hidden="true" /> 루틴 만들기
        </button>
        <Toast message={toast} />
      </Card>
    );
  }

  // ── 보기: 루틴 + 다음 숫자 + 지난 PT 이후 개인운동 ──
  const conf = row.confirmed_at || row.updated_at;
  const after = rlogs.filter((l) => String(l.created_at) > String(conf));
  const lastPt = [...logs].filter((l) => !l.voided && l.source !== "noshow").map((l) => l.session_at ?? l.created_at).sort().at(-1) || null;
  const sincePt = rlogs.filter((l) => !lastPt || String(l.created_at) > String(lastPt));
  const days = Array.isArray(row.days) ? row.days : [];
  const nameDay = (k) => days.find((d) => d.key === k)?.label || k;
  const allItems = days.flatMap((d) => d.items || []);
  const nvOf = (it) => nextValues(it, after, latestPtTop(logs, it.name), conf);
  const painItems = allItems.filter((it) => nvOf(it).painStop);
  const raisedItems = allItems.filter((it) => nvOf(it).ptRaised);
  const locked = allItems.filter((i) => i.locked).map((i) => i.name);
  // 설명 대사 — 법무 점검 수정안(안전 보장 표현 빼기 · 회원 전용 페이지 · 회원이 한 말을 근거로)
  const script = `${String(member?.name || "회원").slice(-2)}님, 혼자 오시는 날 할 루틴을 회원 페이지에 넣어 드렸어요. 오늘 저랑 한 무게보다 가볍게, 70% 정도로 잡았어요. 혼자 하실 때 무리 없게 시작하려고요. 하시다가 가벼우면 플러스, 무거우면 마이너스 누르고 실제로 하신 만큼만 체크해 주세요. 그 기록을 보고 다음 루틴이 조금씩 올라가요. 혼자서는 여기까지만 올라가게 정해 뒀어요. 더 무거운 건 다음 수업 때 저랑 같이 올려요. 컨디션 안 좋은 날은 숫자 다 못 채워도 괜찮아요. 아프거나 찌릿하면 바로 멈추고, 화면의 '아파서 멈췄어요'를 눌러 저한테 알려 주세요.${locked.length ? ` ${locked.join(", ")}${eunNeun(locked.at(-1))} ${hasPain ? "불편하다고 하셔서 " : ""}무게가 안 올라가게 묶어 뒀어요.` : ""}`;
  const recalc = (it) => { const sr = ptSeries.find((x) => x.exercise === it.name); const nx = sr ? itemFromSeries(sr, machines) : null; return nx ? { ...nx, locked: it.locked, note: it.note || nx.note } : it; };

  return (
    <Card as="section">
      <SectionTitle icon={Dumbbell} aside={row.visible ? "회원에게 보이는 중" : "회원에게 안 보임"}>개인운동 루틴 · 혼자 주 {row.split}번</SectionTitle>
      {breakSinceConfirm(logs, conf) && (
        <div className="mb-3 rounded-xl bg-ot-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          PT가 4주 넘게 끊겼다가 다시 시작했어요. 그동안 근력이 달라졌을 수 있어서 <b className="font-semibold">회원 화면에서 루틴을 숨겨 뒀어요.</b> &lsquo;고치기 → 최신 PT 기록으로 다시 계산 → 확정&rsquo;을 하면 다시 보여요.
        </div>
      )}
      {painItems.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-danger-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>회원이 <b className="font-semibold">{painItems.map((i) => i.name).join(", ")}</b>에서 &lsquo;아파서 멈췄어요&rsquo;를 남겼어요. 이 종목은 무게가 더 안 올라가요. 확인하고 &lsquo;고치기 → 확정&rsquo;을 하면 다시 진행돼요.</span>
        </div>
      )}
      {raisedItems.length > 0 && (
        <div className="mb-3 rounded-xl bg-pt-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          PT에서 <b className="font-semibold">{raisedItems.map((i) => i.name).join(", ")}</b>을 더 무겁게 했어요. 혼자 하는 무게 · 상한은 자동으로 안 올라가요.
          <button type="button" disabled={busy} onClick={() => save({ split: row.split, days: days.map((d) => ({ ...d, items: d.items.map((it) => (raisedItems.some((r) => r.name === it.name) ? recalc(it) : it)) })) }, "최신 PT 기록으로 다시 맞췄어요")}
            className="ml-1 font-semibold text-pt-text underline underline-offset-2 disabled:opacity-60">최신 PT 기록으로 다시 맞추기</button>
        </div>
      )}
      <div className="space-y-3">
        {days.filter((d) => d.items?.length).map((d) => (
          <div key={d.key}>
            <p className="mb-1 text-[13px] font-semibold text-ink">{d.key} {d.label}</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {d.items.map((it) => {
                const nv = nvOf(it);
                return (
                  <li key={it.name} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-elevate px-3 py-2 text-[13.5px]">
                    <span className="font-semibold text-ink">{it.name}</span>
                    {it.locked && <Lock className="h-3 w-3 text-ot-text" aria-label="무게 고정" />}
                    <span className="ml-auto text-sub">다음 {kg(nv.weight)} × {nv.reps}회 × {nv.sets}세트{nv.painStop ? " · 아파서 멈춤" : nv.capReached ? " · 혼자 상한" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[13px] font-semibold text-ink">지난 PT 이후 개인운동 {sincePt.length}회</p>
        {sincePt.length === 0 ? (
          <p className="text-[12.5px] text-muted">아직 기록이 없어요.</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0 text-[12.5px] text-sub">
            {sincePt.slice(-6).map((l) => (
              <li key={l.id} className="rounded-lg bg-elevate px-3 py-2">
                <span className="font-semibold text-ink">{mdKo(l.performed_on || l.created_at)} {l.day_key} {nameDay(l.day_key)}</span>
                {" · "}
                {(l.items || []).map((x) => `${x.name} ${kg(x.weight)}×${x.reps}×${x.sets}${x.pain ? " (아파서 멈춤)" : ""}`).join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!row.visible && hasPain && (
        <label className="mt-4 flex items-start gap-2 rounded-xl bg-ot-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          <input type="checkbox" checked={painOk} onChange={(e) => setPainOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>회원 불편 부위(<b className="font-semibold">{member.pain}</b>)를 확인하고, 관련 종목은 빼거나 무게를 고정했어요. <span className="text-sub">(확인해야 회원에게 보이기를 켤 수 있어요)</span></span>
        </label>
      )}
      <p className="mt-3 text-[12px] text-muted">마지막 PT가 4주 넘게 없으면 회원 화면에서 자동으로 숨겨져요.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy || (!row.visible && hasPain && !painOk)} onClick={() => save({ split: row.split, days, visible: !row.visible, keepConfirmed: true, painChecked: !row.visible && hasPain }, row.visible ? "회원에게 안 보이게 했어요" : "회원 전용 페이지에 보이게 했어요")}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-50 ${row.visible ? "border border-line bg-card text-sub" : "bg-primary text-white"}`}>
          {row.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {row.visible ? "회원에게 안 보이기" : "회원에게 보이기"}
        </button>
        <button type="button" onClick={() => { setEdit({ split: row.split, days: JSON.parse(JSON.stringify(days)) }); setDayIdx(0); }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-card px-4 text-[14px] font-semibold text-ink"><Pencil className="h-4 w-4" /> 고치기</button>
        <button type="button" onClick={() => setShowScript((v) => !v)} className="inline-flex min-h-[40px] items-center gap-1 px-2 text-[13px] text-sub">
          회원에게 하는 설명 <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showScript ? "rotate-180" : ""}`} />
        </button>
      </div>
      {showScript && <p className="mt-2 rounded-xl bg-primary-soft px-3.5 py-3 text-[14px] leading-relaxed text-ink">&ldquo;{script}&rdquo;</p>}
      <Toast message={toast} />
    </Card>
  );
}
