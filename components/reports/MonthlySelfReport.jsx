"use client";

/* 트레이너 '성적표' · 개인 계정 '내 결산'(2026-10-06) — 내 실적 맨 위. 서버가 매월 1일 만든 monthly_report(본인 것).
   트레이너(kind trainer) = 규칙 기반(AI 없음 · 잘한 점만 · 보완할 점은 대표 면담용이라 저장도 안 함)
   개인(kind solo) = + AI 총평 · 잘한 점 · 보완할 점 · 해 볼 것 + 장부 순이익/받은 금액.
   아직 안 열어 본 지난달 것은 펼친 채로 · 펼치면 seen_at 기록. */

import { useEffect, useState } from "react";
import { CalendarCheck, ChevronDown, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import { Delta, Num, RecommendGoal, EventLines, markSeen, pct, ymKo } from "@/components/reports/MonthlyParts";

export default function MonthlySelfReport({ goals = [] }) {
  const [rep, setRep] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au?.user?.id) return;
      const { data, error } = await supabase.from("monthly_report").select("id, kind, ym, data, ai, generated_at, seen_at")
        .eq("trainer_id", au.user.id).in("kind", ["trainer", "solo"]).order("ym", { ascending: false }).limit(1).maybeSingle();
      if (error) { console.error("성적표 읽기 실패", error); return; }
      if (alive) setRep(data || null);
    })();
    return () => { alive = false; };
  }, []);
  if (!rep) return null;

  const solo = rep.kind === "solo";
  const t = solo ? rep.data.trainers?.[0] : rep.data.trainer;
  if (!t) return null;
  const c = solo ? rep.data.center : null;
  const ai = solo && rep.ai?.state === "ready" ? rep.ai : null;
  const praise = ai?.praise?.length ? ai.praise : (t.signals?.good || []).map((s) => s.text);
  const current = goals.find((g) => g.ym === t.recommend?.ym)?.target_revenue ?? null;
  const title = solo ? `${ymKo(rep.ym)} 결산` : `${ymKo(rep.ym)} 성적표`;

  return (
    <details open={!rep.seen_at} onToggle={(e) => { if (e.currentTarget.open && !rep.seen_at) { markSeen(rep.id); } }}
      className="group rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-5 shadow-sm">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><CalendarCheck className="h-4 w-4 text-primary-strong" aria-hidden="true" /> {title}</span>
        <span className="flex items-center gap-1.5 tabular-nums text-[14px] font-semibold text-ink">{won(t.revenue.total)} <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="space-y-3 pb-4">
        {ai?.headline && <p className="m-0 rounded-xl bg-primary-soft px-3.5 py-3 text-[15px] font-bold leading-relaxed text-primary-strong">{ai.headline}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Num label="매출" value={won(t.revenue.total)} sub={`신규 ${t.revenue.cntNew} · 재등록 ${t.revenue.cntRe}`}><Delta cur={t.revenue.total} prev={t.revenue.prev} /></Num>
          <Num label="OT 진행" value={`${t.ot.held}건`} sub={`등록 ${t.ot.success}/${t.ot.attempted}`}><Delta cur={t.ot.held} prev={t.ot.heldPrev} unit="건" /></Num>
          <Num label="PT 수업" value={`${t.sessions}회`} sub={`재등록 ${t.rereg.success}/${t.rereg.attempted}`} />
          {solo && c?.ledger ? <Num label="남은 돈" value={won(c.ledger.net)} sub={`지출 ${won(c.ledger.expense)}`} />
            : solo && c?.received != null ? <Num label="받은 금액" value={won(c.received)} />
            : <Num label="목표 달성" value={t.goal ? pct(t.goalRate) : "—"} sub={t.goal ? `목표 ${won(t.goal)}` : "목표를 안 정했어요"} />}
          <Num label="회원이 운동한 날" value={`${t.ounwanDays}일`} sub={`${t.ounwanMembers}명이 기록했어요`} />
          <Num label="회원 확인" value={pct(t.confirmRate)} sub={t.gainedMembers ? `무게가 늘어난 회원 ${t.gainedMembers}명` : "운동일지 확인 비율"} />
        </div>

        {praise.length > 0 && (
          <div>
            <p className="m-0 text-[13px] font-semibold text-cyan-700">잘한 점</p>
            <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-ink">{praise.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {ai?.improve?.length > 0 && (
          <div>
            <p className="m-0 text-[13px] font-semibold text-danger-text">보완할 점</p>
            <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-ink">{ai.improve.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {ai?.action && (
          <p className="m-0 flex items-start gap-1.5 text-[14px] text-ink"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" /><span><b className="font-semibold">이번 달 해 볼 것</b> · {ai.action}</span></p>
        )}

        {t.events?.length > 0 && (
          <div>
            <p className="m-0 mb-1 text-[13px] font-semibold text-ink">내 이벤트</p>
            <EventLines events={t.events} />
          </div>
        )}

        {(t.expiring?.length > 0 || t.otHold?.length > 0) && (
          <div className="rounded-xl bg-elevate px-3.5 py-3 text-[13.5px] text-ink">
            <p className="m-0 font-semibold">이번 달 챙길 회원</p>
            {t.expiring?.length > 0 && <p className="m-0 mt-1 text-sub">재등록 대상 {t.expiring.length}명 · {t.expiring.slice(0, 5).map((m) => m.name).join(", ")}{t.expiring.length > 5 ? " 외" : ""}</p>}
            {t.otHold?.length > 0 && <p className="m-0 mt-0.5 text-sub">다시 연락할 OT 회원 {t.otHold.length}명 · {t.otHold.slice(0, 5).map((m) => m.name).join(", ")}{t.otHold.length > 5 ? " 외" : ""}</p>}
          </div>
        )}

        <RecommendGoal rec={t.recommend} trainerId={t.trainer_id} current={current} />
      </div>
    </details>
  );
}
