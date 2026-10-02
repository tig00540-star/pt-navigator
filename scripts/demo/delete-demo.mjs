// scripts/demo/delete-demo.mjs — seed-demo.mjs가 만든 데모 센터 계정을 통째로 지운다.
// -----------------------------------------------------------------------------
// 실행: node scripts/demo/delete-demo.mjs
//
// ⚠️ 안전장치 — 실제 계정을 지우는 사고를 막는다.
//   - 지울 계정 id는 scripts/demo/.demo-credentials.json에서만 읽는다(인자로 받지 않음).
//   - 그 계정의 대표 이메일이 데모 주소(demo.owner@onlytrainer.co.kr)가 아니면 아무것도 안 지우고 멈춘다.
//   - 지우는 범위는 그 account_id의 행 + 그 계정 회원(user_id) 행 + 데모 로그인 계정뿐.
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CRED_FILE = path.join(HERE, ".demo-credentials.json");
const DEMO_OWNER_EMAIL = "demo.owner@onlytrainer.co.kr";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!fs.existsSync(CRED_FILE)) { console.error("✖ 지울 데모 계정 정보가 없습니다(scripts/demo/.demo-credentials.json)."); process.exit(1); }
const creds = JSON.parse(fs.readFileSync(CRED_FILE, "utf8"));
const accountId = creds.accountId;
if (!accountId) { console.error("✖ 계정 id가 비어 있습니다."); process.exit(1); }

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function del(label, q) {
  const { error, count } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`  - ${label}${typeof count === "number" ? ` ${count}건` : ""}`);
}

async function main() {
  // ① 정말 데모 계정인지 — 대표 이메일로 확인
  const { data: owner } = await sb.from("trainer").select("id").eq("account_id", accountId).eq("role", "owner").maybeSingle();
  if (owner) {
    const { data: u } = await sb.auth.admin.getUserById(owner.id);
    if (u?.user?.email !== DEMO_OWNER_EMAIL) {
      console.error(`✖ 이 계정의 대표가 데모 주소가 아닙니다(${u?.user?.email ?? "없음"}). 지우지 않고 멈춥니다.`);
      process.exit(1);
    }
  }
  console.log(`▶ 데모 계정 삭제: ${creds.centerName ?? ""} (${accountId})`);

  const { data: mem } = await sb.from("user_table").select("id").eq("account_id", accountId);
  const memberIds = (mem || []).map((m) => m.id);
  const { data: ann } = await sb.from("announcement").select("id").eq("account_id", accountId);
  const annIds = (ann || []).map((a) => a.id);

  const opt = { count: "exact" };
  if (memberIds.length) {
    for (const t of ["cardio_log", "schedule_check", "member_photo"]) await del(t, sb.from(t).delete(opt).in("user_id", memberIds));
  }
  // 수업 로그를 지우면 회원 확인(workout_log_confirmation)은 연쇄 삭제된다.
  for (const t of ["appointment", "daily_workout_log", "inbody_log", "ot_log", "session_log", "trainer_todo"]) {
    await del(t, sb.from(t).delete(opt).eq("account_id", accountId));
  }
  await del("user_table", sb.from("user_table").delete(opt).eq("account_id", accountId));
  if (annIds.length) await del("announcement_read", sb.from("announcement_read").delete(opt).in("announcement_id", annIds));
  for (const t of ["announcement", "pt_package", "pay_scheme", "pay_policy", "payroll_run", "trainer_goal", "expense", "income",
    "trainer_reward", "center_machine", "library_item", "trainer_profile", "payment"]) {
    await del(t, sb.from(t).delete(opt).eq("account_id", accountId));
  }
  const { data: trs } = await sb.from("trainer").select("id").eq("account_id", accountId);
  await del("trainer", sb.from("trainer").delete(opt).eq("account_id", accountId));
  await del("account", sb.from("account").delete(opt).eq("id", accountId));

  // ② 로그인 계정 — 이 계정에 속했던 사람 + 정보 파일에 적힌 사람
  const ids = new Set([...(trs || []).map((t) => t.id), creds.owner?.id, ...(creds.trainers || []).map((t) => t.id)].filter(Boolean));
  for (const id of ids) {
    const { error } = await sb.auth.admin.deleteUser(id);
    console.log(`  - 로그인 계정 ${id.slice(0, 8)}… ${error ? "실패: " + error.message : "삭제"}`);
  }
  fs.unlinkSync(CRED_FILE);
  console.log("✔ 삭제 완료 — lib/demo.js의 DEMO_ACCOUNT_IDS에서 이 id를 빼 주세요(없으면 그대로).");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
