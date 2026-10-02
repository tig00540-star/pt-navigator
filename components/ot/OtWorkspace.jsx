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
import { otRoundsInfo, parseOtStep, otStepPath, roundAllowed, OT_STEP_KEYS } from "@/lib/otRounds";
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

/* OT 화면 탭(2026-10-02 대표 지정 구조) — 두 줄.
   1줄: 대시보드 | 1차 OT | 2차 OT …(+ N차 OT 시작)  — 차수는 진행하면 옆에 하나씩 늘어난다.
   2줄(차수를 골랐을 때만): OT 준비하기 | 인바디 분석 | OT 피드백 */
// 차수 탭을 누르면 그 차수에서 아직 안 한 첫 칸으로(다 했으면 준비하기).
const firstOpenStep = (r) => (!r?.progress?.prep ? "prep" : !r.progress.feedback ? "feedback" : "prep");

export function OtTabs({ memberId, info, stepKey, round }) {
  const rounds = info.rounds.map((r) => ({ n: r.n, go: firstOpenStep(r) }));
  if (round && round > info.current) rounds.push({ n: round, go: "prep" }); // 버튼으로 막 연 다음 차수(아직 행 없음)
  const top = (on) => `inline-flex min-h-[40px] shrink-0 items-center rounded-full px-4 text-[14px] transition ${
    on ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"}`;
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <nav className="flex gap-1 rounded-full bg-elevate p-[3px]" aria-label="OT 회원 화면">
          <Link href={`/ot/${memberId}`} aria-current={!stepKey ? "page" : undefined} className={top(!stepKey)}>대시보드</Link>
          {rounds.map((r) => (
            <Link key={r.n} href={otStepPath(memberId, r.go, r.n)} aria-current={stepKey && r.n === round ? "page" : undefined}
              className={top(Boolean(stepKey) && r.n === round)}>
              {r.n}차 OT
            </Link>
          ))}
        </nav>
        {info.canStartNext && (!round || round <= info.current) && (
          <Link href={otStepPath(memberId, "prep", info.current + 1)}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] text-sub transition hover:text-ink">
            <Plus className="h-3.5 w-3.5" /> {info.current + 1}차 OT
          </Link>
        )}
      </div>
      {stepKey && (
        <nav className="flex border-b border-line" aria-label={`${round}차 OT`}>
          {OT_STEP_KEYS.map((k) => {
            const on = k === stepKey;
            return (
              <Link key={k} href={otStepPath(memberId, k, round)} aria-current={on ? "page" : undefined}
                className={`relative flex-1 px-1 py-2.5 text-center text-[14px] transition ${on ? "font-semibold text-ot-text" : "text-sub hover:text-ink"}`}>
                {STEP_NAME[k]}
                {on && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ot" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
const STEP_NAME = { prep: "OT 준비하기", inbody: "인바디 분석", feedback: "OT 피드백" };

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

  if (!key) {
    return (
      <>
        <OtTabs memberId={member.id} info={info} stepKey={null} round={null} />
        <OtDashboard member={member} info={info} />
      </>
    );
  }

  return (
    <>
      <OtTabs memberId={member.id} info={info} stepKey={key} round={round} />
      {key === "prep" && (round === 1
        ? <FirstOTAssist member={member} onSaved={reload} />
        : <SecondOTTab key={round} member={member} round={round} onSaved={reload} />)}
      {key === "inbody" && <PtInbodyTab member={member} showAnalysis />}
      {key === "feedback" && <ObservationTab key={round} member={member} round={round} onClosingSaved={saved} />}
    </>
  );
}
