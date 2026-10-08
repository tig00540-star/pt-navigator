// lib/portfolio.js — 트레이너 포트폴리오 활용 동의(2026-10-08 · 서버 · service_role 클라를 받는다).
//   동의 행 = member_consent kind 'portfolio'. 동의는 그때 담당 트레이너 아이디(trainer_id)에 묶이고,
//   철회는 trainer_id 없이(모든 트레이너). 회원 · 트레이너 쌍마다 '가장 최근 행'이 동의면 OK.
//   사례가 이미 다른 아이디로 복사된 것이면 data.portfolio.{member, trainer}가 원래 회원 · 처음 동의받은 트레이너다.

/** 사례 한 건 → 동의를 따질 { member, trainer } (회원 없는 후기 캡처 등은 null) */
export function caseOwner(c, srcTrainer) {
  const p = c?.data?.portfolio;
  const member = p?.member || c?.member_id || null;
  if (!member) return null;
  return { member, trainer: p?.trainer || srcTrainer };
}

/** pairs [{member, trainer}] → Set("member:trainer") 동의한 쌍 */
export async function portfolioAgreed(sb, pairs) {
  const ids = [...new Set(pairs.map((p) => p.member).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from("member_consent").select("member_id, trainer_id, agreed, created_at")
      .eq("kind", "portfolio").in("member_id", ids.slice(i, i + 100)).order("created_at", { ascending: true }).limit(5000);
    if (error) { console.error("[portfolio] 동의 읽기 실패", error.message); return new Set(); }
    rows.push(...(data || []));
  }
  const ok = new Set();
  for (const { member, trainer } of pairs) {
    let last = null;
    for (const r of rows) if (r.member_id === member && (r.trainer_id === trainer || r.trainer_id == null)) last = r;
    if (last?.agreed) ok.add(`${member}:${trainer}`);
  }
  return ok;
}

/** 사례가 가리키는 이미지 파일들 [{bucket, path, key}] — key: 'before' | 'after' | 'path' */
export function caseFiles(c) {
  const d = c?.data || {};
  const out = [];
  if (c?.kind === "photo") {
    for (const k of ["before", "after"]) if (d[k]?.path) out.push({ bucket: d[k].bucket || "member-photos", path: d[k].path, key: k });
  }
  if (c?.kind === "review" && d.path) out.push({ bucket: "sales-cases", path: d.path, key: "path" });
  return out;
}
