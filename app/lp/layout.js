// 트레이너용 랜딩(/lp) — 페이지가 클라이언트 컴포넌트라 공유 미리보기(메타데이터)는 여기서(2026-10-07).
const DESC = "오직 트레이너는 트레이너만을 위한 앱이에요. 운동일지 · OT 대본 · 재등록 자료 · 회원 관리 · 실적까지, 수업 밖 업무를 앱이 알아서 해 드려요.";
export const metadata = {
  title: "오직 트레이너 · 트레이너만을 위한 앱",
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/",
    title: "오직 트레이너 · 트레이너만을 위한 앱",
    description: DESC,
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너: 트레이너만을 위한 앱. 수업 밖 일은 앱이 알아서." }],
  },
  twitter: { card: "summary_large_image", images: ["/og/trainer.png"] },
};

export default function LpLayout({ children }) {
  return children;
}
