"use client";

/* =========================================================================
   Step7 reader — 홈 "오늘 재접근" 파생 리스트.
   writer(ObservationTab 1차 · SecondOTTab 2차)가 채운 ot_log의
   closing_result='hold' + closing_reapproach_at(도래분)을 today 주입해 렌더.
   판정은 lib/memberStatus의 reapproachToday 하나로(both round · '오늘 이하' 도래+경과, 미도래·null 제외).
   회원명 + 예정일(+경과) + 선택 시 onSelect(user_id). 만기임박(pt_expiring)은 ③ 소관 — 여기 없음.
   ========================================================================= */

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { reapproachToday, viewFor } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

// 오늘(로컬 달력일) ISO. 컴포넌트는 now 읽어도 됨(순수 모듈 아님) — 순수 판정엔 이 값을 주입.
function todayISOLocal() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// 예정일 대비 경과일(오늘 기준). 0=오늘, 양수=경과.
function daysOverdue(dateISO, todayISO) {
  const a = new Date(`${dateISO}T00:00:00`);
  const b = new Date(`${todayISO}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export default function ReapproachToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);
  const today = todayISOLocal();
  const memberKey = (members || []).map((m) => m.id).join(",");
  const otKey = (members || []).filter((m) => viewFor(m) === "ot").map((m) => m.id).join(",");

  useEffect(() => {
    if (!supabase || !memberKey) return; // 데모/무회원: 초기 [] 유지 → 카드 미표시(라이브 전용 위젯, 폴백 결 유지)
    let cancelled = false;
    (async () => {
      // both round의 hold 행만 당겨오고, 날짜(도래·null) 판정은 reapproachToday에 위임.
      const ids = memberKey.split(",");
      // 회원별 최신 차수를 가려야 해서 결과와 무관하게 다 가져온다(2026-10-06) · OT 회원만 넘긴다.
      const { data } = await supabase
        .from("ot_log")
        .select("user_id, ot_round, closing_result, closing_reapproach_at, created_at")
        .in("user_id", ids); // ★ 내 회원만
      if (cancelled) return;
      setRows(reapproachToday(data || [], today, new Set(otKey ? otKey.split(",") : [])));
    })();
    return () => {
      cancelled = true;
    };
  }, [today, memberKey, otKey]);

  if (!rows.length) return null;

  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";
  // 오래 밀린(예정일 이른) 순으로 위에.
  const list = [...rows].sort((a, b) =>
    a.closing_reapproach_at < b.closing_reapproach_at ? -1 : 1
  );

  return (
    <ToneCard tone="reapproach">
      <SectionHeader
        tone="reapproach"
        icon={CalendarClock}
        title="오늘 재접근"
        count={list.length}
        hint="보류했던 회원 · 다시 연락할 날"
      />
      <div className="grid gap-2">
        {list.map((r) => {
          const over = daysOverdue(r.closing_reapproach_at, today);
          return (
            <ListRow
              key={`${r.user_id}-${r.ot_round}`}
              tone="reapproach"
              name={nameOf(r.user_id)}
              onClick={() => onSelect(r.user_id)}
            >
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-sub">
                <span className="font-mono">{r.closing_reapproach_at}</span>
                <span className={over > 0 ? "font-medium text-amber-600" : "font-medium text-primary-strong"}>
                  {over > 0 ? `${over}일 경과` : "오늘"}
                </span>
                <span className="text-muted">· {r.ot_round}차 {r.closing_result === "none" ? "· 다음 OT" : "보류"}</span>
              </div>
            </ListRow>
          );
        })}
      </div>
    </ToneCard>
  );
}
