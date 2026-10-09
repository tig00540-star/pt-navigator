// app/api/ops/alerts/route.js — 회사 업무 사이트용 '앱 운영'(2026-10-08) · 인증 = Bearer OPS_SECRET(ops/summary와 같음)
// -----------------------------------------------------------------------------
// GET  → { open: 사람이 볼 결제 이상, recent: 최근 14일 자동 처리 · 처리 끝, errors: 앱 오류 묶음(24시간 · 7일) }
//        개인정보 없음 — 계정은 앞 8자리 번호만, 회원 이름 · 번호 없음.
// POST {action:'check'}                         → 지금 바로 결제 대조(lib/opsCheck)
//      {id, action:'done'|'ignore'|'reopen', note} → 처리 표시
//      {id, action:'retry_refund'}               → 환불 실패 건 다시 시도(횟수 초기화 뒤 대조 한 번)
//      {id, action:'refund_payment', note}       → 이중 결제 의심 · 금액 다름 건의 결제를 전액 환불(대표 결재 뒤 업무 사이트가 부름)
// -----------------------------------------------------------------------------
import { bearerOk } from "@/lib/bearerOk";
import { serviceClient } from "@/lib/serverCaller";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { runOpsChecks } from "@/lib/opsCheck";
import { cancelPayment, tossReady } from "@/lib/toss";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400000;
const pick = (a) => ({ id: a.id, created_at: a.created_at, kind: a.kind, severity: a.severity, status: a.status, amount: a.amount, title: a.title,
  account: a.account_id ? String(a.account_id).slice(0, 8) : null, detail: a.detail || {}, handled_at: a.handled_at, handled_by: a.handled_by, note: a.note });

function guard(req) {
  const secret = process.env.OPS_SECRET;
  if (!secret) return Response.json({ error: "OPS_SECRET 미설정" }, { status: 503 });
  if (!bearerOk(req, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req) {
  const bad = guard(req); if (bad) return bad;
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  const now = Date.now();
  const [open, recent, errs] = await Promise.all([
    sb.from("ops_alert").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(100),
    sb.from("ops_alert").select("*").neq("status", "open").gte("created_at", new Date(now - 14 * DAY).toISOString()).order("created_at", { ascending: false }).limit(60),
    fetchAllRows(() => sb.from("app_error").select("id, created_at, source, fingerprint, path, message, role").gte("created_at", new Date(now - 7 * DAY).toISOString())),
  ]);
  if (open.error || recent.error || errs.error) {
    const m = open.error?.message || recent.error?.message || errs.error?.message || "";
    return Response.json({ error: /does not exist|relation|schema cache|Could not find the table/i.test(m) ? "앱 운영 표가 아직 없어요(SQL 2026-10-08-ops.sql 실행 필요)." : "조회 실패" }, { status: 500 });
  }
  const groups = new Map();
  let e24 = 0;
  for (const e of errs.data || []) {
    const recent24 = Date.parse(e.created_at) > now - DAY;
    if (recent24) e24++;
    const g = groups.get(e.fingerprint) || { fingerprint: e.fingerprint, source: e.source, path: e.path, message: e.message, role: e.role, count24h: 0, count7d: 0, first_at: e.created_at, last_at: e.created_at };
    g.count7d++; if (recent24) g.count24h++;
    if (e.created_at < g.first_at) g.first_at = e.created_at;
    if (e.created_at > g.last_at) g.last_at = e.created_at;
    groups.set(e.fingerprint, g);
  }
  const list = [...groups.values()].sort((a, b) => b.count24h - a.count24h || String(b.last_at).localeCompare(String(a.last_at))).slice(0, 30);
  return Response.json({
    open: (open.data || []).map(pick),
    recent: (recent.data || []).map(pick),
    errors: { total24h: e24, total7d: (errs.data || []).length, kinds7d: groups.size, list },
    at: new Date(now).toISOString(),
  });
}

export async function POST(req) {
  const bad = guard(req); if (bad) return bad;
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const by = typeof body.by === "string" ? body.by.slice(0, 40) : "업무 사이트";
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  const now = Date.now();

  if (body.action === "check") return Response.json({ ok: true, result: await runOpsChecks(sb, { now, dry: body.dry === true }) });

  const { data: a } = await sb.from("ops_alert").select("*").eq("id", String(body.id || "")).maybeSingle();
  if (!a) return Response.json({ error: "그 건을 찾지 못했어요." }, { status: 404 });
  const mark = async (status, extra = {}) => {
    const { data, error } = await sb.from("ops_alert").update({ status, handled_at: status === "open" ? null : new Date(now).toISOString(), handled_by: status === "open" ? null : by, note, ...extra }).eq("id", a.id).select("*");
    if (error || !data?.length) return Response.json({ error: "저장하지 못했어요." }, { status: 500 });
    return Response.json({ ok: true, alert: pick(data[0]) });
  };

  if (body.action === "done") return mark("done");
  if (body.action === "ignore") return mark("ignored");
  if (body.action === "reopen") return mark("open");

  if (body.action === "retry_refund") {
    if (a.kind !== "refund_failed" || !a.payment_id) return Response.json({ error: "환불 실패 건이 아니에요." }, { status: 400 });
    const { data: p } = await sb.from("payment").select("id, status, raw").eq("id", a.payment_id).maybeSingle();
    if (!p || p.status !== "REFUND_FAILED") return mark("done", { note: note || "이미 처리된 환불" });
    await sb.from("payment").update({ raw: { ...(p.raw || {}), ops_retries: 0, ops_last_try: null } }).eq("id", p.id);
    await sb.from("ops_alert").delete().eq("id", a.id);   // 다시 실패하면 대조가 새로 만든다
    return Response.json({ ok: true, result: await runOpsChecks(sb, { now }) });
  }

  if (body.action === "refund_payment") {
    if (!["duplicate_charge", "amount_mismatch"].includes(a.kind) || !a.payment_id || a.status !== "open") return Response.json({ error: "환불할 수 있는 건이 아니에요." }, { status: 400 });
    if (!tossReady()) return Response.json({ error: "결제 키가 설정되지 않았어요." }, { status: 503 });
    const { data: p } = await sb.from("payment").select("id, account_id, toss_payment_key, amount, status").eq("id", a.payment_id).maybeSingle();
    if (!p || p.status !== "DONE" || !p.toss_payment_key) return Response.json({ error: "환불할 결제를 찾지 못했어요." }, { status: 409 });
    const r = await cancelPayment(p.toss_payment_key, { cancelReason: "이중 결제 · 금액 오류 환불", idempotencyKey: `opsrefund_${p.id}` });
    await sb.from("payment").upsert({
      account_id: p.account_id, order_id: `opsrefund_${p.id}`, toss_payment_key: p.toss_payment_key,
      amount: -Math.abs(p.amount), status: r.ok ? "CANCELED" : "REFUND_FAILED", plan: null,
      raw: { reason: "ops_refund", alert: a.id, error: r.ok ? null : (r.error?.code || r.status) },
    }, { onConflict: "order_id" });
    if (!r.ok) return Response.json({ error: `토스가 환불을 거절했어요(${r.error?.code || r.status}). 내일 자동으로 다시 시도해요.` }, { status: 502 });
    return mark("done", { note: note || "전액 환불함 · 이용 기간은 그대로(필요하면 직접 조정)" });
  }
  return Response.json({ error: "알 수 없는 요청이에요." }, { status: 400 });
}
