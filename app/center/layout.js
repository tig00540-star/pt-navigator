// 센터 대표용 랜딩(/center) — 공유 미리보기(2026-10-07 · 트레이너용과 다른 제목 · 설명 · 이미지).
const DESC = "대표님은 열어 보기만 하세요. 아침 보고서 · 월간 결산 · 매출 · 정산 · 트레이너 성과를 앱이 모아 보고드려요. 트레이너 3인 + 대표 1인.";
export const metadata = {
  title: "오직 트레이너 센터 · 대표님은 열어 보기만 하세요",
  description: DESC,
  alternates: { canonical: "/center" },
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/center",
    title: "대표님은 열어 보기만 하세요. 숫자는 앱이 모아 보고드려요.",
    description: DESC,
    images: [{ url: "/og/center.png", width: 1200, height: 630, alt: "오직 트레이너 센터: 대표님은 열어 보기만 하세요. 숫자는 앱이 모아 보고드려요." }],
  },
  twitter: { card: "summary_large_image", images: ["/og/center.png"] },
};

export default function CenterLayout({ children }) {
  return children;
}
