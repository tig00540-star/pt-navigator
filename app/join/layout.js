// OT 신청서(/join/[code]) — 공개 페이지지만 검색에는 안 나오게(링크 · QR로만 연다).
export const metadata = {
  title: "OT 신청서 · 오직 트레이너",
  robots: { index: false, follow: false },
};

export default function JoinLayout({ children }) {
  return children;
}
