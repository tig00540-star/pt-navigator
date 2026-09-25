/* =========================================================================
   nav — 탭 번호 ↔ 주소 매핑 한 곳.

   ── 왜 번호를 남겨두나 ──
   ScheduleBoard·TodoTab·ChurnRiskToday·MyStats 등 여러 화면이 onSelect(id, toTab)로
   "이 회원의 이 탭으로 가라"를 숫자로 알려준다(탭 id는 DB·스펙 문서에도 박혀 있다).
   그 계약을 그대로 두고, 여기서 숫자를 주소로 옮긴다 — 호출부는 한 줄도 안 바뀐다.
   ========================================================================= */

export const OT_STEPS = [
  { step: "prep",     tab: 1, label: "1차 OT 준비" },
  { step: "feedback", tab: 5, label: "1차 피드백" },
  { step: "second",   tab: 2, label: "2차 OT 준비" },
];

export const PT_STEPS = [
  { step: "logs",    tab: 10, label: "회원자료" },
  { step: "write",   tab: 12, label: "자료남기기" },
  { step: "renewal", tab: 11, label: "재등록 준비" },
];

const OT_BY_TAB = Object.fromEntries(OT_STEPS.map((s) => [s.tab, s.step]));
const PT_BY_TAB = Object.fromEntries(PT_STEPS.map((s) => [s.tab, s.step]));

// 회원 워크플로우 탭인가(= 회원 id가 있어야 갈 수 있는 곳).
export const isMemberTab = (tab) => Boolean(OT_BY_TAB[tab] || PT_BY_TAB[tab]);

// step 문자열 → 탭 번호(없는 step이면 그 뷰의 첫 화면).
export function tabForStep(kind, step) {
  const list = kind === "pt" ? PT_STEPS : OT_STEPS;
  return list.find((s) => s.step === step)?.tab ?? list[0].tab;
}

// 탭 번호(또는 "hub") → 주소. 회원 탭인데 회원 id가 없으면 회원 목록으로 보낸다.
export function hrefFor(tab, memberId) {
  if (tab === "hub" || tab == null) return "/";
  if (tab === 9) return "/today";
  if (tab === 0) return "/members";
  if (tab === 8) return "/stats";
  if (tab === 7) return "/settings";
  if (OT_BY_TAB[tab]) return memberId ? `/ot/${memberId}/${OT_BY_TAB[tab]}` : "/members";
  if (PT_BY_TAB[tab]) return memberId ? `/pt/${memberId}/${PT_BY_TAB[tab]}` : "/members";
  return "/";
}

// 회원 뷰(viewFor 결과) → 그 회원의 기본 화면. 보관 회원도 PT 주소로 들어가고,
// 화면 쪽 MemberViewShell이 InactiveView로 갈아끼운다(기존 동작 그대로).
export function hrefForMember(memberId, view) {
  if (!memberId) return "/members";
  return view === "ot" ? `/ot/${memberId}/prep` : `/pt/${memberId}/logs`;
}

// 주소 → { section, memberId, step }. 하단바 활성 표시·상단 서브탭 판단에 쓴다.
export function routeInfo(pathname = "/") {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return { section: "hub" };
  const seg = p.split("/").filter(Boolean);
  const [head, a, b] = seg;
  if (head === "today") return { section: "today" };
  if (head === "stats") return { section: "stats" };
  if (head === "settings") return { section: "settings", sub: a || "me" };
  if (head === "members") return { section: "members", seg: a || "all" };
  if (head === "ot" || head === "pt") return { section: head, memberId: a || null, step: b || null };
  return { section: "hub" };
}

// 주소 → 하단바가 쓰는 탭 값(섹션 대표값).
export function tabForPath(pathname) {
  const { section, step } = routeInfo(pathname);
  if (section === "hub") return "hub";
  if (section === "today") return 9;
  if (section === "stats") return 8;
  if (section === "settings") return 7;
  if (section === "members") return 0;
  if (section === "ot") return tabForStep("ot", step);
  if (section === "pt") return tabForStep("pt", step);
  return "hub";
}
