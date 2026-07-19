export default function manifest() {
  return {
    name: "오직 트레이너",
    short_name: "오직 트레이너",
    description: "트레이너용 OT 세일즈·PT 관리 내비게이터",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef1f5", // 안드로이드 실행 스플래시 배경 = --color-bg(globals.css). 앱과 같아야 전환 시 색이 안 튄다.
    theme_color: "#ffffff",      // 상태바 영역 = 헤더(bg-card/80 · 거의 흰색)와 맞춤 — 배경색과 달라야 정상.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
