// 1분 진단(/check) — 트레이너 · 대표가 예/아니요로 답하면 앱이 챙길 것을 한 장으로(2026-10-08).
export const metadata = {
  title: "1분 무료 진단 · 오직 트레이너",
  description: "트레이너 · 센터 대표 1분 무료 진단. 예/아니요로 답하면 수업 밖 일에서 놓치고 있는 것과 앱이 줄여 줄 시간을 한 장으로 정리해 드려요.",
  alternates: { canonical: "/check" },
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/check", title: "1분 무료 진단 · 오직 트레이너",
    description: "예/아니요로 답하면 놓치고 있는 것과 앱이 줄여 줄 시간을 한 장으로 정리해 드려요.",
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너" }],
  },
};

export default function CheckLayout({ children }) {
  return children;
}
