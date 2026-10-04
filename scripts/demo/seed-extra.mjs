// scripts/demo/seed-extra.mjs — 데모 센터("강남 피트니스")에 '모든 상황'을 더 채운다(2026-10-05).
// -----------------------------------------------------------------------------
// 전제: seed-demo.mjs --write로 데모 센터가 이미 있다(scripts/demo/.demo-credentials.json).
// 미리보기: node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-extra.mjs          ← 기본. DB에 안 씀.
// 실제:     node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-extra.mjs --write
// 삭제:     node scripts/demo/delete-demo.mjs (센터 전체를 지운다 · 이 스크립트가 넣은 것 포함)
//
// 더하는 것(seed-demo 이후 생긴 기능 · 상황):
//   · 오늘(실행일) 스케줄 — 완료 · 예약 · 취소 · 어제 미처리 2건 · 이번 주 예약 / 지난 예약 정리
//   · 최근 수업(어제 · 그제) — 꾸준한 PT 회원 · 오늘 완료 수업 일지
//   · 어제 결과(대표 아침 보고서) — OT 등록 · OT 그만 · OT 이어감(제안 못 함) · 3차 OT로 가는 보류 · 재등록 성공 · 보류 · 안 함
//   · PT 종료 처리할까요(남은 0회) · 7일 미루기 · 지난 회원(읽기 전용 · 6개월 지나 닫힘) · 환불(숨김) 회원
//   · 2번째 재등록 회원 · 재등록 만족도
//   · 개인운동 루틴(규칙 계산 · 확정 · 보이기 · 회원 기록 · 아파서 멈춤) · 루틴 요청(처리됨 · 열림)
//   · 목표 로드맵(트레이너가 직접 쓴 것) · 개인정보/건강정보 동의(동의 · 건강정보 미동의 · 철회)
//   · 회원 자가입력(유산소 · 개인운동 = 오운완 연속) · 사례 보관함(인바디 · 운동 변화 · 기록 숫자 그대로)
//   · 대표 피드백(확인 전 · 확인함) · 트레이너 메모 할 일 · 공지 읽음
//
// ⚠️ 규율(seed-demo와 같음): 이름 · 연락처 · 통증 · 인바디 전부 지어낸 값. AI 결과(OT 리포트 · 재등록 리포트 · 세일즈북 ·
//   운동일지 요약 · 대표 보고서 AI 총평)는 여기서 만들지 않는다 → 실제 앱에서 실제 AI로. 숫자(루틴 · 사례)는 앱의 계산 함수로.
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";
import * as MS from "../../lib/memberStatus.js";
import { draftRoutine } from "../../lib/routine.js";
import { inbodyCandidates, liftCandidates, anonLabel, guessCategory } from "../../lib/salesCase.js";

const DRY = !process.argv.includes("--write");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CRED_FILE = path.join(HERE, ".demo-credentials.json");

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!fs.existsSync(CRED_FILE)) { console.error("✖ 데모 센터가 없습니다. 먼저 seed-demo.mjs --write"); process.exit(1); }
const creds = JSON.parse(fs.readFileSync(CRED_FILE, "utf8"));
const ACC = creds.accountId;
const OWNER_ID = creds.owner.id;
const T = Object.fromEntries(creds.trainers.map((t) => [t.key, t.id]));
// 읽기는 미리보기에서도 한다(지금 상태를 보고 계획을 세우려고). 쓰기는 w()만 — DRY면 막힌다.
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(DRY ? "[미리보기 — DB에 쓰지 않음 · 실제로 넣으려면 --write]" : "[실제 — DB에 씁니다]");

