"use client";

/* =========================================================================
   OtWorkspace — OT 회원 화면 본체(2026-10-02 개편).
   /ot/{회원}            → 대시보드(OtDashboard)
   /ot/{회원}/{칸}-{n}   → n차의 칸: prep(OT 준비하기) · inbody(인바디 분석) · feedback(OT 피드백)
   차수 생략·열 수 없는 차수면 '지금 차수'로 주소를 바로잡는다(router.replace).
   차수 계산 규칙은 lib/otRounds.js 한 곳.
   ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { otRoundsInfo, parseOtStep, otStepPath, otStepLabel, roundAllowed } from "@/lib/otRounds";
import SkeletonScreen from "@/components/ui/Skeleton";
import OtDashboard from "@/components/ot/OtDashboard";
import FirstOTAssist from "@/components/tabs/FirstOTAssist";
import SecondOTTab from "@/components/tabs/SecondOTTab";
import ObservationTab from "@/components/tabs/ObservationTab";
import PtInbodyTab from "@/components/views/PtInbodyTab";

// 이 회원의 ot_log 전부(차수 수가 적어 전체를 읽는다) — 대시보드 진행 표시·차수 계산 재료.
export function useOtRows(memberId) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(!supabase);
  const reload = useCallback(async () => {
    if (!supabase || !memberId) { setReady(true); return; }
    try {
      const { data } = await supabase
        .from("ot_log")
        .select("id, ot_round, closing_result, closing_reason, closing_reapproach_at, created_at, report")
        .eq("user_id", memberId)
        .order("created_at", { ascending: true });
      setRows(data || []);
    } finally {
      setReady(true);
    }
  }, [memberId]);
  useEffect(() => {
    (async () => { await reload(); })();
  }, [reload]);
  return { rows, ready, reload };
}

function RoundBar({ memberId, info, stepKey, round }) {
  const list = info.rounds.map((r) => r.n);
  if (round > info.current) list.push(round); // 버튼으로 막 연 다음 차수(아직 행 없음)
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full bg-elevate p-[3px]" role="tablist" aria-label="OT 차수">
        {list.map((n) => {
          const on = n === round;
          return (
            <Link key={n} href={otStepPath(memberId, stepKey, n)} role="tab" aria-selected={on}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3.5 text-[13px] font-bold transition ${
                on ? "bg-card text-ot-text shadow-sm" : "text-sub hover:text-ink"}`}>
              {n}차
            </Link>
          );
        })}
      </div>
      {info.canStartNext && round <= info.current && (
        <Link href={otStepPath(memberId, "prep", info.current + 1)}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12px] font-semibold text-sub transition hover:text-ink">
          <Plus className="h-3.5 w-3.5" /> {info.current + 1}차 OT 시작
        </Link>
      )}
    </div>
  );
}

export default function OtWorkspace({ member, step, onClosingSaved }) {
  const router = useRouter();
  const { rows, ready, reload } = useOtRows(member.id);
  const info = otRoundsInfo(rows);
  const { key, round: asked } = parseOtStep(step);
  const round = asked && roundAllowed(info, asked) ? asked : info.current;

  // 차수 생략·못 여는 차수 → 지금 차수 주소로(뒤로가기에 남지 않게 replace).
  const fix = ready && key && asked !== round;
  useEffect(() => {
    if (fix) router.replace(otStepPath(member.id, key, round));
  }, [fix, key, round, member.id, router]);

  if (!ready || fix) return <SkeletonScreen cards={2} />;

  // 저장 후 대시보드·차수 진행을 다시 계산(배너 재조회는 부모 몫).
  const saved = () => { reload(); onClosingSaved?.(); };

  if (!key) return <OtDashboard member={member} info={info} />;

  return (
    <>
      <RoundBar memberId={member.id} info={info} stepKey={key} round={round} />
      <h1 className="mb-4 text-[22px] font-extrabold tracking-[-0.03em] text-ink">{otStepLabel(key, round)}</h1>
      {key === "prep" && (round === 1
        ? <FirstOTAssist member={member} onSaved={reload} />
        : <SecondOTTab key={round} member={member} round={round} onSaved={reload} />)}
      {key === "inbody" && <PtInbodyTab member={member} showAnalysis />}
      {key === "feedback" && <ObservationTab key={round} member={member} round={round} onClosingSaved={saved} />}
    </>
  );
}
