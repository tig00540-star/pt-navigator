// scripts/demo/seed-owner.mjs — 데모 대표(정민재)를 '대표 겸 트레이너'로: 담당 회원에 일어날 수 있는 모든 경우를 하나씩(2026-10-05).
// -----------------------------------------------------------------------------
// 전제: seed-demo.mjs --write (+ seed-extra.mjs --write) 끝난 데모 센터. 박준형 등 다른 트레이너 회원은 건드리지 않는다.
// 미리보기: node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-owner.mjs          ← 기본. DB에 안 씀.
// 실제:     node --import ./scripts/demo/alias-loader.mjs scripts/demo/seed-owner.mjs --write
// 삭제:     node scripts/demo/delete-demo.mjs (센터 전체)
// 규율: 이름 · 연락처 · 통증 · 인바디 전부 지어낸 값 · AI 결과는 만들지 않음(실제 앱에서) · 루틴 · 사례 숫자는 앱 계산 함수로.
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";
import { draftRoutine } from "../../lib/routine.js";
import { inbodyCandidates, liftCandidates, anonLabel, guessCategory } from "../../lib/salesCase.js";

const DRY = !process.argv.includes("--write");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const creds = JSON.parse(fs.readFileSync(path.join(HERE, ".demo-credentials.json"), "utf8"));
const ACC = creds.accountId;
const OID = creds.owner.id; // 정민재 = 대표이자 이 회원들의 담당 트레이너
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(DRY ? "[미리보기 — DB에 쓰지 않음 · 실제로 넣으려면 --write]" : "[실제 — DB에 씁니다]");

