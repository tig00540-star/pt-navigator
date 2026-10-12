// app/api/billing/pack/route.js — AI 추가 팩(2026-10-07 · 요금제 개편 계획서 4)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만 · 프로 · 센터만(베이직은 못 삼 · 대표 결정 D7).
//   GET                         = 쓰고 있는 팩 목록(남은 수 · 끝나는 날) + 환불 가능 여부
//   POST { action:'confirm', paymentKey, orderId, amount } = 결제창 승인 → ai_credit 넣기(산 날부터 1개월 · 2026-10-11)
//   POST { action:'refund', creditId }                     = 산 뒤 7일 안 · 하나도 안 썼으면 전액 환불(D6) · 그 밖엔 거절
// 결제는 일반결제(결제창 · 매번 카드 인증) — 자동결제(빌링키)는 정기 구독에만 쓰는 게 토스 정책.
// 쓰는 순서 = 기본 한도 먼저, 다 쓰면 기간이 먼저 끝나는 팩부터 — DB ai_reserve가 팩의 used를 올린다(2026-10-11-pack-carryover.sql).
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { confirmPayment, cancelPayment, getPayment, tossReady } from "@/lib/toss";
import { PACKS, REFUND_DAYS } from "@/lib/plans";

export const runtime = "nodejs";

const ORDER_RE = new RegExp(`^pack_(${Object.keys(PACKS).join("|")})_([0-9a-f-]{36})_(\\d{10,})$`);

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

// 지금 보여 줄 팩 — 기간 안 팩 + 기간이 끝났거나 환불한 지 30일 안 팩(기록용)
async function listCredits(sb, accountId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await sb.from("ai_credit").select("id, kind, amount, used, ym, created_at, expires_at, refunded_at, payment_id")
    .eq("account_id", accountId).gte("expires_at", since).order("created_at", { ascending: true });
  return data || [];
}
const refundable = (c, now) => !c.refunded_at && (c.used || 0) === 0 && now - Date.parse(c.created_at) < REFUND_DAYS * 86400000;

