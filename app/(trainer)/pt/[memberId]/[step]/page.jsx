/* PT 회원 화면 — /pt/{회원}/logs · write · renewal */

import MemberScreen from "@/components/screens/MemberScreen";

export default async function PtMemberPage({ params }) {
  const { memberId, step } = await params;
  return <MemberScreen kind="pt" memberId={memberId} step={step} />;
}
