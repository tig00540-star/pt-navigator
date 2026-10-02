/* 세일즈북 — /salesbook(발표 자료 · 회원 누르면 바로 발표) · /salesbook/cases(사례 보관함). 위 칸 탭은 AppChrome 헤더. */

import DeckList from "@/components/salesbook/DeckList";
import CaseLibrary from "@/components/salesbook/CaseLibrary";

export default async function SalesbookPage({ params }) {
  const { sub } = await params;
  const first = Array.isArray(sub) ? sub[0] : sub;
  return first === "cases" ? <CaseLibrary /> : <DeckList />;
}
