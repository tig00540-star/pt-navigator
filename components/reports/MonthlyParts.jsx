"use client";

/* 월간 결산 화면 공용 조각(2026-10-06) — 대표 결산 · 트레이너 성적표 · 개인 '내 결산'이 같이 쓴다. */

import { useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won, manwon } from "@/lib/format";

export const pct = (r) => (r == null ? "—" : `${Math.round(r * 100)}%`);
export const ymKo = (ym) => (ym ? `${Number(ym.slice(5, 7))}월` : "");

/** 전달 대비 ▲▼ */
export function Delta({ cur, prev, unit = "won" }) {
  if (prev == null || cur == null || (prev === 0 && cur === 0)) return null;
  const d = cur - prev;
  if (d === 0) return <span className="text-[12.5px] text-muted">지난달과 같아요</span>;
  const up = d > 0;
  const txt = unit === "won" ? manwon(Math.abs(d)) : `${Math.abs(d)}${unit}`;
  return <span className={`text-[12.5px] font-semibold ${up ? "text-cyan-700" : "text-danger-text"}`}>{up ? "▲" : "▼"} {txt}</span>;
}

/** 숫자 한 칸 */
export function Num({ label, value, sub, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-elevate px-3.5 py-3">
      <p className="m-0 text-[12.5px] text-sub">{label}</p>
      <p className="m-0 mt-0.5 tabular-nums text-[19px] font-bold tracking-[-0.02em] text-ink">{value}</p>
      {sub && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{sub}</p>}
      {children}
    </div>
  );
}

/** 추천 목표 + [목표로 정하기] — trainer_goal upsert(본인 · 대표는 자기 센터 트레이너) */
export function RecommendGoal({ rec, trainerId, current, who = "" }) {
  const [saved, setSaved] = useState(current ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!rec?.target) return null;
  const set = async () => {
    if (!supabase || busy) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase.from("trainer_goal")
      .upsert({ trainer_id: trainerId, ym: rec.ym, target_revenue: rec.target, updated_at: new Date().toISOString() }, { onConflict: "trainer_id,ym" })
      .select("target_revenue");
    setBusy(false);
    if (error || !data?.length) { console.error("목표 저장 실패", error); setErr("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
    setSaved(data[0].target_revenue);
  };
  const why = [rec.avg3 ? `최근 3개월 평균 ${manwon(rec.avg3)}` : null, rec.expiring ? `재등록 대상 ${rec.expiring}명` : null, rec.otPipeline ? `OT 회원 ${rec.otPipeline}명` : null].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Target className="h-4 w-4 text-primary-strong" aria-hidden="true" />
        <span className="text-[14px] font-semibold text-ink">{who}{ymKo(rec.ym)} 추천 목표</span>
        <span className="tabular-nums text-[16px] font-bold text-ink">{won(rec.target)}</span>
      </div>
      {why && <p className="m-0 mt-1 text-[12.5px] text-sub">근거: {why}</p>}
      <div className="mt-2 flex items-center gap-2">
        {saved === rec.target ? (
          <span className="text-[13px] font-semibold text-cyan-700">목표로 정했어요</span>
        ) : (
          <button type="button" onClick={set} disabled={busy}
            className="min-h-[36px] rounded-lg border border-primary/40 bg-primary-soft px-3 text-[13px] font-semibold text-primary-strong disabled:opacity-50">
            {busy ? "저장 중…" : saved ? `목표 ${manwon(saved)} → 이걸로 바꾸기` : "목표로 정하기"}
          </button>
        )}
      </div>
      {err && <p className="m-0 mt-1 text-[12.5px] text-danger-text">{err}</p>}
    </div>
  );
}

/** 이벤트 요약 줄 */
export function EventLines({ events = [] }) {
  if (!events.length) return null;
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {events.map((e) => (
        <li key={e.id} className="rounded-lg bg-elevate px-3 py-2 text-[13.5px]">
          <b className="font-semibold text-ink">{e.title}</b>
          <span className="block text-[12.5px] text-sub">
            참여 {e.joined}명{e.kind === "challenge" ? ` · 달성 ${e.achieved}명` : ""}
            {e.pendingReward ? <b className="ml-1 font-semibold text-primary-strong">· 상품 지급 대기 {e.pendingReward}명</b> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 열어 봤어요 기록(본인 · 대표 결산) */
export async function markSeen(id) {
  if (!supabase || !id) return;
  const { error } = await supabase.rpc("mark_monthly_report_seen", { p_id: id });
  if (error) console.error("결산 열람 기록 실패", error);
}
