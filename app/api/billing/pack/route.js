// app/api/billing/pack/route.js — AI 추가 팩(2026-10-07 · 요금제 개편 계획서 4)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만 · 프로 · 센터만(베이직은 못 삼 · 대표 결정 D7).
//   GET                         = 이번 달 산 팩 목록 + 환불 가능 여부
//   POST { action:'confirm', paymentKey, orderId, amount } = 결제창 승인 → ai_credit 넣기(그달 말까지)
//   POST { action:'refund', creditId }                     = 산 뒤 7일 안 · 하나도 안 썼으면 전액 환불(D6) · 그 밖엔 거절
// 결제는 일반결제(결제창 · 매번 카드 인증) — 자동결제(빌링키)는 정기 구독에만 쓰는 게 토스 정책.
// 쓰는 순서 = 기본 한도 먼저, 넘친 만큼 팩(산 순서대로). 그래서 '썼는지' = 그 팩까지 사용량이 닿았는지.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { confirmPayment, cancelPayment, tossReady } from "@/lib/toss";
import { PACKS, REFUND_DAYS } from "@/lib/plans";

export const runtime = "nodejs";

const ORDER_RE = /^pack_(prep10|voice50)_([0-9a-f-]{36})_(\d{10,})$/;

async function guard(req) {
  const sb = serviceClient();
  if (!sb) return { res: Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 }) };
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return { res: Response.json({ error: "다시 로그인해 주세요." }, { status: 401 }) };
  if (me.role !== "owner") return { res: Response.json({ error: "대표만 추가 팩을 살 수 있어요." }, { status: 403 }) };
  const { data: q } = await sb.rpc("ai_quota_for", { p_account: me.account_id });
  if (!q) return { res: Response.json({ error: "계정을 찾지 못했어요." }, { status: 404 }) };
  return { sb, me, q };
}

// 이번 달 팩 하나하나가 얼마나 쓰였는지 — 기본 한도를 넘친 사용량을 산 순서대로 나눠 담는다
function packUse(q, credits) {
  const out = new Map();
  for (const kind of ["prep", "voice"]) {
    const g = q.groups?.[kind];
    let over = g ? Math.max(0, g.used - g.limit) : 0;
    for (const c of credits.filter((x) => x.kind === kind && !x.refunded_at).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const used = Math.min(over, c.amount);
      out.set(c.id, used);
      over -= used;
    }
  }
  return out;
}

async function listCredits(sb, accountId, ym) {
  const { data } = await sb.from("ai_credit").select("id, kind, amount, ym, created_at, refunded_at, payment_id")
    .eq("account_id", accountId).eq("ym", ym).order("created_at", { ascending: true });
  return data || [];
}

export async function GET(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const credits = await listCredits(g.sb, g.me.account_id, g.q.ym);
  const use = packUse(g.q, credits);
  const now = Date.now();
  return Response.json({
    tier: g.q.tier,
    packs: credits.map((c) => ({
      id: c.id, kind: c.kind, amount: c.amount, created_at: c.created_at, refunded: Boolean(c.refunded_at), used: use.get(c.id) || 0,
      refundable: !c.refunded_at && (use.get(c.id) || 0) === 0 && now - Date.parse(c.created_at) < REFUND_DAYS * 86400000,
    })),
  });
}

