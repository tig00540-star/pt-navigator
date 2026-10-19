// app/api/billing/beta-trial/route.js — 베타 기간 무료 이용 스스로 시작(2026-10-19 대표: "베타라 7일 무료 이용 후 결제")
// -----------------------------------------------------------------------------
// 계정 주인(센터 대표 · 개인 트레이너)이 가입 직후(가입 화면이 자동으로) 또는 결제 화면의 [7일 무료로 시작하기]로 연다.
// 규칙은 업무 사이트 '무료 이용 열어 주기'와 같다(lib/trialGrant · 계정당 한 번 · 결제 이력 없음 · 지금 이용 중 아님).
// GET = 열 수 있는지 · POST = 열기. BETA_FREE_DAYS = 0 이면 꺼짐.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { trialState, grantTrial } from "@/lib/trialGrant";
import { BETA_FREE_DAYS } from "@/lib/plans";

export const runtime = "nodejs";

async function load(req) {
  const sb = serviceClient();
  if (!sb) return { res: Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 }) };
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return { res: Response.json({ error: "다시 로그인해 주세요." }, { status: 401 }) };
  const { data: acct } = await sb.from("account")
    .select("id, name, type, billing_plan, subscription_status, current_period_end")
    .eq("id", me.account_id).maybeSingle();
  if (!acct) return { res: Response.json({ error: "계정을 찾지 못했어요." }, { status: 404 }) };
  const st = await trialState(sb, { role: me.role, acct });
  return { sb, me, acct, st };
}

export async function GET(req) {
  if (!BETA_FREE_DAYS) return Response.json({ eligible: false, days: 0 });
  const r = await load(req);
  if (r.res) return r.res;
  return Response.json({ eligible: !r.st.block, days: BETA_FREE_DAYS });
}

export async function POST(req) {
  if (!BETA_FREE_DAYS) return Response.json({ error: "지금은 무료 이용 기간이 아니에요." }, { status: 409 });
  const r = await load(req);
  if (r.res) return r.res;
  if (r.st.block) return Response.json({ error: r.st.block }, { status: 409 });
  const g = await grantTrial(r.sb, { acct: r.acct, days: BETA_FREE_DAYS, by: "가입(베타 무료)", label: r.acct.name || "" });
  if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
  return Response.json({ ok: true, until: g.until });
}
