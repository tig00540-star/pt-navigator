// app/api/member-auth/route.js — 회원 로그인(카톡 토큰 + 휴대 끝4 → 세션). 서버전용.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 토큰별 인메모리 스로틀(끝4 브루트포스 방어). 서버리스 = best-effort(인스턴스별·콜드리셋).
const HITS = new Map(); // token -> number[] (ms)
function throttle(token, limit = 6, windowMs = 600000) {
  const now = Date.now();
  const arr = (HITS.get(token) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  HITS.set(token, arr);
  return true;
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = crypto.randomBytes(16);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAIL = () =>
  Response.json({ error: "링크가 맞지 않거나 휴대폰 번호가 달라요. 다시 확인해 주세요." }, { status: 401 });

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !svcKey || !anon) {
    console.error("[member-auth] 503 서버키 미설정");
    return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim().toLowerCase();
  const last4 = String(body.phoneLast4 || "").trim();
  if (!UUID_RE.test(token) || !/^\d{4}$/.test(last4)) {
    console.warn("[member-auth] 401 형식오류 — 토큰/끝4 형식 불일치"); // 값 미로깅
    return FAIL();
  }

  if (!throttle(token)) {
    console.warn("[member-auth] 429 스로틀 — 끝4 브루트포스 의심(토큰 미로깅)");
    return Response.json({ error: "시도가 많아요. 잠시 뒤 다시 시도해 주세요." }, { status: 429 });
  }

  const svc = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 실패 기록(DB · 서버 여러 대가 같이 센다 · 2026-10-08) — 표(member_auth_fail)가 아직 없으면 세지 않고 지나간다(로그인을 막지 않음).
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null;
  const since = new Date(Date.now() - 600000).toISOString();
  const failCount = async (col, val) => {
    if (!val) return 0;
    const { count, error } = await svc.from("member_auth_fail").select("id", { count: "exact", head: true }).eq(col, val).gte("created_at", since);
    return error ? 0 : count || 0;
  };
  const recordFail = async (memberId) => {
    const { error } = await svc.from("member_auth_fail").insert({ member_id: memberId, ip });
    if (error) console.warn("[member-auth] 실패 기록 안 됨(표 없음?)", error.message);
  };
  const LOCKED = () => Response.json({ error: "여러 번 틀려서 잠시 막아 뒀어요. 10분 뒤 다시 시도해 주세요." }, { status: 429 });
  if ((await failCount("ip", ip)) >= 30) {
    console.warn("[member-auth] 429 같은 곳에서 실패가 많음");
    return LOCKED();
  }

  // 1) 토큰으로 회원 조회(service_role = RLS 우회)
  const { data: member } = await svc
    .from("user_table")
    .select("id, name, phone_number, member_auth_id, account_id, status, status_changed_at, hidden")
    .eq("member_token", token)
    .maybeSingle();
  if (!member) {
    console.warn("[member-auth] 401 인증실패 — 토큰 매칭 회원 없음"); // 토큰 값 미로깅
    await recordFail(null);
    return FAIL();
  }
  if ((await failCount("member_id", member.id)) >= 8) {
    console.warn(`[member-auth] 429 이 회원 링크로 실패가 많음 member_id=${member.id}`);
    return LOCKED();
  }

  // 2) 휴대 끝4 대조(숫자만 추출)
  const digits = String(member.phone_number || "").replace(/\D/g, "");
  if (digits.length < 4 || digits.slice(-4) !== last4) {
    console.warn(`[member-auth] 401 인증실패 — 끝4 불일치 member_id=${member.id}`); // 끝4 값 미로깅
    await recordFail(member.id);
    return FAIL();
  }

  // 2.4) 지난 회원(PT 종료)이 된 지 6개월이 지나면 닫힘(2026-10-05). DB auth_member_id()와 같은 규칙 — 여기선 로그인 자체를 안내와 함께 거절.
  // 환불 · 삭제(숨김) 회원은 열지 않는다(2026-10-06 · DB auth_member_id도 같은 조건).
  if (member.hidden) {
    console.warn(`[member-auth] 403 숨김 회원 member_id=${member.id}`);
    return Response.json({ error: "이 페이지는 닫혔어요. 궁금한 점은 트레이너에게 말해 주세요." }, { status: 403 });
  }
  if (member.status === "inactive" && member.status_changed_at) {
    // DB(now() - interval '6 months')와 같은 방향으로 센다 — 말일(8/31 등) 경계에서 앱과 DB가 하루 이틀 어긋나지 않게.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    if (new Date(member.status_changed_at) < cutoff) {
      console.warn(`[member-auth] 403 열람 기간 끝남 member_id=${member.id}`);
      return Response.json(
        { error: "이 페이지는 닫혔어요. 다시 시작하려면 트레이너에게 말해 주세요." },
        { status: 403 }
      );
    }
  }

  // 2.5) 소속 계정이 premium·활성·미만료인지 (층2 게이트). 아니면 회원앱 로그인 거절.
  //   basic 다운그레이드/구독 만료/해지 시 회원 재로그인 차단(이미 발급된 링크도 그날부터 안 열림).
  const { data: acct } = await svc
    .from("account")
    .select("plan, subscription_status, current_period_end")
    .eq("id", member.account_id)
    .maybeSingle();
  // 이용 중 + 기간이 끝난 뒤 30일(볼 수만 · 2026-10-07 · DB auth_member_id와 같은 창)
  const endMs = acct?.current_period_end ? Date.parse(acct.current_period_end) : null;
  const nowMs = Date.now();
  const premiumActive =
    acct &&
    acct.plan === "premium" &&
    ((acct.subscription_status === "active" && (endMs == null || endMs > nowMs))
      || (endMs != null && endMs <= nowMs && endMs > nowMs - 30 * 86400000));
  if (!premiumActive) {
    console.warn(`[member-auth] 403 회원앱 중단 — 계정 premium/활성 아님 member_id=${member.id}`);
    return Response.json(
      { error: "회원 전용 페이지 이용이 잠시 중단됐어요. 담당 트레이너에게 문의해 주세요." },
      { status: 403 }
    );
  }

  // 3) 회원 auth 유저 확보(최초=생성·연결 / 재방문=비번 회전). account_type 미설정 → 가입트리거 no-op.
  const email = `m-${member.id}@member.pt-navigator.app`;
  const password = genPassword();
  let authId = member.member_auth_id;

  if (authId) {
    const { error: ue } = await svc.auth.admin.updateUserById(authId, { password });
    if (ue) authId = null; // 유저 삭제됨(teardown 등) → 아래서 재생성·재연결
  }
  if (!authId) {
    const { data: created, error: ce } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "member", member_id: member.id }, // account_type 없음(중요)
    });
    if (ce || !created?.user?.id) {
      console.error(`[member-auth] 회원 auth 생성 실패 member_id=${member.id}:`, ce?.message || "unknown");
      return Response.json({ error: "회원 세션 생성 실패." }, { status: 500 });
    }
    authId = created.user.id;
    const { error: le } = await svc.from("user_table").update({ member_auth_id: authId }).eq("id", member.id);
    if (le) {
      console.error(`[member-auth] member_auth_id 연결 실패 — auth 롤백 member_id=${member.id}:`, le.message);
      await svc.auth.admin.deleteUser(authId); // 정합성: 연결 실패 시 방금 만든 유저 롤백
      return Response.json({ error: "회원 연결 실패." }, { status: 500 });
    }
  }

  // 4) 세션 발급 = anon 클라로 서버측 로그인 → 토큰 반환
  const pub = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: se } = await pub.auth.signInWithPassword({ email, password });
  if (se || !sess?.session) {
    console.error(`[member-auth] 세션 발급 실패 member_id=${member.id}:`, se?.message || "no session");
    return Response.json({ error: "세션 발급 실패." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    member: { id: member.id, name: member.name },
  });
}
