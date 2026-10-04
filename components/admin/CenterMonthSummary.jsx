"use client";
/* =========================================================================
   트레이너 탭 상단 '센터 요약' — 구 '실데이터 요약'(센터 클로징률+재등록률) 교체.
   ⚠️ 중복 정리(2026-09-29): '이달 신규 등록' 타일 제거 — 홈 매출 타일과 오늘의 운영 보고서
   '이달 등록' 타일이 이미 같은 숫자를 말한다. 누적 총 수업은 구 '클로징·재등록 상세 분석'
   안에 홀로 박혀 있던 카드를 여기로 흡수(사유 분포 차트들 사이에 있어 아무도 못 찾았다).
   남긴 기준: 이 탭(리더보드)의 분모가 되는 수치만 — 수업 수와 사람 수.
   admin이 로드한 배열 props로 파생만(fetch 0 · 마이그레이션 0 · RLS 0). hidden 제외는 컴포넌트 책임.
   ========================================================================= */
import { useMemo } from "react";
import { CalendarClock, UserCircle, Users } from "lucide-react";
import { otSessionsThisMonthByTrainer, sessionsThisMonthByTrainer, sessionsCount, otHeld } from "@/lib/memberStatus";
import Card from "@/components/ui/Card";

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}{label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-extrabold text-ink">{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-relaxed text-muted">{sub}</div>}
    </Card>
  );
}

export default function CenterMonthSummary({ members = [], otRows = [], logs = [], trainers = [], ym }) {
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(visible.filter((m) => m?.id).map((m) => [m.id, m.trainer_id ?? "unknown"])), [visible]);
  const otSess = useMemo(() => otSessionsThisMonthByTrainer(otRows, memberTrainer, ym), [otRows, memberTrainer, ym]);
  const ptSess = useMemo(() => sessionsThisMonthByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const otTotal = useMemo(() => [...otSess.values()].reduce((s, n) => s + n, 0), [otSess]);
  const ptTotal = useMemo(() => [...ptSess.values()].reduce((s, n) => s + n, 0), [ptSess]);
  // 누적도 '합계'와 같은 범위(OT+PT)로 — 예전엔 PT만 세서 옆 합계와 기준이 달랐다.
  const allTime = useMemo(
    () => sessionsCount(logs) + otRows.filter((r) => r && r.ot_round >= 1 && otHeld(r)).length,
    [logs, otRows]
  );
  const otMembers = useMemo(() => visible.filter((m) => m.status === "ot_active").length, [visible]);
  const ptMembers = useMemo(() => visible.filter((m) => m.status === "pt_active").length, [visible]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile icon={CalendarClock} label="이번 달 진행 수업" value={`OT ${otTotal} · PT ${ptTotal}`}
        sub={`합계 ${otTotal + ptTotal}회 · 센터 누적 ${allTime.toLocaleString("ko-KR")}회`} />
      <Tile icon={Users} label="활성 회원" value={`OT ${otMembers} · PT ${ptMembers}`}
        sub={`합계 ${otMembers + ptMembers}명`} />
      <Tile icon={UserCircle} label="트레이너" value={`${trainers.length}명`} sub="트레이너별 수치는 아래 리더보드" />
    </div>
  );
}
