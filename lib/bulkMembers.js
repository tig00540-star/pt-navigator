// lib/bulkMembers.js — 회원 한꺼번에 등록(2026-10-12 · docs/v2-계획-처음시작-회원일괄등록.md).
//   붙여 넣은 글 → 줄마다 회원 하나(규칙으로 나눔 · AI 안 씀) · 줄 검사 · DB 함수 bulk_add_members에 보낼 모양.
//   숫자 · 날짜 규칙은 DB 함수(docs/migrations/2026-10-12-bulk-members.sql)와 같아야 한다.

let seq = 0;
export const newRow = (patch = {}) => ({
  key: `r${Date.now().toString(36)}${(seq++).toString(36)}`,
  name: "", phone: "", kind: "pt", remaining: "", price: "", pre: "",
  thisMonth: false, tmDate: "", tmKind: "new", tmAmount: "", tmTotal: "",
  trainerId: "",
  ...patch,
});

export const digitsOf = (s) => String(s || "").replace(/[^0-9]/g, "");
// 010-1234-5678 꼴로(11자리 · 10자리) · 그 밖엔 그대로
export function formatPhone(s) {
  const d = digitsOf(s);
  if (/^01\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^01\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(s || "").trim();
}
export const phoneOk = (s) => !String(s || "").trim() || /^01\d{8,9}$/.test(digitsOf(s));

// 한국 시간 오늘 'YYYY-MM-DD' · 이번 달 1일
export function kstToday() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
export const monthStart = (ymd = kstToday()) => `${ymd.slice(0, 8)}01`;

const PHONE_RE = /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/;

// 한 줄 → 칸들. 탭(엑셀 · 구글 시트) > 쉼표로 나눈 줄(홍길동,010-…,20,50000) > 그대로.
//   쉼표가 숫자 사이에만 있으면(50,000 · 1,100,000) 천 단위라 나누지 않는다.
//   쉼표로 나눈 줄에서 '000'처럼 세 자리만 남은 칸은 앞 숫자 칸에 붙인다(20,50,000 → 20 · 50000).
//   (2026-10-12 점검: '김영희,15,60000'이 단가 1,560,000원으로 읽히던 것)
function splitFields(raw) {
  if (raw.includes("\t")) return raw.split("\t");
  if (!/[^\d\s],|,\s*[^\d\s]/.test(raw)) return [raw];
  const out = [];
  for (const f of raw.split(",")) {
    const t = f.trim();
    if (/^\d{3}$/.test(t) && out.length && /^\d+$/.test(out[out.length - 1].trim())) out[out.length - 1] = out[out.length - 1].trim() + t;
    else out.push(f);
  }
  return out;
}

/**
 * 붙여 넣은 글 → 줄마다 회원 하나. 엑셀 · 구글 시트(탭) · 쉼표 · 메모 · 카톡 목록.
 *   이름 = 첫 한글 · 영문 덩어리(2~20자) / 전화 = 010… / OT · 오티 · 체험 = OT 예정
 *   남은 수업 = '남은|잔여 N' · 'N회' · 그 밖의 작은 수(1~500) / 회당 단가 = 'N원' · 'N만' · 1,000 이상 큰 수
 */
export function parsePasted(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    let line = splitFields(raw).join(" ").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const phoneM = line.match(PHONE_RE);
    const phone = phoneM ? formatPhone(phoneM[0]) : "";
    if (phoneM) line = line.replace(phoneM[0], " ");
    const ot = /(^|\s)(ot|오티|체험)(\s|$|예정)/i.test(line) || /OT\s*예정/i.test(line);
    line = line.replace(/OT\s*예정|오티|체험/gi, " ").replace(/(^|\s)ot(?=\s|$)/gi, " ");

    let remaining = "", price = "";
    const remM = line.match(/(?:남은|잔여|남음)\s*(\d{1,3})\s*회?/) || line.match(/(\d{1,3})\s*회/);
    if (remM) { remaining = remM[1]; line = line.replace(remM[0], " "); }
    const manM = line.match(/(\d+(?:\.\d+)?)\s*만\s*원?/);
    if (manM) { price = String(Math.round(Number(manM[1]) * 10000)); line = line.replace(manM[0], " "); }
    const wonM = !price && line.match(/(\d[\d,]{2,})\s*원/);
    if (wonM) { price = digitsOf(wonM[1]); line = line.replace(wonM[0], " "); }
    // 남은 숫자들: 작은 수 → 남은 수업(없을 때), 큰 수(1,000 이상) → 단가(없을 때)
    for (const n of line.match(/\d[\d,]*/g) || []) {
      const v = Number(digitsOf(n));
      if (!remaining && v >= 1 && v <= 500) { remaining = String(v); line = line.replace(n, " "); continue; }
      if (!price && v >= 1000) { price = String(v); line = line.replace(n, " "); }
    }
    const nameM = line.match(/[가-힣A-Za-z][가-힣A-Za-z·\s]{0,19}/);
    const name = nameM ? nameM[0].trim().replace(/\s*(회원님|회원|님)$/, "").trim().slice(0, 20) : "";
    if (!name && !phone) continue;
    out.push(newRow({ name, phone, kind: ot ? "ot" : "pt", remaining: ot ? "" : remaining, price: ot ? "" : price }));
  }
  return out;
}

