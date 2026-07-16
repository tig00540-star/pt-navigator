// app/api/member-revoke/route.js — 회원앱 접근 완전 차단('PT 종료'). 서버전용.
//   ① 호출 트레이너 인증(JWT)+활성 확인 ② 대상 회원이 내 account인지 확인
//   ③ 회원 auth 유저 삭제(세션 무효) → FK(on delete set null)로 member_auth_id 자동 해제
//   ④ member_token=null(재로그인 차단). 회원 데이터(user_table/일지/인바디/계약)는 안 건드림.
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "서버 키 미설정" }, { status: 503 });

  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return Response.json({ error: "인증 필요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const memberId = String(body.memberId || "").trim();
  if (!UUID_RE.test(memberId)) return Response.json({ error: "잘못된 요청" }, { status: 400 });

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // ① 호출자 = 활성 트레이너 검증(service 키라 RLS 우회하여 조회)
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return Response.json({ error: "세션 무효" }, { status: 401 });
  const { data: me } = await sb.from("trainer").select("account_id, active").eq("id", u.user.id).maybeSingle();
  if (!me || me.active !== true) {
    return Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 });
  }

  // ② 대상 회원이 내 account 소속인지 확인(타 계정 회원 revoke 차단)
  const { data: member } = await sb
    .from("user_table")
    .select("id, account_id, member_auth_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.account_id !== me.account_id) {
    return Response.json({ error: "대상 회원을 찾을 수 없습니다." }, { status: 404 });
  }

  // ③ 회원 auth 유저 삭제 → 세션 무효화 + FK로 member_auth_id 자동 null. (없으면 스킵.)
  if (member.member_auth_id) {
    const { error: de } = await sb.auth.admin.deleteUser(member.member_auth_id);
    if (de && !/not.*found/i.test(de.message || "")) {
      return Response.json({ error: "세션 차단 실패: " + de.message }, { status: 500 });
    }
  }

  // ④ 토큰 폐기 + 링크 상태 초기화(멱등 · FK로 이미 null이어도 명시).
  const { data: upd, error: upe } = await sb
    .from("user_table")
    .update({ member_token: null, member_auth_id: null })
    .eq("id", memberId)
    .select("id");
  if (upe || !upd || upd.length === 0) {
    return Response.json({ error: "링크 폐기 실패: " + (upe?.message || "0행") }, { status: 500 });
  }

  return Response.json({ ok: true });
}
