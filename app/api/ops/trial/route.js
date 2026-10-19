// app/api/ops/trial/route.js — 회사 업무 사이트용 '무료 이용 열어 주기'(2026-10-15) · 인증 = Bearer OPS_SECRET(ops/alerts와 같음)
// -----------------------------------------------------------------------------
// 앱에는 무료 체험이 없다(2026-10-07 · 카드 등록 = 바로 첫 결제). 베타 · 영업 문의로 써 보게 할 계정만 대표가 손으로 연다.
// GET  ?email=          → 그 이메일 계정 미리 보기(센터/개인 · 이름 · 지금 상태 · 결제 이력 · 이미 열어 줬는지)
// POST {email, days, note} → 이용 중(active) + 끝나는 날 = 지금 + days(기본 7 · 1~30)
//   - 결제 이력(DONE · TRIAL)이 있거나 지금 이용 중이면 안 연다 · 계정당 한 번(ops_alert key trial_{계정})
//   - 결제 기록(payment)은 만들지 않는다 → 나중 첫 결제가 그대로 '첫 결제 7일 안 전액 환불' 대상
//   - 기간 안에 카드를 등록하면 결제 없이 카드만 저장 → 끝나는 날 결제 작업이 첫 달을 청구
//   - 카드 없이 끝나면 30일 '볼 수만'(기존 규칙) → 카드 등록 = 바로 첫 결제
//   - 기록 = ops_alert(kind trial_grant · status done) → 업무 사이트 '최근 2주 처리 기록'에 보인다
// -----------------------------------------------------------------------------
import { bearerOk } from "@/lib/bearerOk";
import { serviceClient } from "@/lib/serverCaller";
import { trialState, grantTrial } from "@/lib/trialGrant";

export const runtime = "nodejs";
export const maxDuration = 60;


function guard(req) {
  const secret = process.env.OPS_SECRET;
  if (!secret) return Response.json({ error: "OPS_SECRET 미설정" }, { status: 503 });
  if (!bearerOk(req, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

const maskEmail = (e) => {
  const [id, dom] = String(e || "").split("@");
  return id && dom ? `${id.slice(0, 2)}${"*".repeat(Math.max(1, id.length - 2))}@${dom}` : "";
};

async function findUserByEmail(sb, email) {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("users");
    const hit = (data?.users || []).find((u) => String(u.email || "").toLowerCase() === want);
    if (hit) return hit;
    if ((data?.users || []).length < 1000) return null;
  }
  return null;
}

// 이메일 → 계정 상태 한 번에 읽기
async function lookup(sb, email) {
  const user = await findUserByEmail(sb, email);
  if (!user) return { error: "그 이메일로 가입한 아이디가 없어요. 가입을 먼저 해 달라고 해 주세요.", status: 404 };
  const { data: tr } = await sb.from("trainer").select("id, name, role, account_id").eq("id", user.id).maybeSingle();
  if (!tr?.account_id) return { error: "가입은 됐는데 계정이 아직 만들어지지 않았어요. 잠시 뒤 다시 해 주세요.", status: 409 };
  const { data: acct } = await sb.from("account")
    .select("id, name, type, plan, billing_plan, subscription_status, current_period_end, billing_key")
    .eq("id", tr.account_id).maybeSingle();
  if (!acct) return { error: "계정을 찾지 못했어요.", status: 404 };
  const st = await trialState(sb, { role: tr.role, acct });
  const info = {
    email: maskEmail(user.email),
    name: acct.name || tr.name || "",
    type: acct.type === "center" ? "center" : "solo",
    role: tr.role,
    activeNow: st.activeNow,
    periodEnd: acct.current_period_end || null,
    paid: st.paid,
    oldTrial: st.oldTrial,
    card: !!acct.billing_key,
    granted: st.granted,
  };
  const block = st.block;
  return { user, tr, acct, info, block };
}

export async function GET(req) {
  const bad = guard(req); if (bad) return bad;
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  const email = new URL(req.url).searchParams.get("email") || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "이메일을 입력해 주세요." }, { status: 400 });
  try {
    const r = await lookup(sb, email);
    if (r.error) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ ok: true, account: r.info, canGrant: !r.block, reason: r.block });
  } catch {
    return Response.json({ error: "계정을 읽지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(req) {
  const bad = guard(req); if (bad) return bad;
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "이메일을 입력해 주세요." }, { status: 400 });
  const days = Math.min(30, Math.max(1, Math.round(Number(body.days) || 7)));
  const by = typeof body.by === "string" ? body.by.slice(0, 40) : "업무 사이트";
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  try {
    const r = await lookup(sb, email);
    if (r.error) return Response.json({ error: r.error }, { status: r.status });
    if (r.block) return Response.json({ error: r.block }, { status: 409 });
    const g = await grantTrial(sb, { acct: r.acct, days, by, note, label: r.info.name || r.info.email, email: r.info.email });
    if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
    return Response.json({ ok: true, account: { ...r.info, activeNow: true, periodEnd: g.periodEnd }, days, until: g.until });
  } catch {
    return Response.json({ error: "처리하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  }
}
