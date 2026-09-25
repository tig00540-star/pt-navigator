/* 회원 목록 — /members(전체) · /members/ot · /members/pt · /members/inactive.
   params는 Promise라 서버에서 풀어 클라이언트 화면에 넘긴다(Next 16). */

import MembersScreen from "@/components/screens/MembersScreen";

const ALLOWED = ["all", "ot", "pt", "inactive"];

export default async function MembersPage({ params }) {
  const { seg } = await params;
  const first = Array.isArray(seg) ? seg[0] : seg;
  return <MembersScreen segment={ALLOWED.includes(first) ? first : "all"} />;
}
