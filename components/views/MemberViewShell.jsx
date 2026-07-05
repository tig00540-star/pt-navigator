"use client";

/* =========================================================================
   ② member_status — 뷰 스위치 shell.
   분기는 viewFor(member) 로만(매핑 규칙은 lib/memberStatus 모듈에만; status 직접 비교 X).
   'ot'는 기존 6탭(page.jsx의 MemberListTab·CRMTab 등에 의존)이라 children으로 주입 —
   OT 콘텐츠는 page.jsx에 그대로 두고 shell이 감싸기만 한다(회귀 최소).
   lazy 가능한 구조: PTView·InactiveView는 별도 컴포넌트라 필요 시 next/dynamic으로 교체 가능(optional).
   ========================================================================= */

import { viewFor } from "@/lib/memberStatus";
import PTView from "@/components/views/PTView";
import InactiveView from "@/components/views/InactiveView";

export default function MemberViewShell({ member, children }) {
  const view = viewFor(member);
  if (view === "pt") return <PTView member={member} />;
  if (view === "inactive") return <InactiveView member={member} />;
  return children; // 'ot' — 기존 6탭 그대로
}
