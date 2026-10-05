// 서버 라우트에서 요청한 사람 알아내기(2026-10-06 · 푸시) — Authorization: Bearer <access token>.
//   트레이너(앱 로그인) 또는 회원(회원 전용 페이지 세션) 중 하나. 둘 다 아니면 null.
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** @returns {Promise<null | {kind:'trainer', id, account_id, role} | {kind:'member', id, account_id, trainer_id}>} */
export async function callerOf(sb, req) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return null;
  const { data: u } = await sb.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return null;
  const { data: t } = await sb.from("trainer").select("id, account_id, role, active").eq("id", uid).maybeSingle();
  if (t && t.active !== false) return { kind: "trainer", id: t.id, account_id: t.account_id, role: t.role };
  const { data: m } = await sb.from("user_table").select("id, account_id, trainer_id, status, hidden").eq("member_auth_id", uid).maybeSingle();
  if (m && !m.hidden) return { kind: "member", id: m.id, account_id: m.account_id, trainer_id: m.trainer_id };
  return null;
}
