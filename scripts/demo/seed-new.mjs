// scripts/demo/seed-new.mjs — 2026-10-06 새 기능을 데모 센터에 채운다(랜딩 촬영용).
// -----------------------------------------------------------------------------
// 전제: 데모 날짜가 오늘 기준(shift-to-today.mjs --write 뒤 · anchorDate = 오늘).
// 미리보기: node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-new.mjs                  ← DB에 안 씀
// 실제:     node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-new.mjs --write [--base http://localhost:3000]
// 채우는 것(전부 정민재 = 대표 겸 트레이너 · 이미 있으면 건너뜀):
//   ① 회원 이벤트 2개(센터 · 출석 챌린지 · 선착순 클래스) + 참여 회원
//   ② 수업 예약 요청 3건(새 수업 · 시간 변경 · 취소 · 대기) + 요청 받기 설정(12시간 전까지)
//   ③ '내용이 달라요' 1건(도은비 · 가장 최근 미확인 일지)
//   ④ OT 신청서 3건 — 실제 신청서 라우트로 제출(센터 QR 2 = 배정 대기 · 정민재 QR 1 = 새 OT 회원) · 2단계 답까지
//   ⑤ 예전 시험용 '테스트 빈 회원' 정리
// 규율: 이름 · 연락처(010-0000-xxxx · 쓰지 않는 국번) · 목표 전부 지어낸 값. AI 결과는 만들지 않는다.
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";

