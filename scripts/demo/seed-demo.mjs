// scripts/demo/seed-demo.mjs — 랜딩 스크린샷·영업 시연용 "데모 센터" 계정을 만든다.
// -----------------------------------------------------------------------------
// 미리보기: node scripts/demo/seed-demo.mjs           ← 기본값. DB 연결 자체를 안 만든다(쓰기 불가).
//           앱의 실제 계산 함수로 대시보드 숫자(만료 임박·이탈 위험·등록률·월별 매출)만 출력.
// 실제 생성: node scripts/demo/seed-demo.mjs --write  ← 이 플래그가 있어야만 DB에 쓴다.
// 삭제:     node scripts/demo/delete-demo.mjs
// ⚠️ 2026-10-02: 미리보기 플래그가 무시돼 실제로 써진 사고가 있었다 → 기본을 미리보기로 뒤집었다.
//
// 만드는 것 — 실제 계정과 완전히 분리된 센터 계정 하나:
//   대표 1 + 트레이너 3 · 가짜 회원 38명(OT·PT·종료) · 최근 6개월 계약·수업·OT 기록 ·
//   인바디·예약·목표·패키지·급여 규칙·지출·FC매출·공지·포상·장비
//
// ⚠️ 규율
//   - 이름·연락처·통증·인바디는 전부 지어낸 값. 실제 회원 정보 0.
//   - AI 결과(OT 브리핑·운동일지 요약·재등록 브리핑·운영 보고서)는 여기서 만들지 않는다.
//     화면에 "AI가 만든 것"으로 나가는 걸 손으로 지어 넣지 않는다 — 실제 앱에서 실제 AI로 돌린다.
//     (트레이너가 손으로 입력하는 값 — 1차 관찰·클로징 3박자·세트 기록 — 만 채운다.)
//   - 결제 없이 구독 '활성·프리미엄'으로 연다(billing_key 없음 → 자동결제 크론 대상 아님).
//   - 계정 id·로그인 정보는 scripts/demo/.demo-credentials.json(깃 제외)에만 저장. 화면 출력 안 함.
//   - 운영자 주간 리포트·노션 동기화에서 빼려면 lib/demo.js의 DEMO_ACCOUNT_IDS에 id를 넣는다
//     (이 스크립트가 끝에 안내한다).
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";
import * as MS from "../../lib/memberStatus.js";

const DRY = !process.argv.includes("--write");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CRED_FILE = path.join(HERE, ".demo-credentials.json");

/* ───────── 환경 ───────── */
function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✖ .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  process.exit(1);
}
if (!DRY && fs.existsSync(CRED_FILE)) {
  console.error("✖ 데모 계정이 이미 있습니다(scripts/demo/.demo-credentials.json). 다시 만들려면 먼저 delete-demo.mjs를 실행하세요.");
  process.exit(1);
}
// 미리보기면 클라이언트를 아예 만들지 않는다 — 어떤 경로로도 DB에 쓸 수 없게.
const sb = DRY ? null : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(DRY ? "[미리보기 — DB에 쓰지 않음 · 실제로 만들려면 --write]" : "[실제 생성 — DB에 씁니다]");

