/* OT 회원 차수 화면 — /ot/{회원}/prep · inbody · feedback (뒤에 -2·-3 = 차수, 생략 = 지금 차수) */

import MemberScreen from "@/components/screens/MemberScreen";

export default async function OtMemberPage({ params }) {
  const { memberId, step } = await params;
  return <MemberScreen kind="ot" memberId={memberId} step={step} />;
}
