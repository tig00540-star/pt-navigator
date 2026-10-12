// 회원 전용 페이지(/m/{token}) 머리 — 홈 화면에 추가하면 이 회원 페이지로 열리게(2026-10-12).
//   사이트 전체 manifest(app/manifest.js)는 start_url "/"(트레이너 로그인)라, 회원이 홈 화면에 추가하면 엉뚱한 화면이 열렸다.
//   아이폰은 홈 화면에 추가한 앱에서만 폰 알림을 받을 수 있어서 회원 페이지 전용 manifest가 필요하다.
//   이 묶음 안에서만 manifest 링크를 바꾼다(트레이너 화면은 그대로 app/manifest.js).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }) {
  const { token } = await params;
  const t = String(token || "").toLowerCase();
  if (!UUID_RE.test(t)) return {};
  return {
    manifest: `/m/${t}/manifest`,
    appleWebApp: { capable: true, title: "오직 트레이너 회원", statusBarStyle: "default" },
    robots: { index: false, follow: false },
  };
}

export default function MemberLayout({ children }) {
  return children;
}
