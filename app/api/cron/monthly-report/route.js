// app/api/cron/monthly-report/route.js
// -----------------------------------------------------------------------------
// 월간 결산 — 매일 아침 8시대(KST) 돌지만 **매월 1일에만** 지난달 결산을 만든다(2026-10-06).
//   Vercel Cron "20 23 * * *"(UTC) = KST 다음 날 8시 20분 무렵 · Hobby는 그 1시간 안 아무 때나.
//   대상: 구독이 살아 있는 계정(센터 · 개인). AI는 프리미엄만. 이미 만든 계정은 건너뜀(이어 하기).
// 인증: Authorization: Bearer <CRON_SECRET>.
// 수동(점검): ?force=1(1일이 아니어도) · ?ym=YYYY-MM(결산 달) · ?account=<id>(한 계정만) · ?redo=1(이미 있어도 다시)
// -----------------------------------------------------------------------------
import { bearerOk } from "@/lib/bearerOk";
import { createClient } from "@supabase/supabase-js";
import { buildMonthlyForAccount } from "@/lib/monthlyReportBuild";
import { lastMonthYm } from "@/lib/monthlyReport";
import { sendPush } from "@/lib/pushServer";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchByIds } from "@/lib/fetchByIds";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req) {
  const s = process.env.CRON_SECRET;
  return bearerOk(req, s);
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "supabase 키 미설정" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const q = new URL(req.url).searchParams;
  const nowMs = Date.now();
  const kstDay = Number(new Date(nowMs + 9 * 3600000).toISOString().slice(8, 10));
  // 1~3일(2026-10-09 · 대량 시험): 계정이 많으면 5분 안에 다 못 끝낸다 → 다음 날 남은 계정만 이어서(이미 만든 계정은 아래에서 건너뜀)
  if (kstDay > 3 && !q.get("force")) return Response.json({ ok: true, skipped: "not_first_days" });
  const ym = /^\d{4}-\d{2}$/.test(q.get("ym") || "") ? q.get("ym") : lastMonthYm(nowMs);
  const only = q.get("account");

  let aq = sb.from("account").select("id, type, plan, subscription_status, current_period_end").in("type", ["center", "solo"]).eq("subscription_status", "active");
  if (only) aq = aq.eq("id", only);
  const { data: accounts, error } = await fetchAllRows(() => aq);   // 계정 1000개 넘어도 다
  if (error) return Response.json({ error: `계정 조회 실패: ${error.message}` }, { status: 500 });
  let list = (accounts || []).filter((a) => !a.current_period_end || Date.parse(a.current_period_end) > nowMs);

  if (!q.get("redo") && list.length) {
    const { data: have } = await fetchByIds(sb, "monthly_report", "id, account_id", "account_id", list.map((a) => a.id), (x) => x.eq("ym", ym).in("kind", ["owner", "solo"]));
    const done = new Set((have || []).map((r) => r.account_id));
    list = list.filter((a) => !done.has(a.id));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || null;
  const deadline = nowMs + (maxDuration - 40) * 1000;
  const done = [], failed = [], skipped = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const a = list[i++];
      if (Date.now() > deadline) { skipped.push(a.id); continue; }
      try {
        const r = await buildMonthlyForAccount(sb, a, { ym, nowMs, apiKey });
        done.push({ account: r.account, rows: r.rows, ai: r.ai });
        for (const n of r.notify) await sendPush(sb, { ...n, type: "monthly" }).catch(() => {});
      } catch (e) { console.error("[monthly-report] 실패", a.id, e?.message || e); failed.push(a.id); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
  return Response.json({ ok: true, ym, done, failed, skipped });
}
