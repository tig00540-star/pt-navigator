// scripts/demo/rename.mjs — 데모 센터 이름 바꾸기(2026-10-06 · 랜딩 촬영용 · 대표 결정)
// -----------------------------------------------------------------------------
// 센터 = '오트 강남점' · 대표 겸 트레이너 정민재 = '오직이' · 회원 = 목표 · 상황에 맞춘 이름(성은 그대로).
// 이름 칸뿐 아니라 이미 만든 AI 리포트 · 세일즈북 · 운동일지 · 아침 보고서 · 할 일 글 속 이름도 같이 바꾼다(내용은 그대로).
//   · 전체 이름(예: 도은비)은 어디서나 바꿈 · 이름만(예: 은비님)은 그 회원의 행에서 '님 · 씨 · 회원 · 쌤' 앞일 때만.
//   · 운동일지 본문을 고치면 트리거가 edited_at을 지금으로 바꾸므로 되돌리고, 맞던 확인 · 서명 해시는 새 본문으로 다시 계산.
// 미리보기: node --import ./scripts/demo/alias-loader.mjs scripts/demo/rename.mjs   /  실제: … --write (한 번)
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "../../lib/workoutHash.js";
import { fetchAllRows } from "../../lib/fetchAllRows.js";
import { fetchByIds } from "../../lib/fetchByIds.js";

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

const CENTER = ["강남 피트니스", "오트 강남점"];
const TRAINER = ["정민재", "오직이"];
// 옛 이름 → 새 이름(성 그대로 · 목표 · 상황에 맞춘 이름)
const MEMBERS = {
  강서현: "강첫발", 강주원: "강휴식", 고은채: "고민중", 구하람: "구바른", 권서연: "권코어", 권예준: "권체력", 권태호: "권건강",
  김도아: "김루틴", 김민지: "김바프", 김서연: "김날씬", 김예준: "김쉼표", 나태윤: "나개근", 남궁현: "남궁안녕", 노지훈: "노목표",
  도은비: "도감량", 류건희: "류잠수", 류지아: "류쉼", 마예은: "마다음", 모하린: "모완주", 문지환: "문잠깐", 박지호: "박생각",
  박하윤: "박튼튼", 박하은: "박탄탄", 반시온: "반휴가", 배수정: "배작별", 백나연: "백기회", 서다인: "서추억", 서주원: "서활력",
  서하린: "서계단", 석준영: "석복근", 송다은: "송든든", 송시우: "송자세", 송지안: "송미리", 신서윤: "신방학", 신유진: "신연장",
  안지호: "안심", 안하윤: "안여행", 엄태경: "엄망설", 염다솜: "염하체", 오지아: "오어깨", 오지은: "오멈춤", 왕재민: "왕근력",
  유하늘: "유시작", 육서진: "육승모", 윤서연: "윤지구", 윤소희: "윤아쉬", 윤예준: "윤척추", 이도윤: "이졸업", 이서준: "이가뿐",
  이수아: "이단단", 이준혁: "이득근", 인하준: "인바디", 임재현: "임꾸준", 임지호: "임슬림", 임하윤: "임휴학", 장도윤: "장안식",
  장민호: "장광배", 장수아: "장소풍", 전소민: "전깜빡", 정건우: "정근육", 정지아: "정균형", 제우현: "제오늘", 조서윤: "조유연",
  조아라: "조언제", 지성훈: "지벤치", 진우석: "진패스", 차나래: "차스쿼", 차승우: "차시험", 채도영: "채데드", 천유빈: "천멀리",
  최가온: "최처음", 최다은: "최플랭", 최시우: "최수료", 최준호: "최목표", 추승민: "추비밀", 탁민성: "탁고민", 편소라: "편결심",
  표하은: "표막판", 하도윤: "하기억", 하윤아: "하라인", 한다은: "한식단", 한시우: "한활기", 한예린: "한만점", 홍세린: "홍잘가",
  홍주원: "홍상쾌", 황대수: "황궁금", 황도윤: "황잠적", 황보라: "황보안녕", 황수아: "황쉼표",
};
const surnameLen = (n) => (/^(남궁|황보|선우|제갈|독고)/.test(n) && n.length >= 4 ? 2 : 1);
const given = (n) => n.slice(surnameLen(n));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SUFFIX = "(?=\\s?(?:님|씨|회원|쌤|트레이너|코치|선생님))";

// 전체 이름 바꾸기(긴 이름 먼저) — 모든 행
const fullPairs = [CENTER, TRAINER, ...Object.entries(MEMBERS)].sort((a, b) => b[0].length - a[0].length);
const fullRe = new RegExp(fullPairs.map(([o]) => esc(o)).join("|"), "g");
const fullMap = new Map(fullPairs);
// 이름만(그 회원 행 · 트레이너는 어디서나 '민재 쌤' → '오직이 쌤')
const trainerGivenRe = new RegExp(esc(given(TRAINER[0])) + SUFFIX, "g");
function rewrite(text, oldMemberName) {
  let s = text.replace(fullRe, (m) => fullMap.get(m));
  s = s.replace(trainerGivenRe, TRAINER[1]);
  if (oldMemberName && MEMBERS[oldMemberName]) {
    const g = given(oldMemberName);
    if (g.length >= 2) s = s.replace(new RegExp(esc(g) + SUFFIX, "g"), given(MEMBERS[oldMemberName]));
  }
  return s;
}
const SKIP = new Set(["id", "account_id", "user_id", "member_id", "trainer_id", "member_token", "edit_token", "path", "content_hash"]);
function patchOf(row, oldMemberName) {
  const p = {};
  for (const [k, v] of Object.entries(row)) {
    if (SKIP.has(k) || k.endsWith("_id") || v == null) continue;
    if (typeof v === "string") { const n = rewrite(v, oldMemberName); if (n !== v) p[k] = n; }
    else if (typeof v === "object") { const j = JSON.stringify(v), n = rewrite(j, oldMemberName); if (n !== j) p[k] = JSON.parse(n); }
  }
  return p;
}

