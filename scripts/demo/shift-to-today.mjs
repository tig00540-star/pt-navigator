// scripts/demo/shift-to-today.mjs — 데모 센터의 모든 날짜를 '오늘' 기준으로 옮긴다(2026-10-06).
// -----------------------------------------------------------------------------
// 전제: docs/migrations/2026-10-06-demo-shift.sql 실행(함수 demo_shift_days).
// 미리보기: node --import ./scripts/demo/alias-loader.mjs scripts/demo/shift-to-today.mjs          ← 며칠 옮길지만 보여 줌
// 실제:     node --import ./scripts/demo/alias-loader.mjs scripts/demo/shift-to-today.mjs --write
// 기준일: .demo-credentials.json 의 anchorDate(데모가 '오늘'이던 날 · 없으면 2026-10-05) → 옮긴 뒤 오늘로 바꿔 적는다.
// 운동일지 확인 · 서명의 내용 해시엔 수업 시각이 들어가므로, 옮기기 전에 맞던 해시만 새 시각으로 다시 계산한다
// (원래 '확인 후 변경됨'이던 건 그대로 · 자동 확인(sql1:)은 해시 대신 edited_at으로 보므로 건드리지 않음).
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";
import { fetchByIds } from "../../lib/fetchByIds.js";
import { fetchAllRows } from "../../lib/fetchAllRows.js";

const DRY = !process.argv.includes("--write");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CRED_FILE = path.join(HERE, ".demo-credentials.json");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const creds = JSON.parse(fs.readFileSync(CRED_FILE, "utf8"));
const ACC = creds.accountId;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const anchor = creds.anchorDate || "2026-10-05";
const today = kstToday();
const days = Math.round((Date.parse(today) - Date.parse(anchor)) / 86400000);

async function logsWithHashes() {
  const { data: logs, error } = await fetchAllRows(() => sb.from("daily_workout_log").select("id, ai_summary, session_at, sets_structured").eq("account_id", ACC));
  if (error) throw new Error(`daily_workout_log: ${error.message}`);
  const ids = logs.map((l) => l.id);
  const confs = await fetchByIds(sb, "workout_log_confirmation", "id, log_id, content_hash, method", "log_id", ids);
  const sigs = await fetchByIds(sb, "workout_log_signature", "id, log_id, content_hash", "log_id", ids);
  if (confs.error) throw new Error(`workout_log_confirmation: ${confs.error.message}`);
  if (sigs.error) throw new Error(`workout_log_signature: ${sigs.error.message}`);
  return { logs: new Map(logs.map((l) => [l.id, l])), confs: confs.data || [], sigs: sigs.data || [] };
}

async function main() {
  console.log(`▶ 데모 센터 ${creds.centerName ?? ""} · 기준일 ${anchor} → 오늘 ${today} · ${days}일 옮김`);
  if (days === 0) { console.log("✔ 이미 오늘 기준이에요. 할 일 없음."); return; }
  if (DRY) { console.log("[미리보기 — DB에 쓰지 않음 · 실제로 옮기려면 --write]"); return; }

  // 옮기기 전: 내용과 맞는(=변경 없는) 확인 · 서명 해시만 고른다
  const before = await logsWithHashes();
  const ok = (row) => row.content_hash && !row.content_hash.startsWith("sql1:") && before.logs.has(row.log_id)
    && contentHashNode(before.logs.get(row.log_id), crypto) === row.content_hash;
  const confFix = before.confs.filter(ok), sigFix = before.sigs.filter(ok);

  const { data, error } = await sb.rpc("demo_shift_days", { p_days: days });
  if (error) throw new Error(`demo_shift_days: ${error.message}`);
  console.log("  옮긴 행:", Object.entries(data || {}).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`).join(" · "));

  // 음성일지 본문 첫 줄의 날짜("[2026.10.05 · 20회차 …]")도 같이 옮긴다.
  //   본문을 고치면 트리거가 edited_at을 지금으로 바꾸므로(=확인 후 변경됨 · 자동 확인 시계) 바로 원래 값으로 되돌린다.
  const DOT = /(\d{4})\.(\d{2})\.(\d{2})/g;
  const moveDot = (s) => s.replace(DOT, (m, y, mo, d) => new Date(Date.UTC(+y, +mo - 1, +d) + days * 86400000).toISOString().slice(0, 10).replace(/-/g, "."));
  const { data: dotted, error: dErr } = await sb.from("daily_workout_log").select("id, ai_summary, edited_at").eq("account_id", ACC).like("ai_summary", "%20__.__.__%");
  if (dErr) throw new Error(`daily_workout_log text: ${dErr.message}`);
  for (const l of dotted || []) {
    const text = moveDot(l.ai_summary);
    if (text === l.ai_summary) continue;
    const a = await sb.from("daily_workout_log").update({ ai_summary: text }).eq("id", l.id).select("id");
    const b = await sb.from("daily_workout_log").update({ edited_at: l.edited_at }).eq("id", l.id).select("id");
    if (a.error || b.error) throw new Error(`daily_workout_log text: ${(a.error || b.error).message}`);
  }
  if (dotted?.length) console.log(`  일지 본문 날짜 ${dotted.length}건 옮김`);

  // 옮긴 뒤: 새 수업 시각으로 해시 다시 계산
  const after = await logsWithHashes();
  let n = 0;
  for (const [table, rows] of [["workout_log_confirmation", confFix], ["workout_log_signature", sigFix]]) {
    for (const r of rows) {
      const log = after.logs.get(r.log_id);
      if (!log) continue;
      const { error: e } = await sb.from(table).update({ content_hash: contentHashNode(log, crypto) }).eq("id", r.id).select("id");
      if (e) throw new Error(`${table} hash: ${e.message}`);
      n++;
    }
  }
  console.log(`  확인 · 서명 해시 ${n}건 다시 계산`);

  // 아침 보고서 중 오늘보다 뒤 날짜가 된 것은 지운다(아직 오지 않은 날 · 그날 아침 작업이 새로 만든다)
  const { error: rErr, count } = await sb.from("owner_daily_report").delete({ count: "exact" }).eq("account_id", ACC).gt("ymd", today);
  if (rErr) throw new Error(`owner_daily_report: ${rErr.message}`);
  if (count) console.log(`  내일 이후 날짜가 된 아침 보고서 ${count}건 지움`);

  creds.anchorDate = today;
  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
  console.log(`✔ 끝 — 기준일을 ${today}로 적었어요.`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