/* ───────── 도우미 ───────── */
const DAY = 86400000;
const NOW = Date.now();
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const atKst = (ymd, hh = 10, mm = 0) => new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`).toISOString();
const ago = (n) => kstDate(NOW - n * DAY);
const TODAY = ago(0);
const THIS_YM = TODAY.slice(0, 7);
let FAKE = 0;
async function read(label, q) { const { data, error } = await q; if (error) throw new Error(`${label}: ${error.message}`); return data || []; }
async function ins(table, rows) {
  if (!rows.length) return [];
  if (DRY) { FAKE += rows.length; return rows.map((r) => ({ id: crypto.randomUUID(), created_at: new Date(NOW).toISOString(), ...r })); }
  const out = [];
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await sb.from(table).insert(rows.slice(i, i + 300)).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
}
async function upd(table, id, patch) {
  if (DRY) return;
  const { error } = await sb.from(table).update(patch).eq("id", id).select("id");
  if (error) throw new Error(`${table} update: ${error.message}`);
}

/* 운동 기록 — 부위 두 개씩 돌아가며 · 3수업마다 한 칸 올림(scale = 시작 무게 배수) */
const MOVES = {
  legs: [["레그프레스", 60, 10, 12], ["힙쓰러스트", 40, 5, 12]],
  back: [["랫풀다운", 30, 2.5, 12], ["시티드로우", 30, 2.5, 12]],
  chest: [["체스트프레스", 25, 2.5, 12], ["케이블크로스오버", 10, 1.25, 12]],
  shoulders: [["숄더프레스 머신", 15, 2.5, 12], ["사이드 레터럴 레이즈", 3, 1, 15]],
};
function sessionSets(k, scale = 1) {
  const pairs = [["legs", "back"], ["chest", "shoulders"], ["legs", "chest"], ["back", "shoulders"]];
  const [a, b] = pairs[k % pairs.length];
  return [...MOVES[a], ...MOVES[b]].map(([exercise, base, step, reps]) => {
    const wgt = Math.round((base * scale + step * Math.floor(k / 3)) / step) * step;
    return { exercise, sets: wgt <= 5 ? [{ weight: wgt, reps }, { weight: wgt, reps }] : [{ weight: Math.max(step, wgt - step * 2), reps: 12 }, { weight: wgt, reps }, { weight: wgt, reps: reps - 2 }] };
  });
}
// 마지막 수업(lastAgo일 전)에서 거꾸로 n번 · every일 간격
const datesBack = (n, lastAgo, every = 3) => Array.from({ length: n }, (_, i) => ago(lastAgo + (n - 1 - i) * every));

/* ───────── 회원 설계 — 경우 하나에 한 명 ─────────
   c = 계약들 [{ size, price, svc, startAgo, kind, used, lastAgo, every, reg, reason, reapproachAgo, regAgo, sat, refund, counts, extraDates }]
   ot = OT 기록들 [{ round, dayAgo, result, reason, reapproachAgo, proposed, quote, want, next }]                                   */
const P = (o) => ({ status: "pt_active", origin: "ot_funnel", ...o });
const SC = [
  // ── OT ──
  { k: "ot_wait", name: "강서현", case: "OT · 1차 대기(오늘 15시)", status: "ot_active", gender: "female", age: 33, job: "회계사", goal: "체지방 감량", pain: "목 뻐근함", createdAgo: 2,
    profile: { residence: "역삼동", mbti: "ISTJ", goal_deadline: "연말 동창회 전", training_pace: "제대로", injury_history: "없음", exercise_level: "헬스 3개월 혼자", quit_reason: "혼자 하니 방법을 몰라서", past_exercise: "요가", availability: "평일 오후 3시 이후", activity_level: "하루 대부분 앉아 있음", member_note: "거북목이 신경 쓰인다고 함" },
    appts: [[0, 15, 0, "booked"]] },
  { k: "ot_blank", name: "노지훈", case: "OT · 1차 대기 · 목표와 직업 비어 있음", status: "ot_active", gender: "male", age: 27, job: "-", goal: "-", createdAgo: 1, appts: [[-1, 19, 0, "booked"]] },
  { k: "ot_none", name: "백나연", case: "OT · 1차 끝 · 등록 제안 못 함 → 2차 예약", status: "ot_active", gender: "female", age: 25, job: "대학원생", goal: "체력 기르기", createdAgo: 5,
    ot: [{ round: 1, dayAgo: 4, result: "none", proposed: false, next: "continue", reapproachAgo: -2, quote: "생각보다 재밌었어요", want: "health" }], appts: [[-2, 18, 0, "booked"]] },
  { k: "ot_hold1", name: "석준영", case: "OT · 1차 보류(제안함) · 다시 연락할 날 = 오늘", status: "ot_active", gender: "male", age: 36, job: "영업직", goal: "뱃살 빼기", createdAgo: 6,
    ot: [{ round: 1, dayAgo: 5, result: "hold", reason: "consider", proposed: true, reapproachAgo: 0, quote: "주말에 생각해 보고 연락드릴게요", want: "appearance" }] },
  { k: "ot_unclosed", name: "하윤아", case: "OT · 2차 했는데 결과 미기록", status: "ot_active", gender: "female", age: 29, job: "간호사", goal: "하체 라인 정리", createdAgo: 9,
    ot: [{ round: 1, dayAgo: 8, result: "hold", reason: "time", proposed: true, quote: "교대 근무라 시간이 걱정이에요", want: "appearance" }, { round: 2, dayAgo: 2, result: null }] },
  { k: "ot_r3", name: "탁민성", case: "OT · 보류 두 번 → 3차 · 연락 3일 밀림", status: "ot_active", gender: "male", age: 41, job: "자영업", goal: "허리 통증 줄이기", pain: "허리 뻐근함", createdAgo: 14,
    ot: [{ round: 1, dayAgo: 13, result: "hold", reason: "money", proposed: true, quote: "가격이 좀 세네요", want: "pain" }, { round: 2, dayAgo: 6, result: "hold", reason: "partner", proposed: true, reapproachAgo: 3, quote: "집사람이랑 얘기해 볼게요", want: "pain" }] },
  { k: "ot_won", name: "편소라", case: "OT · 1차 등록 성공 · PT 등록 확정 대기(배너)", status: "ot_active", gender: "female", age: 31, job: "마케터", goal: "바디프로필", createdAgo: 3,
    ot: [{ round: 1, dayAgo: 2, result: "success", proposed: true, quote: "오늘 바로 시작할게요", want: "appearance" }] },
  { k: "ot_fail", name: "진우석", case: "OT · 그만하기로 함(시간)", status: "ot_active", gender: "male", age: 45, job: "공무원", goal: "건강검진 수치 개선", createdAgo: 7,
    ot: [{ round: 1, dayAgo: 5, result: "fail", reason: "time", proposed: true, quote: "야근이 많아서 꾸준히 못 올 것 같아요", want: "health" }] },
  { k: "ot_lost", name: "마예은", case: "OT에서 이탈 · 지난 회원", status: "inactive", statusAgo: 50, gender: "female", age: 38, job: "주부", goal: "체지방 감량", createdAgo: 60,
    ot: [{ round: 1, dayAgo: 58, result: "hold", reason: "money", proposed: true, quote: "조금 더 알아볼게요", want: "appearance" }, { round: 2, dayAgo: 52, result: "fail", reason: "compare", proposed: true, quote: "다른 데랑 비교해 볼게요", want: "appearance" }] },

  // ── PT ──
  P({ k: "pt_new", name: "구하람", case: "PT · 막 등록 · 수업 0 · 인바디 없음 · 오늘 첫 수업", gender: "female", age: 26, job: "디자이너", goal: "자세 교정", createdAgo: 6,
    ot: [{ round: 1, dayAgo: 4, result: "success", proposed: true, quote: "자세부터 제대로 배우고 싶어요", want: "pain" }],
    c: [{ size: 20, price: 65000, startAgo: 3, kind: "new", used: 0 }], appts: [[0, 19, 0, "booked"]], noInbody: true }),
  P({ k: "pt_full", name: "나태윤", case: "PT · 회원 페이지 전부(동의 · 로드맵 · 루틴 · 오운완 5일 · 서비스 2회) · 오늘 8시 완료", gender: "male", age: 34, job: "개발자", goal: "근력 증가", createdAgo: 70, token: true, consent: "all",
    c: [{ size: 30, svc: 2, price: 60000, startAgo: 62, kind: "new", used: 18, lastAgo: 2, every: 3.3, scale: 1.3 }], inbody: [4, 60, 5],
    appts: [[0, 8, 0, "done", true], [-2, 8, 0, "booked"]], roadmap: true, routine: { layout: "ppl", confirmedAgo: 6, logs: true }, selfLog: [5, 0] }),
  P({ k: "pt_due", name: "도은비", case: "PT · 재등록 타이밍(잔여 6) · 오늘 예약 · 운동일지 미확인 3건", gender: "female", age: 37, job: "교사", goal: "체지방 감량", createdAgo: 55, token: true, consent: "all",
    c: [{ size: 20, price: 65000, startAgo: 50, kind: "new", used: 14, lastAgo: 2, every: 3.4 }], inbody: [3, 48, 10], appts: [[0, 13, 0, "booked"]], unconfirmedLast: 3 }),
  P({ k: "pt_churn", name: "류건희", case: "PT · 이탈 위험(20일 무수업 · 잔여 12)", gender: "male", age: 48, job: "회사원", goal: "체력 기르기", createdAgo: 60,
    c: [{ size: 20, price: 65000, startAgo: 55, kind: "new", used: 8, lastAgo: 20, every: 4 }], inbody: [2, 52, 25] }),
  P({ k: "pt_zero", name: "모하린", case: "PT · 남은 0회 → PT 종료 처리할까요?", gender: "female", age: 30, job: "약사", goal: "탄탄한 몸 만들기", createdAgo: 45, token: true, consent: "all",
    c: [{ size: 10, price: 70000, startAgo: 38, kind: "new", used: 10, lastAgo: 3, every: 3.5 }], inbody: [2, 36, 6] }),
  P({ k: "pt_snooze", name: "반시온", case: "PT · 남은 0회 · 7일 미룸(카드 안 보임)", gender: "male", age: 39, job: "자영업", goal: "체지방 감량", createdAgo: 40, snoozeAgo: -5,
    c: [{ size: 10, price: 70000, startAgo: 35, kind: "new", used: 10, lastAgo: 4, every: 3 }] }),
  P({ k: "pt_ahead", name: "송지안", case: "PT · 미리 재등록(잔여 3 + 다음 계약 대기) → 재등록 알림 안 뜸", gender: "female", age: 42, job: "은행원", goal: "건강·체력", createdAgo: 60,
    c: [{ size: 20, price: 65000, startAgo: 55, kind: "new", used: 17, lastAgo: 1, every: 3.2, reg: "success", regAgo: 6, sat: ["very", "다음 달도 같은 시간으로 해 주세요"] },
        { size: 20, price: 65000, startAgo: 6, kind: "reregister", used: 0 }] }),
  P({ k: "pt_hold", name: "엄태경", case: "PT · 재등록 보류 · 다시 물어볼 날 = 오늘", gender: "male", age: 51, job: "회사원", goal: "혈압 관리", createdAgo: 50,
    c: [{ size: 20, price: 65000, startAgo: 45, kind: "new", used: 15, lastAgo: 2, every: 2.9, reg: "hold", reason: "money", reapproachAgo: 0, regAgo: 5, sat: ["neutral", "효과는 있는데 금액이 고민이에요"] }],
    appts: [[0, 17, 0, "booked"]] }),
  P({ k: "pt_nore", name: "염다솜", case: "PT · 재등록 안 함(개인 사정) · 잔여 2", gender: "female", age: 28, job: "대학생", goal: "하체 라인 정리", createdAgo: 40,
    c: [{ size: 10, price: 70000, startAgo: 35, kind: "new", used: 8, lastAgo: 3, every: 4, reg: "fail", reason: "personal", regAgo: 4, sat: ["good", "이사 가게 돼서요"] }] }),
  P({ k: "pt_rr2", name: "왕재민", case: "PT · 2번째 재등록 회차(계약 3개 · 잔여 9)", gender: "male", age: 35, job: "엔지니어", goal: "근력 증가", createdAgo: 150, token: true, consent: "all",
    c: [{ size: 20, price: 60000, startAgo: 145, kind: "new", used: 20, lastAgo: 96, every: 2.5, reg: "success", regAgo: 98, scale: 1.4 },
        { size: 20, price: 60000, startAgo: 95, kind: "reregister", used: 20, lastAgo: 44, every: 2.5, reg: "success", regAgo: 46, scale: 1.4, k0: 20, sat: ["very", "벤치 처음으로 60 들었어요"] },
        { size: 30, price: 58000, startAgo: 43, kind: "reregister", used: 21, lastAgo: 1, every: 2, scale: 1.4, k0: 40 }], inbody: [4, 140, 8], appts: [[-1, 20, 0, "booked"]] }),
  P({ k: "pt_handover", name: "육서진", case: "PT · 인계받은 회원(매출 제외 이월 계약)", origin: "handover", gender: "female", age: 44, job: "주부", goal: "어깨 결림 완화", pain: "어깨 결림", createdAgo: 30,
    c: [{ size: 15, price: 60000, startAgo: 29, kind: null, counts: false, used: 7, lastAgo: 2, every: 3.5 }], appts: [[-2, 11, 0, "booked"]] }),
  P({ k: "pt_external", name: "인하준", case: "PT · 외부 PT 등록 · 인바디 4주 넘음", origin: "external", gender: "male", age: 32, job: "연구원", goal: "체지방 감량", createdAgo: 45,
    c: [{ size: 20, price: 65000, startAgo: 44, kind: null, counts: false, used: 11, lastAgo: 3, every: 3.5 }], inbody: [1, 40, 40], appts: [[-3, 19, 0, "booked"]] }),
  P({ k: "pt_noshow", name: "전소민", case: "PT · 노쇼 2회 · 지운 일지 1개 · 오늘 취소", gender: "female", age: 27, job: "회사원", goal: "체지방 감량", createdAgo: 40,
    c: [{ size: 20, price: 65000, startAgo: 36, kind: "new", used: 10, lastAgo: 2, every: 3 }], noshow: 2, voidOne: true, appts: [[0, 11, 0, "canceled"]] }),
  P({ k: "pt_nolog", name: "제우현", case: "PT · 오늘 수업 완료인데 운동일지 안 씀", gender: "male", age: 46, job: "자영업", goal: "건강·체력", createdAgo: 35,
    c: [{ size: 20, price: 65000, startAgo: 30, kind: "new", used: 9, lastAgo: 3, every: 3 }], appts: [[0, 10, 0, "done", false]] }),
  P({ k: "pt_nobook", name: "조아라", case: "PT · 다음 예약 없음", gender: "female", age: 33, job: "디자이너", goal: "탄탄한 몸 만들기", createdAgo: 25,
    c: [{ size: 20, price: 65000, startAgo: 22, kind: "new", used: 6, lastAgo: 2, every: 3.5 }] }),
  P({ k: "pt_pastdue", name: "지성훈", case: "PT · 어제 예약 미처리(완료 · 취소 안 누름)", gender: "male", age: 29, job: "회사원", goal: "근력 증가", createdAgo: 28,
    c: [{ size: 20, price: 65000, startAgo: 25, kind: "new", used: 6, lastAgo: 4, every: 3.5 }], appts: [[1, 18, 0, "booked"]] }),
  P({ k: "pt_rreq", name: "차나래", case: "PT · 루틴 요청 열림 · 건강정보 미동의", gender: "female", age: 31, job: "회사원", goal: "하체 라인 정리", createdAgo: 30, token: true, consent: "general",
    c: [{ size: 20, price: 65000, startAgo: 27, kind: "new", used: 8, lastAgo: 2, every: 3 }], rreq: true }),
  P({ k: "pt_raised", name: "채도영", case: "PT · 루틴 확정 뒤 PT 무게 오름(다시 맞추기) · 아파서 멈춤 1", gender: "female", age: 35, job: "약사", goal: "근력 증가", pain: "무릎 시큰함", createdAgo: 50, token: true, consent: "all",
    c: [{ size: 30, svc: 2, price: 60000, startAgo: 45, kind: "new", used: 16, lastAgo: 1, every: 2.6, scale: 1.2 }], routine: { layout: "ul", confirmedAgo: 12, logs: true, pain: true } }),
  P({ k: "pt_break", name: "천유빈", case: "PT · 루틴 확정 뒤 PT 28일 넘게 끊김 → 회원 화면 '다시 확인 중'", gender: "male", age: 40, job: "회사원", goal: "체력 기르기", createdAgo: 90, token: true, consent: "all",
    c: [{ size: 30, price: 60000, startAgo: 85, kind: "new", used: 14, lastAgo: 33, every: 3, extraDates: [2] }], routine: { layout: "full", confirmedAgo: 40 } }),
  P({ k: "pt_gate", name: "최가온", case: "PT · 링크만 보냄 · 아직 동의 전(첫 화면 동의)", gender: "female", age: 24, job: "대학생", goal: "체지방 감량", createdAgo: 20, token: true,
    c: [{ size: 10, price: 70000, startAgo: 18, kind: "new", used: 4, lastAgo: 3, every: 4 }] }),
  P({ k: "pt_withdrew", name: "추승민", case: "PT · 건강정보 동의 철회", gender: "male", age: 38, job: "회사원", goal: "허리 통증 줄이기", pain: "허리 뻐근함", createdAgo: 40, token: true, consent: "withdrawn",
    c: [{ size: 20, price: 65000, startAgo: 36, kind: "new", used: 11, lastAgo: 2, every: 3 }] }),
  P({ k: "pt_last", name: "표하은", case: "PT · 유료 다 쓰고 서비스 1회만 남음", gender: "female", age: 43, job: "주부", goal: "체력 기르기", createdAgo: 40,
    c: [{ size: 10, svc: 1, price: 70000, startAgo: 35, kind: "new", used: 10, lastAgo: 2, every: 3 }] }),

  // ── 지난 · 숨김 ──
  { k: "x_past", name: "하도윤", case: "지난 회원 · 회원 페이지 볼 수만 있음(10일 전 종료)", status: "inactive", statusAgo: 10, note: "남은 수업 0회", gender: "male", age: 30, job: "회사원", goal: "근력 증가", createdAgo: 80, token: true, consent: "all",
    c: [{ size: 20, price: 65000, startAgo: 75, kind: "new", used: 20, lastAgo: 11, every: 3, reg: "fail", reason: "money", regAgo: 12 }], inbody: [3, 70, 12], selfLog: [4, 12] },
  { k: "x_closed", name: "홍세린", case: "지난 회원 · 6개월 지나 회원 페이지 닫힘", status: "inactive", statusAgo: 240, note: "남은 수업 0회", gender: "female", age: 47, job: "주부", goal: "체지방 감량", createdAgo: 300, token: true,
    c: [{ size: 10, price: 70000, startAgo: 290, kind: "new", used: 10, lastAgo: 242, every: 4, reg: "fail", reason: "personal", regAgo: 243 }] },
  { k: "x_refund", name: "황보라", case: "환불 · 숨김(목록에 안 보임)", status: "pt_active", hidden: true, gender: "female", age: 34, job: "회사원", goal: "체지방 감량", createdAgo: 30,
    c: [{ size: 20, price: 65000, startAgo: 28, kind: "new", used: 2, lastAgo: 24, every: 3, refund: 1170000, refundAgo: 20 }] },
];

async function main() {
  const existing = await read("회원", sb.from("user_table").select("name").eq("account_id", ACC));
  const clash = SC.filter((s) => existing.some((e) => e.name === s.name)).map((s) => s.name);
  if (clash.length) { console.error(`✖ 이미 있는 이름: ${clash.join(", ")} — 이미 넣었으면 다시 하지 마세요.`); process.exit(1); }
  const machines = await read("장비", sb.from("center_machine").select("*").eq("account_id", ACC));

  /* 회원 */
  const rows = SC.map((s, i) => ({
    account_id: ACC, trainer_id: OID, name: s.name, gender: s.gender, age: s.age, job: s.job, goal: s.goal, pain: s.pain || null,
    phone_number: `010-0000-${String(4100 + i)}`, status: s.status, origin: s.origin || "ot_funnel", machines: [], hidden: !!s.hidden,
    created_at: atKst(ago(s.createdAgo), 11), status_changed_at: atKst(ago(s.statusAgo ?? s.createdAgo), s.statusAgo != null ? 20 : 11), status_note: s.note || null,
    member_token: s.token ? crypto.randomUUID() : null, pt_end_snooze_until: s.snoozeAgo != null ? atKst(ago(s.snoozeAgo), 9) : null,
    // member_note는 '회원이 바라는 점'(AI 리포트 재료)이라 경우 설명을 넣지 않는다 — 경우 목록은 콘솔 · 인계 문서에.
    ...(s.profile ? Object.fromEntries(Object.entries(s.profile).filter(([k]) => k !== "member_note")) : {}),
  }));
  const saved = await ins("user_table", rows);
  SC.forEach((s, i) => { s.id = saved[i].id; s.row = saved[i]; });
  console.log(`  ✓ 회원 ${saved.length}명(정민재 담당)`);

  /* 계약 */
  const cRows = [], cMeta = [];
  for (const s of SC) for (const c of s.c || []) {
    cRows.push({ account_id: ACC, user_id: s.id, trainer_id: OID, sessions_total: c.size, service_sessions: c.svc || 0, price_per_session: c.price,
      amount_total: c.size * c.price, counts_as_revenue: c.counts ?? true, started_at: atKst(ago(c.startAgo), 15), kind: c.kind, handed_over: false,
      reg_result: c.reg || null, reg_reason: c.reason || null, reg_reapproach_at: c.reapproachAgo != null ? ago(c.reapproachAgo) : null,
      report: c.sat ? { reg_satisfaction: { level: c.sat[0], quote: c.sat[1] } } : null,
      refund_amount: c.refund || null, refunded_at: c.refundAgo != null ? atKst(ago(c.refundAgo), 14) : null });
    cMeta.push({ s, c });
  }
  const cSaved = await ins("session_log", cRows);
  cMeta.forEach((m, i) => { m.id = cSaved[i].id; });
  for (const m of cMeta) if (m.c.reg) await upd("session_log", m.id, { reg_recorded_at: atKst(ago(m.c.regAgo ?? m.c.lastAgo ?? 0), 21) });
  console.log(`  ✓ 계약 ${cSaved.length}`);

  /* 수업 */
  const lRows = [];
  for (const m of cMeta) {
    const { s, c } = m;
    if (!c.used) continue;
    const ds = datesBack(c.used - (c.extraDates?.length || 0), c.lastAgo, c.every || 3);
    for (const e of c.extraDates || []) ds.push(ago(e));
    ds.forEach((ymd, j) => {
      const noshow = s.noshow && j >= 3 && j < 3 + s.noshow;
      lRows.push({ account_id: ACC, user_id: s.id, contract_id: m.id, session_at: atKst(ymd, 8 + ((j * 5) % 12)), source: noshow ? "noshow" : "manual", voided: false,
        sets_structured: noshow ? null : sessionSets((c.k0 || 0) + j, c.scale || 1) });
    });
    if (s.voidOne) lRows.push({ account_id: ACC, user_id: s.id, contract_id: m.id, session_at: atKst(ago(9), 15), source: "manual", voided: true, sets_structured: sessionSets(2) });
  }
  // 오늘 완료 + 일지 있음
  for (const s of SC) for (const a of s.appts || []) if (a[0] === 0 && a[3] === "done" && a[4]) {
    const m = cMeta.filter((x) => x.s === s).at(-1);
    lRows.push({ account_id: ACC, user_id: s.id, contract_id: m.id, session_at: atKst(TODAY, a[1], a[2]), source: "manual", voided: false, sets_structured: sessionSets(30, 1.3) });
  }
  const lSaved = await ins("daily_workout_log", lRows);
  console.log(`  ✓ 수업 ${lSaved.length}(노쇼 · 지운 일지 포함)`);

  /* 회원 확인 — 이틀 지난 것 대부분 · 도은비 마지막 3개는 미확인 */
  const skip = new Set();
  for (const s of SC) if (s.unconfirmedLast) lSaved.filter((l) => l.user_id === s.id).sort((a, b) => b.session_at.localeCompare(a.session_at)).slice(0, s.unconfirmedLast).forEach((l) => skip.add(l.id));
  const conf = lSaved.filter((l) => !l.voided && l.source !== "noshow" && Date.parse(l.session_at) < NOW - 2 * DAY && !skip.has(l.id))
    .map((l) => ({ log_id: l.id, member_id: l.user_id, result: "confirm", method: "tap", content_hash: DRY ? "dry" : contentHashNode(l, crypto), confirmed_at: new Date(Date.parse(l.session_at) + 5 * 3600000).toISOString() }));
  await ins("workout_log_confirmation", conf);

  /* 예약 */
  const aRows = [];
  for (const s of SC) for (const [d, hh, mm, st] of s.appts || []) aRows.push({ account_id: ACC, trainer_id: OID, user_id: s.id, start_at: atKst(ago(d), hh, mm), status: st });
  await ins("appointment", aRows);
  console.log(`  ✓ 예약 ${aRows.length}(오늘 ${aRows.filter((a) => a.start_at.startsWith(TODAY) || kstDate(Date.parse(a.start_at)) === TODAY).length}) · 회원 확인 ${conf.length}`);

  /* OT 기록 */
  const QUOTE_WANT = { appearance: "외형 변화가 제일 궁금해함", pain: "불편한 곳부터 편해지고 싶어함", health: "체력을 키우고 싶어함" };
  const oRows = [], oMeta = [];
  for (const s of SC) for (const o of s.ot || []) {
    const day = ago(o.dayAgo);
    const rep = o.result === null ? null : {
      movements: [{ name: "레그프레스", tags: ["felt"], star: true, observation: "레그프레스: 자극 바로 옴", memberAware: false, plan2nd: "다음 OT에서 다시 보여주기(증명 재연)" },
                  { name: "랫풀다운", tags: ["weak"], star: false, observation: "랫풀다운: 잘 못 느낌", memberAware: false, plan2nd: "" }],
      reaction: { stimulus: "well", attitudeTags: ["active"], memo: "" },
      goal: { identified: true, type: o.want || "appearance", detail: QUOTE_WANT[o.want] || "" },
      memberQuote: o.quote || "", trainer_note: "", sales_intensity: o.result === "hold" ? "strong" : "standard",
      proposed: o.proposed ?? true, next: o.next || (o.result === "hold" ? "continue" : null), feedback_v: 2, feedbackAt: atKst(day, 20, 5),
    };
    const closed = o.result && o.result !== "none";
    oRows.push({ account_id: ACC, user_id: s.id, ot_round: o.round, created_at: atKst(day, 19), report: rep, goal_type: o.want || "appearance", goal_identified: !!rep,
      closing_result: o.result, closing_approach: rep ? (["appearance", "pain", "health"].includes(o.want) ? o.want : "other") : null,
      closing_reason: o.reason || null, closing_reapproach_at: o.reapproachAgo != null ? ago(o.reapproachAgo) : null,
      ...(closed ? { closing_detail: { approach: rep.proposed ? "등록 제안함" : "등록 제안 못 함", reaction: o.quote || null, outcome: o.result === "success" ? "등록했어요" : o.result === "fail" ? "그만하기로 했어요" : "다음 OT 이어가요" },
        closing_profile: { age: s.age, job: s.job, pain: s.pain || null, goal: s.goal, goal_type: o.want || "appearance" } } : {}) });
    oMeta.push(o);
  }
  const oSaved = await ins("ot_log", oRows);
  for (const [i, r] of oSaved.entries()) if (oMeta[i].result) await upd("ot_log", r.id, { closing_recorded_at: atKst(ago(oMeta[i].dayAgo), 20, 5) });
  console.log(`  ✓ OT 기록 ${oSaved.length}`);

  /* 인바디 [횟수, 처음(일 전), 마지막(일 전)] */
  const iRows = [];
  for (const s of SC) {
    if (!s.inbody) continue;
    const [n, first, last] = s.inbody, f = s.gender === "female", w0 = f ? 62 : 80;
    for (let q = 0; q < n; q++) {
      const d = Math.round(first - ((first - last) * q) / Math.max(1, n - 1));
      iRows.push({ account_id: ACC, trainer_id: OID, user_id: s.id, measured_at: ago(d), weight: +(w0 - q * 1.2).toFixed(1), skeletal_muscle: +((f ? 22 : 32.5) + q * 0.5).toFixed(1),
        body_fat_pct: +((f ? 30 : 23) - q * 1.4).toFixed(1), body_fat_mass: +(((f ? 30 : 23) - q * 1.4) * (w0 - q * 1.2) / 100).toFixed(1), bmr: (f ? 1270 : 1690) + q * 13, visceral_fat_level: Math.max(3, (f ? 8 : 10) - q) });
    }
  }
  await ins("inbody_log", iRows);

  /* 동의 */
  const cs = [];
  for (const s of SC) {
    const t = atKst(ago(Math.min(20, s.createdAgo)), 21);
    if (s.consent === "all" || s.consent === "withdrawn") cs.push({ member_id: s.id, kind: "general", agreed: true, method: "member_page", version: "2026-10-05", created_at: t }, { member_id: s.id, kind: "health", agreed: true, method: "member_page", version: "2026-10-05", created_at: t });
    if (s.consent === "general") cs.push({ member_id: s.id, kind: "general", agreed: true, method: "member_page", version: "2026-10-05", created_at: t }, { member_id: s.id, kind: "health", agreed: false, method: "member_page", version: "2026-10-05", created_at: t });
    if (s.consent === "withdrawn") cs.push({ member_id: s.id, kind: "health", agreed: false, method: "member_page", version: "2026-10-05", created_at: atKst(ago(3), 22) });
  }
  await ins("member_consent", cs);

  /* 루틴 · 요청 · 로드맵 */
  let rCount = 0;
  for (const s of SC) {
    const r = s.routine;
    if (r) {
      const confirmedAt = atKst(ago(r.confirmedAgo), 21);
      const before = lSaved.filter((l) => l.user_id === s.id && l.session_at < confirmedAt && !l.voided && l.source !== "noshow");
      const { days } = draftRoutine({ logs: before, machines, layout: r.layout, pain: s.pain || "" });
      await ins("member_routine", [{ member_id: s.id, account_id: ACC, trainer_id: OID, split: days.length, layout: r.layout, days, visible: true,
        confirmed_at: confirmedAt, confirmed_by: OID, visible_at: confirmedAt, visible_by: OID, pain_checked_at: s.pain ? confirmedAt : null, updated_at: confirmedAt }]);
      if (r.logs && days.length) {
        const logs = [];
        for (let i = 0; i < Math.min(3, days.length + 1); i++) {
          const d = days[i % days.length];
          const items = d.items.map((it, j) => ({ name: it.name, weight: it.weight, reps: it.reps, sets: it.sets, done: true, ...(r.pain && i === 1 && j === 0 ? { pain: true } : {}) }));
          const ymd = ago(Math.max(1, r.confirmedAgo - 2 - i * 2));
          logs.push({ user_id: s.id, performed_on: ymd, day_key: d.key, items, created_at: atKst(ymd, 21) });
        }
        await ins("member_routine_log", logs);
      }
      rCount++;
    }
    if (s.rreq) await ins("member_routine_request", [{ user_id: s.id, status: "open", created_at: atKst(ago(1), 22, 10), handled_at: null, handled_by: null }]);
    if (s.roadmap) await ins("member_roadmap", [{ member_id: s.id, account_id: ACC, trainer_id: OID, title: "근력 기본기 다지고 무게 올리기", current: 2, visible: true, ai_meta: null,
      stages: [{ title: "자세 잡기", detail: "무게보다 동작 길이를 먼저 맞춰요." }, { title: "버티는 힘", detail: "하체와 코어로 버티는 힘을 쌓아요." },
               { title: "상체 균형", detail: "미는 운동과 당기는 운동을 같은 비율로." }, { title: "무게 늘리기", detail: "같은 횟수에서 한 칸씩 올려요." }, { title: "혼자서도 이어가기", detail: "개인운동 루틴으로 주 1회 더해요." }] }]);
  }
  console.log(`  ✓ 루틴 ${rCount} · 동의 ${cs.length} · 인바디 ${iRows.length}`);

  /* 회원 자가입력 [일수, 며칠 전부터] */
  const cardio = [], sched = [];
  for (const s of SC) {
    if (!s.selfLog) continue;
    const [n, off] = s.selfLog;
    for (let i = 0; i < n; i++) {
      const ymd = ago(off + i);
      sched.push({ user_id: s.id, on_date: ymd, kind: "personal", note: i === 0 ? "하체 위주" : null, created_at: atKst(ymd, 21) });
      if (i % 2 === 0) cardio.push({ user_id: s.id, performed_on: ymd, kind: "러닝머신", minutes: 25 + i * 5, note: null, created_at: atKst(ymd, 21) });
    }
  }
  await ins("cardio_log", cardio);
  await ins("schedule_check", sched);

  /* 대표 겸 트레이너 준비물: 패키지 · 목표 · 메모 할 일 · 사례 */
  const pk = await read("패키지", sb.from("pt_package").select("id").eq("trainer_id", OID));
  if (!pk.length) await ins("pt_package", [
    { account_id: ACC, trainer_id: OID, name: "PT 10회", sessions: 10, price: 700000, list_price: 750000, sort: 1, active: true, note: "처음 시작·체험 연장용" },
    { account_id: ACC, trainer_id: OID, name: "PT 20회", sessions: 20, price: 1300000, list_price: 1400000, sort: 2, active: true, note: "가장 많이 선택 · 주 2회 10주" },
    { account_id: ACC, trainer_id: OID, name: "PT 30회", sessions: 30, price: 1800000, list_price: 2100000, sort: 3, active: true, note: "목표가 뚜렷한 회원 · 회당 단가 최저" }]);
  const g = await read("목표", sb.from("trainer_goal").select("id").eq("trainer_id", OID).eq("ym", THIS_YM));
  if (!g.length) await ins("trainer_goal", [{ account_id: ACC, trainer_id: OID, ym: THIS_YM, target_revenue: 4000000 }]);
  const byK = Object.fromEntries(SC.map((s) => [s.k, s]));
  await ins("trainer_todo", [
    { account_id: ACC, trainer_id: OID, body: "강서현 1차 OT 전에 거북목 체크 자료 준비", due_date: TODAY, member_id: byK.ot_wait.id, done: false, done_at: null },
    { account_id: ACC, trainer_id: OID, body: "엄태경 재등록 다시 여쭤보기", due_date: TODAY, member_id: byK.pt_hold.id, done: false, done_at: null },
    { account_id: ACC, trainer_id: OID, body: "모하린 마지막 인바디 결과 출력", due_date: ago(2), member_id: byK.pt_zero.id, done: true, done_at: atKst(ago(2), 18) }]);
  const mine = SC.filter((s) => !s.hidden).map((s) => s.row);
  const ic = inbodyCandidates(mine, iRows).slice(0, 2);
  const lc = []; for (const c of liftCandidates(mine, lSaved)) { if (!lc.some((x) => x.member.id === c.member.id)) lc.push(c); if (lc.length >= 2) break; }
  await ins("sales_case", [...ic.map((c) => ["inbody", c]), ...lc.map((c) => ["lift", c])].map(([kind, c], i) => ({
    account_id: ACC, trainer_id: OID, kind, member_id: c.member.id, label: anonLabel(c.member, c.data.weeks), data: { ...c.data, category: guessCategory(c.member.goal) }, sort: i })));
  console.log(`  ✓ 패키지 · 목표 · 메모 할 일 3 · 사례 ${ic.length + lc.length}`);

  console.log("\n경우 목록:");
  for (const s of SC) console.log(`  - ${s.name}: ${s.case}`);
  console.log(DRY ? `\n[미리보기 끝 — 약 ${FAKE}행 · 실제로 넣으려면 --write]` : "\n✔ 완료");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
