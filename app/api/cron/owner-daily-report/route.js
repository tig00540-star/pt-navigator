// app/api/cron/owner-daily-report/route.js
// -----------------------------------------------------------------------------
// 대표 아침 보고서 — 매일 아침 8시대(KST · Vercel Cron "0 23 * * *" UTC · Hobby 플랜은 그 1시간 안 아무 때나 → 9시 전엔 항상 준비) 센터(center 계정)마다 미리 만들어 둔다(2026-10-03).
//   숫자 = lib/memberStatus ownerReportData(대표 화면과 같은 순수 함수 · 어제 결과 · 오늘 예정 포함)
//   AI 총평 · 코칭 = lib/ownerReportAI(프리미엄 · 구독 활성 계정만)
//   저장 = owner_daily_report(account_id, ymd) upsert — 대표 화면이 열자마자 읽는다(RLS: 대표만 읽기 · 쓰기는 여기 service_role만).
// 인증: Authorization: Bearer <CRON_SECRET>. 수동 실행(점검): ?account=<id> 로 한 센터만.
// 데모 센터도 만든다(대표 화면 시연용 · 운영 지표와 무관).
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { ownerReportData } from "@/lib/memberStatus";
import { buildOwnerAIInput, generateOwnerAI } from "@/lib/ownerReportAI";
import { personName } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req) {
  const s = process.env.CRON_SECRET;
  return Boolean(s) && (req.headers.get("authorization") || "") === `Bearer ${s}`;
}

const kstYm = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 7);

async function buildFor(sb, account, nowMs, apiKey) {
  const aid = account.id;
  const nowISO = new Date(nowMs).toISOString();
  const ym = kstYm(nowMs);
  const apptCutoff = new Date(nowMs - 90 * 86400000).toISOString(); // 대표 화면과 같은 창(최근 90일)
  const [mR, oR, cR, lR, aR, gR, tR] = await Promise.all([
    sb.from("user_table").select("*").eq("account_id", aid),
    fetchAllRows(() => sb.from("ot_log").select("*").eq("account_id", aid)),
    fetchAllRows(() => sb.from("session_log").select("*").eq("account_id", aid)),
    fetchAllRows(() => sb.from("daily_workout_log").select("*").eq("account_id", aid)),
    fetchAllRows(() => sb.from("appointment").select("*").eq("account_id", aid).gte("start_at", apptCutoff)),
    sb.from("trainer_goal").select("*").eq("account_id", aid),
    sb.from("trainer").select("id, name").eq("account_id", aid),
  ]);
  const err = mR.error || oR.error || cR.error || lR.error || aR.error || gR.error || tR.error;
  if (err) throw new Error(err.message);

  const d = ownerReportData({
    members: mR.data || [], otRows: oR.data || [], contracts: cR.data || [], logs: lR.data || [],
    appts: aR.data || [], goals: gR.data || [], ym, nowISO,
  });

  // AI — 프리미엄 + 구독 활성(auth_account_plan()과 같은 조건)일 때만.
  const premium = account.plan === "premium" && account.subscription_status === "active"
    && (!account.current_period_end || Date.parse(account.current_period_end) > nowMs);
  let ai = null;
  if (premium && apiKey) {
    const names = new Map((tR.data || []).map((t) => [t.id, personName(t.name) || "트레이너"]));
    try {
      ai = await generateOwnerAI(buildOwnerAIInput(d, (id) => names.get(id) || "담당 미정"), apiKey);
    } catch (e) {
      console.error("[owner-daily-report] AI 실패", aid, e?.message || e);
    }
  }
  const row = { account_id: aid, ymd: d.dateISO, data: d, ai: ai ? { ...ai, state: "ready" } : { state: premium ? "failed" : "premium" }, generated_at: nowISO };
  const { error: upErr } = await sb.from("owner_daily_report").upsert(row, { onConflict: "account_id,ymd" });
  if (upErr) throw new Error(upErr.message);
  return { account: aid, ymd: d.dateISO, items: d.results?.items?.length ?? 0, ai: Boolean(ai) };
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "supabase 키 미설정" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const only = new URL(req.url).searchParams.get("account");
  let q = sb.from("account").select("id, type, plan, subscription_status, current_period_end").eq("type", "center");
  if (only) q = q.eq("id", only);
  const { data: accounts, error } = await q;
  if (error) return Response.json({ error: `계정 조회 실패: ${error.message}` }, { status: 500 });

  const nowMs = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY || null;
  const ymd = new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 센터가 늘어도 시간 안에 끝나게(2026-10-06): ① 오늘 이미 다 만든 센터는 건너뜀(수동 재실행 · 이어 하기)
  //   ② 4곳씩 동시에(AI 한 번 수십 초 · 한 줄로 돌리면 센터 10곳만 넘어도 5분 한도에 걸린다)
  //   ③ 남은 시간이 40초 아래면 새 센터는 시작하지 않음 — 못 만든 센터는 대표가 열 때 화면이 지금 데이터로 만든다(기존 대체 경로).
  let list = accounts || [];
  if (!only && list.length) {
    const { data: have } = await sb.from("owner_daily_report").select("account_id, ai").eq("ymd", ymd).in("account_id", list.map((a) => a.id));
    const ready = new Set((have || []).filter((r) => r.ai?.state && r.ai.state !== "failed").map((r) => r.account_id));
    list = list.filter((a) => !ready.has(a.id));
  }
  const deadline = nowMs + (maxDuration - 40) * 1000;
  const done = [], failed = [], skipped = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const a = list[i++];
      if (Date.now() > deadline) { skipped.push(a.id); continue; }
      try { done.push(await buildFor(sb, a, nowMs, apiKey)); }
      catch (e) { console.error("[owner-daily-report] 실패", a.id, e?.message || e); failed.push(a.id); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
  if (skipped.length) console.warn("[owner-daily-report] 시간 부족으로 건너뜀", skipped.length);
  return Response.json({ ok: true, done, failed, skipped });
}