/**
 * 줄 검사. 반환 { errors: [문구], warns: [문구] } · errors가 있으면 그 줄은 고쳐야 등록.
 *   existingDigits: 이미 등록된 회원 번호(숫자만) Set · seen: 이 목록 안 앞줄 번호 Set(호출부가 채움)
 */
export function checkRow(r, { existingDigits = new Set(), seenDigits = new Set(), today = kstToday() } = {}) {
  const errors = [], warns = [];
  const d = digitsOf(r.phone);
  if (!String(r.name || "").trim()) errors.push("이름을 입력해 주세요");
  if (!phoneOk(r.phone)) errors.push("휴대폰 번호를 확인해 주세요");
  const skip = d && existingDigits.has(d) ? "exists" : d && seenDigits.has(d) ? "dup" : null;
  if (r.kind === "pt") {
    const rem = Number(r.remaining);
    if (!(rem >= 1 && rem <= 500)) errors.push("남은 수업을 입력해 주세요");
    if (r.thisMonth) {
      const total = Number(r.tmTotal), amt = Number(r.tmAmount);
      if (!r.tmDate || r.tmDate > today || r.tmDate < monthStart(today)) errors.push("이번 달 등록일을 골라 주세요");
      if (!(amt >= 1)) errors.push("결제 금액을 입력해 주세요");
      if (!(total >= 1)) errors.push("등록 횟수를 입력해 주세요");
      else if (rem >= 1 && total < rem) errors.push("등록 횟수가 남은 수업보다 적어요");
    } else if (!(Number(r.price) > 0)) {
      warns.push("회당 단가 빈칸 · 나중에 넣어도 돼요(그때까지 급여 0원)");
    } else if (Number(r.price) > 1000000) {
      warns.push("회당 단가가 100만 원이 넘어요. 맞는지 확인해 주세요");
    }
  }
  if (!d) warns.push("휴대폰 빈칸 · 회원 전용 페이지 로그인에 필요해요");
  return { errors, warns, skip };
}

// DB 함수에 보낼 한 줄
export function toPayload(r, { isOwner = false } = {}) {
  const base = { name: String(r.name).trim(), phone: formatPhone(r.phone) || null, kind: r.kind };
  if (isOwner && r.trainerId) base.trainer_id = r.trainerId;
  if (r.kind !== "pt") return base;
  base.remaining = Number(r.remaining);
  if (r.thisMonth) {
    base.this_month = { date: r.tmDate, kind: r.tmKind === "reregister" ? "reregister" : "new", amount: Number(r.tmAmount), total: Number(r.tmTotal) };
  } else {
    base.price = Number(r.price) > 0 ? Number(r.price) : null;
    base.pre_this_month = Number(r.pre) > 0 ? Number(r.pre) : 0;
  }
  return base;
}

// DB 함수 오류 → 화면 문구
export function bulkErrorText(err) {
  const m = String(err?.message || "");
  if (/not_allowed|row-level security|permission/i.test(m)) return "등록하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.";
  if (/too_many/.test(m)) return "한 번에 200명까지 등록할 수 있어요. 나눠서 등록해 주세요.";
  if (/function .*does not exist|Could not find the function/i.test(m)) return "아직 준비 중이에요. 잠시 후 다시 시도해 주세요.";
  if (/bad_|empty/.test(m)) return "입력을 다시 확인해 주세요. 빈칸이나 숫자가 맞지 않는 줄이 있어요.";
  return "등록하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
}

// 되돌리기(10분) — 이 기기에만 · 방금 만든 회원 id
export const UNDO_KEY = "ot.bulkUndo.v1";
export const UNDO_MIN = 10;
export function readUndo() {
  try {
    const v = JSON.parse(localStorage.getItem(UNDO_KEY) || "null");
    if (!v || !Array.isArray(v.added) || Date.now() - v.at > UNDO_MIN * 60000) return null;
    return v;
  } catch { return null; }
}
export function writeUndo(v) { try { v ? localStorage.setItem(UNDO_KEY, JSON.stringify(v)) : localStorage.removeItem(UNDO_KEY); } catch { /* 저장 안 돼도 이번 화면에선 동작 */ } }

// 앱 쓰기 전 그달 수업 수(첫 달 급여 안내 · 2026-10-12) — 회원 한꺼번에 등록 때 적은 계약 메모(report.imported)에서.
//   그 계약을 넣은 달(한국 시간)에만 센다. 급여 계산에는 더하지 않는다(보여 주기만 · 대표 결정).
export function preAppSessions(contracts, trainerId, ym) {
  let n = 0;
  for (const c of Array.isArray(contracts) ? contracts : []) {
    const imp = c?.report?.imported;
    if (!imp || (trainerId && c.trainer_id !== trainerId)) continue;
    const at = Date.parse(imp.at);
    if (Number.isNaN(at) || new Date(at + 9 * 3600000).toISOString().slice(0, 7) !== ym) continue;
    n += Math.max(0, Number(imp.pre_this_month) || 0);
  }
  return n;
}
