// 검색 사이트 안내(2026-10-07) — 소개 · 약관 페이지만 찾게 하고, 앱 · 회원 · 결제 · 신청서 주소는 빼 달라고 한다.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/lp", "/center", "/try", "/check", "/download", "/legal/"],
      disallow: ["/api/", "/m/", "/join/", "/join-center/", "/leave-center", "/admin", "/billing/", "/settings", "/login", "/signup"],
    },
    sitemap: "https://www.onlytrainer.co.kr/sitemap.xml",
  };
}