export async function GET(req) {
  const g = await guard(req);
  if (g.res) return g.res;
  const credits = await listCredits(g.sb, g.me.account_id);
  const now = Date.now();
  return Response.json({
    tier: g.q.tier,
    packs: credits.map((c) => ({
      id: c.id, kind: c.kind, amount: c.amount, used: c.used || 0, created_at: c.created_at, expires_at: c.expires_at,
      refunded: Boolean(c.refunded_at), expired: Date.parse(c.expires_at) <= now, refundable: refundable(c, now),
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
    // 결제 한 건 = 팩 한 개(2026-10-12): 넣기 직전에 다시 확인 · 동시에 두 번 들어와 둘 다 넣으려 하면 DB 고유 색인(ai_credit.payment_id)이 하나만 남긴다(23505 = 이미 들어감 = 성공).
    const ensureCredit = async (paymentId) => {
      if (!paymentId) return { error: { message: "payment id 없음" } };
      const { data: has } = await sb.from("ai_credit").select("id").eq("payment_id", paymentId).limit(1);
      if (has?.length) return { already: true };
      const { error } = await sb.from("ai_credit").insert({ account_id: me.account_id, kind: pack.kind, amount: pack.amount, ym: q.ym, payment_id: paymentId });
      if (error && error.code !== "23505") return { error };
      return { ok: true };
    };
    // 같은 주문을 두 번 처리하지 않는다(새로고침 · 뒤로 가기) — 결제는 됐는데 팩이 안 들어간 채 끊겼으면 여기서 넣는다
    const { data: dup } = await sb.from("payment").select("id, status").eq("order_id", body.orderId).maybeSingle();
    if (dup?.status === "DONE") {
      const c0 = await ensureCredit(dup.id);
      if (c0.error) { console.error("[billing/pack] 팩 넣기 실패(결제됨 · 수동 보정)", c0.error.message); return Response.json({ error: "결제는 됐지만 팩을 넣지 못했어요. 고객센터로 알려 주세요." }, { status: 500 }); }
      return Response.json({ ok: true, already: true, kind: pack.kind, amount: pack.amount });
    }

    let r = await confirmPayment({ paymentKey: String(body.paymentKey || ""), orderId: body.orderId, amount: pack.price });
    let done = r.ok && r.data?.status === "DONE";
    // 승인은 됐는데 응답 전에 끊겨 다시 들어온 경우(2026-10-08) — 토스에 실제 상태를 물어 이어 처리(예전엔 돈만 나가고 팩이 안 들어갔다)
    if (!done && r.error?.code === "ALREADY_PROCESSED_PAYMENT") {
      const g2 = await getPayment(String(body.paymentKey || ""));
      if (g2.ok && g2.data?.status === "DONE" && g2.data.orderId === body.orderId && Number(g2.data.totalAmount) === pack.price) { r = g2; done = true; }
    }
    let { data: pay } = await sb.from("payment").upsert({
      account_id: me.account_id, order_id: body.orderId, toss_payment_key: done ? r.data.paymentKey : null, amount: pack.price,
      status: done ? "DONE" : "FAILED", plan: `pack_${pack.kind}`,
      raw: done ? { approvedAt: r.data.approvedAt ?? null, method: r.data.method ?? null } : { error: r.error ?? null, status: r.status ?? null },
    }, { onConflict: "order_id" }).select("id").maybeSingle();
    if (!done) { console.error("[billing/pack] 승인 실패", r.status, r.error?.code || r.error?.message); return Response.json({ error: "결제를 승인하지 못했어요. 카드 정보를 확인하고 다시 시도해 주세요." }, { status: 402 }); }
    if (!pay?.id) ({ data: pay } = await sb.from("payment").select("id").eq("order_id", body.orderId).maybeSingle());   // 기록 저장 응답이 비면 다시 읽기(팩이 결제와 이어져야 환불 가능)
    const c1 = await ensureCredit(pay?.id ?? null);
    if (c1.error) { console.error("[billing/pack] 팩 넣기 실패(결제됨 · 수동 보정)", c1.error.message); return Response.json({ error: "결제는 됐지만 팩을 넣지 못했어요. 고객센터로 알려 주세요." }, { status: 500 }); }
    return Response.json({ ok: true, kind: pack.kind, amount: pack.amount });   // 기간 = DB 기본값(산 날 + 1개월)
  }

  if (body.action === "refund") {
    const { data: c } = await sb.from("ai_credit").select("id, kind, amount, used, created_at, refunded_at, payment_id")
      .eq("id", String(body.creditId || "")).eq("account_id", me.account_id).maybeSingle();
    if (!c) return Response.json({ error: "환불할 팩을 찾지 못했어요." }, { status: 404 });
    if (c.refunded_at) return Response.json({ error: "이미 환불한 팩이에요." }, { status: 409 });
    if (Date.now() - Date.parse(c.created_at) >= REFUND_DAYS * 86400000) return Response.json({ error: "산 지 7일이 지나 환불할 수 없어요." }, { status: 409 });
    if ((c.used || 0) > 0) return Response.json({ error: "이미 쓴 팩은 환불할 수 없어요." }, { status: 409 });
    const { data: pay } = await sb.from("payment").select("id, toss_payment_key, amount").eq("id", c.payment_id).maybeSingle();
    if (!pay?.toss_payment_key) return Response.json({ error: "결제 정보를 찾지 못했어요. 고객센터로 알려 주세요." }, { status: 404 });
    // 먼저 팩을 막고(그 사이 쓰이지 않게) 환불 — 환불이 실패하면 되돌린다
    const nowIso = new Date().toISOString();
    const { data: locked } = await sb.from("ai_credit").update({ refunded_at: nowIso }).eq("id", c.id).is("refunded_at", null).eq("used", 0).select("id");
    if (!locked?.length) return Response.json({ error: "이미 쓰였거나 환불한 팩이에요." }, { status: 409 });
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
