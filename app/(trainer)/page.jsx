"use client";

/* 허브(홈) — 로그인 후 첫 화면. */

import { useRouter } from "next/navigation";
import TrainerHub from "@/components/views/TrainerHub";
import InstallHint from "@/components/app/InstallHint";
import { useMembers } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { useAccount } from "@/lib/useAccount";
import { hrefFor } from "@/lib/nav";
import { useIsWide } from "@/lib/useIsWide";
import WideHome from "@/components/home/WideHome";

export default function HubPage() {
  const router = useRouter();
  const { members, myUid } = useMembers();
  const wide = useIsWide(); // 태블릿 가로·PC는 '오늘 할 일'을 한 화면에 펼친 넓은 홈
  const { trainerName } = useAccount();
  const { openMemberForm } = useAppUi();

  if (wide) {
    return (
      <WideHome
        members={members}
        uid={myUid}
        trainerName={trainerName}
        go={(id, toTab) => router.push(hrefFor(toTab ?? 1, id))}
      />
    );
  }

  return (
    <div className="space-y-4">
      <InstallHint />
      <TrainerHub
        members={members}
        trainerName={trainerName}
        onGo={(tab, opts) => router.push(hrefFor(tab) + (opts?.segment ? `/${opts.segment}` : ""))}
        onAdd={openMemberForm}
      />
    </div>
  );
}
