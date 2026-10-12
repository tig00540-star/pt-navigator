// 회원 전용 페이지 manifest(2026-10-12) — 홈 화면에 추가하면 /m/{token}으로 열린다(사이트 manifest는 트레이너 로그인 "/").
//   토큰은 링크에 이미 들어 있는 값이라 새로 드러나는 것은 없다. DB를 읽지 않는다(모양만 맞으면 그대로 돌려줌).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req, { params }) {
  const { token } = await params;
  const t = String(token || "").toLowerCase();
  if (!UUID_RE.test(t)) return new Response("Not found", { status: 404 });
  const base = `/m/${t}`;
  const body = {
    id: base,
    name: "오직 트레이너 회원",
    short_name: "내 PT",
    description: "담당 트레이너와 함께하는 내 운동 기록",
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef1f5",   // app/manifest.js와 같은 값
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
