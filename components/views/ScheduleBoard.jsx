"use client";

/* =========================================================================
   스케줄 보드 (SCHED · C3) — 주간 그리드 + 오늘 뷰 · 배치 · 완료(차감·일지·카톡)/취소.
   완료 = daily_workout_log 한 줄(활성계약 차감) + appointment done/log_id 링크.
     · 수업내용 입력 시: ai_summary 저장 + 카톡용 clipboard 복사 + sent_at 기록(PTView saveLog 미러).
     · 차감안함(보강/무료) = contract_id 없이 로그(기록만 · 차감 X).
   한 예약 = 한 로그(이중차감 방지). 시간변경·완료취소·음성입력 = 후속.
   시간은 트레이너 브라우저 로컬(KST 전제). owner는 전체가 섞여 보임(trainer_id 필터 후속).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract } from "@/lib/memberStatus";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import VoiceLogTab from "@/components/tabs/VoiceLogTab";
import MemberBadge, { viewMeta } from "@/components/ui/MemberBadge";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// purge-safe 트레이너 색 팔레트 (정적 클래스 · 동적 조립 금지 · C 토큰 패턴). 6색 순환.
const TRAINER_PALETTE = [
  { dot: "bg-violet-400",  chip: "bg-violet-500/15 text-violet-300",   bar: "bg-violet-400" },
  { dot: "bg-amber-400",   chip: "bg-amber-500/15 text-amber-300",     bar: "bg-amber-400" },
  { dot: "bg-rose-400",    chip: "bg-rose-500/15 text-rose-300",       bar: "bg-rose-400" },
  { dot: "bg-sky-400",     chip: "bg-sky-500/15 text-sky-300",         bar: "bg-sky-400" },
  { dot: "bg-teal-400",    chip: "bg-teal-500/15 text-teal-300",       bar: "bg-teal-400" },
  { dot: "bg-fuchsia-400", chip: "bg-fuchsia-500/15 text-fuchsia-300", bar: "bg-fuchsia-400" },
];

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = (x.getDay() + 6) % 7; // 월=0
  x.setDate(x.getDate() - wd);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function pad(n) { return String(n).padStart(2, "0"); }
function hhmm(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// PTView 패턴 재사용 — clipboard 복사(실패 시 execCommand 폴백).
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

export default function ScheduleBoard({ members = [] }) {
  const [mode, setMode] = useState("week"); // 'week' | 'today'
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(24);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null);     // 배치 슬롯 {dayIdx, hour}
  const [action, setAction] = useState(null);  // 액션 대상 appointment
  const [note, setNote] = useState("");        // 완료 시 수업내용(선택)
  const [rawText, setRawText] = useState("");  // 음성 STT 원본(voice일 때만)
  const [usedVoice, setUsedVoice] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [trainers, setTrainers] = useState([]);            // owner=계정 전체 / 트레이너=본인 1행
  const [trainerFilter, setTrainerFilter] = useState("all");
  const { toast, showToast } = useToast();

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setAppts([]); return; }
      setLoading(true);
      const { data } = await supabase
        .from("appointment")
        .select("*")
        .gte("start_at", weekStart.toISOString())
        .lt("start_at", weekEnd.toISOString())
        .neq("status", "canceled");
      if (cancelled) return;
      setAppts(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [weekStart, weekEnd]);

  // 트레이너 목록 — owner면 계정 전체(C5a RLS), 트레이너면 본인 1행. 필터·라벨용.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from("trainer").select("id, name");
      if (!cancelled) setTrainers(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // 액션 모달 열 때 수업내용 입력 초기화(이전 회원 내용 오전송 방지 · effect 대신 핸들러에서).
  const openAction = (a) => { setNote(""); setRawText(""); setUsedVoice(false); setAction(a); };
  // 음성 STT 결과 → 내용칸 채움(이후 손편집). PTView handleVoiceResult 미러.
  const handleVoiceResult = (raw, summaryText) => { setNote(summaryText || ""); setRawText(raw || ""); setUsedVoice(true); };

  const memberName = (id) => members.find((m) => m.id === id)?.name ?? "회원";
  const trainerName = (id) => trainers.find((t) => t.id === id)?.name ?? "";
  // 트레이너 색 — trainers 배열 순서 인덱스 %6(세션 내 안정 · uuid 해시 아님). 못 찾으면 [0].
  const trainerTone = (id) => { const i = trainers.findIndex((t) => t.id === id); return i >= 0 ? TRAINER_PALETTE[i % 6] : TRAINER_PALETTE[0]; };
  // 회원 상태(ot|pt|inactive) — 카드 배지/색점용.
  const memberView = (id) => viewFor(members.find((m) => m.id === id) || {});
  const isOwnerView = trainers.length > 1; // 여러 트레이너가 보이면 owner 뷰
  const viewAppts = trainerFilter === "all" ? appts : appts.filter((a) => a.trainer_id === trainerFilter);

  const apptAt = (dayIdx, hour) => {
    const day = addDays(weekStart, dayIdx);
    return viewAppts.filter((a) => {
      if (a.status === "canceled") return false;
      const t = new Date(a.start_at);
      return sameDay(t, day) && t.getHours() === hour;
    });
  };

  // 빈 슬롯에 회원 배치 → appointment insert.
  const book = async (member) => {
    if (saving || !pick) return;
    setSaving(true);
    const slot = addDays(weekStart, pick.dayIdx);
    slot.setHours(pick.hour, 0, 0, 0);
    const payload = { user_id: member.id, start_at: slot.toISOString() };
    if (!supabase) {
      setAppts((p) => [...p, { ...payload, id: `demo-${Date.now()}`, status: "booked" }]);
      setPick(null); setQ(""); setSaving(false); return;
    }
    const { data, error } = await supabase.from("appointment").insert(payload).select();
    if (error || !data || data.length === 0) { setSaving(false); return; }
    setAppts((p) => [...p, data[0]]);
    setPick(null); setQ(""); setSaving(false);
  };

  // 완료 — daily_workout_log 한 줄 + appointment done/log_id. 내용 있으면 카톡 복사·sent_at.
  const complete = async (appt, deduct) => {
    if (acting) return;
    setActing(true);
    const body = note.trim();
    let copied = false, sentAt = null;
    if (body) { copied = await copyToClipboard(body); if (copied) sentAt = new Date().toISOString(); }

    const doneMsg = () => showToast(
      (deduct ? "완료 · 차감" : "완료(차감 안 함)") + (body ? (copied ? " · 카톡 복사됨" : " · 복사 실패(길게 눌러 복사)") : "")
    );

    if (!supabase) {
      setAppts((p) => p.map((a) => (a.id === appt.id ? { ...a, status: "done" } : a)));
      doneMsg(); setAction(null); setActing(false); return;
    }
    let contractId = null;
    if (deduct) {
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*").eq("user_id", appt.user_id),
        supabase.from("daily_workout_log").select("*").eq("user_id", appt.user_id),
      ]);
      contractId = activeContract(cs || [], ls || [])?.id ?? null; // 활성 없으면 null(차감 안 됨)
    }
    const { data: logIns, error: logErr } = await supabase
      .from("daily_workout_log")
      .insert({ user_id: appt.user_id, contract_id: contractId, session_at: appt.start_at, source: usedVoice ? "voice" : "manual", ai_summary: body || null, raw_voice_text: usedVoice ? (rawText || null) : null, sent_at: sentAt })
      .select();
    if (logErr || !logIns || logIns.length === 0) { showToast("완료 실패 — 다시 시도하세요"); setActing(false); return; }
    const { data: up, error: upErr } = await supabase
      .from("appointment")
      .update({ status: "done", log_id: logIns[0].id })
      .eq("id", appt.id)
      .select();
    if (upErr || !up || up.length === 0) { showToast("완료 저장 실패 — 다시 시도하세요"); setActing(false); return; }
    setAppts((p) => p.map((a) => (a.id === appt.id ? up[0] : a)));
    doneMsg(); setAction(null); setActing(false);
  };

  // 취소 — status=canceled(보드에서 제거).
  const cancelAppt = async (appt) => {
    if (acting) return;
    setActing(true);
    if (!supabase) {
      setAppts((p) => p.filter((a) => a.id !== appt.id));
      setAction(null); setActing(false); return;
    }
    const { data, error } = await supabase.from("appointment").update({ status: "canceled" }).eq("id", appt.id).select();
    if (error || !data || data.length === 0) { showToast("취소 실패 — 다시 시도하세요"); setActing(false); return; }
    setAppts((p) => p.filter((a) => a.id !== appt.id));
    setAction(null); setActing(false);
  };

  const hours = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const filtered = q.trim()
    ? members.filter((m) => `${m.name} ${m.job}`.toLowerCase().includes(q.trim().toLowerCase()))
    : members;

  const rangeLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} – ${addDays(weekStart, 6).getMonth() + 1}/${addDays(weekStart, 6).getDate()}`;

  const now = new Date();
  const todayList = viewAppts
    .filter((a) => a.status !== "canceled" && sameDay(new Date(a.start_at), now))
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const remainingToday = todayList.filter((a) => a.status === "booked").length;

  const chipCls = (a) =>
    `block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold ${
      a.status === "done"
        ? "bg-zinc-700/40 text-zinc-400 line-through"
        : isOwnerView ? trainerTone(a.trainer_id).chip : "bg-lime-500/15 text-lime-300"
    }`;

  const actionMember = action ? (members.find((m) => m.id === action.user_id) || null) : null;

  return (
    <div className="space-y-4">
      {/* 모드 토글 + (owner) 트레이너 필터 */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setMode("week")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "week" ? "bg-lime-500/15 text-lime-400 ring-1 ring-lime-500/40" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"}`}>주간</button>
        <button onClick={() => { setMode("today"); setWeekStart(mondayOf(new Date())); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "today" ? "bg-lime-500/15 text-lime-400 ring-1 ring-lime-500/40" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"}`}>오늘</button>
        {isOwnerView && (
          <select value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)} className="ml-auto rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-lime-500/50">
            <option value="all">전체 트레이너</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* 트레이너 범례 (owner 전용 · 목업 ① 배지행 미러) */}
      {isOwnerView && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {trainers.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <span className={`inline-block h-2 w-2 rounded-full ${trainerTone(t.id).dot}`} />
              {t.name}
            </span>
          ))}
        </div>
      )}

      {mode === "week" ? (
        <>
          {/* 주 네비 + 시간범위 */}
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-5 w-5 text-lime-400" />
            <span className="text-sm font-semibold text-zinc-100">{rangeLabel}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:border-lime-500/50"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-lime-500/50">오늘</button>
              <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:border-lime-500/50"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200">
                {Array.from({ length: 13 }, (_, i) => i).map((h) => <option key={h} value={h}>{h}시</option>)}
              </select>
              <span>–</span>
              <select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200">
                {Array.from({ length: 12 }, (_, i) => i + 13).map((h) => <option key={h} value={h}>{h}시</option>)}
              </select>
            </div>
          </div>

          {/* 그리드 */}
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <div className="min-w-[720px]">
              <div className="flex border-b border-zinc-800 bg-zinc-900/60">
                <div className="w-12 shrink-0" />
                {DAY_LABELS.map((d, i) => {
                  const day = addDays(weekStart, i);
                  return (
                    <div key={i} className="flex-1 border-l border-zinc-800 px-2 py-2 text-center">
                      <div className="text-xs font-semibold text-zinc-200">{d}</div>
                      <div className="font-mono text-[10px] text-zinc-500">{day.getMonth() + 1}/{day.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              {hours.map((h) => (
                <div key={h} className="flex border-b border-zinc-900">
                  <div className="w-12 shrink-0 px-1 py-2 text-right font-mono text-[10px] text-zinc-600">{h}시</div>
                  {DAY_LABELS.map((_, i) => {
                    const list = apptAt(i, h);
                    return (
                      <div
                        key={i}
                        onClick={() => setPick({ dayIdx: i, hour: h })}
                        className="group min-h-[44px] flex-1 cursor-pointer border-l border-zinc-900 p-1 transition hover:bg-zinc-900/60"
                      >
                        {list.length === 0 ? (
                          <Plus className="h-3 w-3 text-zinc-800 group-hover:text-zinc-600" />
                        ) : (
                          <div className="space-y-1">
                            {list.map((a) => (
                              <button key={a.id} onClick={(e) => { e.stopPropagation(); openAction(a); }} className={chipCls(a)}>
                                {a.status === "done" ? "✓ " : ""}
                                <span className={`${viewMeta(memberView(a.user_id)).dot} mr-1 inline-block h-1.5 w-1.5 rounded-full`} />
                                {memberName(a.user_id)}
                                {isOwnerView && trainerFilter === "all" && (
                                  <span className="block truncate text-[9px] font-normal text-zinc-500">{trainerName(a.trainer_id)}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {loading && <p className="text-center text-xs text-zinc-500">불러오는 중…</p>}
        </>
      ) : (
        /* 오늘 뷰 */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-100">
              오늘 {now.getMonth() + 1}/{now.getDate()} ({DAY_LABELS[(now.getDay() + 6) % 7]})
            </span>
            <span className="rounded-md border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[11px] font-semibold text-lime-300">
              남은 수업 {remainingToday}타임
            </span>
          </div>
          {todayList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">오늘 예약이 없습니다.</div>
          ) : (
            <ul className="space-y-2">
              {todayList.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => openAction(a)}
                    className={`flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition ${
                      a.status === "done" ? "border-zinc-800 bg-zinc-900/30 opacity-60" : "border-zinc-800 bg-zinc-900/40 hover:border-lime-500/40"
                    }`}
                  >
                    {isOwnerView && <span className={`-my-3 -ml-3 mr-0 w-1 self-stretch ${trainerTone(a.trainer_id).bar}`} />}
                    <span className="font-mono text-sm font-semibold text-zinc-300">{hhmm(a.start_at)}</span>
                    <MemberBadge view={memberView(a.user_id)} />
                    <span className="flex-1 text-sm font-medium text-zinc-100">{memberName(a.user_id)}</span>
                    {isOwnerView && <span className="text-[11px] text-zinc-500">{trainerName(a.trainer_id)}</span>}
                    {a.status === "done" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-700/40 px-2 py-0.5 text-[10px] font-semibold text-zinc-400"><Check className="h-3 w-3" /> 완료</span>
                    ) : (
                      <span className="rounded-md bg-lime-500/15 px-2 py-0.5 text-[10px] font-semibold text-lime-300">예약</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 회원 픽커 모달 (배치) */}
      {pick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !saving && setPick(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100">
                {addDays(weekStart, pick.dayIdx).getMonth() + 1}/{addDays(weekStart, pick.dayIdx).getDate()} {DAY_LABELS[pick.dayIdx]} {pick.hour}시 — 회원 배치
              </h3>
              <button onClick={() => setPick(null)} className="text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회원 검색" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50" />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500">회원이 없습니다.</p>
              ) : filtered.map((m) => (
                <button key={m.id} onClick={() => book(m)} disabled={saving} className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left transition hover:border-lime-500/40 disabled:opacity-50">
                  <span className="text-sm font-medium text-zinc-100">{m.name}</span>
                  <span className="text-xs text-zinc-500">{m.job}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 액션 모달 (완료·일지·카톡 / 취소) */}
      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !acting && setAction(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">{memberName(action.user_id)}</h3>
              <button onClick={() => setAction(null)} className="text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              {new Date(action.start_at).getMonth() + 1}/{new Date(action.start_at).getDate()} {hhmm(action.start_at)}
              {action.status === "done" && " · 완료됨"}
            </p>

            {action.status === "done" ? (
              <p className="text-sm text-zinc-400">완료 처리된 수업입니다. (완료 취소는 후속)</p>
            ) : (
              <div className="space-y-3">
                <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-400">🎙 음성으로 채우기 (선택)</summary>
                  <div className="mt-2">
                    {actionMember && <VoiceLogTab member={actionMember} onResult={handleVoiceResult} />}
                  </div>
                </details>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={acting}
                  rows={3}
                  placeholder="오늘 수업 내용·피드백 (입력하고 완료하면 카톡용으로 복사돼요 · 선택)"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500/50 disabled:opacity-50"
                />
                <button onClick={() => complete(action, true)} disabled={acting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 py-2.5 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50">
                  <Check className="h-4 w-4" strokeWidth={2.5} /> {acting ? "처리 중…" : `완료 · 차감${note.trim() ? " · 카톡 복사" : ""}`}
                </button>
                <button onClick={() => complete(action, false)} disabled={acting} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 active:scale-95 disabled:opacity-50">
                  완료 · 차감 안 함 (보강·무료)
                </button>
                <button onClick={() => cancelAppt(action)} disabled={acting} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-red-500/50 hover:text-red-300 active:scale-95 disabled:opacity-50">
                  예약 취소
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
