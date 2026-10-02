"use client";

/* 이번 달 출석 랭킹 — 홈(폰 TrainerHub · 넓은 화면 WideHome) 카드(2026-10-02 대표: "홈에 회원 랭킹").
   기준 = 오운완 일수(유산소 · 개인운동 · PT 중 하나라도 기록된 날 · rpc ounwan_ranking 서버 집계 · 1000행 잘림 무관).
   내 담당만(직접 맡은 회원이 없는 대표는 센터 전체 · WideHome과 같은 규칙). 상위 5명 · 0일은 뺀다.
   전체 목록 · 연속일 보기는 '내 실적'의 오운완 랭킹에 그대로 있다. 데모(키 없음) · 0건이면 숨김.
   ⚠️ 트레이너 전용 화면 — 회원 전용 페이지엔 노출 금지(하위권 사기저하). */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import { hrefFor, hrefForMember } from "@/lib/nav";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const TOP_N = 5;

export default function AttendanceRanking({ members = [], uid }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.rpc("ounwan_ranking");
        if (error) console.error("출석 랭킹 조회 실패", error);

        if (!cancelled) setRows(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ranked = useMemo(() => {
    const centerWide = Boolean(uid) && members.length > 0 && !members.some((m) => m.trainer_id === uid);
    const scoped = uid && !centerWide ? members.filter((m) => m.trainer_id === uid) : members;
    const byId = new Map(scoped.filter((m) => !m.hidden).map((m) => [m.id, m]));
    return (rows || [])
      .map((r) => ({ ...r, member: byId.get(r.user_id) }))
      .filter((r) => r.member && (r.month_count ?? 0) > 0)
      .sort((a, b) => (b.month_count ?? 0) - (a.month_count ?? 0) || (b.streak ?? 0) - (a.streak ?? 0))
      .slice(0, TOP_N);
  }, [rows, members, uid]);

  if (!supabase || !rows || ranked.length === 0) return null;
  const month = new Date().getMonth() + 1;

  return (
    <Card as="section" padding="none">
      <div className="px-4 pt-4">
        <SectionTitle icon={Flame} aside={`${month}월 · 오운완 기준`}>이번 달 출석 랭킹</SectionTitle>
      </div>
      <ol className="m-0 list-none divide-y divide-line p-0">
        {ranked.map((r, i) => (
          <li key={r.user_id}>
            <Link href={hrefForMember(r.user_id, viewFor(r.member))}
              className="flex min-h-[48px] items-center gap-3 px-4 py-2.5 no-underline transition hover:bg-elevate">
              <span className={`w-5 shrink-0 text-center text-[14px] font-bold ${i < 3 ? "text-primary-strong" : "text-muted"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{r.member.name}</span>
              {(r.streak ?? 0) >= 3 && <span className="shrink-0 text-[12px] text-muted">{r.streak}일 연속</span>}
              <span className="shrink-0 text-[15px] font-bold text-ink">{r.month_count}<span className="ml-0.5 text-[12px] font-medium text-muted">일</span></span>
            </Link>
          </li>
        ))}
      </ol>
      <Link href={hrefFor(8)} className="flex min-h-[44px] items-center justify-center gap-1 border-t border-line text-[13px] font-semibold text-sub no-underline hover:text-ink">
        전체 보기 · 내 실적 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </Card>
  );
}
