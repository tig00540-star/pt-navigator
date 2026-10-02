"use client";

/* 회원 목록 화면 — 카드를 누르면 그 회원의 기본 화면(OT 준비 / 회원자료)으로 간다. */

import { useRouter } from "next/navigation";
import MemberList from "@/components/views/MemberList";
import { useMembers } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { hrefForMember } from "@/lib/nav";
import { viewFor } from "@/lib/memberStatus";

export default function MembersScreen({ segment = "all" }) {
  const router = useRouter();
  const { members, myUid } = useMembers();
  const { openMemberForm } = useAppUi();

  return (
    <>
    {/* 넓은 화면(lg~)은 왼쪽 회원 목록(AppChrome)이 있어서 여기선 안내만. */}
    <div className="hidden min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card text-center lg:flex">
      <p className="text-[16px] font-semibold text-ink">왼쪽에서 회원을 골라 주세요</p>
      <p className="mt-1 text-[13px] text-muted">회원을 누르면 이 자리에 대시보드가 열려요. 목록은 그대로 남아 있어요.</p>
    </div>
    <div className="lg:hidden">
    <MemberList
      key={segment} // 세그먼트가 바뀌면 필터 상태를 새로 시작
      initialSegment={segment}
      members={members}
      selectedId={null}
      uid={myUid}
      onAdd={openMemberForm}
      onSelect={(id) => {
        const m = members.find((x) => x.id === id);
        router.push(hrefForMember(id, m ? viewFor(m) : "ot"));
      }}
    />
    </div>
    </>
  );
}
