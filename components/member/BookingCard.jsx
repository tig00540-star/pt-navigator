"use client";

/* 회원 전용 페이지 '수업 예약'(2026-10-06 · 홈 탭) — 잡힌 수업 보기 · 새 수업 요청 · 시간 변경 · 취소 요청.
   트레이너가 승인해야 실제 예약이 생기거나 바뀐다. 변경 · 취소는 수업 'N시간 전'까지만(트레이너가 정함 · 기본 12)
   — 지나면 "트레이너와 직접 이야기해 주세요". 새 요청은 이번 주 + 다음 주 · 1시간 칸 · 트레이너가 바쁜 칸은 막힘.
   요청 · 철회 · 결과 확인은 DB 함수(request_appt · withdraw_appt_request · mark_appt_request_seen) — 규칙도 DB가 다시 확인.
   읽기 전용(지난 회원 · 남은 수업 0회)이면 버튼 없이 보기만. 표가 없거나(SQL 전) 트레이너가 요청을 안 받으면 카드 숨김. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { ymdOf } from "@/lib/trainerEvents";
import { BOOK_HOURS, slotText, dayText, windowDays, slotDate, busySlots, beforeCutoff, requestLine, KIND_LABEL } from "@/lib/booking";
import { notifyPush } from "@/lib/pushClient";
import Modal from "@/components/ui/Modal";

const ERR = {
  too_late: "수업 시간이 가까워서 앱으로는 바꿀 수 없어요. 트레이너와 직접 이야기해 주세요.",
  pending: "이미 요청한 수업이에요. 트레이너가 확인하고 있어요.",
  bad_time: "그 시간은 요청할 수 없어요. 다른 시간을 골라 주세요.",
  too_many: "새 수업 요청은 한 번에 3개까지예요. 트레이너가 확인한 뒤 다시 요청해 주세요.",
  closed: "트레이너가 지금은 앱 요청을 받지 않아요. 트레이너와 직접 이야기해 주세요.",
  not_allowed: "남은 수업이 없거나 지금은 요청할 수 없어요.",
  no_appt: "그 수업은 이미 바뀌었거나 취소됐어요.",
};

// embedded = '내 PT' 카드 안에 들어갈 때(테두리 · 제목 없이 · 2026-10-06 홈 정리).
export default function BookingCard({ supabase, readOnly = false, embedded = false }) {
  const [d, setD] = useState(null);           // { rule, appts, reqs, busy } · false = 숨김
  const [nowMs] = useState(() => Date.now());
  const [pick, setPick] = useState(null);     // { mode: 'new'|'change'|'cancel', appt? }
  const [day, setDay] = useState(null);
  const [hour, setHour] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const [ru, ap, rq, bz] = await Promise.all([
      supabase.from("member_booking_rule").select("*").maybeSingle(),
      supabase.from("member_upcoming_appt").select("id, start_at"),
      supabase.from("appt_request").select("id, kind, appointment_id, orig_start, want_start, note, status, decide_note, seen_at, created_at").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("member_trainer_busy").select("*"),
    ]);
    if (ru.error || ap.error || rq.error) { console.error("수업 예약 읽기 실패", ru.error || ap.error || rq.error); setD(false); return; }
    if (!ru.data) { setD(false); return; }
    setD({ rule: ru.data, appts: ap.data || [], reqs: rq.data || [], busy: bz.data || [] });
  }, [supabase]);
  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  const days = useMemo(() => (d ? windowDays(d.rule.window_end) : []), [d]);
  const taken = useMemo(() => {
    if (!d || !days.length) return new Set();
    const set = busySlots(d.busy, days[0], new Date(days[days.length - 1].getTime() + 86400000));
    for (const r of d.reqs) if (r.status === "pending" && r.want_start) { const t = new Date(r.want_start); set.add(`${ymdOf(t)}|${t.getHours()}`); }
    return set;
  }, [d, days]);

  if (!d) return null;
  const cut = d.rule.cutoff_hours;
  // 트레이너가 앱 요청을 안 받으면 잡힌 수업만 보여 준다(버튼 없음).
  const ro = readOnly || d.rule.accept === false;
  const headers = async () => {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  const pendingFor = (apptId) => d.reqs.find((r) => r.status === "pending" && r.appointment_id === apptId);
  const pendingNew = d.reqs.filter((r) => r.status === "pending" && r.kind === "new");
  const decided = d.reqs.filter((r) => (r.status === "approved" || r.status === "declined") && !r.seen_at);

  const open = (mode, appt = null) => { setPick({ mode, appt }); setDay(null); setHour(null); setNote(""); setMsg(""); };
  const send = async () => {
    if (pick.mode !== "cancel" && (day == null || hour == null)) { setMsg("날짜와 시간을 골라 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      const want = pick.mode === "cancel" ? null : slotDate(days[day], hour).toISOString();
      const { data, error } = await supabase.rpc("request_appt", { p_kind: pick.mode, p_appt: pick.appt?.id || null, p_want: want, p_note: note || null });
      if (error) {
        const k = Object.keys(ERR).find((x) => (error.message || "").includes(x));
        console.error("수업 요청 실패", error); setMsg(k ? ERR[k] : "요청하지 못했어요. 다시 시도해 주세요."); return;
      }
      notifyPush(headers(), "appt_request", data);   // 트레이너 폰으로
      setPick(null); await load();
    } catch { setMsg("인터넷 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const withdraw = async (id) => {
    const { error } = await supabase.rpc("withdraw_appt_request", { p_id: id });
    if (error) console.error("요청 취소 실패", error);
    await load();
  };
  const seen = async (id) => { await supabase.rpc("mark_appt_request_seen", { p_id: id }); await load(); };

  const btn = "min-h-[40px] rounded-lg border border-line bg-card px-3 text-[14px] font-semibold text-ink";
  const Wrap = embedded ? "div" : "section";
  return (
    <Wrap className={embedded ? "" : "mb-6 rounded-2xl border border-line bg-card p-4 shadow-sm"}>
      {embedded
        ? <p className="m-0 flex items-center gap-1.5 text-[14px] font-bold text-ink"><CalendarClock className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 수업 일정</p>
        : <h2 className="m-0 flex items-center gap-1.5 text-[15px] font-bold text-ink"><CalendarClock className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 수업 예약</h2>}

      {decided.map((r) => (
        <div key={r.id} className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[14px] ${r.status === "approved" ? "bg-primary-soft text-ink" : "bg-elevate text-ink"}`}>
          <span className="min-w-0 flex-1 leading-relaxed">
            <b className={r.status === "approved" ? "text-primary-strong" : "text-sub"}>{KIND_LABEL[r.kind]} 요청이 {r.status === "approved" ? "승인됐어요" : "거절됐어요"}</b> · {requestLine(r)}
            {r.status === "declined" && <span className="block text-[13px] text-sub">{r.decide_note || "트레이너와 다시 정해 주세요."}</span>}
          </span>
          <button type="button" onClick={() => seen(r.id)} className="shrink-0 text-[13px] font-semibold text-sub">확인</button>
        </div>
      ))}

      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {d.appts.length === 0 && <li className="text-[14px] text-sub">잡힌 수업이 없어요.</li>}
        {d.appts.map((a) => {
          const p = pendingFor(a.id);
          const ok = beforeCutoff(a.start_at, cut, nowMs);
          return (
            <li key={a.id} className="rounded-xl bg-elevate px-3 py-2.5">
              <div className="text-[15px] font-semibold text-ink">{slotText(a.start_at)}</div>
              {p ? (
                <div className="mt-1 flex items-center gap-2 text-[13px] text-sub">
                  <span>{KIND_LABEL[p.kind]} 요청 · 트레이너 확인 중{p.kind === "change" ? ` (→ ${slotText(p.want_start)})` : ""}</span>
                  {!ro && <button type="button" onClick={() => withdraw(p.id)} className="ml-auto shrink-0 font-semibold text-sub">요청 취소</button>}
                </div>
              ) : ro ? null : ok ? (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => open("change", a)} className={btn}>시간 바꾸기</button>
                  <button type="button" onClick={() => open("cancel", a)} className={btn}>취소하기</button>
                </div>
              ) : (
                <p className="m-0 mt-1 text-[13px] leading-relaxed text-sub">수업 {cut}시간 전부터는 앱으로 바꿀 수 없어요. 트레이너와 직접 이야기해 주세요.</p>
              )}
            </li>
          );
        })}
        {pendingNew.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-[14px]">
            <span className="min-w-0 flex-1"><b className="font-semibold text-ink">새 수업 요청</b> · {slotText(r.want_start)} <span className="text-sub">· 확인 중</span></span>
            {!ro && <button type="button" onClick={() => withdraw(r.id)} className="shrink-0 text-[13px] font-semibold text-sub">요청 취소</button>}
          </li>
        ))}
      </ul>

      {!ro && (
        <>
          <button type="button" onClick={() => open("new")} className="mt-3 min-h-[44px] w-full rounded-xl bg-ink text-[15px] font-bold text-white">새 수업 요청하기</button>
          <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-muted">트레이너가 승인하면 예약이 잡혀요. 변경 · 취소는 수업 {cut}시간 전까지 요청할 수 있어요.</p>
        </>
      )}

      {pick && (
        <Modal variant="sheet" onClose={() => setPick(null)}
          title={pick.mode === "new" ? "새 수업 요청" : pick.mode === "change" ? "언제로 바꿀까요?" : "수업 취소 요청"}
          subtitle={pick.appt ? `지금 예약 · ${slotText(pick.appt.start_at)}` : "이번 주와 다음 주 중에서 골라 주세요"}>
          {pick.mode !== "cancel" && (
            <>
              <p className="m-0 mb-2 text-[14px] font-semibold text-sub">날짜</p>
              <div className="grid grid-cols-5 gap-1.5">
                {days.map((dd, i) => {
                  const any = BOOK_HOURS.some((h) => !taken.has(`${ymdOf(dd)}|${h}`) && beforeCutoff(slotDate(dd, h).toISOString(), cut, nowMs));
                  return (
                    <button key={i} type="button" disabled={!any} onClick={() => { setDay(i); setHour(null); }} aria-pressed={day === i}
                      className={`min-h-[44px] rounded-lg border text-[13.5px] disabled:opacity-30 ${day === i ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>{dayText(dd)}</button>
                  );
                })}
              </div>
              {day != null && (
                <>
                  <p className="m-0 mb-2 mt-4 text-[14px] font-semibold text-sub">시간 <span className="font-normal text-muted">· 흐린 칸은 트레이너 일정이 있어요</span></p>
                  <div className="grid grid-cols-6 gap-1">
                    {BOOK_HOURS.map((h) => {
                      const off = taken.has(`${ymdOf(days[day])}|${h}`) || !beforeCutoff(slotDate(days[day], h).toISOString(), cut, nowMs);
                      return (
                        <button key={h} type="button" disabled={off} onClick={() => setHour(h)} aria-pressed={hour === h}
                          className={`min-h-[44px] rounded-lg border text-[14px] disabled:opacity-30 ${hour === h ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>{h}시</button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
          <label className="mt-4 block">
            <span className="mb-1 block text-[14px] font-semibold text-sub">트레이너에게 한마디 <span className="font-normal text-muted">(선택)</span></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick.mode === "cancel" ? "예: 출장이 생겼어요" : "예: 퇴근이 늦어서요"}
              className="w-full rounded-xl border border-line bg-elevate px-3.5 py-3 text-[16px] text-ink placeholder-muted outline-none focus:border-primary" />
          </label>
          {msg && <p className="m-0 mt-3 text-[14px] text-danger-text">{msg}</p>}
          <button type="button" disabled={busy} onClick={send}
            className="mt-4 min-h-[48px] w-full rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-40">
            {busy ? "보내는 중…" : pick.mode === "cancel" ? "취소 요청 보내기" : day != null && hour != null ? `${slotText(slotDate(days[day], hour).toISOString())} 요청하기` : "요청 보내기"}
          </button>
          <p className="m-0 mt-2 text-center text-[12.5px] text-muted">트레이너가 확인하면 알려 드려요.</p>
        </Modal>
      )}
    </Wrap>
  );
}
