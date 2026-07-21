"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract, remainingSessions, reregisterDue } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

export default function RegisterDueToday({ members, onSelect }) {
  const [rows, setRows] = useState([]);
  // ⚠️ deps는 members 배열 참조가 아니라 pt 회원 id 문자열이다(P1-9). 형제 위젯
  //    ReapproachToday·RegisterReapproachToday가 쓰는 정답 패턴 — 배열을 deps에 넣으면
  //    부모의 어떤 state 변경(탭 전환·선택·벨)에나 새 배열 참조가 내려와 session_log +
  //    daily_workout_log를 통째로 재조회했다. 여기서 필요한 건 "재등록 대상 pt 회원 집합"이
  //    바뀔 때만이므로 그 id들을 문자열 키로 좁힌다.
  const ptKey = (members || []).filter((m) => viewFor(m) === "pt").map((m) => m.id).join(",");

  useEffect(() => {
    if (!supabase) return; // 데모: [] 유지 → 카드 미표시(라이브 전용, ReapproachToday와 결 동일)
    const ptIds = ptKey ? ptKey.split(",") : [];
    let cancelled = false;
    (async () => {
      // setState는 전부 IIFE 안에서만(ReapproachToday 골격 = 동기 setState 0 → set-state-in-effect 회피).
      if (!ptIds.length) { if (!cancelled) setRows([]); return; }
      const [{ data: cs }, { data: ls }] = await Promise.all([
        // 컬럼 좁힘(P1-9) — activeContract·remainingSessions·reregisterDue가 읽는 필드만.
        // ChurnRiskToday가 같은 계산에 쓰는 셋과 동일. select("*")는 max-rows·전송량 낭비.
        supabase.from("session_log").select("id, user_id, started_at, created_at, sessions_total, service_sessions").in("user_id", ptIds),
        supabase.from("daily_workout_log").select("user_id, contract_id, voided").in("user_id", ptIds),
      ]);
      if (cancelled) return;
      const contracts = cs || [];
      const logs = ls || [];
      const out = [];
      for (const id of ptIds) {
        const mContracts = contracts.filter((c) => c.user_id === id);
        const mLogs = logs.filter((l) => l.user_id === id);
        const active = activeContract(mContracts, mLogs);
        if (!active) continue; // 계약없음/전소진 = 재등록 카드 아님(전소진은 다른 신호)
        if (!reregisterDue(active, mLogs)) continue;
        const rem = remainingSessions(active, mLogs);
        out.push({ user_id: id, paid: rem.paid, service: rem.service });
      }
      setRows(out);
    })();
    return () => { cancelled = true; };
  }, [ptKey]);

  if (!rows.length) return null;

  const nameOf = (id) => members?.find((m) => m.id === id)?.name || "회원";
  // 잔여 유료 적은 순(급한 순)으로 위에.
  const list = [...rows].sort((a, b) => a.paid - b.paid);

  return (
    <ToneCard tone="renewal">
      <SectionHeader
        tone="renewal"
        icon={RefreshCw}
        title="재등록 타이밍"
        count={list.length}
        hint="잔여 임계 도래분"
      />
      <div className="grid gap-2">
        {list.map((r) => (
          <ListRow
            key={r.user_id}
            tone="renewal"
            name={nameOf(r.user_id)}
            onClick={() => onSelect(r.user_id)}
          >
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-sub">
              <span>잔여 유료 <b className="text-primary-strong">{r.paid}</b></span>
              <span className="text-muted">· 서비스 {r.service}</span>
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
