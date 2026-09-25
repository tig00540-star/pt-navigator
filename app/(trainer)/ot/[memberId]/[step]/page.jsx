/* OT 회원 화면 — /ot/{회원}/prep · feedback · second */

import MemberScreen from "@/components/screens/MemberScreen";

export default async function OtMemberPage({ params }) {
  const { memberId, step } = await params;
  return <MemberScreen kind="ot" memberId={memberId} step={step} />;
}
