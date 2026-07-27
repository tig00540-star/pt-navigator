"use client";
/* =========================================================================
   오늘 할일 — "다음 예약 미정": 잔여 있는 활성 PT인데 앞으로 잡힌 예약이 없는 회원.
   판정=lib/memberStatus의 unbookedActiveMembers. 선택 시 스케줄로(onSelect id,9) 예약 잡기.
   self-fetch: session_log·daily_workout_log(계정) + appointment(booked·미래·트레이너 스코프). 빈배열 null.
   ⚠️ write 0 · 새 저장 0 — 순수 파생.
   ========================================================================= */
import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { unbookedActiveMembers } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

export default function NoNextBookingToday({ members, uid, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!supabase) return;               // 데모: 집계 데이터 없음 → 빈 채로 숨김
    const nowISO = new Date().toISOString();
    let cancelled = false;
    (async () => {
      try {
        // appointment은 트레이너 스코프(uid)로 미래 booked만. contracts/logs는 계정 전체(회원별 filter는 순수함수가).
        const [ap, cs, ls] = await Promise.all([
          uid
            ? supabase.from("appointment").select("user_id, start_at, status, trainer_id")
                .eq("status", "booked").eq("trainer_id", uid).gte("start_at", nowISO)
            : Promise.resolve({ data: [] }),
          supabase.from("session_log").select("id, user_id, started_at, created_at, sessions_total, service_sessions, handed_over"),
          supabase.from("daily_workout_log").select("user_id, contract_id, session_at, created_at, voided, source"),
        ]);
        if (cancelled) return;
        setRows(unbookedActiveMembers(members || [], cs.data || [], ls.data || [], ap.data || [], { nowISO }));
      } catch {
        // 조회 실패 — 빈 채로 숨김 degrade.
      }
    })();
    return () => { cancelled = true; };
    // members 신원 바뀔 때 재계산(page.jsx가 loadMembers 후 새 배열).
  }, [uid, members]);

  if (!rows.length) return null;

  return (
    <ToneCard tone="neutral">
      <SectionHeader
        tone="neutral"
        icon={CalendarPlus}
        title="다음 예약 미정"
        count={rows.length}
        hint="잔여 있는데 다음 수업이 안 잡힘 — 먼저 예약을 잡으세요"
      />
      <div className="grid gap-2">
        {rows.map((r) => (
          <ListRow key={r.user_id} tone="neutral" name={r.name || "회원"} onClick={() => onSelect(r.user_id)}>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-sub">
              <span className="font-medium">잔여 {r.rem}회</span>
              {r.gap != null ? (
                <span className={r.gap >= 14 ? "font-medium text-amber-600" : "text-muted"}>마지막 수업 {r.gap}일 전</span>
              ) : (
                <span className="text-muted">아직 첫 수업 전</span>
              )}
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
