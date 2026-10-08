"use client";

/* 회원 전용 페이지 '내 PT' 카드(2026-10-03) — 남은 수업 · 다음 수업 · 목표 로드맵.
   읽기 경로(회원 세션 · 본인 것만 · docs/migrations/2026-10-03-member-pt-status.sql):
     member_contract(횟수 · 진행 수만 · 금액 없음) · member_next_appt(앞으로 잡힌 예약 시각) · member_roadmap_view(트레이너가 '보이기' 켠 것만).
   남은 수업 = 트레이너 앱 remainingSessions와 같은 규칙(취소 제외 · 노쇼 포함 차감 · 유료 먼저 · 인계 계약 제외) · 활성 = 남은 게 있는 가장 오래된 계약.
   표시(대표 결정 2026-10-03): 합계는 크게, 유료/서비스 나눔은 작게. 남은 회수 재촉 문구는 넣지 않는다.
   표가 아직 없거나(SQL 전) 실패하면 카드가 조용히 숨는다(회원 화면을 막지 않는다).
   2026-10-06 홈 정리: children(= 수업 예약 · BookingCard embedded)을 받으면 '다음 수업' 줄 대신 그걸 넣는다(카드 하나로).
   로드맵은 접어 둔다(한 줄 '지금 N단계' → 누르면 펼침). */

import { useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, Dumbbell, Flag } from "lucide-react";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function apptLabel(iso) {
  const k = new Date(Date.parse(iso) + 9 * 3600000);
  const h = k.getUTCHours(), m = k.getUTCMinutes();
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${DAYS[k.getUTCDay()]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}
const remainOf = (c) => {
  if (c.handed_over) return { paid: 0, service: 0, total: 0 };
  const paidTotal = c.sessions_total ?? 0, svcTotal = c.service_sessions ?? 0, used = c.used ?? 0;
  const paid = Math.max(0, paidTotal - used);
  const service = Math.max(0, paidTotal + svcTotal - used) - paid;
  return { paid, service, total: paid + service };
};

export default function MyPtCard({ supabase, children = null }) {
  const [data, setData] = useState(null);
  const [openStage, setOpenStage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const [c, a, r] = await Promise.all([
        supabase.from("member_contract").select("*"),
        supabase.from("member_next_appt").select("start_at"),
        supabase.from("member_roadmap_view").select("*").maybeSingle(),
      ]);
      if (c.error) { console.error("내 PT 계약 조회 실패", c.error); return; }
      if (!cancelled) setData({ contracts: c.data || [], appts: a.error ? [] : a.data || [], roadmap: r.error ? null : r.data || null });
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  if (!data) return null;
  const withRem = data.contracts.map((c) => ({ ...c, rem: remainOf(c) }))
    .sort((x, y) => String(x.started_at ?? "").localeCompare(String(y.started_at ?? "")));
  const active = withRem.find((c) => c.rem.total > 0) || null;
  const queued = active ? withRem.filter((c) => c.id !== active.id && c.rem.total > 0 && String(c.started_at) > String(active.started_at)) : [];
  const queuedTotal = queued.reduce((s, c) => s + c.rem.total, 0);
  const rm = data.roadmap && Array.isArray(data.roadmap.stages) && data.roadmap.stages.length ? data.roadmap : null;
  if (!active && !rm && !data.appts.length && !children) return null;

  const total = active ? (active.sessions_total ?? 0) + (active.service_sessions ?? 0) : 0;
  const done = active ? Math.min(total, active.used ?? 0) : 0;
  const next = data.appts[0]?.start_at || null;
  const cur = rm ? Math.min(Math.max(rm.current ?? 0, 0), rm.stages.length - 1) : 0;
  const shown = openStage ?? cur;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm break-keep text-pretty">
      <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold text-ink">
        <Dumbbell className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 내 PT
      </h2>

      {active ? (
        <div>
          <p className="text-[13px] text-sub">남은 수업</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold tracking-[-0.03em] text-ink">{active.rem.total}회</span>
            <span className="text-[14px] text-muted">/ {total}회</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevate" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted">
            {done}회 진행 · 유료 {active.rem.paid} · 서비스 {active.rem.service}
            {queuedTotal > 0 ? ` · 다음 계약 ${queuedTotal}회 대기` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[14px] text-sub">진행 중인 PT 계약이 없어요.</p>
      )}

      {children ? <div className="mt-4">{children}</div> : (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-elevate px-3.5 py-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
          <span className="text-[13px] text-sub">다음 수업</span>
          <span className="ml-auto text-[14px] font-semibold text-ink">{next ? apptLabel(next) : "트레이너와 잡아 주세요"}</span>
        </div>
      )}

      {rm && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 text-[14px] font-bold text-ink [&::-webkit-details-marker]:hidden">
            <Flag className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" /> 나의 목표 로드맵
            <span className="min-w-0 truncate text-[13px] font-normal text-sub">· 지금 {cur + 1}단계 {rm.stages[cur]?.title || ""}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          {rm.title && <p className="m-0 mb-2 mt-1 text-[13px] text-sub">{rm.title}</p>}
          <ol className="m-0 mt-2 list-none p-0">
            {rm.stages.map((s, i) => {
              const state = i < cur ? "done" : i === cur ? "now" : "next";
              const open = shown === i && s.detail;
              return (
                <li key={i} className="relative pb-1 pl-8 last:pb-0">
                  {i < rm.stages.length - 1 && <span aria-hidden="true" className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 ${i < cur ? "bg-primary" : "bg-line"}`} />}
                  <span aria-hidden="true" className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    state === "done" ? "bg-primary text-white" : state === "now" ? "border-2 border-primary bg-card text-primary-strong" : "border border-line bg-card text-muted"}`}>
                    {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <button type="button" onClick={() => setOpenStage(shown === i ? -1 : i)} aria-expanded={Boolean(open)}
                    className="flex min-h-[36px] w-full items-center gap-2 text-left">
                    <span className={`text-[15px] ${state === "now" ? "font-bold text-ink" : state === "done" ? "font-medium text-sub" : "text-sub"}`}>{s.title}</span>
                    {state === "now" && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-semibold text-primary-strong">지금</span>}
                    {s.detail && <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
                  </button>
                  {open && <p className="mb-2 rounded-lg bg-elevate px-3 py-2 text-[13px] leading-relaxed text-ink">{s.detail}</p>}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