async function main() {
  console.log(DRY ? "[미리보기 — DB에 쓰지 않음 · 실제로 바꾸려면 --write]" : "[실제 — DB에 씁니다]");
  const { data: members, error } = await sb.from("user_table").select("id, name").eq("account_id", ACC);
  if (error) throw new Error(error.message);
  const oldName = new Map(members.map((m) => [m.id, m.name]));
  const unknown = members.filter((m) => !MEMBERS[m.name] && !Object.values(MEMBERS).includes(m.name));
  if (unknown.length) console.log("  ⚠ 바꿀 이름표에 없는 회원:", unknown.map((m) => m.name).join(", "));
  const newNames = Object.values(MEMBERS);
  if (new Set(newNames).size !== newNames.length) throw new Error("새 이름이 겹쳐요");
  const ids = members.map((m) => m.id);

  const byAcc = ["user_table", "ot_log", "session_log", "daily_workout_log", "owner_daily_report", "owner_feedback", "trainer_todo",
    "announcement", "member_roadmap", "member_routine", "sales_case", "ot_application", "appointment", "appt_request", "member_event", "inbody_log"];
  const NO_ID = new Set(["member_roadmap", "member_routine"]);   // 회원당 한 행 · 키 = member_id
  const byUser = { schedule_check: "user_id", cardio_log: "user_id", member_routine_log: "user_id", member_routine_request: "user_id" };
  let total = 0;
  const logFix = [];   // 운동일지 — 트리거 · 해시 뒤처리
  for (const t of [...byAcc, ...Object.keys(byUser)]) {
    const res = byUser[t]
      ? await fetchByIds(sb, t, "*", byUser[t], ids)
      : NO_ID.has(t) ? await sb.from(t).select("*").eq("account_id", ACC)
      : await fetchAllRows(() => sb.from(t).select("*").eq("account_id", ACC));
    if (res.error) { console.log(`  ✖ ${t}: ${res.error.message}`); continue; }
    let n = 0;
    for (const row of res.data || []) {
      const owner = t === "user_table" ? row.id : (row.user_id || row.member_id);
      const p = patchOf(row, oldName.get(owner));
      if (!Object.keys(p).length) continue;
      n++;
      if (DRY) continue;
      const key = NO_ID.has(t) ? ["member_id", row.member_id] : row.id !== undefined ? ["id", row.id] : null;
      if (!key) { console.log(`  ⚠ ${t}: id 없음 · 건너뜀`); continue; }
      if (t === "daily_workout_log") logFix.push({ before: row, after: { ...row, ...p } });
      const { error: e } = await sb.from(t).update(p).eq(...key).select("id");
      if (e) throw new Error(`${t}: ${e.message}`);
    }
    if (n) console.log(`  ${t} ${n}행`);
    total += n;
  }

  // 운동일지: edited_at 되돌리기 + 맞던 확인 · 서명 해시 다시 계산
  if (logFix.length) {
    const lids = logFix.map((x) => x.before.id);
    const confs = await fetchByIds(sb, "workout_log_confirmation", "id, log_id, content_hash", "log_id", lids);
    const sigs = await fetchByIds(sb, "workout_log_signature", "id, log_id, content_hash", "log_id", lids);
    let h = 0;
    for (const { before, after } of logFix) {
      const { error: e } = await sb.from("daily_workout_log").update({ edited_at: before.edited_at }).eq("id", before.id).select("id");
      if (e) throw new Error(`edited_at: ${e.message}`);
      const oldH = contentHashNode(before, crypto), newH = contentHashNode(after, crypto);
      for (const [tb, rows] of [["workout_log_confirmation", confs.data || []], ["workout_log_signature", sigs.data || []]]) {
        for (const r of rows.filter((x) => x.log_id === before.id && x.content_hash === oldH)) {
          await sb.from(tb).update({ content_hash: newH }).eq("id", r.id).select("id"); h++;
        }
      }
    }
    console.log(`  운동일지 수정 시각 되돌림 ${logFix.length}건 · 해시 ${h}건 다시 계산`);
  }

  if (!DRY) {
    const a = await sb.from("account").update({ name: CENTER[1] }).eq("id", ACC).select("id");
    const t = await sb.from("trainer").update({ name: TRAINER[1] }).eq("id", creds.owner.id).select("id");
    if (a.error || t.error) throw new Error((a.error || t.error).message);
    creds.centerName = CENTER[1];
    creds.owner.name = TRAINER[1];
    fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
  }
  console.log(`✔ ${DRY ? "미리보기" : "끝"} — 글 바뀐 행 ${total} · 센터 '${CENTER[1]}' · 트레이너 '${TRAINER[1]}'`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
