"use client";

/* 내 실적 — 등록·재등록 현황. (구 탭 8) */

import { useRouter } from "next/navigation";
import MyStats from "@/components/views/MyStats";
import { useMembers } from "@/components/app/MembersProvider";
import { useAccount } from "@/lib/useAccount";
import { hrefForMember } from "@/lib/nav";
import { viewFor } from "@/lib/memberStatus";

export default function StatsPage() {
  const router = useRouter();
  const { members } = useMembers();
  const { isSolo } = useAccount();

  return (
    <MyStats
      members={members}
      isSolo={isSolo}
      onSelect={(id) => {
        const m = members.find((x) => x.id === id);
        router.push(m ? hrefForMember(id, viewFor(m)) : "/members");
      }}
    />
  );
}
