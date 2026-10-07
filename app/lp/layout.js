// 트레이너용 랜딩(/lp) — 페이지가 클라이언트 컴포넌트라 공유 미리보기(메타데이터)는 여기서(2026-10-07).
const DESC = "트레이너는 말만 하세요. 운동일지 · OT 대본 · 재등록 자료 · 회원 전용 페이지까지, 앱이 기록하고 앱이 정리해요. 써 보고 아니면 7일 안에 전액 환불.";
export const metadata = {
  title: "오직 트레이너 · 트레이너는 말만 하세요",
  description: DESC,
  alternates: { canonical: "/lp" },
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/lp",
    title: "트레이너는 말만 하세요. 기록하고 정리하는 건 앱이.",
    description: DESC,
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너: 트레이너는 말만 하세요. 기록하고 정리하는 건 앱이." }],
  },
  twitter: { card: "summary_large_image", images: ["/og/trainer.png"] },
};

export default function LpLayout({ children }) {
  return children;
}
