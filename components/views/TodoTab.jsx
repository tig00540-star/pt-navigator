"use client";
/* =========================================================================
   기능2 할일 — 트레이너 "오늘 할일" 통합 탭.
   흩어져 있던 자동 위젯(재접근·재등록)을 여기로 흡수 + (C2)수동 메모 + (C3)미확정 클로징·미처리 예약.
   onSelect(user_id, toTab) = 회원 선택 + 해당 탭 이동(page.jsx가 setSelectedId+setTab 수행).
   C1 = 골격 + 자동 1~3(기존 위젯 재사용·탭 목적지 매핑). 각 위젯은 빈배열이면 스스로 null.
   ========================================================================= */
import ReapproachToday from "@/components/views/ReapproachToday";
import RegisterDueToday from "@/components/views/RegisterDueToday";
import RegisterReapproachToday from "@/components/views/RegisterReapproachToday";
import TodoManual from "@/components/views/TodoManual";
import UnclosedClosingToday from "@/components/views/UnclosedClosingToday";
import PastDueAppointments from "@/components/views/PastDueAppointments";
import NoNextBookingToday from "@/components/views/NoNextBookingToday";
import UnconfirmedConfirmToday from "@/components/views/UnconfirmedConfirmToday";
import OwnerFeedbackToday from "@/components/views/OwnerFeedbackToday";
import OtApplicationToday from "@/components/views/OtApplicationToday";
import ApptRequestToday from "@/components/views/ApptRequestToday";
import PayrollConfirmedToday from "@/components/views/PayrollConfirmedToday";
import InbodyDueToday from "@/components/views/InbodyDueToday";
import RoutineRequestToday from "@/components/views/RoutineRequestToday";
import PtEndToday from "@/components/views/PtEndToday";
import SectionTitle from "@/components/ui/SectionTitle";
import { ListChecks } from "lucide-react";

export default function TodoTab({ members, uid, onSelect }) {
  // 원장은 계정 전체 회원/예약이 RLS로 넘어옴 → 할일은 '내 담당'만(개인 뷰). 트레이너는 이미 본인 것뿐이라 무변.
  const scoped = uid ? (members || []).filter((m) => m.trainer_id === uid) : (members || []);
  return (
    <div>
      <div className="mb-4">
        <SectionTitle icon={ListChecks} className="mb-0">오늘 할 일</SectionTitle>
        <p className="mt-0.5 text-[13px] text-sub">다시 연락할 회원 · 재등록 타이밍 · 직접 적은 메모를 한 곳에서 봐요.</p>
      </div>

      {/* 새 OT 회원(OT 신청서) — 맨 위 */}
      <OtApplicationToday uid={uid} />
      <ApptRequestToday members={members} uid={uid} />
      {/* 대표 피드백(아침 보고서에서 대표가 남긴 것) */}
      <OwnerFeedbackToday members={members} uid={uid} />
      <PayrollConfirmedToday uid={uid} />
      <RoutineRequestToday members={scoped} onSelect={(id) => onSelect(id, 10)} />

      {/* 자동 1~3 — 기존 위젯 재사용(회원 탭에서 이관). 탭 목적지만 감싸서 지정. */}
      <ReapproachToday members={scoped} onSelect={(id) => onSelect(id, 1)} />
      <RegisterDueToday members={scoped} onSelect={(id) => onSelect(id, 11)} />
      <RegisterReapproachToday members={scoped} onSelect={(id) => onSelect(id, 11)} />
      <PtEndToday members={scoped} onSelect={(id) => onSelect(id, 11)} />
      <InbodyDueToday members={scoped} onSelect={(id) => onSelect(id, 12)} />

      {/* 자동 4~5 — 신규 파생 섹션(미확정 클로징=2차 OT, 미처리 예약=스케줄) */}
      <UnclosedClosingToday members={scoped} onSelect={(id) => onSelect(id, 5)} />
      <PastDueAppointments members={scoped} uid={uid} onSelect={(id) => onSelect(id, 9)} />
      <NoNextBookingToday members={scoped} uid={uid} onSelect={(id) => onSelect(id, 9)} />

      {/* 자동 6 — 운동일지 확인 요청(회원의 내용이 달라요 + 오늘 오는 회원 미확인 · 회원자료 열어 고치기/void) */}
      <UnconfirmedConfirmToday members={scoped} uid={uid} onSelect={(id) => onSelect(id, 10)} />

      {/* 수동 메모 — 자동 아래. */}
      <TodoManual />
    </div>
  );
}
