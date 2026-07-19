import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = crypto.randomBytes(12);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[create-trainer] 503 서버키 미설정(SUPABASE_SERVICE_ROLE_KEY/URL)");
    return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  }

  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) {
    console.warn("[create-trainer] 401 인증필요 — 토큰 없음");
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // 호출자 = owner 검증 (service 키라 RLS 우회하여 trainer 조회)
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) {
    console.warn("[create-trainer] 401 세션무효:", ue?.message || "no uid");
    return Response.json({ error: "세션 무효" }, { status: 401 });
  }
  const { data: me } = await sb.from("trainer").select("role, account_id").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "owner") {
    console.warn(`[create-trainer] 403 권한상승 시도 — owner 아님 uid=${u.user.id} role=${me?.role ?? "none"}`);
    return Response.json({ error: "원장(owner)만 트레이너를 추가할 수 있습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  if (!email || !name) return Response.json({ error: "이메일과 이름을 입력하세요." }, { status: 400 });

  const password = genPassword();
  const { data: created, error: ce } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { must_change_pw: true }, // 최초 로그인 시 비번 변경 강제(P1b)
  });
  if (ce || !created?.user?.id) {
    console.error("[create-trainer] 계정 생성 실패:", ce?.message || "unknown");
    return Response.json({ error: "계정 생성 실패: " + (ce?.message || "unknown") }, { status: 400 });
  }

  const { error: te } = await sb.from("trainer").insert({
    id: created.user.id, account_id: me.account_id, role: "trainer", name,
  });
  if (te) {
    console.error(`[create-trainer] trainer insert 실패 — 계정 롤백 uid=${created.user.id}:`, te.message);
    await sb.auth.admin.deleteUser(created.user.id); // 정합성: trainer 실패 시 방금 만든 계정 롤백
    return Response.json({ error: "trainer 등록 실패: " + te.message }, { status: 400 });
  }

  return Response.json({ ok: true, email, tempPassword: password });
}
