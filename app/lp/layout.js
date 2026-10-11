// 트레이너용 랜딩(/lp) — 페이지가 클라이언트 컴포넌트라 공유 미리보기(메타데이터)는 여기서(2026-10-07).
// 2026-10-12 대표: 검색어(PT 회원관리 · AI 운동일지 · 재등록 상담)를 제목에 · 설명은 '말로 기록 → 관리 · 상담 준비'. /lp에만 적용(다른 페이지는 app/layout.js 값 그대로).
const TITLE = "오직트레이너 | PT 회원관리·AI 운동일지·재등록 상담 앱";
const DESC = "수업일지는 말로 간편하게 기록하세요. 회원별 운동 기록을 바탕으로 회원관리와 OT·재등록 상담 준비를 돕습니다. 트레이너는 수업에 더 집중하세요.";
export const metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/lp" },   // 2026-10-12 검색용 대표 랜딩 = /lp("/"는 앱 홈이라 초기 HTML이 비어 있음)
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/lp",
    title: TITLE,
    description: DESC,
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너: 트레이너만을 위한 앱. 수업 밖 일은 앱이 알아서." }],
  },
  twitter: { card: "summary_large_image", images: ["/og/trainer.png"] },
};

export default function LpLayout({ children }) {
  return children;
}
