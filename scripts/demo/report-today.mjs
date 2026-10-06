// scripts/demo/report-today.mjs — 데모 센터의 '오늘 아침 보고서'를 지금 다시 만든다(2026-10-06 · 랜딩 촬영용).
// -----------------------------------------------------------------------------
// 아침 작업(app/api/cron/owner-daily-report)과 같은 함수(ownerReportData · ownerReportAI)로 데모 센터 하나만 만들어 저장한다.
// AI 1회(ANTHROPIC_API_KEY · .env.local). 알림은 보내지 않는다. 오늘 날짜 행을 덮어쓴다(upsert).
// 실행: node --import ./scripts/demo/alias-loader.mjs scripts/demo/report-today.mjs --write
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../../lib/fetchAllRows.js";
import { ownerReportData } from "../../lib/memberStatus.js";
import { buildOwnerAIInput, generateOwnerAI } from "../../lib/ownerReportAI.js";
import { personName } from "../../lib/format.js";

const DRY = !process.argv.includes("--write");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const creds = JSON.parse(fs.readFileSync(path.join(HERE, ".demo-credentials.json"), "utf8"));
const aid = creds.accountId;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const nowMs = Date.now(), nowISO = new Date(nowMs).toISOString();
  const ym = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 7);
  const apptCutoff = new Date(nowMs - 90 * 86400000).toISOString();
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
  const d = ownerReportData({ members: mR.data || [], otRows: oR.data || [], contracts: cR.data || [], logs: lR.data || [],
    appts: aR.data || [], goals: gR.data || [], ym, nowISO });
  console.log(`▶ ${creds.centerName ?? ""} · ${d.dateISO} 보고서 · 어제 결과 ${d.results?.items?.length ?? 0}건`);
  if (DRY) { console.log("[미리보기 — AI · 저장 안 함 · 실제로 만들려면 --write]"); return; }
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 없음");
  const names = new Map((tR.data || []).map((t) => [t.id, personName(t.name) || "트레이너"]));
  const ai = await generateOwnerAI(buildOwnerAIInput(d, (id) => names.get(id) || "담당 미정"), env.ANTHROPIC_API_KEY);
  if (!ai) throw new Error("AI 총평을 읽지 못했어요(저장 안 함) · 다시 실행해 주세요.");
  const { error } = await sb.from("owner_daily_report").upsert(
    { account_id: aid, ymd: d.dateISO, data: d, ai: { ...ai, state: "ready" }, generated_at: new Date(`${d.dateISO}T08:23:00+09:00`).toISOString() },   // 데모: 실제 예약 작업처럼 아침 8시대로(화면이 '아침 보고서 · 오후 N시 기준'으로 어색하지 않게)
    { onConflict: "account_id,ymd" });
  if (error) throw new Error(error.message);
  console.log("✔ 저장했어요(AI 총평 포함).");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
