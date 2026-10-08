import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { trainerSeatLimit } from "@/lib/plans";

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
    return Response.json({ error: "대표만 트레이너를 추가할 수 있어요." }, { status: 403 });
  }

  // 좌석 — 센터 플랜은 트레이너 3인(관리자 제외), 솔로는 추가 없음.
  // 결제 전(체험·파일럿)이면 billing_plan이 비어 있어 account.type으로 판단한다.
  // ⚠️ 이게 유일한 관문이다(트레이너 추가 경로는 이 라우트뿐). 화면 표시는 안내용.
  const { data: acct } = await sb.from("account").select("type, billing_plan, extra_seats, next_extra_seats").eq("id", me.account_id).maybeSingle();
  const planKey = acct?.billing_plan || acct?.type || "solo";
  // 자리 줄이기를 예약했으면 줄어든 수 기준(2026-10-08 · 예약해 두고 트레이너를 늘려 다음 결제에서 자리 값을 덜 내던 구멍)
  const seatsPaid = Math.min(acct?.extra_seats ?? 0, acct?.next_extra_seats ?? acct?.extra_seats ?? 0);
  const seatLimit = trainerSeatLimit(planKey, seatsPaid);   // 센터 3 + 결제한 추가 좌석(2026-10-07)
  const { count: used, error: cErr } = await sb
    .from("trainer")
    .select("id", { count: "exact", head: true })
    .eq("account_id", me.account_id)
    .eq("role", "trainer")
    .eq("active", true);
  if (cErr) {
    console.error("[create-trainer] 좌석 집계 실패:", cErr.message);
    return Response.json({ error: "좌석을 확인하지 못했습니다. 잠시 후 다시 시도하세요." }, { status: 500 });
  }
  if ((used ?? 0) >= seatLimit) {
    console.warn(`[create-trainer] 409 좌석 초과 account=${me.account_id} plan=${planKey} used=${used} limit=${seatLimit}`);
    return Response.json({
      error: seatLimit === 0
        ? "개인 요금제는 트레이너를 추가할 수 없어요. 센터 요금제로 바꾸면 트레이너 3명까지 함께 쓸 수 있어요."
        : `트레이너 자리 ${seatLimit}개를 모두 쓰고 있어요. 설정 › 구독 관리에서 자리를 추가할 수 있어요.`,
      code: "seat_limit", used: used ?? 0, limit: seatLimit,
    }, { status: 409 });
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
    const dup = /already|registered|exists/i.test(ce?.message || "");
    return Response.json({ error: dup ? "이미 가입된 이메일이에요. 다른 이메일로 초대해 주세요." : "트레이너 계정을 만들지 못했어요. 다시 시도해 주세요." }, { status: 400 });
  }

  const { error: te } = await sb.from("trainer").insert({
    id: created.user.id, account_id: me.account_id, role: "trainer", name,
  });
  if (te) {
    console.error(`[create-trainer] trainer insert 실패 — 계정 롤백 uid=${created.user.id}:`, te.message);
    await sb.auth.admin.deleteUser(created.user.id); // 정합성: trainer 실패 시 방금 만든 계정 롤백
    return Response.json({ error: "트레이너를 등록하지 못했어요. 다시 시도해 주세요." }, { status: 400 });
  }

  return Response.json({ ok: true, id: created.user.id, email, tempPassword: password });
}
