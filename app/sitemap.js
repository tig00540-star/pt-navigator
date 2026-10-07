// 검색 사이트용 주소 목록(2026-10-07) — 공개 소개 · 약관 페이지만.
const SITE = "https://www.onlytrainer.co.kr";
export default function sitemap() {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/lp`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/center`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/try`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/download`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/legal/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
