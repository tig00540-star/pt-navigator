"use client";
/* =========================================================================
   트레이너 탭 상단 '이번 달 센터 요약' — 구 '실데이터 요약'(센터 클로징률+재등록률) 교체.
   그 두 %는 OT회원 현황·PT회원 현황 탭이 소유(중복 제거) → 여기선 트레이너 관점 실물 수치.
   admin이 로드한 배열 props로 파생만(fetch 0 · 마이그레이션 0 · RLS 0). hidden 제외는 컴포넌트 책임.
   ========================================================================= */
import { useMemo } from "react";
import { CalendarClock, UserPlus, Users } from "lucide-react";
import { otSessionsThisMonthByTrainer, sessionsThisMonthByTrainer, revenueCompositionInMonth } from "@/lib/memberStatus";
import Card from "@/components/ui/Card";

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-1.5 text-[11px] tracking-label-ko text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}{label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-extrabold text-ink">{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-relaxed text-muted">{sub}</div>}
    </Card>
  );
}

export default function CenterMonthSummary({ members = [], otRows = [], logs = [], contracts = [], trainers = [], ym }) {
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(visible.filter((m) => m?.id).map((m) => [m.id, m.trainer_id ?? "unknown"])), [visible]);
  const otSess = useMemo(() => otSessionsThisMonthByTrainer(otRows, memberTrainer, ym), [otRows, memberTrainer, ym]);
  const ptSess = useMemo(() => sessionsThisMonthByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const otTotal = useMemo(() => [...otSess.values()].reduce((s, n) => s + n, 0), [otSess]);
  const ptTotal = useMemo(() => [...ptSess.values()].reduce((s, n) => s + n, 0), [ptSess]);
  const comp = useMemo(() => revenueCompositionInMonth(contracts, ym), [contracts, ym]);
  const activeMembers = useMemo(() => visible.filter((m) => m.status === "ot_active" || m.status === "pt_active").length, [visible]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile icon={CalendarClock} label="이번 달 진행 수업" value={`OT ${otTotal} · PT ${ptTotal}`} sub={`합계 ${otTotal + ptTotal}회 · 실제 진행 기록`} />
      <Tile icon={UserPlus} label="이달 신규 등록" value={`${comp.cntNew}건`} sub={comp.cntRe ? `재등록 ${comp.cntRe}건 별도` : "신규 계약 기준"} />
      <Tile icon={Users} label="트레이너 / 활성 회원" value={`${trainers.length} / ${activeMembers}`} sub="담당 활성(OT+PT) 회원" />
    </div>
  );
}
