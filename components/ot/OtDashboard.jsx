"use client";

/* =========================================================================
   OtDashboard — OT 회원을 누르면 처음 뜨는 화면(2026-10-02 대표 요청).
   설명 없이 한눈에: 누구인지 → 최근 OT·다음 예약 → 인바디 → 차수 진행(지금 할 일).
   읽기 전용 화면(쓰기 0) — ot_log는 부모(OtWorkspace)가 읽어 넘기고,
   예약·인바디만 여기서 읽는다(각각 회원 1명 소량 조회).
   넓은 화면(@container — 회원 칸 폭 기준): 768px~ 왼쪽 회원·할 일 | 오른쪽 OT 진행.
   ========================================================================= */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarCheck2, Check, ChevronRight, Pencil, Plus, Scale } from "lucide-react";
import { useAppUi } from "@/components/app/AppChrome";
import { supabase } from "@/lib/supabaseClient";
import { otStepPath, otStepLabel } from "@/lib/otRounds";
import { hasVal } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const RESULT_TONE = { success: "primary", hold: "ot", fail: "neutral", none: "neutral" };
// 배지·작은 칸용 짧은 결과 이름(드롭다운의 긴 설명 대신).
const RESULT_SHORT = { success: "등록", hold: "보류", fail: "실패", none: "결과 미기록" };
// 결과 이름 — 'none'이어도 '다음 OT 이어가요'(제안 못 함)로 저장했으면 '이어가기'.
const resultName = (p) => (p.result === "none" && p.next ? "이어가기" : RESULT_SHORT[p.result]);

const dayLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (same(d, today)) return `오늘 ${time}`;
  if (same(d, tomorrow)) return `내일 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
};
const shortDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function Stat({ icon: Icon, label, value, sub, accent, href }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </div>
      <div className={`mt-1 text-[16px] font-semibold tracking-[-0.02em] ${accent ? "text-danger-text" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-sub">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl bg-elevate px-3.5 py-3 transition hover:bg-line/60">{body}</Link>
  ) : (
    <div className="rounded-xl bg-elevate px-3.5 py-3">{body}</div>
  );
}

