/** @type {import('next').NextConfig} */
const nextConfig = {
  // 서비스 워커(폰 푸시 알림 · 2026-10-06) — 늘 최신으로 받게 캐시 금지 · 같은 출처 스크립트만.
  async headers() {
    return [
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
