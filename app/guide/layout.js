// 사용 가이드(/guide) — 공개 주소(AuthGate 우회). 앞 두 장은 누구나, 나머지는 가입(로그인)한 사람만(page.jsx).
const TITLE = "사용 가이드 · 오직 트레이너";
const DESC = "회원 등록부터 OT 대본, PT 회원 관리, 재등록까지 오직 트레이너를 쓰는 방법을 순서대로 정리했어요.";

export const metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "오직 트레이너", url: "/guide", title: TITLE, description: DESC,
    images: [{ url: "/og/trainer.png", width: 1200, height: 630, alt: "오직 트레이너 사용 가이드" }],
  },
};

export default function GuideLayout({ children }) {
  return children;
}
