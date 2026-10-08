/** @type {import('next').NextConfig} */
const nextConfig = {
  // 서비스 워커(폰 푸시 알림 · 2026-10-06) — 늘 최신으로 받게 캐시 금지 · 같은 출처 스크립트만.
  async headers() {
    return [
      // 보안 헤더(2026-10-08 · 전체 점검) — 다른 사이트가 우리 화면을 몰래 띄워 누르게 하는 것(클릭재킹) 막기 · 파일 형식 추측 금지 · 주소 노출 줄이기
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },   // 랜딩 데모(같은 사이트 iframe)는 허용
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
