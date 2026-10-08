"use client";

/* 루틴 요청 — 회원이 회원 전용 페이지에서 '루틴 요청하기'를 누른 것(2026-10-04). 트레이너가 루틴을 만들어 보이기를 켜면 처리됨(사라짐).
   보이는 곳: '오늘' 탭 · 폰 홈(오늘 카드 아래 · 있을 때만) · 넓은 홈. 누르면 그 회원 PT 대시보드(개인운동 루틴 카드).
   받은 members(내 담당 · 호출부가 거름) 안에서만. 표 없거나(SQL 전) 없으면 숨김. */

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";
import { fetchByIds } from "@/lib/fetchByIds";

const daysAgo = (iso) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? "오늘 요청" : `${d}일째 기다림`; };

export default function RoutineRequestToday({ members = [], onSelect }) {
  const [rows, setRows] = useState([]);
  const key = (members || []).filter((m) => m && !m.hidden).map((m) => m.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const ids = key ? key.split(",") : [];
      if (!ids.length) { if (!cancelled) setRows([]); return; }
      const { data: raw, error } = await fetchByIds(supabase, "member_routine_request", "id, user_id, created_at", "user_id", ids, (q) => q.eq("status", "open"));
      const data = (raw || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (error) { console.error("루틴 요청 조회 실패", error); return; }
      const seen = new Set(); const out = [];
      for (const r of data || []) if (!seen.has(r.user_id)) { seen.add(r.user_id); out.push(r); }
      if (!cancelled) setRows(out);
    })();
    return () => { cancelled = true; };
  }, [key]);

  if (!rows.length) return null;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "회원";

  return (
    <ToneCard tone="brand">
      <SectionHeader tone="brand" icon={Hand} title="루틴 요청" count={rows.length} hint="회원이 개인운동 루틴을 요청했어요. 만들어서 보이기를 켜면 사라져요." />
      <div className="grid gap-2">
        {rows.map((r) => (
          <ListRow key={r.id} tone="brand" name={nameOf(r.user_id)} onClick={() => onSelect?.(r.user_id, 10)}>
            <div className="mt-0.5 text-[12.5px] text-sub">{daysAgo(r.created_at)}</div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
