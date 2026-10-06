"use client";

/* '수업 요청' 카드(2026-10-06) — 회원이 회원 전용 페이지에서 보낸 새 수업 · 시간 변경 · 취소 요청.
   승인 = DB 함수 decide_appt_request가 예약을 실제로 만들고 · 옮기고 · 취소(같은 시각 다른 수업이 있으면 승인 안 됨).
   거절은 한마디(선택)와 함께. 결과는 회원 폰으로(appt_decided). 폰 홈 · '오늘' 탭 · 넓은 홈. 대상 없으면 숨김. */

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { notifyPush } from "@/lib/pushClient";
import { requestLine, KIND_LABEL } from "@/lib/booking";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";

export default function ApptRequestToday({ members, uid, onChanged }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [declining, setDeclining] = useState(null);   // 거절 한마디 쓰는 요청 id
  const [note, setNote] = useState("");
  const [err, setErr] = useState({});

  const load = async () => {
    if (!supabase || !uid) return;
    const { data, error } = await supabase.from("appt_request")
      .select("id, member_id, kind, orig_start, want_start, note, created_at")
      .eq("trainer_id", uid).eq("status", "pending").order("created_at");
    if (error) { console.error("수업 요청 읽기 실패", error); return; }
    setRows(data || []);
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase || !uid) return;
      const { data, error } = await supabase.from("appt_request")
        .select("id, member_id, kind, orig_start, want_start, note, created_at")
        .eq("trainer_id", uid).eq("status", "pending").order("created_at");
      if (error) { console.error("수업 요청 읽기 실패", error); return; }
      if (alive) setRows(data || []);
    })();
    return () => { alive = false; };
  }, [uid]);

  if (!rows.length) return null;
  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";

  const decide = async (r, approve) => {
    setBusyId(r.id); setErr((e) => ({ ...e, [r.id]: "" }));
    try {
      const { error } = await supabase.rpc("decide_appt_request", { p_id: r.id, p_approve: approve, p_note: approve ? null : note || null });
      if (error) {
        console.error("수업 요청 처리 실패", error);
        const m = error.message || "";
        setErr((e) => ({ ...e, [r.id]: m.includes("conflict") ? "그 시간에 이미 다른 수업이 있어요. 거절하고 회원과 다시 정해 주세요."
          : m.includes("appt_gone") ? "그 예약은 이미 바뀌었거나 취소됐어요. 거절해 주세요."
          : "처리하지 못했어요. 다시 시도해 주세요." }));
        return;
      }
      notifyPush(authHeader(), "appt_decided", r.id);   // 회원 폰으로 승인/거절
      setDeclining(null); setNote("");
      await load(); onChanged?.();
    } finally { setBusyId(null); }
  };

  return (
    <ToneCard tone="renewal">
      <SectionHeader tone="renewal" icon={CalendarClock} title="수업 요청" count={rows.length} hint="회원이 보낸 예약 · 변경 · 취소 요청이에요. 승인하면 스케줄에 바로 반영돼요" />
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-elevate px-3.5 py-2.5">
            <div className="text-[15px] font-semibold text-ink">{nameOf(r.member_id)} <span className="text-[13px] font-semibold text-pt-text">· {KIND_LABEL[r.kind]}</span></div>
            <div className="mt-0.5 text-[13.5px] text-ink">{requestLine(r)}</div>
            {r.note && <div className="mt-0.5 text-[13px] text-sub">&ldquo;{r.note}&rdquo;</div>}
            {err[r.id] && <div className="mt-1 text-[13px] text-danger-text">{err[r.id]}</div>}
            {declining === r.id ? (
              <div className="mt-2 flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="회원에게 한마디(선택)"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[14px] text-ink placeholder-muted outline-none focus:border-primary" />
                <button type="button" disabled={busyId === r.id} onClick={() => decide(r, false)} className="min-h-[40px] shrink-0 rounded-lg border border-line bg-card px-3 text-[14px] font-semibold text-sub">거절</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busyId === r.id} onClick={() => decide(r, true)} className="min-h-[40px] rounded-lg bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40">승인</button>
                <button type="button" disabled={busyId === r.id} onClick={() => { setDeclining(r.id); setNote(""); }} className="min-h-[40px] rounded-lg border border-line bg-card px-3 text-[14px] font-semibold text-sub">거절</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </ToneCard>
  );
}
