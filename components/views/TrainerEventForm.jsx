"use client";

/* 개인 일정 만들기 · 고치기(2026-10-06) — 스케줄 칸을 누르면 '회원 수업 | 개인 일정' 중 개인 일정 쪽.
   제목은 직접(빠른 칩: 회의 · 청소 · 휴무 …) · 색 · 하루 종일 · 시작/끝(30분 단위) · 반복(매일 · 매주 요일 · 매월 · 끝나는 날).
   고칠 때: 반복이면 '이 날만 빼기'(skip_dates) · '반복 전체 삭제'. 저장 · 삭제는 .select()로 확인. */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { EVENT_COLORS, EVENT_COLOR_KEYS, EVENT_PRESETS, REPEAT_OPTS, WEEKDAYS, ymdOf } from "@/lib/trainerEvents";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

const pad = (n) => String(n).padStart(2, "0");
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes() >= 30 ? 30 : 0)}`;

export default function TrainerEventForm({ date, hour = 9, event = null, occurrenceYmd = null, onSaved, onDeleted, onCancel, showToast }) {
  const s0 = event ? new Date(event.start_at) : new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0);
  const e0 = event ? new Date(event.end_at) : new Date(s0.getTime() + 3600000);
  const [title, setTitle] = useState(event?.title || "");
  const [color, setColor] = useState(event?.color || "gray");
  const [allDay, setAllDay] = useState(Boolean(event?.all_day));
  const [day, setDay] = useState(ymdOf(s0));
  const [start, setStart] = useState(hm(s0));
  const [end, setEnd] = useState(hm(e0) === "00:00" && !event?.all_day ? "23:30" : hm(e0));
  const [repeat, setRepeat] = useState(event?.repeat || "none");
  const [days, setDays] = useState(event?.repeat_days?.length ? event.repeat_days : [s0.getDay()]);
  const [until, setUntil] = useState(event?.repeat_until || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    const t = title.trim();
    if (!t) { setErr("일정 이름을 입력해 주세요."); return; }
    const startAt = allDay ? new Date(`${day}T00:00:00`) : new Date(`${day}T${start}:00`);
    const endAt = allDay ? new Date(startAt.getTime() + 86400000) : new Date(`${day}T${end}:00`);
    if (!(endAt > startAt)) { setErr("끝나는 시간이 시작보다 뒤여야 해요."); return; }
    if (repeat !== "none" && until && until < day) { setErr("반복 끝나는 날이 시작 날보다 앞이에요."); return; }
    const payload = {
      title: t, color, all_day: allDay, start_at: startAt.toISOString(), end_at: endAt.toISOString(),
      repeat, repeat_days: repeat === "weekly" ? [...new Set(days)].sort() : null, repeat_until: repeat !== "none" && until ? until : null,
    };
    if (!supabase) { onSaved?.({ ...(event || {}), ...payload, id: event?.id || `demo-${Date.now()}`, skip_dates: event?.skip_dates || [] }); return; }
    setBusy(true); setErr("");
    try {
      const q = event
        ? supabase.from("trainer_event").update(payload).eq("id", event.id).select()
        : supabase.from("trainer_event").insert(payload).select();
      const { data, error } = await q;
      if (error || !data?.length) { console.error("개인 일정 저장 실패", error); setErr("저장하지 못했어요. 다시 시도해 주세요."); return; }
      showToast?.(event ? "일정을 고쳤어요" : "일정을 추가했어요");
      onSaved?.(data[0]);
    } catch { setErr("인터넷 연결을 확인하고 다시 시도해 주세요."); } finally { setBusy(false); }
  };

  const remove = async (onlyThisDay) => {
    if (busy || !event) return;
    if (!supabase) { onDeleted?.(event.id, onlyThisDay ? occurrenceYmd : null); return; }
    setBusy(true); setErr("");
    try {
      const q = onlyThisDay
        ? supabase.from("trainer_event").update({ skip_dates: [...new Set([...(event.skip_dates || []), occurrenceYmd])] }).eq("id", event.id).select()
        : supabase.from("trainer_event").delete().eq("id", event.id).select("id");
      const { data, error } = await q;
      if (error || !data?.length) { console.error("개인 일정 삭제 실패", error); setErr("지우지 못했어요. 다시 시도해 주세요."); return; }
      showToast?.(onlyThisDay ? "이 날만 뺐어요" : "일정을 지웠어요");
      onlyThisDay ? onSaved?.(data[0]) : onDeleted?.(event.id);
    } catch { setErr("인터넷 연결을 확인하고 다시 시도해 주세요."); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3.5">
      <div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="일정 이름 (예: 회의, 청소, 휴무)" className={inputCls} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EVENT_PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => { setTitle(p); if (p === "휴무") setAllDay(true); }}
              className={`min-h-[32px] rounded-full border px-3 text-[13px] ${title === p ? "border-ink bg-ink text-white" : "border-line bg-card text-sub"}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2" role="radiogroup" aria-label="색">
        {EVENT_COLOR_KEYS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={color === k} aria-label={EVENT_COLORS[k].label} onClick={() => setColor(k)}
            className={`h-8 w-8 rounded-full ${EVENT_COLORS[k].dot} ${color === k ? "ring-2 ring-ink ring-offset-2" : ""}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${inputCls} col-span-2`} aria-label="날짜" />
        <label className="col-span-2 flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-primary" /> 하루 종일
        </label>
        {!allDay && (
          <>
            <select value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} aria-label="시작">
              {TIMES.map((t) => <option key={t} value={t}>{t} 시작</option>)}
            </select>
            <select value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} aria-label="끝">
              {TIMES.map((t) => <option key={t} value={t}>{t} 끝</option>)}
            </select>
          </>
        )}
      </div>

      <div className="space-y-2">
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputCls} aria-label="반복">
          {REPEAT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {repeat === "weekly" && (
          <div className="flex gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <button key={w} type="button" aria-pressed={days.includes(i)}
                onClick={() => setDays((d) => (d.includes(i) ? (d.length > 1 ? d.filter((x) => x !== i) : d) : [...d, i]))}
                className={`h-9 w-9 rounded-full text-[13px] font-semibold ${days.includes(i) ? "bg-ink text-white" : "bg-elevate text-sub"}`}>{w}</button>
            ))}
          </div>
        )}
        {repeat !== "none" && (
          <label className="flex items-center gap-2 text-[13px] text-sub">
            끝나는 날(선택)
            <input type="date" value={until} min={day} onChange={(e) => setUntil(e.target.value)} className={`${inputCls} flex-1`} />
          </label>
        )}
      </div>

      {err && <p className="text-[13px] text-danger-text">{err}</p>}
      <div className="flex gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={busy} className="flex-1">취소</Button>
        <Button variant="primary" size="md" onClick={save} disabled={busy} className="flex-1">{busy ? "저장 중…" : event ? "고치기" : "추가"}</Button>
      </div>
      {event && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {event.repeat !== "none" && occurrenceYmd && (
            <Button variant="ghost" size="sm" onClick={() => remove(true)} disabled={busy}>이 날만 빼기</Button>
          )}
          <Button variant="danger" subtle size="sm" onClick={() => remove(false)} disabled={busy}>{event.repeat !== "none" ? "반복 전체 삭제" : "삭제"}</Button>
        </div>
      )}
    </div>
  );
}