function Step({ done, children }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${done ? "text-ink" : "text-muted"}`}>
      {done ? <Check className="h-3.5 w-3.5 text-ot-text" strokeWidth={3} aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" aria-hidden="true" />}
      {children}
    </span>
  );
}

export default function OtDashboard({ member, info }) {
  const { openMemberEdit } = useAppUi();
  const [nextAppt, setNextAppt] = useState(null);
  const [lastAppt, setLastAppt] = useState(null);
  const [inbody, setInbody] = useState({ latest: null, count: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const now = new Date().toISOString();
      const [nx, ls, ib] = await Promise.all([
        supabase.from("appointment").select("start_at").eq("user_id", member.id).eq("status", "booked")
          .gte("start_at", now).order("start_at", { ascending: true }).limit(1),
        supabase.from("appointment").select("start_at, status").eq("user_id", member.id).neq("status", "canceled")
          .lt("start_at", now).order("start_at", { ascending: false }).limit(1),
        supabase.from("inbody_log").select("measured_at, weight, skeletal_muscle, body_fat_pct", { count: "exact" })
          .eq("user_id", member.id).order("measured_at", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      setNextAppt(nx.data?.[0] || null);
      setLastAppt(ls.data?.[0] || null);
      setInbody({ latest: ib.data?.[0] || null, count: ib.count || 0 });
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  // 지금 할 일 — 지금 차수에서 아직 안 한 첫 칸.
  const cur = info.rounds.find((r) => r.n === info.current) || { n: info.current, progress: { prep: false, feedback: false, result: "none" } };
  const nextKey = info.done ? null : !cur.progress.prep ? "prep" : !cur.progress.feedback ? "feedback" : null;

  // 최근 OT — 지난 예약(취소 제외)이 있으면 그 날짜, 없으면 마지막 피드백 기록일.
  const lastFeedback = [...info.rounds].reverse().find((r) => r.progress.feedback);
  const lastOtDate = lastAppt?.start_at || (lastFeedback?.row?.created_at ?? null);

  const goalSet = hasVal(member.goal) && member.goal !== "미설정";
  const facts = [
    hasVal(member.age) && `${member.age}세`,
    hasVal(member.job) && member.job,
    hasVal(member.residence) && member.residence,
    hasVal(member.mbti) && member.mbti,
  ].filter(Boolean);

  return (
    <div className="@container">
    <div className="space-y-4 @3xl:grid @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-4 @3xl:space-y-0">
      <div className="space-y-4">
      {/* 회원 */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ot-soft text-[15px] font-bold text-ot-text" aria-hidden="true">
            {(member.name || "?").slice(-2)}
          </div>
          <button type="button" onClick={() => openMemberEdit(member.id)}
            className="order-last inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[12px] text-sub transition hover:text-ink">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> 정보 수정
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">{member.name}</h1>
              <Badge tone="ot">
                {info.done ? (info.lastResult === "success" ? "등록 완료" : "OT 종료") : `OT · ${info.current}차 진행 중`}
              </Badge>
            </div>
            {facts.length > 0 && <p className="mt-0.5 text-[13px] text-sub">{facts.join(" · ")}</p>}
            <p className="mt-1 text-[13px] text-sub">
              목표 {goalSet ? <span className="font-medium text-ink">{member.goal}</span> : <span className="text-muted">미설정</span>}
              {hasVal(member.pain) && <> · 불편 부위 <span className="font-medium text-ink">{member.pain}</span></>}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat icon={CalendarCheck2} label="최근 OT"
            value={lastOtDate ? shortDate(lastOtDate) : "아직 없음"}
            sub={lastFeedback ? `${lastFeedback.n}차 · ${resultName(lastFeedback.progress)}` : null} />
          <Stat icon={CalendarClock} label="다음 OT 예약"
            value={nextAppt ? dayLabel(nextAppt.start_at) : "예약 없음"}
            sub={nextAppt ? `${info.current}차` : "스케줄에서 잡아 주세요"}
            accent={Boolean(nextAppt && dayLabel(nextAppt.start_at)?.startsWith("오늘"))} />
          <div className="col-span-2">
          <Stat icon={Scale} label={inbody.latest ? `인바디 · ${shortDate(inbody.latest.measured_at)}${inbody.count > 1 ? ` · ${inbody.count}회 측정` : ""}` : "인바디"}
            value={inbody.latest
              ? [inbody.latest.weight != null && `체중 ${inbody.latest.weight}`, inbody.latest.skeletal_muscle != null && `골격근 ${inbody.latest.skeletal_muscle}`, inbody.latest.body_fat_pct != null && `체지방 ${inbody.latest.body_fat_pct}%`].filter(Boolean).join(" · ")
              : "아직 측정 없음"}
            sub={inbody.latest ? "누르면 분석" : "인바디 분석에서 입력해요"}
            href={otStepPath(member.id, "inbody", info.current)} />
          </div>
        </div>
      </Card>

      {/* 지금 할 일 */}
      {nextKey && (
        <Link href={otStepPath(member.id, nextKey, info.current)}
          className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-primary px-5 text-white no-underline shadow-sm transition hover:bg-primary-strong">
          <span>
            <span className="block text-[12px] text-white/80">지금 할 일</span>
            <span className="block text-[17px] font-bold tracking-[-0.02em]">{otStepLabel(nextKey, info.current)}</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}

      </div>

      {/* OT 진행 */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[15px] font-bold text-ink">OT 진행</h2>
          {info.canStartNext && (
            <Link href={otStepPath(member.id, "prep", info.current + 1)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12px] font-semibold text-sub transition hover:text-ink">
              <Plus className="h-3.5 w-3.5" /> {info.current + 1}차 OT 시작
            </Link>
          )}
        </div>
        <ul className="divide-y divide-line">
          {info.rounds.map((r) => {
            const now = r.n === info.current && !info.done;
            const go = !r.progress.prep ? "prep" : !r.progress.feedback ? "feedback" : "prep";
            return (
              <li key={r.n}>
                <Link href={otStepPath(member.id, go, r.n)}
                  className={`flex items-center gap-3 px-5 py-3.5 no-underline transition hover:bg-elevate ${now ? "bg-ot-soft/60" : ""}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${now ? "bg-ot text-white" : "bg-elevate text-sub"}`}>{r.n}차</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      <Step done={r.progress.prep}>준비</Step>
                      <Step done={r.progress.feedback}>피드백</Step>
                    </span>
                  </span>
                  {r.progress.result !== "none" || r.progress.next
                    ? <Badge tone={RESULT_TONE[r.progress.result] || "neutral"}>{resultName(r.progress)}</Badge>
                    : now && <span className="text-[12px] font-semibold text-ot-text">지금</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
    </div>
  );
}
