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

export default function TodoTab({ members, onSelect }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">오늘 할일</h2>
        <p className="mt-0.5 text-xs text-muted">재접근·재등록 타이밍과 직접 적은 메모를 한 곳에서.</p>
      </div>

      {/* 자동 1~3 — 기존 위젯 재사용(회원 탭에서 이관). 탭 목적지만 감싸서 지정. */}
      <ReapproachToday members={members} onSelect={(id) => onSelect(id, 1)} />
      <RegisterDueToday members={members} onSelect={(id) => onSelect(id, 11)} />
      <RegisterReapproachToday members={members} onSelect={(id) => onSelect(id, 11)} />

      {/* 수동 메모 — 자동 아래. */}
      <TodoManual />
    </div>
  );
}
