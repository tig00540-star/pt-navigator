// lib/portfolio.js — 사례 보관함 사례가 가리키는 이미지 파일(2026-10-08 · 클라 · 서버 공용 순수 함수).
//   (2026-10-11) 회원 페이지 '포트폴리오 활용 동의'는 없앴다 — 사진 · 후기는 트레이너가 동의를 받고 체크한다(lib/trainerIntro needsConsent).
//   다른 아이디에서 가져온 사례는 data.portfolio = { member, trainer, src_case } (어디서 왔는지 기록).

/** 사례가 가리키는 이미지 파일들 [{bucket, path, key}] — key: 'before' | 'after' | 'path' */
export function caseFiles(c) {
  const d = c?.data || {};
  const out = [];
  if (c?.kind === "photo") {
    for (const k of ["before", "after"]) if (d[k]?.path) out.push({ bucket: d[k].bucket || "member-photos", path: d[k].path, key: k });
  }
  if ((c?.kind === "review" || c?.kind === "care") && d.path) out.push({ bucket: "sales-cases", path: d.path, key: "path" });
  return out;
}
