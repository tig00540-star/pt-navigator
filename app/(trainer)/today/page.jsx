"use client";

/* 오늘 — 스케줄 보드 + 이탈 위험 + 오늘 할 일. (구 탭 9) */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, User } from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import ScheduleBoard from "@/components/views/ScheduleBoard";
import ChurnRiskToday from "@/components/views/ChurnRiskToday";
import TodoTab from "@/components/views/TodoTab";
import { useMembers } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { hrefFor } from "@/lib/nav";

export default function TodayPage() {
  const router = useRouter();
  const { members, myUid } = useMembers();
  const { openMemberForm } = useAppUi();
  const scheduleRef = useRef(null);

  // 기존 계약 그대로 — 자식들은 (회원id, 탭번호)로 알려주고, 여기서 주소로 옮긴다.
  const go = (id, toTab) => router.push(hrefFor(toTab ?? 1, id));

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center shadow-sm">
        <User className="mx-auto h-8 w-8 text-line" />
        <h2 className="mt-3 text-base font-bold text-ink">첫 회원을 등록해 시작하세요</h2>
        <p className="mt-1 text-sm leading-relaxed text-sub">
          회원을 등록하면 오늘 스케줄·이탈 위험·할 일이 여기 채워져요.
        </p>
        <Button variant="primary" size="sm" onClick={openMemberForm} className="mt-4">
          첫 회원 등록하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div ref={scheduleRef} className="scroll-mt-20">
        <Eyebrow icon={CalendarDays}>오늘 스케줄</Eyebrow>
        <ScheduleBoard members={members} onSelect={go} />
      </div>
      <div className="border-t border-line" />
      <ChurnRiskToday members={members} onSelect={go} />
      <TodoTab
        members={members}
        uid={myUid}
        onSelect={(id, toTab) => {
          // 같은 화면(오늘)으로 보내는 항목은 이동 대신 스케줄 섹션으로 스크롤.
          if (toTab === 9) scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          else go(id, toTab);
        }}
      />
    </div>
  );
}
