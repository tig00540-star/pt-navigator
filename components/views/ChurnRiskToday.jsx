"use client";
/* 오늘 할일 — 이탈 위험 조기경보. 활성 계약(잔여>0)인데 최근 N일 수업이 없는 PT 회원.
   자기완결: session_log·daily_workout_log 계정 전체 조회 → 회원별 마지막 수업일 계산. 데모/0건 숨김. */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract, remainingSessions } from "@/lib/memberStatus";

const STALE_DAYS = 14; // 이 일수 이상 수업 없으면 이탈 위험(여기 숫자만 바꾸면 조정됨)

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function ChurnRiskToday({ members = [], onSelect }) {
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      setLoading(true);
      try {
        const [{ data: cs }, { data: ls }] = await Promise.all([
          supabase.from("session_log").select("id, user_id, started_at, created_at, sessions_total, service_sessions"),
          supabase.from("daily_workout_log").select("user_id, session_at, created_at, voided, source"),
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
  }, []);

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
    <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-bold text-ink">이탈 위험 · 최근 {STALE_DAYS}일 무수업</h3>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700">{risky.length}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        잔여가 남았는데 발길이 뜸해진 회원 — 먼저 연락해 재방문을 잡으세요.
      </p>
      <ul className="mt-3 space-y-1.5">
        {risky.map(({ m, gap, rem, everCame }) => (
          <li key={m.id}>
            <button
              onClick={() => onSelect?.(m.id, 10)}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition hover:border-primary"
            >
              <span className="text-sm font-semibold text-ink">{m.name}</span>
              <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                {everCame ? `${gap}일째 무수업` : `등록 후 ${gap}일 미방문`}
              </span>
              <span className="text-[11px] text-muted">잔여 {rem.total}회</span>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
