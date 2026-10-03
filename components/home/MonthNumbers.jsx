"use client";

/* 홈 위젯 '이번 달 내 숫자' — 신규 등록 · 재등록 건수 + 이번 달 매출.
   숫자는 '내 실적'과 같은 함수(revenueByTrainer · 환불 차감 포함)로 센다 → 두 화면이 같은 숫자.
   조회: 내 계약(session_log trainer_id=나) 전부 · fetchAllRows(1000행 잘림 방지). 데모(키 없음)면 숨김. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { revenueByTrainer } from "@/lib/memberStatus";
import { manwon } from "@/lib/format";
import { hrefFor } from "@/lib/nav";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

export default function MonthNumbers({ uid }) {
  const [rev, setRev] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !uid) return;
      const { data, error } = await fetchAllRows(() => supabase.from("session_log").select("*").eq("trainer_id", uid));
      if (error) { console.error("이번 달 숫자 조회 실패", error); return; }
      const ym = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
      const mine = revenueByTrainer(data || [], ym).find((r) => r.trainer_id === uid) || { total: 0, cntNew: 0, cntRe: 0 };
      if (!cancelled) setRev(mine);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!supabase || !rev) return null;
  const month = new Date().getMonth() + 1;
  const cell = (label, value) => (
    <div className="rounded-xl bg-elevate px-3 py-2.5">
      <span className="block text-[12px] text-muted">{label}</span>
      <span className="mt-0.5 block text-[17px] font-bold tracking-[-0.02em] text-ink">{value}</span>
    </div>
  );

  return (
    <Card as="section">
      <SectionTitle icon={BarChart3} aside={
        <Link href={hrefFor(8)} className="inline-flex min-h-[32px] items-center gap-0.5 font-semibold text-sub no-underline hover:text-ink">
          내 실적 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }>{month}월 내 숫자</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {cell("신규 등록", `${rev.cntNew}건`)}
        {cell("재등록", `${rev.cntRe}건`)}
        {cell("매출", manwon(rev.total))}
      </div>
    </Card>
  );
}
