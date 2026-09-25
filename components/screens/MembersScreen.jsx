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
  );
}
