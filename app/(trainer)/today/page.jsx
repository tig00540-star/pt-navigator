"use client";

/* 오늘 — 스케줄 보드 + 이탈 위험 + 오늘 할 일. (구 탭 9)
   2026-10-03: OT · PT 회원 화면과 같은 모양(SectionTitle · 흰 카드). 이탈 위험도 '오늘 할 일'과 같이 내 담당만
   (대표가 센터 전체를 보는 곳은 대표 화면 '등록·이탈'). 회원 목록을 다 불러오기 전엔 '첫 회원 등록' 안내를 띄우지 않는다.
   2026-10-19 대표: 회원이 0명이어도 스케줄은 그대로 보인다(개인 일정 · 첫 OT 예약을 먼저 잡는 트레이너도 있다) — 안내는 위에 한 장만. */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, User } from "lucide-react";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import ScheduleBoard from "@/components/views/ScheduleBoard";
import ChurnRiskToday from "@/components/views/ChurnRiskToday";
import TodoTab from "@/components/views/TodoTab";
import { useMembers } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { hrefFor } from "@/lib/nav";

export default function TodayPage() {
  const router = useRouter();
  const { members, myUid, ready } = useMembers();
  const { openMemberForm } = useAppUi();
  const scheduleRef = useRef(null);

  // 기존 계약 그대로 — 자식들은 (회원id, 탭번호)로 알려주고, 여기서 주소로 옮긴다.
  const go = (id, toTab) => router.push(hrefFor(toTab ?? 1, id));

  if (!ready && members.length === 0) return <p className="py-16 text-center text-[13px] text-muted">불러오는 중…</p>;

  const empty = members.length === 0;

  return (
    <>
    {empty && (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-card px-4 py-3.5 shadow-sm">
        <User className="h-6 w-6 shrink-0 text-muted" aria-hidden="true" />
        <p className="m-0 min-w-0 flex-1 text-[14px] leading-relaxed text-sub break-keep">
          <b className="text-ink">아직 회원이 없어요.</b> 스케줄 빈칸을 누르면 개인 일정이나 첫 OT를 바로 넣을 수 있어요.
        </p>
        <span className="flex shrink-0 gap-2">
          <Button variant="primary" size="sm" onClick={openMemberForm}>회원 등록</Button>
          <Link href="/settings/me" className="inline-flex min-h-[36px] items-center rounded-lg border border-line bg-elevate px-3 text-[13px] font-semibold text-sub no-underline hover:text-ink">OT 신청 QR</Link>
        </span>
      </div>
    )}
    {/* 넓은 화면(lg~): 왼쪽 스케줄 | 오른쪽 이탈 위험·할 일. 폰은 위아래 한 줄. */}
    <div className="space-y-8 break-keep text-pretty lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div ref={scheduleRef} className="scroll-mt-20">
        <SectionTitle icon={CalendarDays}>스케줄</SectionTitle>
        <ScheduleBoard members={members} onSelect={go} />
      </div>
      <div className="border-t border-line lg:hidden" />
      <div className="space-y-8">
      <ChurnRiskToday members={myUid ? members.filter((m) => m.trainer_id === myUid) : members} onSelect={go} />
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
    </div>
    </>
  );
}