export async function POST(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { sb, me, q } = g;
  if (!tossReady()) return Response.json({ error: "결제 설정이 아직 준비되지 않았어요. 고객센터로 알려 주세요." }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  if (body.action === "confirm") {
    if (q.tier === "basic") return Response.json({ error: "추가 팩은 프로 · 센터에서 살 수 있어요. 프로로 올리면 한도가 늘어나요." }, { status: 409 });
    const m = ORDER_RE.exec(String(body.orderId || ""));
    const pack = m ? PACKS[m[1]] : null;
    if (!pack || m[2] !== me.account_id) return Response.json({ error: "결제 정보가 올바르지 않아요." }, { status: 400 });
    if (Number(body.amount) !== pack.price) return Response.json({ error: "결제 금액이 맞지 않아요." }, { status: 400 });
    // 같은 주문을 두 번 처리하지 않는다(새로고침 · 뒤로 가기)
    const { data: dup } = await sb.from("payment").select("id, status").eq("order_id", body.orderId).maybeSingle();
    if (dup?.status === "DONE") return Response.json({ ok: true, already: true });

    const r = await confirmPayment({ paymentKey: String(body.paymentKey || ""), orderId: body.orderId, amount: pack.price });
    const done = r.ok && r.data?.status === "DONE";
    const { data: pay } = await sb.from("payment").insert({
      account_id: me.account_id, order_id: body.orderId, toss_payment_key: done ? r.data.paymentKey : null, amount: pack.price,
      status: done ? "DONE" : "FAILED", plan: `pack_${pack.kind}`,
      raw: done ? { approvedAt: r.data.approvedAt ?? null, method: r.data.method ?? null } : { error: r.error ?? null, status: r.status ?? null },
    }).select("id").maybeSingle();
    if (!done) { console.error("[billing/pack] 승인 실패", r.status, r.error?.code || r.error?.message); return Response.json({ error: "결제를 승인하지 못했어요. 카드 정보를 확인하고 다시 시도해 주세요." }, { status: 402 }); }
    const { error: ce } = await sb.from("ai_credit").insert({ account_id: me.account_id, kind: pack.kind, amount: pack.amount, ym: q.ym, payment_id: pay?.id ?? null });
    if (ce) { console.error("[billing/pack] 팩 넣기 실패(결제됨 · 수동 보정)", ce.message); return Response.json({ error: "결제는 됐지만 팩을 넣지 못했어요. 고객센터로 알려 주세요." }, { status: 500 }); }
    return Response.json({ ok: true, kind: pack.kind, amount: pack.amount });
  }

  if (body.action === "refund") {
    const credits = await listCredits(sb, me.account_id, q.ym);
    const c = credits.find((x) => x.id === body.creditId);
    if (!c) return Response.json({ error: "환불할 팩을 찾지 못했어요." }, { status: 404 });
    if (c.refunded_at) return Response.json({ error: "이미 환불한 팩이에요." }, { status: 409 });
    if (Date.now() - Date.parse(c.created_at) >= REFUND_DAYS * 86400000) return Response.json({ error: "산 지 7일이 지나 환불할 수 없어요." }, { status: 409 });
    if ((packUse(q, credits).get(c.id) || 0) > 0) return Response.json({ error: "이미 쓴 팩은 환불할 수 없어요." }, { status: 409 });
    const { data: pay } = await sb.from("payment").select("id, toss_payment_key, amount").eq("id", c.payment_id).maybeSingle();
    if (!pay?.toss_payment_key) return Response.json({ error: "결제 정보를 찾지 못했어요. 고객센터로 알려 주세요." }, { status: 404 });
    // 먼저 팩을 막고(그 사이 쓰이지 않게) 환불 — 환불이 실패하면 되돌린다
    const nowIso = new Date().toISOString();
    const { data: locked } = await sb.from("ai_credit").update({ refunded_at: nowIso }).eq("id", c.id).is("refunded_at", null).select("id");
    if (!locked?.length) return Response.json({ error: "이미 환불한 팩이에요." }, { status: 409 });
    const r = await cancelPayment(pay.toss_payment_key, { cancelReason: "추가 팩 미사용 환불(7일 안)", idempotencyKey: `packrefund_${c.id}` });
    if (!r.ok) {
      await sb.from("ai_credit").update({ refunded_at: null }).eq("id", c.id);
      console.error("[billing/pack] 환불 실패", r.status, r.error?.code || r.error?.message);
      return Response.json({ error: "환불하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    await sb.from("payment").insert({ account_id: me.account_id, order_id: `refund_${pay.id}`, toss_payment_key: pay.toss_payment_key,
      amount: -pay.amount, status: "CANCELED", plan: `pack_${c.kind}`, raw: { canceledAt: nowIso } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
}
