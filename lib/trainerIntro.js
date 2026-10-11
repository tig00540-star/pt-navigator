// lib/trainerIntro.js — 트레이너 '내 소개'를 밖에 보여 줄 모양으로(2026-10-11 · 서버 전용 · service_role 클라를 받는다).
//   OT 신청 QR 페이지(/join/[code] · 로그인 없음)가 쓴다. 세일즈북은 트레이너 본인 화면이라 클라이언트에서 같은 모양을 만든다(components/intro).
//   보여 주는 사례 = 트레이너가 고른 것(intro_cases 순서) 중 같은 계정 · 같은 트레이너 것 · 사진 · 후기는 '동의받았어요' 체크한 것만.
//   회원 이름 · id는 내보내지 않는다(익명 라벨 · 숫자 · 1시간 사진 링크만).
import { caseFiles } from "@/lib/portfolio";

const TTL = 3600;
export const INTRO_MAX_CASES = 4;
export const PHOTO_KINDS = ["photo", "review", "care"];   // 회원 동의 체크가 필요한 종류(사진 · 캡처)
export const needsConsent = (c) => PHOTO_KINDS.includes(c?.kind);
// 회원에게 보여도 되는 사례 — 숫자 사례는 늘 · 사진 · 후기는 트레이너가 동의 체크한 것만(세일즈북 · 내 소개 공통 · 2026-10-11)
export const caseUsable = (c) => !!c && (!needsConsent(c) || !!c.consent_confirmed_at);
// 세일즈북 소개 장에 실제로 보이는 사례 수(설정에선 4개까지 · QR 페이지는 다 보임)
export const INTRO_SLIDE_CASES = 2;

export async function loadTrainerIntro(sb, trainerId) {
  if (!sb || !trainerId) return null;
  const [{ data: p }, { data: t }] = await Promise.all([
    sb.from("trainer_profile").select("*").eq("trainer_id", trainerId).maybeSingle(),
    sb.from("trainer").select("id, name, account_id, active").eq("id", trainerId).maybeSingle(),
  ]);
  if (!t || t.active === false || !p) return null;
  const tags = Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 5) : [];
  const ids = Array.isArray(p.intro_cases) ? p.intro_cases.slice(0, INTRO_MAX_CASES) : [];
  if (!p.intro && !tags.length && !ids.length && !p.photo_path) return null;   // 아직 안 만든 소개 = 안 보임

  let cases = [];
  if (ids.length) {
    const { data: rows } = await sb.from("sales_case").select("id, kind, label, data, note, account_id, trainer_id, consent_confirmed_at").in("id", ids);
    cases = ids.map((id) => (rows || []).find((r) => r.id === id))
      .filter((c) => c && c.kind !== "care" && c.account_id === t.account_id && c.trainer_id === t.id && (!needsConsent(c) || c.consent_confirmed_at));
  }
  // 경로 검사(2026-10-11 점검) — 사례 data의 경로 · 프로필 사진 경로는 트레이너가 쓴 값이라, 이 계정 파일만 서명한다
  //   (다른 센터 경로를 적어 로그인 없는 신청 페이지로 꺼내는 것 막기). sales-cases = '{계정}/…' · 회원 사진 = '{이 계정 회원 id}/…'.
  const seg0 = (path) => String(path || "").split("/")[0];
  const memberIds = new Set();
  for (const c of cases) for (const f of caseFiles(c)) if (f.bucket === "member-photos") memberIds.add(seg0(f.path));
  let okMembers = new Set();
  if (memberIds.size) {
    const { data: ms } = await sb.from("user_table").select("id").eq("account_id", t.account_id).in("id", [...memberIds]);
    okMembers = new Set((ms || []).map((r) => r.id));
  }
  const safe = (path) => !String(path || "").includes("..");
  const allowed = (f) => safe(f.path) && (f.bucket === "sales-cases" ? seg0(f.path) === t.account_id
    : f.bucket === "member-photos" ? okMembers.has(seg0(f.path)) : false);
  const photoOk = p.photo_path && safe(p.photo_path) && String(p.photo_path).startsWith(`${t.account_id}/profile/`);

  // 사진 링크(1시간) — 버킷별로 묶어 한 번에. 밖으로는 경로 대신 'c0-before'처럼 의미 없는 열쇠만(경로에 회원 id가 들어 있다).
  const want = { "member-photos": new Set(), "sales-cases": new Set() };
  for (const c of cases) for (const f of caseFiles(c)) if (allowed(f)) want[f.bucket].add(f.path);
  if (photoOk) want["sales-cases"].add(p.photo_path);
  const signed = {};
  for (const [bucket, set] of Object.entries(want)) {
    const paths = [...set];
    if (!paths.length) continue;
    const { data } = await sb.storage.from(bucket).createSignedUrls(paths, TTL);
    for (const d of data || []) if (d?.signedUrl) signed[`${bucket}:${d.path}`] = d.signedUrl;
  }
  const urls = {};
  const outCases = cases.map((c, i) => {
    const data = { ...(c.data || {}) };
    delete data.portfolio;   // 가져온 사례의 원래 회원 · 트레이너 id
    for (const f of caseFiles(c)) {
      const key = `c${i}-${f.key}`;
      const url = allowed(f) ? signed[`${f.bucket}:${f.path}`] : null;
      if (url) urls[key] = url;
      if (f.key === "path") data.path = url ? key : null;
      else data[f.key] = { ...(data[f.key] || {}), path: url ? key : null, bucket: undefined };
    }
    return { id: c.id, kind: c.kind, label: c.label, note: c.note, data };
  });
  return {
    name: p.display_name || t.name || "",
    credentials: p.credentials || "",
    intro: p.intro || "",
    tags,
    photo: photoOk ? signed[`sales-cases:${p.photo_path}`] || null : null,
    cases: outCases,
    urls,
  };
}
