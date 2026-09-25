"use client";

/* =========================================================================
   MemberScreen — 회원 한 명의 워크플로우 화면(OT 3단계 / PT 3단계).

   구 page.jsx의 회원 영역을 그대로 옮긴 것:
   PtConfirmBanner(OT 클로징 후 등록 확정) → 정보 수정 → MemberViewShell(뷰 스위치).
   회원 전환은 주소가 바뀌어 화면이 통째로 다시 뜨므로 이전 회원 잔상이 남지 않는다.
   ========================================================================= */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useMembers, DEMO_MEMBER } from "@/components/app/MembersProvider";
import { useAppUi } from "@/components/app/AppChrome";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import { tabForStep, hrefForMember } from "@/lib/nav";
import MemberViewShell from "@/components/views/MemberViewShell";
import PtConfirmBanner from "@/components/views/PtConfirmBanner";
import FirstOTTab from "@/components/tabs/FirstOTTab";
import SecondOTTab from "@/components/tabs/SecondOTTab";
import ObservationTab from "@/components/tabs/ObservationTab";

export default function MemberScreen({ kind, memberId, step }) {
  const router = useRouter();
  const { members, ready, onMemberPatch, loadMembers, confirmPtActive, closingVersion, bumpClosingVersion } = useMembers();
  const { openMemberEdit } = useAppUi();

  const found = members.find((m) => m.id === memberId) || null;
  // 데모(키 미설정)에서는 예시 회원으로 화면을 보여준다 — 실서비스에선 아래 effect가 목록으로 되돌린다.
  const member = found || (!supabase ? DEMO_MEMBER : null);
  const tab = tabForStep(kind, step);
  const view = member ? viewFor(member) : null;

  // 없는 회원(삭제·환불·남의 링크)이면 목록으로. 첫 조회가 끝나기 전에는 판단하지 않는다.
  useEffect(() => {
    if (ready && !member) router.replace("/members");
  }, [ready, member, router]);

  // 주소의 종류(ot/pt)와 회원의 실제 뷰가 어긋나면 맞는 쪽으로 — 등록 확정 직후 등.
  useEffect(() => {
    if (!member) return;
    const shouldBePt = view === "pt" || view === "inactive";
    if (shouldBePt && kind === "ot") router.replace(hrefForMember(member.id, view));
    if (!shouldBePt && kind === "pt") router.replace(hrefForMember(member.id, view));
  }, [member, view, kind, router]);

  if (!member) {
    return <div className="flex items-center justify-center py-16 text-sm text-sub">불러오는 중…</div>;
  }

  return (
    <>
      {/* OT 회원 + 클로징 성공 시 '수동 PT 등록 확정' 배너(자체 게이트) */}
      {view === "ot" && (
        <PtConfirmBanner
          member={member}
          onConfirm={(contractInput) => confirmPtActive(member, contractInput)}
          closingVersion={closingVersion}
        />
      )}

      <div className="mb-3 flex justify-end">
        <button
          onClick={() => openMemberEdit(member.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-sub transition hover:text-primary-strong"
        >
          <Pencil className="h-3.5 w-3.5" /> 정보 수정
        </button>
      </div>

      <MemberViewShell
        member={member}
        tab={tab}
        onGoList={() => router.push("/members")}
        showList={false}
        onMemberPatch={onMemberPatch}
        onMembersChanged={loadMembers}
      >
        {/* 'ot' 뷰일 때만 아래가 쓰인다(PT·보관은 MemberViewShell이 자체 화면으로 교체). */}
        {tab === 1 && <FirstOTTab member={member} />}
        {tab === 5 && <ObservationTab member={member} onClosingSaved={bumpClosingVersion} />}
        {tab === 2 && <SecondOTTab member={member} onClosingSaved={bumpClosingVersion} />}
      </MemberViewShell>
    </>
  );
}
