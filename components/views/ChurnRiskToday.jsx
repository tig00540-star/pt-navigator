"use client";
/* 오늘 할일 — 이탈 위험 조기경보. 활성 계약(잔여>0)인데 최근 N일 수업이 없는 PT 회원.
   자기완결: session_log·daily_workout_log 계정 전체 조회 → 회원별 마지막 수업일 계산. 데모/0건 숨김. */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";
import { supabase } from "@/lib/supabaseClient";
import { fetchByIds } from "@/lib/fetchByIds";
import { viewFor, activeContract, remainingSessions } from "@/lib/memberStatus";

const STALE_DAYS = 14; // 이 일수 이상 수업 없으면 이탈 위험(여기 숫자만 바꾸면 조정됨)

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function ChurnRiskToday({ members = [], onSelect }) {
  // 받은 PT 회원 것만 · 끝까지(1000행 잘림 방지 · 2026-10-06). 예전엔 센터 전체를 한 번에 불러 잘렸다.
  const ptKey = members.filter((m) => viewFor(m) === "pt").map((m) => m.id).sort().join(",");
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      setLoading(true);
      try {
        const ids = ptKey ? ptKey.split(",") : [];
        const [{ data: cs }, { data: ls }] = await Promise.all([
          fetchByIds(supabase, "session_log", "id, user_id, started_at, created_at, sessions_total, service_sessions, handed_over", "user_id", ids),
          fetchByIds(supabase, "daily_workout_log", "user_id, contract_id, session_at, created_at, voided, source", "user_id", ids),
        ]);
        if (cancelled) return;
        setContracts(cs || []);
        setLogs(ls || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제(위젯은 빈 채로 숨김 degrade).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ptKey]);

  // 회원×로그 O(n²) 집계 — 데이터 변경 시에만 재계산(모든 훅은 early return 앞에).
  const risky = useMemo(() =>
    members
      .filter((m) => viewFor(m) === "pt")
      .map((m) => {
        const mlogs = logs.filter((l) => l.user_id === m.id);
        const mcontracts = contracts.filter((c) => c.user_id === m.id);
        const active = activeContract(mcontracts, mlogs);
        if (!active) return null;
        const rem = remainingSessions(active, mlogs);
        if (rem.total <= 0) return null; // 잔여 없으면 재등록 대상(이탈 아님)
        // 마지막 '실제' 수업(노쇼·취소 제외) 기준. 한 번도 안 왔으면 계약 시작일 기준.
        const done = mlogs.filter((l) => !l.voided && l.source !== "noshow");
        const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
        const ref = last ?? active.started_at ?? active.created_at ?? null;
        const gap = ref ? daysSince(ref) : null;
        if (gap == null || gap < STALE_DAYS) return null;
        return { m, gap, rem, everCame: Boolean(last) };
      })
      .filter(Boolean)
      .sort((a, b) => b.gap - a.gap),
    [members, contracts, logs]
  );

  if (!supabase) return null; // 데모: 집계 데이터 없음

  if (loading || risky.length === 0) return null;

  return (
    <ToneCard tone="danger">
      <SectionHeader tone="danger" icon={AlertTriangle} title="이탈 위험" count={risky.length}
        hint={`남은 수업이 있는데 ${STALE_DAYS}일 넘게 안 온 회원이에요. 먼저 연락해 다음 수업을 잡아 주세요.`} />
      <div className="grid gap-2">
        {risky.map(({ m, gap, rem, everCame }) => (
          <ListRow key={m.id} tone="danger" name={m.name} onClick={() => onSelect?.(m.id, 10)}>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-sub">
              <span className="font-medium text-danger-text">{everCame ? `${gap}일째 수업 없음` : `등록 후 ${gap}일째 안 옴`}</span>
              <span className="text-muted">· 남은 수업 {rem.total}회</span>
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
