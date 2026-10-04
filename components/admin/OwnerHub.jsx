"use client";

/* =========================================================================
   OwnerHub — 대표 화면 폰 홈(2026-10-05 · 트레이너 홈과 같은 모양).
   인사 → 오늘 카드(센터 오늘 수업 · 신규 OT · 이달 매출 · 목표) + 보고서 바로가기 → 바로가기 칸.
   숫자는 admin이 이미 로드한 배열에서 파생만(DB 조회 0 · 같은 함수 = 보고서 · 매출 탭과 같은 숫자).
   ⚠️ hidden(환불·소프트삭제) 필터는 컴포넌트 책임 — 여기서 걸러 넘긴다.
   넓은 화면(lg~)은 OwnerWideHome.
   ========================================================================= */

import { useMemo } from "react";
import { ArrowRight, CalendarDays, ChevronRight, LayoutDashboard, Receipt, Repeat2, Settings2, Users, Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import { manwon } from "@/lib/format";
import { ownerBriefing, revenueCompositionInMonth, otFunnel, reregisterStats, viewFor } from "@/lib/memberStatus";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const ymdKST = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, value, sub, accent = false }) {
  return (
    <div className="rounded-xl bg-elevate px-3.5 py-3">
      <span className="block text-[12px] text-muted">{label}</span>
      <span className={`mt-0.5 block text-[18px] font-bold tracking-[-0.02em] ${accent ? "text-primary-strong" : "text-ink"}`}>{value}</span>
      {sub && <span className="block truncate text-[12px] text-sub">{sub}</span>}
    </div>
  );
}

function Tile({ icon: Icon, title, desc, tone, onClick }) {
  return (
    <Card as="button" interactive padding="md" onClick={onClick}
      className="flex min-h-[112px] flex-col items-start justify-between text-left active:scale-[0.98]">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="mt-3 block">
        <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
      </span>
    </Card>
  );
}

export default function OwnerHub({
  members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [],
  trainers = [], ym, centerName, onGoTab,
}) {
  const visible = useMemo(() => members.filter((m) => !m.hidden), [members]);
  const byId = useMemo(() => new Map(visible.map((m) => [m.id, m])), [visible]);
  const now = new Date();
  const nowISO = now.toISOString();

  const brief = ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, ym, nowISO });
  const top = brief.slice(0, 3);
  const atRisk = top.reduce((s, c) => s + (c.impact || 0), 0);

  const rev = revenueCompositionInMonth(contracts, ym);
  const target = goals.filter((g) => g && g.ym === ym && g.target_revenue != null).reduce((s, g) => s + (g.target_revenue || 0), 0) || null;
  const funnel = otFunnel(visible, otRows);
  const rereg = reregisterStats(contracts);
  const convRate = funnel.intake ? funnel.confirmed / funnel.intake : null;

  // 오늘(KST) 센터 전체 예약 · 취소 제외.
  const today = ymdKST(now);
  const todays = appts.filter((a) => a && a.status !== "canceled" && a.start_at && ymdKST(new Date(a.start_at)) === today);
  const done = todays.filter((a) => a.status === "done").length;
  const newOt = todays.filter((a) => { const m = byId.get(a.user_id); return Boolean(m && viewFor(m) === "ot"); }).length;
  const activeTrainers = trainers.filter((t) => t.active !== false).length;

  return (
    <div className="space-y-4 break-keep text-pretty">
      <div>
        <p className="text-[13px] text-muted">{now.getMonth() + 1}월 {now.getDate()}일 {WEEKDAY[now.getDay()]}요일</p>
        <h1 className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">{centerName || "내 센터"} 대표님</h1>
      </div>

      {/* 오늘 — 숫자 4칸 + 보고서 바로가기 */}
      <Card as="section">
        <SectionTitle icon={CalendarDays} aside={
          <button type="button" onClick={() => onGoTab("schedule")} className="inline-flex min-h-[32px] items-center gap-0.5 font-semibold text-sub hover:text-ink">
            스케줄 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }>오늘</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="오늘 수업" value={`${todays.length}건`} sub={todays.length ? `완료 ${done} · 남음 ${todays.length - done}` : "예약 없음"} />
          <Stat label="오늘 신규 OT" value={`${newOt}명`} accent={newOt > 0} sub={newOt ? "등록 기회" : "없음"} />
          <Stat label="이달 매출" value={manwon(rev.net)} sub={target ? `목표의 ${pct(rev.net / target)}` : `신규 ${rev.cntNew} · 재등록 ${rev.cntRe}건`} />
          <Stat label="등록률 · 재등록률" value={`${pct(convRate)} · ${pct(rereg.rate)}`} sub="누적 기준" />
        </div>
        <button type="button" onClick={() => onGoTab("briefing")}
          className="mt-3 flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl bg-primary px-4 text-left text-white transition hover:bg-primary-strong active:scale-[0.99]">
          <span className="min-w-0">
            <span className="block text-[12px] text-white/80">
              {top.length ? `지금 손쓰면 지킬 수 있는 매출 약 ${manwon(atRisk)}` : "오늘은 급한 건이 없어요"}
            </span>
            <span className="block truncate text-[16px] font-bold tracking-[-0.02em]">오늘 보고서 보기{top.length ? ` · 챙길 것 ${top.length}건` : ""}</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Wallet} title="매출" desc={`이달 ${manwon(rev.net)}`} tone="bg-primary-soft text-primary-strong" onClick={() => onGoTab("revenue")} />
        <Tile icon={Receipt} title="정산" desc="매출 · 지출 · 순이익" tone="bg-primary-soft text-primary-strong" onClick={() => onGoTab("settle")} />
        <Tile icon={Users} title="트레이너" desc={activeTrainers ? `${activeTrainers}명 · 성과와 급여` : "아직 초대 전이에요"} tone="bg-admin-soft text-admin-text" onClick={() => onGoTab("perf")} />
        <Tile icon={Repeat2} title="등록 · 이탈" desc={`OT 회원 ${funnel.intake}명`} tone="bg-pt-soft text-pt-text" onClick={() => onGoTab("flow")} />
        <Tile icon={Settings2} title="운영" desc="스케줄 · 초대 · 공지" tone="bg-elevate text-sub" onClick={() => onGoTab("schedule")} />
        <Tile icon={LayoutDashboard} title="한눈에" desc="센터 지표 한 화면" tone="bg-elevate text-sub" onClick={() => onGoTab("overview")} />
      </div>
    </div>
  );
}
