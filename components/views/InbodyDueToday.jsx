"use client";

/* 인바디 잴 회원 — '오늘' 할 일 카드(2026-10-03 · 대표: "인바디 잰 지 2주 · 한 달 된 PT 회원 알림").
   대상: PT 회원(viewFor=pt · hidden 제외 · 받은 members 그대로 = 호출부가 내 담당으로 거름) 중
         마지막 인바디(inbody_log.measured_at · 'YYYY-MM-DD')가 기준일 넘게 지났거나 한 번도 안 잰 회원.
   기준: 카드에서 2주 | 4주(기본 4주) · 고른 값은 이 기기 localStorage(ot.inbodyInterval).
   누르면 그 회원 '자료남기기'(탭 12 · 인바디 입력 칸). 대상 없으면 카드가 스스로 숨는다. 데모(키 없음)도 숨김. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { Scale } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

const KEY = "ot.inbodyInterval";
const listeners = new Set();
const readInterval = () => { try { return localStorage.getItem(KEY) === "14" ? "14" : "28"; } catch { return "28"; } };
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const writeInterval = (v) => { try { localStorage.setItem(KEY, v); } catch { /* 막힌 브라우저 — 이번 화면만 */ } listeners.forEach((f) => f()); };

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export default function InbodyDueToday({ members = [], onSelect }) {
  const interval = Number(useSyncExternalStore(subscribe, readInterval, () => "28"));
  const [last, setLast] = useState(null); // user_id → 마지막 측정일 | null(안 잼)
  const ptKey = (members || []).filter((m) => m && !m.hidden && viewFor(m) === "pt").map((m) => m.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const ids = ptKey ? ptKey.split(",") : [];
      if (!ids.length) { if (!cancelled) setLast(new Map()); return; }
      const { data, error } = await supabase.from("inbody_log").select("user_id, measured_at").in("user_id", ids);
      if (error) { console.error("인바디 측정일 조회 실패", error); return; }
      const m = new Map(ids.map((id) => [id, null]));
      for (const r of data || []) {
        const d = String(r.measured_at || "").slice(0, 10);
        if (d && (!m.get(r.user_id) || d > m.get(r.user_id))) m.set(r.user_id, d);
      }
      if (!cancelled) setLast(m);
    })();
    return () => { cancelled = true; };
  }, [ptKey]);

  if (!supabase || !last) return null;
  const today = todayKst();
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = [...last.entries()]
    .map(([id, d]) => ({ id, d, days: d ? daysBetween(d, today) : null }))
    .filter((r) => r.d == null || r.days >= interval)
    .sort((a, b) => (a.days == null ? -1 : b.days == null ? 1 : b.days - a.days));
  if (!rows.length) return null;

  const pill = (on) => (on
    ? "inline-flex min-h-[30px] items-center rounded-full bg-card px-2.5 text-[12.5px] font-semibold text-ink shadow-sm"
    : "inline-flex min-h-[30px] items-center rounded-full px-2.5 text-[12.5px] text-sub hover:text-ink");

  return (
    <ToneCard tone="renewal">
      <div className="flex items-start justify-between gap-2">
        <SectionHeader tone="renewal" icon={Scale} title="인바디 잴 회원" count={rows.length}
          hint={`마지막 측정이 ${interval === 14 ? "2주" : "4주"} 넘은 PT 회원이에요. 변화 숫자가 쌓여야 재등록 때 보여 줄 게 생겨요.`} />
        <div className="flex shrink-0 gap-0.5 rounded-full bg-elevate p-[3px]" role="tablist" aria-label="인바디 알림 기준">
          <button type="button" role="tab" aria-selected={interval === 14} onClick={() => writeInterval("14")} className={pill(interval === 14)}>2주</button>
          <button type="button" role="tab" aria-selected={interval === 28} onClick={() => writeInterval("28")} className={pill(interval === 28)}>4주</button>
        </div>
      </div>
      <div className="grid gap-2">
        {rows.slice(0, 8).map((r) => (
          <ListRow key={r.id} tone="renewal" name={byId.get(r.id)?.name || "회원"} onClick={() => onSelect?.(r.id, 12)}>
            <div className="mt-0.5 text-[12.5px] text-sub">
              {r.d ? <>마지막 측정 {Number(r.d.slice(5, 7))}월 {Number(r.d.slice(8, 10))}일 · <span className="font-medium text-pt-text">{r.days}일 지남</span></> : <span className="font-medium text-pt-text">아직 한 번도 안 쟀어요</span>}
            </div>
          </ListRow>
        ))}
        {rows.length > 8 && <p className="text-[12.5px] text-muted">외 {rows.length - 8}명</p>}
      </div>
    </ToneCard>
  );
}