/* ───────── 도우미 ───────── */
// 재실행해도 같은 데이터가 나오게 — 고정 시드 난수.
let _s = 20261002;
const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const DAY = 86400000;
const NOW = Date.now();
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);       // 'YYYY-MM-DD'
const atKst = (ymd, hh = 10, mm = 0) => new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`).toISOString();
const daysAgo = (n) => kstDate(NOW - n * DAY);
const TODAY = kstDate(NOW);
const THIS_YM = TODAY.slice(0, 7);
const password = () => crypto.randomBytes(12).toString("base64url");

async function must(label, q) {
  if (DRY) return [];
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
async function insertBatched(table, rows, size = 400) {
  // 미리보기: 저장된 것처럼 id만 붙여 돌려준다(PostgREST가 돌려주는 모양과 비슷하게).
  if (DRY) return rows.map((r) => ({ id: crypto.randomUUID(), created_at: new Date(NOW).toISOString(), ...r }));
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(...(await must(`${table} insert`, sb.from(table).insert(rows.slice(i, i + size)).select())));
  }
  return out;
}

/* ───────── 사람 ───────── */
const OWNER = { name: "정민재", email: "demo.owner@onlytrainer.co.kr" };
const TRAINERS = [
  { key: "A", name: "박준형", email: "demo.trainer1@onlytrainer.co.kr" }, // 스크린샷 주인공(데모 영상과 같은 이름)
  { key: "B", name: "이수진", email: "demo.trainer2@onlytrainer.co.kr" },
  { key: "C", name: "최도윤", email: "demo.trainer3@onlytrainer.co.kr" },
];
const CENTER_NAME = "강남 피트니스";

/* ───────── 회원 설계 ─────────
   cohort  = 유입 월(오늘 기준 몇 달 전, 0=이번 달)
   kind    = 'pt'(등록 후 PT 중) · 'expt'(PT 끝나고 재등록 안 함) · 'lost'(OT에서 이탈) ·
             'ot'(OT 진행 중) · 'carry'(인계·외부 — OT 없이 PT로 들어옴)
   state   = PT의 지금 상태: steady(꾸준) · expiring(잔여 10회 미만) · churn(14일+ 무수업)
   prev    = 지금 계약 전에 끝난 계약 수(재등록 이력)
   ot      = OT 진행 중 회원의 단계: 'wait'(1차 전) · 'r1'(1차 끝, 2차 전) · 'unclosed'(2차 후 미결정) · 'hold'(보류·재상담 예정) */
const FEATURED = [
  { name: "김민지", gender: "female", age: 29, job: "마케터", trainer: "A", cohort: 0, kind: "ot", ot: "r1", createdAgo: 6,
    goal: "바디프로필 촬영(내년 3월)", pain: "오른쪽 어깨 결림", phone: "010-0000-1101", featured: true,
    goal_deadline: "내년 3월 바디프로필", training_pace: "제대로 집중해서", injury_history: "없음",
    exercise_level: "헬스 6개월 혼자 해봄", quit_reason: "혼자 하니 루틴이 매번 흐지부지", past_exercise: "필라테스 그룹 3개월",
    availability: "평일 저녁 7시 이후", activity_level: "앉아서 일하는 시간이 하루 9시간", mbti: "ENFJ", residence: "역삼동",
    member_note: "상체 라인이 제일 고민. 사진 찍을 때 어깨가 말려 보인다고 함" },
  { name: "이서준", gender: "male", age: 34, job: "개발자", trainer: "A", cohort: 0, kind: "ot", ot: "wait", createdAgo: 1,
    goal: "체중 8kg 감량", pain: "허리 뻐근함", phone: "010-0000-1102", featured: true,
    goal_deadline: "연말 건강검진 전", training_pace: "무리 없이 꾸준히", injury_history: "2년 전 허리 삐끗(병원 진료 후 회복)",
    exercise_level: "운동 거의 안 함", quit_reason: "야근이 잦아서 등록만 하고 못 감", past_exercise: "없음",
    availability: "평일 오후 6시~7시, 주말 오전", activity_level: "재택 위주, 하루 걸음 수 3천보 이하", mbti: "ISTJ", residence: "삼성동",
    member_note: "오래 앉아 있으면 허리가 뻐근하다고 함. 운동 자체에 겁이 조금 있음" },
  { name: "박하은", gender: "female", age: 41, job: "중학교 교사", trainer: "A", cohort: 4, kind: "pt", state: "expiring", prev: 1, rem: 3,
    goal: "체지방 감량 + 체력", pain: "무릎 시큰함", phone: "010-0000-1103", featured: true, token: true, inbodyRich: true,
    goal_deadline: "방학 전까지", training_pace: "꾸준히", injury_history: "없음", exercise_level: "PT 처음",
    quit_reason: "", past_exercise: "수영 1년", availability: "평일 오후 5시", activity_level: "서서 수업하는 시간이 많음", mbti: "ISFJ", residence: "대치동" },
  { name: "최준호", gender: "male", age: 37, job: "영업직", trainer: "A", cohort: 2, kind: "pt", state: "steady", prev: 0, rem: 14,
    goal: "근력 증가", pain: "", phone: "010-0000-1104", featured: true, token: true,
    goal_deadline: "", training_pace: "제대로", injury_history: "없음", exercise_level: "헬스 2년", quit_reason: "", past_exercise: "크로스핏 6개월",
    availability: "평일 저녁 8시", activity_level: "외근 많음", mbti: "ESTP", residence: "논현동" },
  { name: "오지은", gender: "female", age: 26, job: "대학원생", trainer: "A", cohort: 3, kind: "pt", state: "churn", prev: 0, rem: 9, gapDays: 18,
    goal: "자세 교정", pain: "거북목", phone: "010-0000-1105", featured: true,
    goal_deadline: "", training_pace: "천천히", injury_history: "없음", exercise_level: "요가 조금", quit_reason: "논문 시즌에 바빠서", past_exercise: "요가",
    availability: "불규칙", activity_level: "하루 대부분 앉아 있음", mbti: "INFP", residence: "개포동" },
];

// 나머지 33명 — 이름만 다르고 설계 표로 만든다(코호트별 유입·전환이 그럴듯하게).
const FILLER_SPEC = [
  // cohort 5개월 전(5명): PT 3 · 종료(PT 후 미재등록) 1 · OT 이탈 1
  ["A", 5, "pt", "steady", 1], ["B", 5, "pt", "steady", 1], ["C", 5, "pt", "expiring", 1], ["B", 5, "expt", null, 0], ["C", 5, "lost"],
  // 4개월 전(6명, 박하은 포함 → 여기선 5): PT 2 · 종료 1 · OT 이탈 2
  ["B", 4, "pt", "churn", 0], ["C", 4, "pt", "steady", 1], ["A", 4, "expt", null, 0], ["B", 4, "lost"], ["C", 4, "lost"],
  // 3개월 전(7명, 오지은 포함 → 6): PT 3 · OT 이탈 3
  ["A", 3, "pt", "steady", 0], ["B", 3, "pt", "expiring", 0], ["C", 3, "pt", "steady", 0], ["A", 3, "lost"], ["B", 3, "lost"], ["C", 3, "lost"],
  // 2개월 전(6명, 최준호 포함 → 5): PT 3 · OT 이탈 2
  ["B", 2, "pt", "steady", 0], ["C", 2, "pt", "expiring", 0], ["A", 2, "pt", "steady", 0], ["A", 2, "lost"], ["C", 2, "lost"],
  // 1개월 전(8명, 김민지는 이번 달 → 8): PT 3 · OT 이탈 2 · OT 진행 3
  ["A", 1, "pt", "steady", 0], ["C", 1, "pt", "steady", 0], ["B", 1, "pt", "steady", 0], ["B", 1, "lost"], ["C", 1, "lost"],
  ["B", 1, "ot", "hold"], ["C", 1, "ot", "unclosed"], ["A", 1, "ot", "unclosed"],
  // 이번 달(이서준·김민지 + 1): 1차 대기
  ["C", 0, "ot", "wait"],
  // 인계·외부(OT 없이 PT)
  ["B", 3, "carry", "steady", 0], ["C", 2, "carry", "expiring", 0], ["A", 1, "carry", "steady", 0],
];
const FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍"];
const GIVEN = ["서연", "도윤", "하윤", "시우", "지아", "주원", "서윤", "예준", "수아", "지호", "다은", "건우", "채원", "현우", "소율", "민준", "윤서", "우진", "지민", "태윤", "유나", "선우", "나은", "은호", "가은", "도현", "하린", "준서", "수빈", "재원", "예린", "승민", "아린"];
const JOBS = ["회사원", "공무원", "간호사", "자영업", "디자이너", "대학생", "주부", "프리랜서", "은행원", "연구원", "약사", "엔지니어"];
const GOALS = [["appearance", "체지방 감량"], ["appearance", "탄탄한 몸 만들기"], ["health", "체력 기르기"], ["pain", "허리 통증 줄이기"], ["appearance", "하체 라인 정리"], ["health", "건강검진 수치 개선"], ["pain", "어깨 결림 완화"]];
const PAINS = ["", "", "허리 뻐근함", "어깨 결림", "무릎 시큰함", "골반 불편", "목 뻐근함"];

/* ───────── 1. 계정·사람 ───────── */
async function createPeople() {
  if (DRY) {
    const tIds = Object.fromEntries(TRAINERS.map((t) => [t.key, crypto.randomUUID()]));
    return { accountId: crypto.randomUUID(), ownerId: crypto.randomUUID(), tIds };
  }
  const creds = { createdAt: new Date().toISOString(), centerName: CENTER_NAME, owner: null, trainers: [] };

  const ownerPw = password();
  const { data: o, error: oe } = await sb.auth.admin.createUser({
    email: OWNER.email, password: ownerPw, email_confirm: true,
    user_metadata: { account_type: "center", account_name: CENTER_NAME, display_name: OWNER.name },
  });
  if (oe) throw new Error("대표 계정 생성: " + oe.message);
  const ownerRow = await must("대표 trainer 조회", sb.from("trainer").select("id, account_id").eq("id", o.user.id).maybeSingle());
  if (!ownerRow?.account_id) throw new Error("가입 트리거가 계정을 만들지 않았습니다.");
  const accountId = ownerRow.account_id;
  creds.accountId = accountId;
  creds.owner = { id: o.user.id, name: OWNER.name, email: OWNER.email, password: ownerPw };

  // 결제 없이 '활성·프리미엄·센터' — billing_key가 없어 자동결제 크론 대상이 아니다.
  await must("계정 활성화", sb.from("account").update({
    subscription_status: "active", plan: "premium", billing_plan: "center",
    current_period_end: new Date(NOW + 365 * DAY).toISOString(),
  }).eq("id", accountId).select());

  const tIds = {};
  for (const t of TRAINERS) {
    const pw = password();
    const { data: u, error } = await sb.auth.admin.createUser({ email: t.email, password: pw, email_confirm: true });
    if (error) throw new Error(`트레이너 ${t.name}: ${error.message}`);
    await must(`트레이너 ${t.name} 행`, sb.from("trainer").insert({ id: u.user.id, account_id: accountId, role: "trainer", name: t.name, active: true }).select());
    tIds[t.key] = u.user.id;
    creds.trainers.push({ id: u.user.id, key: t.key, name: t.name, email: t.email, password: pw });
  }
  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
  return { accountId, ownerId: o.user.id, tIds, creds };
}

/* ───────── 2. 회원 ───────── */
function buildMemberSpecs() {
  const used = new Set(FEATURED.map((f) => f.name));
  const names = [];
  for (const g of GIVEN) for (const f of FAMILY) { const n = f + g; if (!used.has(n)) names.push(n); }
  const specs = FEATURED.map((f) => ({ ...f }));
  FILLER_SPEC.forEach((row, i) => {
    const [trainer, cohort, kind, stateOrOt, prev] = row;
    const name = names[(i * 7) % names.length];
    used.add(name);
    const [goalType, goal] = pick(GOALS);
    const s = {
      name, trainer, cohort, kind, gender: rnd() < 0.55 ? "female" : "male", age: between(23, 52), job: pick(JOBS),
      goal, goalType, pain: pick(PAINS), phone: `010-0000-${String(2000 + i).padStart(4, "0")}`,
    };
    if (kind === "pt" || kind === "carry") { s.state = stateOrOt; s.prev = prev ?? 0; }
    if (kind === "ot") s.ot = stateOrOt;
    if (kind === "expt") s.prev = 0;
    specs.push(s);
  });
  return specs;
}

/* 코호트(유입 월) 안의 날짜 — 이번 달이면 오늘까지, 지난달이면 그 달 3~25일. */
function cohortDay(cohort, createdAgo) {
  if (createdAgo != null) return daysAgo(createdAgo);
  const d = new Date(NOW + 9 * 3600000);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - cohort, 1));
  if (cohort === 0) return daysAgo(between(0, Math.max(0, d.getUTCDate() - 1)));
  first.setUTCDate(between(3, 25));
  return first.toISOString().slice(0, 10);
}

/* ───────── 3. 운동 ───────── */
const EXERCISES = [
  ["레그프레스", 60, 10], ["스쿼트", 30, 2.5], ["루마니안 데드리프트", 30, 2.5], ["랫풀다운", 30, 2.5],
  ["시티드로우", 30, 2.5], ["체스트프레스", 25, 2.5], ["숄더프레스", 15, 1.25], ["힙쓰러스트", 40, 5],
  ["레그컬", 20, 2.5], ["힙어브덕션", 35, 5], ["케이블크로스오버", 10, 1.25],
];
function setsFor(memberIdx, sessionIdx) {
  const n = 3 + ((memberIdx + sessionIdx) % 2);
  const start = (memberIdx * 3 + sessionIdx) % EXERCISES.length;
  const out = [];
  for (let k = 0; k < n; k++) {
    const [exercise, base, step] = EXERCISES[(start + k * 2) % EXERCISES.length];
    const w = Math.round((base + step * Math.floor(sessionIdx / 3)) * 2) / 2;
    const reps = pick([10, 12, 12, 15]);
    out.push({ exercise, sets: [{ weight: w, reps }, { weight: w, reps }, { weight: w, reps: Math.max(8, reps - 2) }] });
  }
  return out;
}

/* ───────── 실행 ───────── */
async function main() {
  console.log("▶ 데모 센터 계정 만드는 중…");
  const { accountId, ownerId, tIds } = await createPeople();
  console.log("  ✓ 대표 1 · 트레이너 3");

  /* 패키지·급여 규칙·목표·장비·포상 */
  const pkgs = [];
  for (const k of Object.keys(tIds)) {
    pkgs.push(
      { account_id: accountId, trainer_id: tIds[k], name: "PT 10회", sessions: 10, price: 700000, list_price: 750000, sort: 1, active: true, note: "처음 시작·체험 연장용" },
      { account_id: accountId, trainer_id: tIds[k], name: "PT 20회", sessions: 20, price: 1300000, list_price: 1400000, sort: 2, active: true, note: "가장 많이 선택 · 주 2회 10주" },
      { account_id: accountId, trainer_id: tIds[k], name: "PT 30회", sessions: 30, price: 1800000, list_price: 2100000, sort: 3, active: true, note: "목표가 뚜렷한 회원 · 회당 단가 최저" },
    );
  }
  await insertBatched("pt_package", pkgs);
  await insertBatched("pay_scheme", [{
    account_id: accountId, trainer_id: null, type: "banded", band_basis: "revenue",
    bands: [
      { min: 0, payout_type: "pct_of_price", payout_value: 40, incentive_type: "none", incentive_value: 0 },
      { min: 5000000, payout_type: "pct_of_price", payout_value: 45, incentive_type: "none", incentive_value: 0 },
      { min: 7500000, payout_type: "pct_of_price", payout_value: 50, incentive_type: "pct", incentive_value: 2 },
    ],
  }]);
  const _k = new Date(NOW + 9 * 3600000);
  const prevYm = new Date(Date.UTC(_k.getUTCFullYear(), _k.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
  await insertBatched("trainer_goal", [
    { account_id: accountId, trainer_id: tIds.A, ym: THIS_YM, target_revenue: 8000000 },
    { account_id: accountId, trainer_id: tIds.B, ym: THIS_YM, target_revenue: 6000000 },
    { account_id: accountId, trainer_id: tIds.C, ym: THIS_YM, target_revenue: 6000000 },
    { account_id: accountId, trainer_id: tIds.A, ym: prevYm, target_revenue: 7500000 },
    { account_id: accountId, trainer_id: tIds.B, ym: prevYm, target_revenue: 6000000 },
    { account_id: accountId, trainer_id: tIds.C, ym: prevYm, target_revenue: 6000000 },
  ]);
  await insertBatched("center_machine", [
    ["레그프레스", "하체"], ["스미스머신", "프리웨이트"], ["랫풀다운", "등"], ["시티드로우", "등"], ["체스트프레스", "가슴"],
    ["숄더프레스 머신", "어깨"], ["레그컬", "하체"], ["힙어브덕션", "하체"], ["케이블 크로스오버", "전신"], ["파워랙", "프리웨이트"],
  ].map(([name, kind]) => ({ account_id: accountId, name, kind })));
  await insertBatched("trainer_reward", [10, 30, 50].map((m, i) => ({ account_id: accountId, trainer_id: tIds.A, milestone: m, reward_text: ["단백질 쉐이크 1잔", "PT 1회 추가", "운동복 세트"][i], active: true })));
  console.log("  ✓ 패키지 · 급여 규칙 · 목표 · 장비 · 포상");

  /* 회원 */
  const specs = buildMemberSpecs();
  const memberRows = specs.map((s) => {
    const created = cohortDay(s.cohort, s.createdAgo);
    s.created = created;
    const status = s.kind === "pt" || s.kind === "carry" ? "pt_active" : s.kind === "ot" ? "ot_active" : "inactive";
    const origin = s.kind === "carry" ? (s.name.charCodeAt(0) % 2 ? "handover" : "external") : "ot_funnel";
    return {
      account_id: accountId, trainer_id: tIds[s.trainer], name: s.name, gender: s.gender, age: s.age, job: s.job,
      goal: s.goal, pain: s.pain || null, phone_number: s.phone, status, origin, machines: [],
      created_at: atKst(created, 11), status_changed_at: atKst(created, 11), hidden: false,
      residence: s.residence ?? null, mbti: s.mbti ?? null, goal_deadline: s.goal_deadline ?? null,
      training_pace: s.training_pace ?? null, injury_history: s.injury_history ?? null, exercise_level: s.exercise_level ?? null,
      quit_reason: s.quit_reason || null, past_exercise: s.past_exercise ?? null, availability: s.availability ?? null,
      activity_level: s.activity_level ?? null, member_note: s.member_note ?? null,
      member_token: s.token ? crypto.randomUUID() : null,
    };
  });
  const members = await insertBatched("user_table", memberRows);
  specs.forEach((s, i) => { s.id = members[i].id; s.trainerId = tIds[s.trainer]; });
  console.log(`  ✓ 회원 ${members.length}명`);

  /* OT 기록 · 계약 · 수업 */
  const OBS = ["스쿼트 시 무릎이 안쪽으로 모임", "힙힌지에서 허리가 먼저 말림", "랫풀다운 때 어깨가 귀 쪽으로 올라감", "한발 서기에서 골반이 한쪽으로 빠짐", "플랭크 20초에서 허리가 처짐"];
  const QUOTES = ["혼자 하면 맨날 같은 것만 해요", "사진 찍을 때 어깨가 말려 보여요", "계단 오를 때 무릎이 시큰해요", "이번엔 진짜 끝까지 해보고 싶어요", "시간이 제일 걱정이에요"];
  const otRows = [], contracts = [], logsByContract = [], inbody = [], appts = [];

  const otReport = (s) => ({
    goal: { type: s.goalType ?? "appearance", detail: s.goal, identified: true },
    reaction: { memo: "설명할 때 고개를 끄덕이며 집중함", stimulus: pick(["well", "normal", "poor"]), attitudeTags: [pick(["active", "timid"])] },
    movements: [{ observation: pick(OBS), plan2nd: "2차에서 같은 동작을 큐 하나로 바로잡아 체감시키기", memberAware: rnd() < 0.5 }],
    memberQuote: pick(QUOTES),
    trainer_note: "목표가 분명하고 시간대만 맞으면 꾸준히 올 회원",
    sales_intensity: pick(["soft", "standard", "standard", "strong"]),
  });
  const profile = (s) => ({ age: s.age, job: s.job, goal: s.goal, mbti: s.mbti ?? null, pain: s.pain || null, goal_type: s.goalType ?? "appearance", residence: s.residence ?? null });

  for (const s of specs) {
    const isOt = s.kind !== "carry";
    const otDay1 = s.created;
    const otDay2 = kstDate(Date.parse(atKst(s.created)) + 4 * DAY);

    // ① OT 기록
    if (isOt && !(s.kind === "ot" && s.ot === "wait")) {
      if (s.kind === "pt" || s.kind === "expt") {
        const firstWin = rnd() < 0.45;
        otRows.push({ account_id: accountId, user_id: s.id, ot_round: 1, created_at: atKst(otDay1, 19), report: otReport(s), goal_type: s.goalType ?? "appearance", goal_identified: true,
          closing_result: firstWin ? "success" : "hold", closing_approach: firstWin ? pick(["appearance", "pain", "value"]) : null,
          closing_detail: firstWin ? { approach: "1차에서 바로 체감시킨 동작으로 변화 가능성 보여줌", reaction: "생각보다 빨리 느껴진다며 놀람", outcome: "20회 등록" } : null,
          closing_profile: firstWin ? profile(s) : null });
        if (!firstWin) {
          otRows.push({ account_id: accountId, user_id: s.id, ot_round: 2, created_at: atKst(otDay2, 19), report: null,
            closing_result: "success", closing_approach: pick(["appearance", "pain", "value", "health"]),
            closing_detail: { approach: "1차 관찰을 근거로 2차에서 같은 동작 전후 비교", reaction: "자기 몸 얘기라 집중해서 들음", outcome: "20회 등록" },
            closing_profile: profile(s) });
        }
      } else if (s.kind === "lost") {
        const reason = pick(["money", "consider", "time", "compare", "schedule"]);
        otRows.push({ account_id: accountId, user_id: s.id, ot_round: 1, created_at: atKst(otDay1, 19), report: otReport(s), goal_type: s.goalType ?? "appearance", goal_identified: true, closing_result: "hold" });
        otRows.push({ account_id: accountId, user_id: s.id, ot_round: 2, created_at: atKst(otDay2, 19), closing_result: "fail", closing_reason: reason,
          closing_approach: pick(["appearance", "value", "other"]),
          closing_detail: { approach: "가격 얘기를 먼저 꺼냄", reaction: "부담스럽다며 생각해보겠다고 함", outcome: "미등록" }, closing_profile: profile(s) });
      } else if (s.kind === "ot") {
        otRows.push({ account_id: accountId, user_id: s.id, ot_round: 1, created_at: atKst(s.ot === "r1" ? daysAgo(3) : otDay1, 19), report: otReport(s), goal_type: s.goalType ?? "appearance", goal_identified: true, closing_result: "hold" });
        if (s.ot === "unclosed") otRows.push({ account_id: accountId, user_id: s.id, ot_round: 2, created_at: atKst(daysAgo(between(1, 3)), 19), closing_result: null });
        if (s.ot === "hold") otRows.push({ account_id: accountId, user_id: s.id, ot_round: 2, created_at: atKst(daysAgo(6), 19), closing_result: "hold", closing_reason: "consider", closing_reapproach_at: daysAgo(-between(1, 5)) });
      }
    }

    // ② 계약·수업 — 지금 상태(잔여·마지막 수업)에서 거꾸로 만든다.
    if (s.kind === "pt" || s.kind === "carry" || s.kind === "expt") {
      // 시작 = 유입 + 6일(OT 기간) · 인계·외부는 유입 다음 날. 마지막 = 지금 상태로 정한 날.
      const created = Date.parse(atKst(s.created));
      const startMs = created + (s.kind === "carry" ? 1 : 6) * DAY;
      const curSize = s.kind === "carry" ? 15 : pick([20, 20, 30]);
      let prevN = s.prev ?? 0;
      let usedCur, lastMs;
      if (s.kind === "expt") {
        usedCur = 20; prevN = 0;
        lastMs = startMs + (usedCur - 1) * 3.5 * DAY;             // 오래전에 다 쓰고 끝난 회원
      } else {
        const gap = s.state === "churn" ? (s.gapDays ?? between(15, 28)) : between(0, 3);
        lastMs = NOW - gap * DAY;
        const rem = s.rem ?? (s.state === "expiring" ? between(2, 8) : s.state === "churn" ? between(6, 14) : between(11, curSize - 4));
        usedCur = curSize - rem;
      }
      // 주 2~3회를 넘지 않게 — 기간이 짧으면 이전 계약·이번 계약 수업 수를 줄인다(잔여가 늘어남).
      const capacity = Math.max(1, Math.floor((lastMs - startMs) / DAY / 2.6) + 1);
      while (prevN > 0 && prevN * 20 + Math.max(1, usedCur) > capacity) prevN--;
      if (prevN * 20 + usedCur > capacity) usedCur = Math.max(1, capacity - prevN * 20);
      const chain = [];
      for (let p = 0; p < prevN; p++) chain.push({ size: 20, used: 20 });
      chain.push({ size: s.kind === "expt" ? 20 : curSize, used: usedCur });
      const totalSessions = chain.reduce((a, c) => a + c.used, 0);
      const span = Math.max(0, lastMs - startMs);
      let k = 0;
      for (let c = 0; c < chain.length; c++) {
        const ch = chain[c];
        const sessDates = [];
        for (let j = 0; j < ch.used; j++, k++) sessDates.push(startMs + (totalSessions <= 1 ? span : (span * k) / (totalSessions - 1)));
        const startedMs = (sessDates[0] ?? startMs) - DAY;
        const price = pick([60000, 65000, 70000]);
        const isLast = c === chain.length - 1;
        contracts.push({
          account_id: accountId, user_id: s.id, trainer_id: s.trainerId,
          sessions_total: ch.size, service_sessions: ch.size >= 30 ? 2 : 0, price_per_session: price,
          amount_total: ch.size * price, counts_as_revenue: s.kind !== "carry",
          started_at: new Date(startedMs).toISOString(), kind: s.kind === "carry" ? null : c === 0 ? "new" : "reregister",
          handed_over: false,
          // 이전 계약 = 재등록 성공으로 넘어감 · 다 쓰고 끝난 'expt' = 재등록 안 함
          reg_result: !isLast ? "success" : s.kind === "expt" ? "fail" : null,
          reg_reason: isLast && s.kind === "expt" ? pick(["money", "low_effect", "personal"]) : null,
        });
        logsByContract.push({ s, dates: sessDates });
      }
      // 인바디 — PT 회원은 2~4회, 박하은은 4회로 변화가 뚜렷하게
      const nIn = s.inbodyRich ? 4 : between(2, 3);
      const w0 = s.gender === "female" ? between(58, 68) : between(74, 88);
      for (let q = 0; q < nIn; q++) {
        const ms = startMs + (span * q) / Math.max(1, nIn - 1);
        inbody.push({ account_id: accountId, trainer_id: s.trainerId, user_id: s.id, measured_at: kstDate(Math.min(ms, NOW)),
          weight: +(w0 - q * (s.inbodyRich ? 1.4 : 0.9)).toFixed(1),
          skeletal_muscle: +((s.gender === "female" ? 21.5 : 31) + q * 0.4).toFixed(1),
          body_fat_pct: +((s.gender === "female" ? 31 : 24) - q * (s.inbodyRich ? 1.6 : 1.0)).toFixed(1),
          body_fat_mass: +(((s.gender === "female" ? 31 : 24) - q * 1.2) * w0 / 100).toFixed(1),
          bmr: (s.gender === "female" ? 1250 : 1650) + q * 12, visceral_fat_level: Math.max(3, (s.gender === "female" ? 8 : 10) - q) });
      }
    }
  }

  for (const t of ["A", "B", "C"]) {
    const s = specs.find((x) => x.kind === "pt" && x.state === "steady" && x.trainer === t && x.cohort >= 2 && !x.featured);
    if (!s) continue;
    const size = t === "A" ? 30 : 20, price = 60000;
    const cur = contracts.filter((c) => c.user_id === s.id).slice(-1)[0];
    if (cur) cur.reg_result = "success";
    contracts.push({ account_id: accountId, user_id: s.id, trainer_id: s.trainerId, sessions_total: size, service_sessions: size >= 30 ? 2 : 0,
      price_per_session: price, amount_total: size * price, counts_as_revenue: true, started_at: atKst(`${THIS_YM}-01`, 15),
      kind: "reregister", handed_over: false, reg_result: null, reg_reason: null });
    logsByContract.push({ s, dates: [] });
  }

  await insertBatched("ot_log", otRows);
  console.log(`  ✓ OT 기록 ${otRows.length}건`);
  const savedContracts = await insertBatched("session_log", contracts);
  console.log(`  ✓ 계약 ${savedContracts.length}건`);

  // 수업 로그 — 계약 id를 붙여 넣는다. 노쇼 약 5% · 소스는 '손입력'(AI 요약 없음).
  const logs = [];
  savedContracts.forEach((c, i) => {
    const { s, dates } = logsByContract[i];
    dates.forEach((ms, j) => {
      const ymd = kstDate(ms);
      const hh = 7 + ((specs.indexOf(s) * 3 + j) % 14);
      const noshow = j > 2 && rnd() < 0.05;
      logs.push({ account_id: accountId, user_id: s.id, contract_id: c.id, session_at: atKst(ymd, hh), source: noshow ? "noshow" : "manual",
        voided: false, sets_structured: noshow ? null : setsFor(specs.indexOf(s), j) });
    });
  });
  const savedLogs = await insertBatched("daily_workout_log", logs);
  console.log(`  ✓ 수업 ${savedLogs.length}건`);

  // 회원 확인(서명 대체) — 이틀 지난 수업 대부분. 해시는 저장된 행을 다시 읽어 서버와 같은 방식으로 계산.
  const conf = [];
  const twoDaysAgo = NOW - 2 * DAY;
  for (const l of savedLogs) {
    if (l.source === "noshow" || Date.parse(l.session_at) > twoDaysAgo || rnd() < 0.12) continue;
    conf.push({ log_id: l.id, member_id: l.user_id, result: "confirm", method: "tap", content_hash: contentHashNode(l, crypto), confirmed_at: new Date(Date.parse(l.session_at) + 5 * 3600000).toISOString() });
  }
  await insertBatched("workout_log_confirmation", conf);
  console.log(`  ✓ 회원 확인 ${conf.length}건`);

  await insertBatched("inbody_log", inbody);
  console.log(`  ✓ 인바디 ${inbody.length}건`);

  /* 오늘 예약 · 미처리 예약 */
  const byName = Object.fromEntries(specs.map((s) => [s.name, s]));
  const ptActive = specs.filter((s) => s.kind === "pt" && s.state !== "churn");
  const todayPlan = [
    [byName["이서준"], 18, 0], [byName["김민지"], 19, 0], [byName["최준호"], 20, 0], [byName["박하은"], 17, 0],
  ];
  for (const t of ["B", "C"]) ptActive.filter((s) => s.trainer === t).slice(0, 3).forEach((s, i) => todayPlan.push([s, 10 + i * 3, 0]));
  const waitC = specs.find((s) => s.kind === "ot" && s.ot === "wait" && s.trainer === "C");
  if (waitC) todayPlan.push([waitC, 15, 0]);
  for (const [s, hh, mm] of todayPlan) if (s) appts.push({ account_id: accountId, trainer_id: s.trainerId, user_id: s.id, start_at: atKst(TODAY, hh, mm), status: "booked" });
  ptActive.filter((s) => s.trainer === "C").slice(3, 5).forEach((s) => appts.push({ account_id: accountId, trainer_id: s.trainerId, user_id: s.id, start_at: atKst(daysAgo(1), 14), status: "booked" })); // 미처리
  ptActive.slice(0, 6).forEach((s, i) => appts.push({ account_id: accountId, trainer_id: s.trainerId, user_id: s.id, start_at: atKst(daysAgo(-1), 9 + i * 2), status: "booked" }));
  await insertBatched("appointment", appts);
  console.log(`  ✓ 예약 ${appts.length}건`);

  /* 지출·FC매출·공지 */
  const lastMonth = (d) => { const x = new Date(NOW + 9 * 3600000); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - 1, d)).toISOString().slice(0, 10); };
  const thisMonth = (d) => `${THIS_YM}-${String(d).padStart(2, "0")}`;
  await insertBatched("expense", [
    { account_id: accountId, spent_on: lastMonth(1), category: "임대료", amount: 3500000, memo: "9월 임대료" },
    { account_id: accountId, spent_on: lastMonth(10), category: "공과금", amount: 420000, memo: "전기·수도" },
    { account_id: accountId, spent_on: lastMonth(14), category: "장비·소모품", amount: 186000, memo: "폼롤러·밴드 교체" },
    { account_id: accountId, spent_on: lastMonth(20), category: "마케팅", amount: 300000, memo: "지역 광고" },
    { account_id: accountId, spent_on: thisMonth(1), category: "임대료", amount: 3500000, memo: "10월 임대료" },
  ]);
  await insertBatched("income", [
    { account_id: accountId, earned_on: lastMonth(4), kind: "fc", amount: 990000, memo: "회원권 6개월 + 락커" },
    { account_id: accountId, earned_on: lastMonth(12), kind: "fc", amount: 450000, memo: "회원권 3개월" },
    { account_id: accountId, earned_on: lastMonth(22), kind: "fc", amount: 1650000, memo: "회원권 12개월" },
    { account_id: accountId, earned_on: lastMonth(26), kind: "etc", amount: 120000, memo: "운동복 대여" },
    { account_id: accountId, earned_on: thisMonth(1), kind: "fc", amount: 450000, memo: "회원권 3개월" },
  ]);
  await insertBatched("announcement", [{ account_id: accountId, author_id: ownerId, title: "10월 운영 안내",
    body: "이번 달부터 운동일지는 수업 당일 남겨 주세요. 회원 확인이 쌓여야 월말 정산이 빨라집니다.", must_ack: true, pinned: true }]);
  console.log("  ✓ 지출 · FC매출 · 공지");

  // 미리보기 — 앱이 실제로 쓰는 계산 함수로 대시보드 숫자를 미리 본다.
  if (DRY) {
    const nowISO = new Date(NOW).toISOString();
    const nameOf = (id) => members.find((m) => m.id === id)?.name;
    const exp = MS.expiringMembers(members, savedContracts, savedLogs, { nowISO });
    const churn = MS.churnRiskMembers(members, savedContracts, savedLogs, { nowISO });
    const funnel = MS.otFunnel(members, otRows);
    const cohort = MS.otFunnelByMonth(members, THIS_YM, 6);
    const trend = MS.revenueTrendByMonth(savedContracts, THIS_YM, 6);
    const comp = MS.revenueCompositionInMonth(savedContracts, THIS_YM);
    const rr = MS.reregisterStats(savedContracts);
    const otIds = new Set(members.filter((m) => m.status === "ot_active").map((m) => m.id));
    const due = MS.closingDueSoon(otRows, { todayISO: TODAY, horizonISO: daysAgo(-7), otMemberIds: otIds, validMemberIds: new Set(members.map((m) => m.id)) });
    console.log("\n[미리보기 결과 — DB에 쓰지 않음]");
    console.log("상태", JSON.stringify(members.reduce((a, m) => ((a[m.status] = (a[m.status] || 0) + 1), a), {})));
    console.log("만료 임박", exp.length, "→", exp.map((e) => `${nameOf(e.user_id)}(잔여${e.rem.paid})`).join(" "));
    console.log("이탈 위험", churn.length, "→", churn.map((c) => `${nameOf(c.user_id)}(${c.gap}일)`).join(" "));
    console.log("등록 흐름", JSON.stringify(funnel));
    console.log("월별 등록률", cohort.map((c) => `${c.ym.slice(5)}월 ${c.confirmed}/${c.intake}`).join(" · "));
    console.log("월별 매출(만원)", trend.map((t) => `${t.ym.slice(5)}월 ${Math.round(t.net / 10000)}`).join(" · "));
    console.log("이달 매출", comp.net.toLocaleString("ko-KR"), `(신규 ${comp.cntNew} · 재등록 ${comp.cntRe})`);
    console.log("재등록 이력", JSON.stringify(rr));
    console.log("이번 주 챙길 등록", due.length, "· 오늘 예약", appts.filter((a) => kstDate(Date.parse(a.start_at)) === TODAY).length, "· 회원 확인", conf.length);
    const pace = [...new Set(savedLogs.map((l) => l.user_id))].map((id) => {
      const t = savedLogs.filter((l) => l.user_id === id).map((l) => Date.parse(l.session_at)).sort((a, b) => a - b);
      return [nameOf(id), t.length, +((t.length / Math.max(7, (t[t.length - 1] - t[0]) / DAY)) * 7).toFixed(1)];
    }).sort((a, b) => b[2] - a[2]);
    console.log("주당 수업 많은 순 상위3", JSON.stringify(pace.slice(0, 3)));
    return;
  }

  console.log("\n✔ 완료");
  console.log(`  센터: ${CENTER_NAME} · 회원 ${members.length} · 계약 ${savedContracts.length} · 수업 ${savedLogs.length}`);
  console.log("  로그인 정보: scripts/demo/.demo-credentials.json (깃에 안 올라감)");
  console.log("\n⚠ 다음: lib/demo.js의 DEMO_ACCOUNT_IDS에 계정 id를 넣어 주간 리포트·노션 동기화에서 빼세요.");
  console.log(`  계정 id: ${accountId}`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
