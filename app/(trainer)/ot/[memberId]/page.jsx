/* OT 회원 대시보드 — /ot/{회원}. 회원을 누르면 처음 뜨는 화면(회원 정보·최근 OT·다음 예약·인바디·차수 진행). */

import MemberScreen from "@/components/screens/MemberScreen";

export default async function OtMemberHomePage({ params }) {
  const { memberId } = await params;
  return <MemberScreen kind="ot" memberId={memberId} step={null} />;
}