const DRY = !process.argv.includes("--write");
const BASE = (() => { const i = process.argv.indexOf("--base"); return i > 0 ? process.argv[i + 1] : "http://localhost:3000"; })();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const creds = JSON.parse(fs.readFileSync(path.join(HERE, ".demo-credentials.json"), "utf8"));
const ACC = creds.accountId, OID = creds.owner.id;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const DAY = 86400000;
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const TODAY = kstDate(Date.now());
const plus = (n) => kstDate(Date.now() + n * DAY);
const atKst = (ymd, hh, mm = 0) => new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`).toISOString();
const monthStart = TODAY.slice(0, 8) + "01";
const monthEnd = (() => { const [y, m] = TODAY.split("-").map(Number); return kstDate(Date.UTC(y, m, 0) - 9 * 3600000 + 12 * 3600000); })();

console.log(DRY ? "[미리보기 — DB에 쓰지 않음 · 실제로 넣으려면 --write]" : `[실제 — DB에 씁니다 · 신청서 라우트 ${BASE}]`);
if ((creds.anchorDate || "2026-10-05") !== TODAY) {
  console.error(`✖ 데모 날짜가 오늘 기준이 아니에요(기준일 ${creds.anchorDate || "2026-10-05"}). shift-to-today.mjs --write 먼저.`);
  process.exit(1);
}

async function read(label, q) { const { data, error } = await q; if (error) throw new Error(`${label}: ${error.message}`); return data || []; }
async function write(label, q) {
  if (DRY) { console.log(`  (미리보기) ${label}`); return []; }
  const { data, error } = await q.select();
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`  + ${label}`);
  return data || [];
}

async function main() {
  const members = await read("user_table", sb.from("user_table").select("id, name, status, trainer_id").eq("account_id", ACC));
  const byName = (n) => members.find((m) => m.name === n && m.trainer_id === OID);

  // ⑤ 시험용 회원 정리(이름이 정확히 같을 때만)
  const junk = members.filter((m) => m.name === "테스트 빈 회원");
  for (const j of junk) await write(`시험용 회원 지움 · ${j.name}`, sb.from("user_table").delete().eq("id", j.id).eq("account_id", ACC));

  // ① 회원 이벤트
  console.log("① 회원 이벤트");
  const events = await read("member_event", sb.from("member_event").select("id, title").eq("account_id", ACC));
  const EVENTS = [
    { kind: "challenge", title: "10월 출석 챌린지", body: "이번 달 오운완 12일을 채우면 프로틴 쉐이크를 드려요. 수업 날도, 혼자 운동한 날도 다 세요.",
      goal_count: 12, reward_text: "프로틴 쉐이크 1잔", starts_on: monthStart, ends_on: monthEnd, join_from: monthStart, join_until: plus(4), capacity: 30,
      joins: ["나태윤", "도은비", "구하람", "왕재민", "송지안", "표하은", "제우현", "조아라", "채도영"] },
    { kind: "general", title: "토요 하체 클래스 · 선착순 10명", body: "트레이너와 함께 하는 40분 그룹 클래스예요. 스쿼트 · 런지 자세를 한 번에 잡아 드려요. 운동화 · 물만 챙겨 오세요.",
      goal_count: null, reward_text: null, starts_on: plus(11), ends_on: plus(11), join_from: plus(-3), join_until: plus(9), capacity: 10,
      joins: ["나태윤", "송지안", "표하은", "엄태경", "인하준", "육서진", "채도영"] },
  ];
  for (const e of EVENTS) {
    if (events.some((x) => x.title === e.title)) { console.log(`  = 있음 · ${e.title}`); continue; }
    const { joins, ...row } = e;
    const [ev] = await write(`이벤트 · ${e.title}`, sb.from("member_event").insert({ ...row, account_id: ACC, created_by: OID, scope: "center", target_trainer: null, active: true, created_at: atKst(plus(-5), 21, 10) }));
    const jr = joins.map(byName).filter(Boolean).map((m, i) => ({ event_id: ev?.id, member_id: m.id, joined_at: atKst(plus(-4 + Math.min(i, 4)), 12 + (i % 9), (i * 7) % 60) }));
    if (ev) await write(`  참여 ${jr.length}명`, sb.from("member_event_join").insert(jr));
  }

  // ② 수업 예약 요청
  console.log("② 수업 예약 요청");
  await write("요청 받기 · 12시간 전까지", sb.from("trainer_booking_pref").upsert({ trainer_id: OID, accept: true, cutoff_hours: 12, updated_at: new Date().toISOString() }));
  const pend = await read("appt_request", sb.from("appt_request").select("id").eq("trainer_id", OID).eq("status", "pending"));
  if (pend.length) console.log(`  = 대기 요청 ${pend.length}건 있음 · 건너뜀`);
  else {
    const appts = await read("appointment", sb.from("appointment").select("id, user_id, start_at").eq("trainer_id", OID).eq("status", "booked")
      .gte("start_at", new Date(Date.now() + 14 * 3600000).toISOString()).order("start_at"));
    const nameOf = (id) => members.find((m) => m.id === id)?.name;
    const change = appts.find((a) => nameOf(a.user_id) === "인하준") || appts[1];
    const cancel = appts.find((a) => a.id !== change?.id && nameOf(a.user_id) === "육서진") || appts.find((a) => a.id !== change?.id);
    const jo = byName("조아라");
    const rows = [];
    if (jo) rows.push({ kind: "new", member_id: jo.id, want_start: atKst(plus(2), 20), note: "평일 저녁 8시가 제일 편해요.", created_at: new Date(Date.now() - 50 * 60000).toISOString() });
    if (change) {
      const d = kstDate(Date.parse(change.start_at) + DAY);
      rows.push({ kind: "change", member_id: change.user_id, appointment_id: change.id, orig_start: change.start_at, want_start: atKst(d, 7), note: "그날 야근이 생겨서 다음 날 아침으로 바꿀 수 있을까요?", created_at: new Date(Date.now() - 2 * 3600000).toISOString() });
    }
    if (cancel) rows.push({ kind: "cancel", member_id: cancel.user_id, appointment_id: cancel.id, orig_start: cancel.start_at, note: "출장이 잡혀서 이번 수업은 취소할게요. 다녀와서 다시 잡을게요.", created_at: new Date(Date.now() - 5 * 3600000).toISOString() });
    if (rows.length) await write(`요청 ${rows.length}건(${rows.map((r) => `${r.kind} ${nameOf(r.member_id)}`).join(" · ")})`,
      sb.from("appt_request").insert(rows.map((r) => ({ ...r, account_id: ACC, trainer_id: OID, status: "pending" }))));
  }

  // ③ 내용이 달라요
  console.log("③ 내용이 달라요");
  const de = byName("도은비");
  if (de) {
    const logs = await read("daily_workout_log", sb.from("daily_workout_log").select("id, ai_summary, session_at, sets_structured, source, voided")
      .eq("user_id", de.id).order("session_at", { ascending: false }).limit(10));
    const confs = await read("confirmation", sb.from("workout_log_confirmation").select("log_id, result").in("log_id", logs.map((l) => l.id)));
    if (confs.some((c) => c.result === "dispute")) console.log("  = 이미 있음");
    else {
      const target = logs.find((l) => !l.voided && l.source !== "noshow" && !confs.some((c) => c.log_id === l.id));
      if (target) await write(`도은비 ${target.session_at.slice(5, 10)} 일지`, sb.from("workout_log_confirmation").insert({
        log_id: target.id, member_id: de.id, result: "dispute", method: "tap", content_hash: contentHashNode(target, crypto),
        dispute_note: "레그프레스는 안 했고 런지를 했어요. 고쳐 주세요.", confirmed_at: new Date(Date.now() - 3 * 3600000).toISOString(),
      }));
      else console.log("  (미확인 일지가 없어 건너뜀)");
    }
  }

  // ④ OT 신청서 — 실제 라우트로
  console.log("④ OT 신청서");
  const links = await read("intake_link", sb.from("intake_link").select("code, trainer_id").eq("account_id", ACC).eq("active", true));
  const centerCode = links.find((l) => !l.trainer_id)?.code, ownerCode = links.find((l) => l.trainer_id === OID)?.code;
  const apps = await read("ot_application", sb.from("ot_application").select("name").eq("account_id", ACC));
  const APPS = [
    { code: centerCode, name: "윤채원", phone: "01000001001", health: false,
      first: { gender: "female", age: "29" }, slots: { 2: [19, 20], 4: [19, 20], 6: [10, 11] }, note: "",
      more: { goal: "12월 바디프로필 촬영", job: "마케터", weekly_freq: "3", lead_source: "인스타그램", exercise_level: "가끔씩", pref_trainer_gender: "female" } },
    { code: centerCode, name: "김태오", phone: "01000001002", health: true,
      first: { gender: "male", age: "34" }, slots: { 1: [7], 3: [7], 5: [7] }, note: "출근 전 아침만 돼요",
      more: { goal: "체중 8kg 감량", job: "개발자", weekly_freq: "2", lead_source: "네이버 검색 · 지도", exercise_level: "처음", activity_level: "주로 앉아서", pref_trainer_gender: "any",
        health_screen: { items: ["고혈압"] }, pain: "오래 앉아 있으면 허리가 뻐근해요" } },
    { code: ownerCode, name: "서하린", phone: "01000001003", health: false,
      first: { gender: "female", age: "41" }, slots: { 2: [10, 11], 4: [10, 11] }, note: "아이 등원 뒤 오전",
      more: { goal: "계단 오를 때 숨찬 것 줄이기", job: "초등학교 교사", weekly_freq: "2", lead_source: "지인 소개", exercise_level: "처음", pref_trainer_gender: "any" } },
  ];
  for (const a of APPS) {
    if (!a.code) { console.log(`  ✖ 링크 없음 · ${a.name}`); continue; }
    if (apps.some((x) => x.name === a.name)) { console.log(`  = 있음 · ${a.name}`); continue; }
    if (DRY) { console.log(`  (미리보기) ${a.name} → ${a.code === centerCode ? "센터 QR" : "정민재 QR"}`); continue; }
    const res = await fetch(`${BASE}/api/ot-intake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      code: a.code, name: a.name, phone: a.phone, website: "", answers: a.first,
      slots: { by_day: a.slots, note: a.note }, consent: { general: true, log_rule: true, health: a.health },
    }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(`신청 ${a.name}: ${res.status} ${JSON.stringify(d)}`);
    const r2 = await fetch(`${BASE}/api/ot-intake`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: d.app, token: d.token, answers: a.more, health: false, healthKnown: a.health }) });
    const d2 = await r2.json().catch(() => ({}));
    if (!r2.ok || !d2.ok) throw new Error(`이어 적기 ${a.name}: ${r2.status} ${JSON.stringify(d2)}`);
    console.log(`  + ${a.name} (${d.kind})`);
  }
  console.log(DRY ? "✔ 미리보기 끝" : "✔ 끝");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
