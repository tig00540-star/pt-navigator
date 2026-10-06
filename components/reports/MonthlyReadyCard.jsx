"use client";

/* '지난달 결산이 나왔어요' 카드(2026-10-06) — 매월 1~10일, 아직 안 열어 본 지난달 결산이 있으면 한 줄.
   kind="owner" = 대표 홈(대표 결산) · kind="self" = 트레이너 · 개인 홈(내 성적표 · 내 결산 → 내 실적). 없으면 숨김. */

import { useEffect, useState } from "react";
import { CalendarCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { lastMonthYm } from "@/lib/monthlyReport";

export default function MonthlyReadyCard({ kind = "self", onGo, className = "mb-4" }) {
  const [rep, setRep] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const now = Date.now();
      if (Number(new Date(now + 9 * 3600000).toISOString().slice(8, 10)) > 10) return;
      const ym = lastMonthYm(now);
      let q = supabase.from("monthly_report").select("id, kind, ym, seen_at").eq("ym", ym);
      if (kind === "owner") q = q.eq("kind", "owner");
      else {
        const { data: au } = await supabase.auth.getUser();
        if (!au?.user?.id) return;
        q = q.in("kind", ["trainer", "solo"]).eq("trainer_id", au.user.id);
      }
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) { console.error("결산 카드 읽기 실패", error); return; }
      if (alive && data && !data.seen_at) setRep(data);
    })();
    return () => { alive = false; };
  }, [kind]);
  if (!rep) return null;
  const mon = Number(rep.ym.slice(5, 7));
  const title = rep.kind === "owner" ? `${mon}월 결산이 준비됐어요` : rep.kind === "solo" ? `${mon}월 결산이 나왔어요` : `${mon}월 성적표가 나왔어요`;
  const sub = rep.kind === "owner" ? "트레이너별 잘한 점 · 보완할 점과 이번 달 추천 목표" : "지난달 내 숫자와 이번 달 추천 목표";
  const inner = (
    <>
      <CalendarCheck className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        <span className="block text-[13px] text-sub">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </>
  );
  const cls = `${className} flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-4 py-3 text-left shadow-sm transition active:scale-[0.99]`;
  return onGo ? <button type="button" onClick={onGo} className={cls}>{inner}</button> : <Link href="/stats" className={cls}>{inner}</Link>;
}
