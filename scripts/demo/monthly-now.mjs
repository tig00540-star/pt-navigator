// scripts/demo/monthly-now.mjs — 데모 계정의 월간 결산을 지금 만들어 저장(2026-10-06 · 화면 확인 · 촬영용).
// -----------------------------------------------------------------------------
// 매월 1일 예약 작업(app/api/cron/monthly-report)과 같은 함수(lib/monthlyReportBuild)로 데모 계정 하나만.
// 미리보기(저장 안 함): node --import ./scripts/demo/alias-loader.mjs scripts/demo/monthly-now.mjs [--solo] [--ym 2026-09]
// 실제:               … --write [--no-ai]       (AI = 센터 · 개인 각 1회 · 알림 없음)
// 대상: 데모 센터(.demo-credentials.json) 또는 --solo면 개인 시험 계정(.solo-credentials.json)만.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildMonthlyForAccount } from "../../lib/monthlyReportBuild.js";
import { monthlyReportData, lastMonthYm } from "../../lib/monthlyReport.js";

const argv = process.argv;
const DRY = !argv.includes("--write");
const SOLO = argv.includes("--solo");
const NO_AI = argv.includes("--no-ai");
const ym = (() => { const i = argv.indexOf("--ym"); return i > 0 ? argv[i + 1] : lastMonthYm(); })();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const creds = JSON.parse(fs.readFileSync(path.join(HERE, SOLO ? ".solo-credentials.json" : ".demo-credentials.json"), "utf8"));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: account, error } = await sb.from("account").select("id, type, plan, subscription_status, current_period_end").eq("id", creds.accountId).single();
  if (error) throw new Error(error.message);
  console.log(`▶ ${SOLO ? "개인 시험 계정" : creds.centerName} · ${ym} 결산 ${DRY ? "(미리보기 · 저장 안 함)" : ""}`);
  if (DRY) {
    // 숫자만 계산해서 요약 출력(AI · 저장 없음) — 빌더와 같은 입력을 가볍게 다시 읽지 않고 빌더를 noAI로 돌린 뒤 지우지 않게, 여기선 data만 본다
    const r = await buildMonthlyForAccount({ ...sb, from: (t) => (t === "monthly_report" ? fakeTable() : sb.from(t)) }, account, { ym, noAI: true });
    console.log(`  행 ${r.rows}개가 만들어질 예정`);
    return;
  }
  const r = await buildMonthlyForAccount(sb, account, { ym, apiKey: env.ANTHROPIC_API_KEY, noAI: NO_AI });
  console.log(`✔ 저장 ${r.rows}행 · AI ${r.ai ? "있음" : "없음"}`);
}

// 미리보기용: monthly_report 읽기 · 쓰기를 흉내(아무것도 안 씀)
function fakeTable() {
  const chain = {
    select: () => chain, eq: () => chain, is: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: (row) => { summarize(row); return { select: async () => ({ data: [{ id: "dry" }], error: null }) }; },
    update: () => chain,
  };
  return chain;
}
function summarize(row) {
  const d = row.data;
  if (row.kind === "owner" || row.kind === "solo") {
    const c = d.center;
    console.log(`  [${row.kind}] 매출 ${c.revenue.net.toLocaleString()} (지난달 ${c.revenue.prev.toLocaleString()}) · OT ${c.otHeld}건 · 등록 ${c.ot.success}/${c.ot.attempted} · 재등록 ${c.rereg.success}/${c.rereg.attempted} · 추천 ${c.recommend?.target?.toLocaleString() ?? "—"}`);
    for (const t of d.trainers) console.log(`    · ${t.name}: 매출 ${t.revenue.total.toLocaleString()} · OT ${t.ot.held} · 수업 ${t.sessions} · 잘함 ${t.signals.good.length} · 보완 ${t.signals.bad.length} · 추천 ${t.recommend?.target?.toLocaleString() ?? "—"}`);
  } else {
    const t = d.trainer;
    console.log(`  [trainer] ${t.name} · 이벤트 ${t.events.length} · 재등록 대상 ${t.expiring.length} · OT 보류 ${t.otHold.length} · 운동한 날 ${t.ounwanDays}`);
  }
}
void monthlyReportData;

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
