"use client";

/* =========================================================================
   스케줄 보드 (SCHED · C1 뼈대) — 주간 그리드 · 회원 배치 · 예약 렌더.
   완료/취소/당일뷰/시간범위 저장 = C2. 반복 = 후속.
   트레이너 본인 예약만(RLS 자동 스코프 · owner는 전체 — trainer_id 필터는 후속).
   시간은 트레이너 브라우저 로컬(KST 전제 — 기존 코드와 동일)로 그림.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = (x.getDay() + 6) % 7; // 월=0
  x.setDate(x.getDate() - wd);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function ScheduleBoard({ members = [] }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(24);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null); // {dayIdx, hour}
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setAppts([]); return; }
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

  const memberName = (id) => members.find((m) => m.id === id)?.name ?? "회원";

  const apptAt = (dayIdx, hour) => {
    const day = addDays(weekStart, dayIdx);
    return appts.filter((a) => {
      const t = new Date(a.start_at);
      return t.getFullYear() === day.getFullYear() && t.getMonth() === day.getMonth()
        && t.getDate() === day.getDate() && t.getHours() === hour;
    });
  };

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

  const hours = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const filtered = q.trim()
    ? members.filter((m) => `${m.name} ${m.job}`.toLowerCase().includes(q.trim().toLowerCase()))
    : members;

  const rangeLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} – ${addDays(weekStart, 6).getMonth() + 1}/${addDays(weekStart, 6).getDate()}`;

  return (
    <div className="space-y-4">
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
                  <button
                    key={i}
                    onClick={() => setPick({ dayIdx: i, hour: h })}
                    className="group min-h-[44px] flex-1 border-l border-zinc-900 p-1 text-left align-top transition hover:bg-zinc-900/60"
                  >
                    {list.length === 0 ? (
                      <Plus className="h-3 w-3 text-zinc-800 group-hover:text-zinc-600" />
                    ) : (
                      <div className="space-y-1">
                        {list.map((a) => (
                          <span key={a.id} className="block truncate rounded bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-300">
                            {memberName(a.user_id)}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {loading && <p className="text-center text-xs text-zinc-500">불러오는 중…</p>}

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
    </div>
  );
}
