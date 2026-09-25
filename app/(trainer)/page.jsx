"use client";

/* 허브(홈) — 로그인 후 첫 화면. */

import { useRouter } from "next/navigation";
import TrainerHub from "@/components/views/TrainerHub";
import { useMembers } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { useAccount } from "@/lib/useAccount";
import { hrefFor } from "@/lib/nav";

export default function HubPage() {
  const router = useRouter();
  const { members } = useMembers();
  const { trainerName } = useAccount();
  const { openMemberForm } = useAppUi();

  return (
    <TrainerHub
      members={members}
      trainerName={trainerName}
      onGo={(tab, opts) => router.push(hrefFor(tab) + (opts?.segment ? `/${opts.segment}` : ""))}
      onAdd={openMemberForm}
    />
  );
}
