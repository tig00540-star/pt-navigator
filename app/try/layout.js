// 기능 체험(/try) — 가입 없이 트레이너 폰 · 회원 폰을 나란히 눌러 보는 페이지(2026-10-06).
export const metadata = {
  title: "직접 눌러 보기 · 오직 트레이너",
  description: "가입 없이 QR OT 신청 · 회원 이벤트 · 수업 예약 요청 · 운동일지 서명을 트레이너 폰과 회원 폰으로 직접 해 보세요.",
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/try", title: "직접 눌러 보기 · 오직 트레이너", description: "가입 없이 QR OT 신청 · 회원 이벤트 · 수업 예약 요청 · 운동일지 서명을 트레이너 폰과 회원 폰으로 직접 해 보세요.",
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너" }],
  },
};

export default function TryLayout({ children }) {
  return children;
}