/* ───────── 도우미 ───────── */
let _s = 20261005;
const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000;
const NOW = Date.now();
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const atKst = (ymd, hh = 10, mm = 0) => new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`).toISOString();
const daysAgo = (n) => kstDate(NOW - n * DAY);
const TODAY = kstDate(NOW);
const YDAY = daysAgo(1);
const todayStartISO = atKst(TODAY, 0);

async function read(label, q) {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}
let FAKE = 0;
async function w(label, q, rows) {
  if (DRY) { FAKE += Array.isArray(rows) ? rows.length : 1; return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: crypto.randomUUID(), ...r })); }
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}
const ins = (table, rows) => w(`${table} insert`, sb.from(table).insert(rows).select(), rows);

/* ───────── 운동 기록 만들기(진도 있는 세트) ───────── */
// [이름, 시작 무게, 한 칸, 횟수]
const MOVES = {
  legs: [["레그프레스", 60, 10, 12], ["힙쓰러스트", 40, 5, 12], ["레그컬", 20, 2.5, 12], ["힙어브덕션", 35, 5, 15]],
  back: [["랫풀다운", 30, 2.5, 12], ["시티드로우", 30, 2.5, 12]],
  chest: [["체스트프레스", 25, 2.5, 12], ["케이블크로스오버", 10, 1.25, 12]],
  shoulders: [["숄더프레스 머신", 15, 2.5, 12], ["사이드 레터럴 레이즈", 3, 1, 15]],
};
function sessionSets(k, scale = 1) {
  // k번째 수업 — 부위 두 개씩 돌아가며 · 3수업마다 한 칸 올림
  const pairs = [["legs", "back"], ["chest", "shoulders"], ["legs", "chest"], ["back", "shoulders"]];
  const [a, b] = pairs[k % pairs.length];
  const list = [...MOVES[a].slice(0, 2), ...MOVES[b].slice(0, 2)];
  return list.map(([exercise, base, step, reps]) => {
    const wgt = Math.round((base * scale + step * Math.floor(k / 3)) / step) * step;
    const light = wgt <= 5;
    return { exercise, sets: light ? [{ weight: wgt, reps }, { weight: wgt, reps }] : [{ weight: Math.max(step, wgt - step * 2), reps: 12 }, { weight: wgt, reps }, { weight: wgt, reps: reps - 2 }] };
  });
}
// 마지막 수업 날짜에서 거꾸로 n번(주 2~3회)
function sessionDates(n, lastYmd, everyDays = 3) {
  const last = Date.parse(atKst(lastYmd, 12));
  return Array.from({ length: n }, (_, i) => kstDate(last - (n - 1 - i) * everyDays * DAY));
}

async function main() {
  /* ───────── 0. 지금 상태 ───────── */
  const members = await read("회원", sb.from("user_table").select("*").eq("account_id", ACC));
  if (process.argv.includes("--resume8")) return resume8(members);
  if (members.some((m) => m.name === "한예린")) { console.error("✖ 이미 채워져 있습니다(한예린 있음). 다시 하려면 delete-demo → seed-demo → 이 스크립트."); process.exit(1); }
  const byName = Object.fromEntries(members.map((m) => [m.name, m]));
  const contracts = await read("계약", sb.from("session_log").select("*").eq("account_id", ACC));
  const logs = await read("수업", sb.from("daily_workout_log").select("*").eq("account_id", ACC));
  const machines = await read("장비", sb.from("center_machine").select("*").eq("account_id", ACC));
  const appts = await read("예약", sb.from("appointment").select("*").eq("account_id", ACC));
  console.log(`지금: 회원 ${members.length} · 계약 ${contracts.length} · 수업 ${logs.length} · 예약 ${appts.length} · 오늘 ${TODAY}`);

  /* ───────── 1. 지난 예약 정리 — 오늘 전 'booked'는 완료로(미처리 2건만 남김) ───────── */
  const stale = appts.filter((a) => a.status === "booked" && a.start_at < todayStartISO);
  for (const a of stale) await w("지난 예약 완료", sb.from("appointment").update({ status: "done" }).eq("id", a.id).select("id"), a);
  console.log(`  ✓ 지난 예약 ${stale.length}건 완료 처리`);
  const futureOld = appts.filter((a) => a.status === "booked" && a.start_at >= todayStartISO);
  for (const a of futureOld) await w("옛 예약 취소", sb.from("appointment").delete().eq("id", a.id).select("id"), a);

  /* ───────── 2. 새 회원 ───────── */
  const mk = (o) => ({
    account_id: ACC, trainer_id: T[o.t], name: o.name, gender: o.gender, age: o.age, job: o.job, goal: o.goal, pain: o.pain || null,
    phone_number: o.phone, status: o.status, origin: "ot_funnel", machines: [], hidden: !!o.hidden,
    created_at: atKst(o.created, 11), status_changed_at: atKst(o.statusAt || o.created, o.statusAt ? 20 : 11), status_note: o.note || null,
    member_token: o.token ? crypto.randomUUID() : null, pt_end_snooze_until: o.snooze ? atKst(o.snooze, 9) : null,
    residence: o.residence || null, mbti: o.mbti || null, injury_history: o.injury || null, exercise_level: o.level || null,
    availability: o.avail || null, goal_deadline: o.deadline || null, member_note: o.memo || null,
  });
  const NEW = [
    { key: "end0", name: "한예린", t: "A", gender: "female", age: 32, job: "간호사", goal: "체지방 감량", phone: "010-0000-3101", status: "pt_active", created: daysAgo(80), token: true, residence: "역삼동", level: "헬스 처음" },
    { key: "snooze", name: "문지환", t: "B", gender: "male", age: 45, job: "자영업", goal: "체력 기르기", phone: "010-0000-3102", status: "pt_active", created: daysAgo(45), snooze: daysAgo(-4) },
    { key: "past", name: "서다인", t: "A", gender: "female", age: 28, job: "디자이너", goal: "탄탄한 몸 만들기", phone: "010-0000-3103", status: "inactive", created: daysAgo(110), statusAt: daysAgo(21), note: "남은 수업 0회", token: true },
    { key: "closed", name: "남궁현", t: "C", gender: "male", age: 50, job: "회사원", goal: "허리 통증 줄이기", pain: "허리 뻐근함", phone: "010-0000-3104", status: "inactive", created: daysAgo(300), statusAt: daysAgo(220), note: "남은 수업 0회", token: true },
    { key: "refund", name: "배수정", t: "A", gender: "female", age: 36, job: "주부", goal: "체지방 감량", phone: "010-0000-3105", status: "pt_active", created: daysAgo(40), hidden: true },
    { key: "ot3", name: "장민호", t: "A", gender: "male", age: 31, job: "회사원", goal: "어깨 넓히기", phone: "010-0000-3106", status: "ot_active", created: daysAgo(9), residence: "선릉역 근처", mbti: "ESFJ", level: "헬스 1년 혼자", avail: "평일 저녁 7시 이후", memo: "결혼식(내년 5월) 전에 몸 만들고 싶다고 함" },
    { key: "otWin", name: "유하늘", t: "A", gender: "female", age: 27, job: "디자이너", goal: "바디프로필", phone: "010-0000-3107", status: "pt_active", created: daysAgo(1), statusAt: daysAgo(1), residence: "도곡동", mbti: "ENFP", level: "필라테스 1년", deadline: "내년 4월 바디프로필" },
    { key: "otFail", name: "고은채", t: "B", gender: "female", age: 39, job: "주부", goal: "허리 통증 줄이기", pain: "허리 뻐근함", phone: "010-0000-3108", status: "ot_active", created: daysAgo(1), level: "운동 거의 안 함" },
    { key: "otNone", name: "차승우", t: "C", gender: "male", age: 24, job: "대학생", goal: "체력 기르기", phone: "010-0000-3109", status: "ot_active", created: daysAgo(1), level: "축구 동아리" },
    { key: "regWin", name: "신유진", t: "A", gender: "female", age: 44, job: "약사", goal: "체지방 감량", phone: "010-0000-3110", status: "pt_active", created: daysAgo(70), token: true },
    { key: "regHold", name: "권태호", t: "B", gender: "male", age: 52, job: "자영업", goal: "건강검진 수치 개선", phone: "010-0000-3111", status: "pt_active", created: daysAgo(60) },
    { key: "regFail", name: "윤소희", t: "C", gender: "female", age: 33, job: "회사원", goal: "하체 라인 정리", phone: "010-0000-3112", status: "pt_active", created: daysAgo(40) },
    { key: "rereg2", name: "임재현", t: "A", gender: "male", age: 38, job: "엔지니어", goal: "근력 증가", phone: "010-0000-3113", status: "pt_active", created: daysAgo(170), token: true, level: "헬스 3년" },
    { key: "routine", name: "김도아", t: "A", gender: "female", age: 30, job: "은행원", goal: "하체 라인 정리", pain: "무릎 시큰함", phone: "010-0000-3114", status: "pt_active", created: daysAgo(50), token: true, residence: "대치동" },
    { key: "rreq", name: "이준혁", t: "A", gender: "male", age: 29, job: "공무원", goal: "근력 증가", phone: "010-0000-3115", status: "pt_active", created: daysAgo(30), token: true },
  ];
  const saved = await ins("user_table", NEW.map(mk));
  const M = {};
  NEW.forEach((n, i) => { M[n.key] = { ...n, id: saved[i].id, trainerId: T[n.t], row: saved[i] }; });
  console.log(`  ✓ 새 회원 ${saved.length}명`);

  /* ───────── 3. 계약 · 수업 ───────── */
  const newContracts = []; // { key, c }
  const newLogs = [];      // 행(계약 키로 이어 붙임)
  const addContract = (mKey, o) => {
    const m = M[mKey];
    const c = { account_id: ACC, user_id: m.id, trainer_id: m.trainerId, sessions_total: o.size, service_sessions: o.svc || 0, price_per_session: o.price,
      amount_total: o.size * o.price, counts_as_revenue: true, started_at: atKst(o.start, o.hh ?? 15), kind: o.kind, handed_over: false,
      reg_result: o.reg || null, reg_reason: o.reason || null, reg_reapproach_at: o.reapproach || null, report: o.report || null,
      refund_amount: o.refund || null, refunded_at: o.refundedAt ? atKst(o.refundedAt, 14) : null };
    newContracts.push({ key: `${mKey}:${newContracts.length}`, mKey, c, used: o.used, lastYmd: o.last, every: o.every || 3, scale: o.scale || 1, startK: o.startK || 0, regAt: o.regAt || (o.reg ? o.last : undefined) });
    // ↑ 결과가 있는 계약은 기록 시각을 실제 그날로(트리거가 넣는 '지금'이면 내일 보고서에 오늘 결과로 잘못 잡힌다)
  };
  addContract("end0", { size: 20, price: 65000, start: daysAgo(72), kind: "new", used: 20, last: daysAgo(2) });
  addContract("snooze", { size: 10, price: 70000, start: daysAgo(38), kind: "new", used: 10, last: daysAgo(4) });
  addContract("past", { size: 20, price: 65000, start: daysAgo(100), kind: "new", used: 20, last: daysAgo(22), reg: "fail", reason: "personal" });
  addContract("closed", { size: 10, price: 70000, start: daysAgo(290), kind: "new", used: 10, last: daysAgo(222), reg: "fail", reason: "money" });
  addContract("refund", { size: 20, price: 65000, start: daysAgo(35), kind: "new", used: 3, last: daysAgo(28), refund: 1105000, refundedAt: daysAgo(25) });
  addContract("otWin", { size: 20, price: 65000, start: YDAY, kind: "new", used: 0, last: YDAY, hh: 20 });
  addContract("regWin", { size: 20, price: 65000, start: daysAgo(64), kind: "new", used: 18, last: daysAgo(2), reg: "success", regAt: YDAY,
    report: { reg_satisfaction: { level: "very", quote: "몸이 가벼워져서 아침에 일어나는 게 달라요" } } });
  addContract("regWin", { size: 20, price: 65000, start: YDAY, kind: "reregister", used: 0, last: YDAY, hh: 20 });
  addContract("regHold", { size: 20, price: 70000, start: daysAgo(55), kind: "new", used: 16, last: daysAgo(3), reg: "hold", reason: "sessions_left", reapproach: daysAgo(-6), regAt: YDAY,
    report: { reg_satisfaction: { level: "good", quote: "혈압약 줄일 수 있을지 보고 정할게요" } } });
  addContract("regFail", { size: 10, price: 70000, start: daysAgo(35), kind: "new", used: 9, last: daysAgo(2), reg: "fail", reason: "low_effect", regAt: YDAY,
    report: { reg_satisfaction: { level: "low", quote: "생각보다 변화가 느려요" } } });
  addContract("rereg2", { size: 20, price: 60000, start: daysAgo(165), kind: "new", used: 20, last: daysAgo(112), reg: "success", every: 2.6, scale: 1.4 });
  addContract("rereg2", { size: 20, price: 60000, start: daysAgo(110), kind: "reregister", used: 20, last: daysAgo(57), reg: "success", every: 2.6, scale: 1.4, startK: 20,
    report: { reg_satisfaction: { level: "very", quote: "데드리프트 처음으로 몸무게만큼 들었어요" } } });
  addContract("rereg2", { size: 30, price: 58000, svc: 2, start: daysAgo(55), kind: "reregister", used: 28, last: daysAgo(1), every: 1.9, scale: 1.4, startK: 40 });
  addContract("routine", { size: 30, price: 60000, svc: 2, start: daysAgo(45), kind: "new", used: 14, last: daysAgo(3) });
  addContract("rreq", { size: 20, price: 65000, start: daysAgo(26), kind: "new", used: 8, last: daysAgo(2) });

  const savedC = await ins("session_log", newContracts.map((x) => x.c));
  newContracts.forEach((x, i) => { x.id = savedC[i].id; });
  // 결과 기록 시각 = 어제 저녁(트리거가 넣은 '지금'을 덮는다 · 결과 값은 안 바꿔서 트리거가 다시 안 건드림)
  for (const x of newContracts) if (x.regAt) await w("재등록 결과 시각", sb.from("session_log").update({ reg_recorded_at: atKst(x.regAt, 21) }).eq("id", x.id).select("id"), x);

  for (const x of newContracts) {
    if (!x.used) continue;
    const dates = sessionDates(x.used, x.lastYmd, x.every);
    dates.forEach((ymd, j) => {
      newLogs.push({ account_id: ACC, user_id: M[x.mKey].id, contract_id: x.id, session_at: atKst(ymd, 8 + ((j * 5) % 12)), source: "manual", voided: false,
        sets_structured: sessionSets(x.startK + j, x.scale) });
    });
  }

  /* ── 기존 꾸준한 PT 회원: 어제 · 그제 수업 한 번씩(최근 기록이 이어지게) ── */
  const ptOld = members.filter((m) => m.status === "pt_active" && !m.hidden);
  let refreshed = 0;
  for (const [i, m] of ptOld.entries()) {
    const mc = contracts.filter((c) => c.user_id === m.id);
    const ml = logs.filter((l) => l.user_id === m.id);
    const act = MS.activeContract(mc, ml);
    if (!act) continue;
    const rem = MS.remainingSessions(act, ml);
    const last = ml.map((l) => l.session_at).sort().pop();
    if (!last || rem.total < 4) continue;
    if (Date.parse(last) < NOW - 12 * DAY) continue; // 이탈 위험 회원은 그대로 둔다
    const ymd = i % 2 ? YDAY : daysAgo(2);
    if (kstDate(Date.parse(last)) >= ymd) continue;
    newLogs.push({ account_id: ACC, user_id: m.id, contract_id: act.id, session_at: atKst(ymd, 9 + (i % 10)), source: "manual", voided: false, sets_structured: sessionSets(ml.length + 1) });
    refreshed++;
  }

  /* ── 오늘 스케줄(박준형 중심 · 다른 두 명 몇 건) ── */
  const todayAppts = [];
  const todayLogs = [];
  const old = (n) => byName[n];
  const addAppt = (member, trainerId, ymd, hh, mm, status) => todayAppts.push({ account_id: ACC, trainer_id: trainerId, user_id: member.id, start_at: atKst(ymd, hh, mm), status });
  const ptA = ptOld.filter((m) => m.trainer_id === T.A && !["오지은"].includes(m.name));
  const ptB = ptOld.filter((m) => m.trainer_id === T.B);
  const ptC = ptOld.filter((m) => m.trainer_id === T.C);
  // 오늘 완료(일지 있음)
  const doneToday = [[old("최준호"), T.A, 9, 0], [M.routine.row, T.A, 11, 0], [ptB[0], T.B, 10, 0], [ptC[0], T.C, 7, 0]].filter((x) => x[0]);
  for (const [m, tid, hh, mm] of doneToday) addAppt(m, tid, TODAY, hh, mm, "done");
  addAppt(M.otWin.row, T.A, TODAY, 14, 0, "booked");      // 첫 PT
  addAppt(old("김민지"), T.A, TODAY, 17, 0, "booked");     // 2차 OT
  addAppt(M.ot3.row, T.A, TODAY, 18, 30, "booked");        // 3차 OT
  addAppt(M.regWin.row, T.A, TODAY, 20, 0, "booked");
  if (ptA[0]) addAppt(ptA[0], T.A, TODAY, 21, 0, "booked");
  if (ptB[1]) addAppt(ptB[1], T.B, TODAY, 13, 0, "canceled");
  if (ptB[2]) addAppt(ptB[2], T.B, TODAY, 16, 0, "booked");
  if (ptC[1]) addAppt(ptC[1], T.C, TODAY, 12, 0, "booked");
  if (old("이서준")) addAppt(old("이서준"), T.A, daysAgo(-1), 18, 0, "booked"); // 1차 OT 내일
  addAppt(M.otNone.row, T.C, daysAgo(-3), 18, 0, "booked");                      // 다음 OT
  [ptA[1], ptA[2], ptB[3], ptC[2], ptC[3]].filter(Boolean).forEach((m, i) => addAppt(m, m.trainer_id, daysAgo(-(1 + (i % 4))), 9 + i * 2, 0, "booked"));
  // 어제 미처리(완료 · 취소 안 누름) 2건
  [ptC[4], ptB[4]].filter(Boolean).forEach((m, i) => addAppt(m, m.trainer_id, YDAY, 15 + i, 0, "booked"));
  for (const [m, tid, hh, mm] of doneToday) {
    const mc = [...contracts, ...newContracts.map((x) => ({ ...x.c, id: x.id }))].filter((c) => c.user_id === m.id);
    const ml = [...logs, ...newLogs].filter((l) => l.user_id === m.id);
    const act = MS.activeContract(mc, ml);
    if (act) todayLogs.push({ account_id: ACC, user_id: m.id, contract_id: act.id, session_at: atKst(TODAY, hh, mm), source: "manual", voided: false, sets_structured: sessionSets(ml.length + 2) });
  }
  const savedLogs = await ins("daily_workout_log", [...newLogs, ...todayLogs]);
  console.log(`  ✓ 계약 ${savedC.length} · 수업 ${savedLogs.length}(최근 이어 붙임 ${refreshed} · 오늘 ${todayLogs.length})`);
  await ins("appointment", todayAppts);
  console.log(`  ✓ 예약 ${todayAppts.length}(오늘 ${todayAppts.filter((a) => kstDate(Date.parse(a.start_at)) === TODAY).length})`);

  // 회원 확인 — 이틀 지난 수업 대부분(오늘 · 어제는 미확인으로 남김)
  const conf = [];
  for (const l of savedLogs) {
    if (Date.parse(l.session_at) > NOW - 2 * DAY || rnd() < 0.1) continue;
    conf.push({ log_id: l.id, member_id: l.user_id, result: "confirm", method: "tap", content_hash: DRY ? "dry" : contentHashNode(l, crypto), confirmed_at: new Date(Date.parse(l.session_at) + 4 * 3600000).toISOString() });
  }
  await ins("workout_log_confirmation", conf);
  console.log(`  ✓ 회원 확인 ${conf.length}`);

  /* ───────── 4. 인바디 ───────── */
  const inb = [];
  const inbodyFor = (mKey, n, firstAgo, lastAgo, female) => {
    const m = M[mKey];
    const w0 = female ? 63 : 82;
    for (let q = 0; q < n; q++) {
      const ago = Math.round(firstAgo - ((firstAgo - lastAgo) * q) / Math.max(1, n - 1));
      inb.push({ account_id: ACC, trainer_id: m.trainerId, user_id: m.id, measured_at: daysAgo(ago),
        weight: +(w0 - q * 1.3).toFixed(1), skeletal_muscle: +((female ? 21.8 : 32) + q * 0.5).toFixed(1),
        body_fat_pct: +((female ? 30.5 : 23.5) - q * 1.5).toFixed(1), body_fat_mass: +(((female ? 30.5 : 23.5) - q * 1.5) * (w0 - q * 1.3) / 100).toFixed(1),
        bmr: (female ? 1260 : 1680) + q * 14, visceral_fat_level: Math.max(3, (female ? 8 : 10) - q) });
    }
  };
  inbodyFor("end0", 3, 72, 5, true);
  inbodyFor("past", 3, 100, 25, true);
  inbodyFor("regWin", 3, 64, 6, true);
  inbodyFor("regHold", 2, 55, 34, false);   // 4주 넘음 → '인바디 잴 회원'
  inbodyFor("rereg2", 4, 165, 9, false);
  inbodyFor("routine", 3, 45, 4, true);
  inbodyFor("rreq", 2, 26, 3, false);
  await ins("inbody_log", inb);
  console.log(`  ✓ 인바디 ${inb.length}`);

  /* ───────── 5. OT 기록 — 어제 결과 · 3차 OT ───────── */
  const prof = (m) => ({ age: m.age, job: m.job, residence: m.residence || null, mbti: m.mbti || null, pain: m.pain || null, goal: m.goal, goal_type: "appearance" });
  const fb = (o) => ({
    movements: o.moves.map(([name, tags, star]) => ({ name, tags, star, observation: `${name}: ${tags.map((t) => ({ felt: "자극 바로 옴", aware: "본인도 차이 느낌", weak: "잘 못 느낌", discomfort: "불편해함" })[t]).join(", ")}`, memberAware: tags.includes("aware"), plan2nd: star ? "다음 OT에서 다시 보여주기(증명 재연)" : "" })),
    reaction: { stimulus: o.moves.some(([, t]) => t.includes("felt")) ? "well" : "normal", attitudeTags: o.traits, memo: "" },
    goal: { identified: true, type: o.want, detail: o.wantWhy },
    memberQuote: o.quote, trainer_note: o.note || "", sales_intensity: o.push, proposed: o.proposed, next: o.next || null, feedback_v: 2,
    feedbackAt: atKst(o.day, o.hh ?? 20, 10),
  });
  const otRows = [
    { m: "ot3", round: 1, day: daysAgo(9), result: "hold", reason: "money", reapproach: daysAgo(5),
      rep: fb({ day: daysAgo(9), moves: [["숄더프레스 머신", ["felt", "aware"], true], ["랫풀다운", ["weak"], false], ["사이드 레터럴 레이즈", ["felt"], false]],
        traits: ["active", "price_sensitive"], want: "appearance", wantWhy: "내년 5월 결혼식 사진에서 어깨가 좁아 보이는 게 싫다고 함", quote: "가격이 조금 부담돼요", push: "standard", proposed: true, next: "continue" }) },
    { m: "ot3", round: 2, day: YDAY, result: "hold", reason: "partner", reapproach: TODAY,
      rep: fb({ day: YDAY, moves: [["숄더프레스 머신", ["felt", "aware"], true], ["체스트프레스", ["felt"], false]],
        traits: ["active", "questions"], want: "appearance", wantWhy: "결혼식 전 어깨 라인 · 지난번보다 확신이 생겼다고 함", quote: "아내랑 상의해 보고 내일 말씀드릴게요", push: "strong", proposed: true, next: "continue",
        note: "2차에서 어깨 체감은 확실 · 결정권이 배우자에게 있음" }) },
    { m: "otWin", round: 1, day: YDAY, result: "success",
      rep: fb({ day: YDAY, moves: [["힙쓰러스트", ["felt", "aware"], true], ["레그컬", ["felt"], false], ["케이블크로스오버", ["weak"], false]],
        traits: ["enjoys", "active"], want: "appearance", wantWhy: "4월 바디프로필 · 힙 라인이 제일 고민", quote: "오늘 한 것만으로도 엉덩이가 당겨요", push: "standard", proposed: true }) },
    { m: "otFail", round: 1, day: YDAY, result: "fail", reason: "money",
      rep: fb({ day: YDAY, moves: [["힙어브덕션", ["felt"], false], ["시티드로우", ["discomfort"], false]],
        traits: ["timid", "price_sensitive"], want: "pain", wantWhy: "아이 안아 줄 때 허리가 뻐근함", quote: "지금은 금액이 부담돼서요", push: "soft", proposed: true }) },
    { m: "otNone", round: 1, day: YDAY, result: "none", reapproach: daysAgo(-3),
      rep: fb({ day: YDAY, moves: [["레그프레스", ["felt"], true], ["랫풀다운", ["weak"], false]],
        traits: ["passive", "time_conscious"], want: "health", wantWhy: "축구할 때 후반에 체력이 떨어진다고 함", quote: "시험 끝나고 다시 올게요", push: "standard", proposed: false, next: "continue",
        note: "수업 시간이 길어져 등록 제안까지 못 감" }) },
  ];
  const otIns = otRows.map((o) => {
    const m = M[o.m];
    const closed = o.result !== "none";
    return { account_id: ACC, user_id: m.id, ot_round: o.round, created_at: atKst(o.day, 19), report: o.rep, goal_type: o.rep.goal.type, goal_identified: true,
      closing_result: o.result, closing_approach: ["appearance", "pain", "health"].includes(o.rep.goal.type) ? o.rep.goal.type : "other",
      closing_reason: o.reason || null, closing_reapproach_at: o.reapproach || null,
      ...(closed ? { closing_detail: { approach: o.rep.proposed ? "등록 제안함" : "등록 제안 못 함", reaction: o.rep.memberQuote, outcome: o.result === "success" ? "등록했어요" : o.result === "fail" ? "그만하기로 했어요" : "다음 OT 이어가요" },
        closing_profile: prof(m) } : {}) };
  });
  const savedOt = await ins("ot_log", otIns);
  for (const [i, r] of savedOt.entries()) await w("OT 결과 시각", sb.from("ot_log").update({ closing_recorded_at: atKst(otRows[i].day, 20, 10) }).eq("id", r.id).select("id"), r);
  console.log(`  ✓ OT 기록 ${savedOt.length}(어제 결과 ${otRows.filter((o) => o.day === YDAY).length})`);

  /* ───────── 6. 루틴 · 루틴 요청 · 로드맵 ───────── */
  const doaLogs = savedLogs.filter((l) => l.user_id === M.routine.id);
  const { days } = draftRoutine({ logs: doaLogs, machines, layout: "ul", pain: M.routine.pain });
  const confirmedAt = atKst(daysAgo(8), 21);
  await ins("member_routine", [{ member_id: M.routine.id, account_id: ACC, trainer_id: T.A, split: 2, layout: "ul", days, visible: true,
    confirmed_at: confirmedAt, confirmed_by: T.A, visible_at: confirmedAt, visible_by: T.A, pain_checked_at: confirmedAt, updated_at: confirmedAt }]);
  const rlogs = [];
  const unitItems = (k) => (days[k]?.items || []);
  const asDone = (items, bump = 0, painName = null) => items.map((it) => ({ name: it.name, weight: it.weight, reps: Math.min(it.repMax ?? it.reps, (it.reps ?? 10) + bump), sets: it.sets, done: true, ...(it.name === painName ? { pain: true } : {}) }));
  if (days.length >= 2) {
    rlogs.push({ user_id: M.routine.id, performed_on: daysAgo(6), day_key: days[0].key, items: asDone(unitItems(0)), created_at: atKst(daysAgo(6), 21) });
    rlogs.push({ user_id: M.routine.id, performed_on: daysAgo(5), day_key: days[1].key, items: asDone(unitItems(1), 0, unitItems(1)[0]?.name), created_at: atKst(daysAgo(5), 21) });
    rlogs.push({ user_id: M.routine.id, performed_on: daysAgo(1), day_key: days[0].key, items: asDone(unitItems(0), 1), created_at: atKst(daysAgo(1), 20) });
  }
  await ins("member_routine_log", rlogs);
  await ins("member_routine_request", [
    { user_id: M.routine.id, status: "done", handled_at: confirmedAt, handled_by: T.A, created_at: atKst(daysAgo(9), 22) },
    { user_id: M.rreq.id, status: "open", created_at: atKst(YDAY, 21, 40) },
  ]);
  if (old("최준호")) {
    await ins("member_roadmap", [{ member_id: old("최준호").id, account_id: ACC, trainer_id: T.A, title: "3대 운동 기본기 + 근력 올리기", current: 1, visible: true, ai_meta: null,
      stages: [
        { title: "자세 다시 잡기", detail: "무게보다 동작 길이를 먼저 맞춰요." },
        { title: "하체 힘 키우기", detail: "레그프레스 · 힙 운동으로 버티는 힘을 쌓아요." },
        { title: "상체 균형 맞추기", detail: "미는 운동과 당기는 운동을 같은 비율로 가져가요." },
        { title: "무게 늘리기", detail: "같은 횟수에서 무게를 한 칸씩 올려요." },
        { title: "혼자서도 이어가기", detail: "개인운동 루틴으로 주 1회를 더해요." },
      ] }]);
  }
  console.log(`  ✓ 루틴(${days.length}덩어리 · 기록 ${rlogs.length}) · 요청 2 · 로드맵 1`);

  /* ───────── 7. 동의 · 회원 자가입력 ───────── */
  const consent = [];
  const agree = (memberId, health, ago = 20) => {
    consent.push({ member_id: memberId, kind: "general", agreed: true, method: "member_page", version: "2026-10-05", created_at: atKst(daysAgo(ago), 20) });
    consent.push({ member_id: memberId, kind: "health", agreed: health, method: "member_page", version: "2026-10-05", created_at: atKst(daysAgo(ago), 20) });
  };
  for (const n of ["박하은", "최준호"]) if (old(n)) agree(old(n).id, true);
  agree(M.end0.id, true); agree(M.past.id, true, 40); agree(M.regWin.id, true); agree(M.rereg2.id, true); agree(M.routine.id, true);
  agree(M.rreq.id, false, 10); // 건강정보는 동의 안 함 → '아파서 멈췄어요' 대신 안내
  if (old("오지은")) {           // 동의했다가 건강정보 철회
    agree(old("오지은").id, true, 30);
    consent.push({ member_id: old("오지은").id, kind: "health", agreed: false, method: "member_page", version: "2026-10-05", created_at: atKst(daysAgo(4), 22) });
    await w("오지은 링크", sb.from("user_table").update({ member_token: crypto.randomUUID() }).eq("id", old("오지은").id).select("id"), {});
  }
  await ins("member_consent", consent);
  const cardio = [], sched = [];
  const selfLog = (memberId, n, offset = 0) => {
    for (let i = 0; i < n; i++) {
      const ymd = daysAgo(offset + i);
      if (i % 2 === 0) cardio.push({ user_id: memberId, performed_on: ymd, kind: pick(["러닝머신", "실내 자전거", "계단 오르기", "걷기"]), minutes: pick([20, 25, 30, 40]), note: null, created_at: atKst(ymd, 21) });
      sched.push({ user_id: memberId, on_date: ymd, kind: "personal", note: i % 3 === 0 ? "하체 위주" : null, created_at: atKst(ymd, 21) });
    }
  };
  selfLog(M.routine.id, 7);              // 7일 연속 = 불꽃 7일
  if (old("박하은")) selfLog(old("박하은").id, 4, 1);
  if (old("최준호")) selfLog(old("최준호").id, 3, 2);
  selfLog(M.end0.id, 3, 3);
  selfLog(M.past.id, 4, 25);             // PT 끝나기 전 기록(읽기 전용 화면에 보임)
  await ins("cardio_log", cardio);
  await ins("schedule_check", sched);
  console.log(`  ✓ 동의 ${consent.length} · 유산소 ${cardio.length} · 개인운동 ${sched.length}`);

  await tail({ M, members, saved, savedLogs, logs, inb, old, r2: savedOt[1] });
  console.log(DRY ? `\n[미리보기 끝 — 쓰려던 행 약 ${FAKE}개 · 실제로 넣으려면 --write]` : "\n✔ 완료 — 대표 아침 보고서는 앱 작업(cron)으로 만든다(실제 AI).");
}

// 8 · 9단계 — 처음 실행과 --resume8(중간에 멈췄을 때 이어서)이 같이 쓴다.
async function tail({ M, members, saved, savedLogs, logs, inb, old, r2 }) {
  /* ───────── 8. 대표 피드백 · 메모 할 일 · 공지 읽음 ───────── */
  await ins("owner_feedback", [
    { account_id: ACC, author_id: OWNER_ID, trainer_id: T.A, member_id: M.ot3.id, kind: "ot", ref_id: r2?.id ?? null, ref_ymd: YDAY,
      body: "가격 얘기 전에 결혼식 날 모습부터 다시 그려 주세요. 3차엔 아내분과 같이 오시라고 권해 봐요.", created_at: atKst(TODAY, 8, 40) },
    { account_id: ACC, author_id: OWNER_ID, trainer_id: T.B, member_id: M.otFail.id, kind: "ot", ref_ymd: YDAY,
      body: "허리 불편이 등록 이유였는데 금액에서 멈췄어요. 10회로 가볍게 시작하는 안도 같이 보여 주세요.", created_at: atKst(TODAY, 8, 42), seen_at: atKst(TODAY, 9, 15) },
    { account_id: ACC, author_id: OWNER_ID, trainer_id: T.B, member_id: M.regHold.id, kind: "rereg", ref_ymd: YDAY,
      body: "남은 4회 안에 혈압 · 체중 변화를 숫자로 한 번 정리해서 보여 드리면 좋겠어요.", created_at: atKst(TODAY, 8, 45) },
  ]);
  await ins("trainer_todo", [
    { account_id: ACC, trainer_id: T.A, body: "김민지 2차 OT 전에 어깨 사진 비교 준비", due_date: TODAY, member_id: old("김민지")?.id ?? null, done: false, done_at: null },
    { account_id: ACC, trainer_id: T.A, body: "장민호 아내분 동반 OT 시간 여쭤보기", due_date: daysAgo(-1), member_id: M.ot3.id, done: false, done_at: null },
    { account_id: ACC, trainer_id: T.A, body: "한예린 회원 PT 종료 전 마지막 인바디", due_date: null, done: true, done_at: atKst(daysAgo(5), 18), member_id: M.end0.id },
  ]);
  const ann = await read("공지", sb.from("announcement").select("id").eq("account_id", ACC));
  if (ann[0]) await ins("announcement_read", [{ announcement_id: ann[0].id, account_id: ACC, trainer_id: T.B }, { announcement_id: ann[0].id, account_id: ACC, trainer_id: T.C }]);
  console.log("  ✓ 대표 피드백 3 · 메모 할 일 3 · 공지 읽음");

  /* ───────── 9. 사례 보관함(박준형) — 기록 숫자 그대로 ───────── */
  const allMembers = [...members, ...saved].filter((m) => !m.hidden && m.trainer_id === T.A);
  const allInbody = [...(await read("인바디", sb.from("inbody_log").select("*").eq("account_id", ACC))), ...(DRY ? inb : [])];
  const allLogsA = [...logs, ...savedLogs].filter((l) => allMembers.some((m) => m.id === l.user_id));
  const ic = inbodyCandidates(allMembers, allInbody).slice(0, 3);
  const lc = [];
  for (const c of liftCandidates(allMembers, allLogsA)) { if (!lc.some((x) => x.member.id === c.member.id)) lc.push(c); if (lc.length >= 3) break; }
  const cases = [...ic.map((c) => ({ kind: "inbody", c })), ...lc.map((c) => ({ kind: "lift", c }))].map(({ kind, c }, i) => ({
    account_id: ACC, trainer_id: T.A, kind, member_id: c.member.id, label: anonLabel(c.member, c.data.weeks), data: { ...c.data, category: guessCategory(c.member.goal) }, sort: i }));
  await ins("sales_case", cases);
  console.log(`  ✓ 사례 ${cases.length}(인바디 ${ic.length} · 운동 ${lc.length})`);

}

// 이어서 하기: 1~7단계가 이미 들어간 상태에서 8 · 9단계만.
async function resume8(members) {
  const byName = Object.fromEntries(members.map((m) => [m.name, m]));
  const keyOf = { ot3: "장민호", otFail: "고은채", regHold: "권태호", end0: "한예린" };
  const M = Object.fromEntries(Object.entries(keyOf).map(([k, n]) => [k, byName[n]]));
  if (Object.values(M).some((m) => !m)) throw new Error("이어서 할 회원이 없습니다(1~7단계 먼저).");
  // 멈추기 전에 일부 들어간 8 · 9단계 행은 지우고 다시(중복 방지)
  for (const t of ["owner_feedback", "trainer_todo", "sales_case"]) await w(`${t} 정리`, sb.from(t).delete().eq("account_id", ACC).select("id"), []);
  const ots = await read("OT", sb.from("ot_log").select("id, ot_round").eq("user_id", M.ot3.id).eq("ot_round", 2));
  const logs = await read("수업", sb.from("daily_workout_log").select("*").eq("account_id", ACC));
  await tail({ M, members, saved: [], savedLogs: [], logs, inb: [], old: (n) => byName[n], r2: ots[0] });
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
