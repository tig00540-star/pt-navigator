/* 사례 데이터 읽기(클라이언트) — 보관함·세일즈북 장 공용. 사진은 비공개 버킷 서명 URL(lib/photoUrl · 6시간). */
import { supabase } from "@/lib/supabaseClient";
import { PHOTO_URL_TTL } from "@/lib/photoUrl";

export async function signCaseUrls(cases) {
  if (!supabase) return {};
  const photo = [], review = [];
  for (const c of cases || []) {
    if (c.kind === "photo") { if (c.data?.before?.path) photo.push(c.data.before.path); if (c.data?.after?.path) photo.push(c.data.after.path); }
    if (c.kind === "review" && c.data?.path) review.push(c.data.path);
  }
  const map = {};
  const sign = async (bucket, paths) => {
    if (!paths.length) return;
    const { data } = await supabase.storage.from(bucket).createSignedUrls([...new Set(paths)], PHOTO_URL_TTL);
    (data || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
  };
  await Promise.all([sign("member-photos", photo), sign("sales-cases", review)]);
  return map;
}

// 내 사례 전부(보관함 순서 = 최근 담은 순).
export async function loadMyCases(uid) {
  if (!supabase || !uid) return { data: [], error: null };
  return supabase.from("sales_case").select("*").eq("trainer_id", uid).order("created_at", { ascending: false });
}
