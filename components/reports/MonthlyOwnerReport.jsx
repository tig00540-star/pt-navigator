"use client";

/* 대표 '월간 결산'(2026-10-06) — 매월 1일 아침 서버가 만든 monthly_report(kind owner)를 보여 준다.
   AI 한 줄 총평 → 센터 숫자 → 트레이너별 카드(잘한 점 · 보완할 점[대표만 · 면담용] · 해 볼 것 · 추천 목표) → 이벤트 → 급여 확정.
   열면 seen_at 기록(실제로 쓰이는지 잰다). 결산이 아직 없으면 언제 나오는지 안내. */

import { useEffect, useState } from "react";
import { CalendarCheck, ChevronRight, MessageSquareText, Sparkles, Users, Gift } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import { Delta, Num, RecommendGoal, EventLines, markSeen, pct, ymKo } from "@/components/reports/MonthlyParts";

export default function MonthlyOwnerReport({ goals = [], onGoTab }) {
  const [list, setList] = useState(() => (supabase ? null : []));   // [{id, ym, data, ai, generated_at}] · 키 없으면 빈 목록
  const [pick, setPick] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("monthly_report").select("id, ym, data, ai, generated_at, seen_at").eq("kind", "owner").order("ym", { ascending: false }).limit(12);
      if (error) console.error("월간 결산 읽기 실패", error);
      if (!alive) return;
      setList(data || []);
      if (data?.[0]) { setPick(data[0].ym); if (!data[0].seen_at) markSeen(data[0].id); }
    })();
    return () => { alive = false; };
  }, []);

  if (list === null) return <p className="py-10 text-center text-[14px] text-muted">결산을 불러오는 중이에요</p>;
  if (!list.length) {
    return (
      <Card>
        <SectionTitle icon={CalendarCheck}>월간 결산</SectionTitle>
        <p className="m-0 text-[14px] leading-relaxed text-sub">매월 1일 아침에 지난달 결산이 여기 나와요. 센터 숫자 · 트레이너별 잘한 점과 보완할 점 · 이번 달 추천 목표를 한 장으로 정리해 드려요.</p>
      </Card>
    );
  }
  const rep = list.find((r) => r.ym === pick) || list[0];
  const d = rep.data, c = d.center, ai = rep.ai?.state === "ready" ? rep.ai : null;
  const aiBy = new Map((ai?.trainers || []).map((t) => [t.trainer_id, t]));
  const goalOf = (tid, ym) => goals.find((g) => g.trainer_id === tid && g.ym === ym)?.target_revenue ?? null;
  const shown = d.trainers.filter((t) => t.sessions + t.ot.held + t.revenue.total + t.activePt > 0);

  return (
    <div className="space-y-4 break-keep text-pretty">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="m-0 text-[13px] text-muted">월간 결산</p>
          <h2 className="m-0 mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">{ymKo(rep.ym)} 결산</h2>
        </div>
        {list.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-full bg-elevate p-[3px]">
            {list.slice(0, 6).map((r) => (
              <button key={r.ym} type="button" onClick={() => setPick(r.ym)} aria-pressed={r.ym === rep.ym}
                className={`min-h-[34px] rounded-full px-3 text-[13px] ${r.ym === rep.ym ? "bg-card font-semibold text-ink shadow-sm" : "text-sub"}`}>{ymKo(r.ym)}</button>
            ))}
          </div>
        )}
      </div>

      {ai?.headline && (
        <p className="m-0 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3.5 text-[16px] font-bold leading-relaxed text-primary-strong">{ai.headline}</p>
      )}

      <Card>
        <SectionTitle icon={CalendarCheck}>{ymKo(rep.ym)} 센터 숫자</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Num label="매출" value={won(c.revenue.net)} sub={`신규 ${c.revenue.cntNew} · 재등록 ${c.revenue.cntRe}${c.revenue.refund ? ` · 환불 ${won(c.revenue.refund)}` : ""}`}>
            <Delta cur={c.revenue.net} prev={c.revenue.prev} />
          </Num>
          <Num label="목표 달성" value={c.goal ? pct(c.goalRate) : "—"} sub={c.goal ? `목표 ${won(c.goal)}` : "목표를 안 정했어요"} />
          <Num label="OT 진행" value={`${c.otHeld}건`} sub={`등록 ${c.ot.success}/${c.ot.attempted}`}><Delta cur={c.otHeld} prev={c.otHeldPrev} unit="건" /></Num>
          <Num label="등록률 · 재등록률" value={`${pct(c.ot.rate)} · ${pct(c.rereg.rate)}`} sub={`재등록 ${c.rereg.success}/${c.rereg.attempted}`} />
          <Num label="PT 수업" value={`${c.sessions}회`} sub={`2주+ 안 온 회원 ${c.churn}명`} />
          {c.ledger ? <Num label="장부 순이익" value={won(c.ledger.net)} sub={`지출 ${won(c.ledger.expense)}`} /> : <Num label="재등록 대상" value={`${c.expiring}명`} sub="이번 달 챙길 회원" />}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Users}>트레이너별</SectionTitle>
        <div className="space-y-4">
          {shown.map((t) => {
            const a = aiBy.get(t.trainer_id);
            const praise = a?.praise?.length ? a.praise : t.signals.good.map((s) => s.text).slice(0, 2);
            const improve = a?.improve?.length ? a.improve : t.signals.bad.map((s) => s.text).slice(0, 2);
            return (
              <section key={t.trainer_id} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="m-0 text-[16px] font-bold text-ink">{personName(t.name)}</h3>
                  <span className="tabular-nums text-[14px] font-semibold text-ink">{won(t.revenue.total)} <Delta cur={t.revenue.total} prev={t.revenue.prev} /></span>
                </div>
                <p className="m-0 mt-1 text-[13px] text-sub">
                  OT {t.ot.held}건 · 등록 {t.ot.success}/{t.ot.attempted} · 재등록 {t.rereg.success}/{t.rereg.attempted} · PT 수업 {t.sessions}회 · 일지 {pct(t.logRate)} · 회원 확인 {pct(t.confirmRate)}
                </p>
                {praise.length > 0 && (
                  <div className="mt-2.5">
                    <p className="m-0 text-[13px] font-semibold text-cyan-700">잘한 점</p>
                    <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-ink">{praise.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                {improve.length > 0 && (
                  <div className="mt-2.5 rounded-xl border border-dashed border-line-strong px-3 py-2.5">
                    <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-danger-text">
                      보완할 점
                      <span className="inline-flex items-center gap-1 text-[12px] font-normal text-sub"><MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />트레이너 면담 때 활용하세요 · 대표만 보여요</span>
                    </p>
                    <ul className="m-0 mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-ink">{improve.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                {a?.action && (
                  <p className="m-0 mt-2.5 flex items-start gap-1.5 text-[14px] text-ink">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" /><span><b className="font-semibold">이번 달 해 볼 것</b> · {a.action}</span>
                  </p>
                )}
                <div className="mt-2.5">
                  <RecommendGoal rec={t.recommend} trainerId={t.trainer_id} current={goalOf(t.trainer_id, t.recommend?.ym)} who={`${personName(t.name)} · `} />
                </div>
              </section>
            );
          })}
        </div>
        {!ai && rep.ai?.state === "failed" && <p className="m-0 mt-3 text-[12.5px] text-muted">AI 코칭을 만들지 못해서 숫자로 뽑은 신호를 보여 드렸어요.</p>}
      </Card>

      {c.events?.length > 0 && (
        <Card>
          <SectionTitle icon={Gift}>{ymKo(rep.ym)} 이벤트</SectionTitle>
          <EventLines events={c.events} />
        </Card>
      )}

      {onGoTab && (
        <button type="button" onClick={() => onGoTab("perf")}
          className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-line bg-card px-4 text-left text-[15px] font-semibold text-ink shadow-sm">
          {ymKo(rep.ym)} 급여 확정하러 가기 <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
        </button>
      )}
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        {new Date(rep.generated_at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}에 만들었어요. 등록률 · 재등록률은 그달에 결과를 남긴 것만 세요. 추천 목표는 최근 3개월 평균 × 1.1과 들어올 매출 예측 중 큰 값이에요.
      </p>
    </div>
  );
}
