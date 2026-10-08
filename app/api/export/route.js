// app/api/export/route.js — 내 데이터 내려받기(2026-10-07 · 계획서 1단계)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만 · 이용 중이거나 읽기 전용 30일 안. service_role로 읽되 반드시 호출자 계정(account_id)만.
// 결과 = 엑셀에서 열리는 CSV 묶음 ZIP(+ 사진 · 서명 그림은 7일짜리 링크 목록).
// 약관 11조의 '사본 제공(지금은 수동)'을 이걸로 대신한다.
// 2026-10-08: 사례 보관함 · 회원별 변화 요약 · 세트를 읽는 글로 추가.
//   POST ?images=1 → 사진 파일 목록(JSON · 1시간 링크) — 브라우저가 받아 같은 ZIP의 '사진' · '사례' 폴더에 넣는다(lib/exportDownload).
//   (서버 응답 크기 제한 때문에 사진은 서버에서 묶지 않는다)
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchByIds } from "@/lib/fetchByIds";
import { makeZip, toCsv } from "@/lib/zip";
import { buildExerciseSeries } from "@/lib/workout";

export const runtime = "nodejs";
export const maxDuration = 60;

const LINK_TTL = 7 * 24 * 3600; // 사진 · 서명 링크 7일

const IMG_TTL = 3600;             // 사진 파일 받기용 링크 1시간
const safe = (v) => String(v || "").replace(/[\\/:*?"<>|\r\n\t]/g, " ").trim().slice(0, 40) || "이름없음";
const day = (v) => (v ? String(v).slice(0, 10) : "");
// 종목 · 세트(JSON) → "스쿼트 60kg×10, 70kg×8 / 레그프레스 …"
const setsText = (list) => (Array.isArray(list) ? list : []).map((ex) => {
  const sets = (Array.isArray(ex?.sets) ? ex.sets : []).map((s) => `${s?.weight ?? 0}kg×${s?.reps ?? "-"}`).join(", ");
  return `${ex?.exercise || "종목"} ${sets}`.trim();
}).join(" / ");

const kst = (iso) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 9 * 3600000);
  return isNaN(d) ? "" : d.toISOString().slice(0, 16).replace("T", " ");
};

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  if (me.role !== "owner") return Response.json({ error: "대표만 내려받을 수 있어요." }, { status: 403 });
  const aid = me.account_id;

  const { data: acc } = await sb.from("account").select("name, brand_name, subscription_status, current_period_end").eq("id", aid).maybeSingle();
  if (!acc) return Response.json({ error: "계정을 찾지 못했어요." }, { status: 404 });
  const now = Date.now(), end = acc.current_period_end ? Date.parse(acc.current_period_end) : null;
  const full = acc.subscription_status === "active" && (end == null || end > now);
  const readOnly = end != null && end <= now && end > now - 30 * 86400000;
  if (!full && !readOnly) return Response.json({ error: "보관 기간이 지나 내려받을 수 없어요." }, { status: 410 });

  const all = (table, cols = "*") => fetchAllRows(() => sb.from(table).select(cols).eq("account_id", aid));
  const images = new URL(req.url).searchParams.get("images") === "1";
  const [tr, mem, con, logs, ots, inb, appts, inc, exp, cons, sig, cases] = await Promise.all([
    all("trainer", "id, name, role, active, created_at"),
    all("user_table"),
    all("session_log"),
    all("daily_workout_log"),
    all("ot_log"),
    all("inbody_log"),
    all("appointment"),
    all("income"),
    all("expense"),
    all("member_consent"),
    all("workout_log_signature"),
    all("sales_case"),
  ]);
  const firstErr = [tr, mem, con, logs, ots, inb, appts, inc, exp, cons, sig, cases].find((r) => r.error);
  if (firstErr) { console.error("[export] 읽기 실패", firstErr.error?.message); return Response.json({ error: "데이터를 읽지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }

  const members = mem.data || [];
  const ids = members.map((m) => m.id);
  // account_id가 없는 표는 회원 id로
  const [photos, cardio, checks, confs] = await Promise.all([
    fetchByIds(sb, "member_photo", "*", "user_id", ids),
    fetchByIds(sb, "cardio_log", "*", "user_id", ids),
    fetchByIds(sb, "schedule_check", "*", "user_id", ids),
    fetchByIds(sb, "workout_log_confirmation", "log_id, result, method, confirmed_at, dispute_note", "member_id", ids),
  ]);

  const tName = new Map((tr.data || []).map((t) => [t.id, t.name]));
  const mName = new Map(members.map((m) => [m.id, m.name]));
  const T = (r) => tName.get(r.trainer_id) || "";
  const M = (r) => mName.get(r.user_id ?? r.member_id) || "";
  const confByLog = new Map();
  for (const c of confs.data || []) {
    const prev = confByLog.get(c.log_id);
    if (!prev || (c.result === "confirm" && prev.result !== "confirm")) confByLog.set(c.log_id, c);
  }

  // 사진 파일 목록(브라우저가 받아 ZIP에 넣는다)
  if (images) {
    const sign = async (bucket, items) => {
      const out = [];
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100);
        const { data } = await sb.storage.from(bucket).createSignedUrls(chunk.map((x) => x.path), IMG_TTL);
        (data || []).forEach((d, j) => { if (d?.signedUrl) out.push({ name: chunk[j].name, url: d.signedUrl }); });
      }
      return out;
    };
    const seen = new Map();
    const uniq = (name) => { const n = (seen.get(name) || 0) + 1; seen.set(name, n); return n > 1 ? name.replace(/\.jpg$/, `_${n}.jpg`) : name; };
    const LBL = { before: "비포", progress: "진행", after: "애프터" };
    const mp = (photos.data || []).filter((p) => p.storage_path)
      .map((p) => ({ path: p.storage_path, name: uniq(`사진/${safe(mName.get(p.user_id))}/${day(p.taken_on) || "날짜없음"}_${LBL[p.label] || "사진"}.jpg`) }));
    const fromMember = [], fromCases = [];
    (cases.data || []).forEach((c, i) => {
      const base = `사례/${String(i + 1).padStart(3, "0")}_${safe(c.label)}`;
      const d = c.data || {};
      if (c.kind === "photo") for (const [k, l] of [["before", "처음"], ["after", "지금"]]) {
        if (!d[k]?.path) continue;
        (d[k].bucket === "sales-cases" ? fromCases : fromMember).push({ path: d[k].path, name: uniq(`${base}_${l}.jpg`) });
      }
      if (c.kind === "review" && d.path) fromCases.push({ path: d.path, name: uniq(`${base}_후기.jpg`) });
    });
    const list = [...(await sign("member-photos", [...mp, ...fromMember])), ...(await sign("sales-cases", fromCases))];
    return Response.json({ images: list });
  }

  // 회원별 변화 요약 — 인바디 처음 · 마지막 + 종목별 처음 무게 → 최고 무게
  const KIND = { photo: "비포 · 애프터", inbody: "인바디 변화", lift: "운동 변화", review: "회원 후기" };
  const change = [];
  const inbBy = new Map();
  for (const r of inb.data || []) { if (!inbBy.has(r.user_id)) inbBy.set(r.user_id, []); inbBy.get(r.user_id).push(r); }
  const logBy = new Map();
  for (const l of logs.data || []) { if (l.voided || l.source === "noshow") continue; if (!logBy.has(l.user_id)) logBy.set(l.user_id, []); logBy.get(l.user_id).push(l); }
  const r1 = (n) => Math.round(n * 10) / 10;
  // '+' · '-'로 시작하면 엑셀이 수식으로 읽어서(앞에 ' 이 붙음) 화살표로 쓴다
  const arrow = (d, u) => (r1(d) === 0 ? `0${u}` : `${d > 0 ? "▲" : "▼"} ${Math.abs(r1(d))}${u}`);
  for (const m of members) {
    const list = (inbBy.get(m.id) || []).slice().sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));
    if (list.length >= 2) {
      const a = list[0], b = list[list.length - 1];
      for (const [k, l, u] of [["weight", "체중", "kg"], ["skeletal_muscle", "골격근량", "kg"], ["body_fat_pct", "체지방률", "%"], ["body_fat_mass", "체지방량", "kg"]]) {
        if (a[k] == null || b[k] == null) continue;
        change.push({ m: m.name, item: `인바디 · ${l}`, d1: day(a.measured_at), v1: `${a[k]}${u}`, d2: day(b.measured_at), v2: `${b[k]}${u}`, diff: arrow(b[k] - a[k], u), n: list.length });
      }
    }
    for (const s of buildExerciseSeries(logBy.get(m.id) || [])) {
      const pts = s.points.filter((p) => p.topWeight != null);
      if (pts.length < 2) continue;
      const best = pts.reduce((x, y) => (y.topWeight > x.topWeight ? y : x), pts[0]);
      if (!(best.topWeight > pts[0].topWeight)) continue;
      change.push({ m: m.name, item: `운동 · ${s.exercise}`, d1: day(pts[0].date), v1: `${pts[0].topWeight}kg`, d2: day(best.date), v2: `${best.topWeight}kg(최고)`, diff: arrow(best.topWeight - pts[0].topWeight, "kg"), n: pts.length });
    }
  }
  const caseSummary = (c) => {
    const d = c.data || {};
    if (c.kind === "inbody") return (d.metrics || []).map((x) => `${x.label} ${x.first}${x.unit}→${x.latest}${x.unit}`).join(", ");
    if (c.kind === "lift") return `${d.exercise || ""} ${d.first}kg→${d.latest}kg`;
    if (c.kind === "photo") return `${day(d.before?.taken_on)} → ${day(d.after?.taken_on)}`;
    return "";
  };

  // 사진 · 서명 그림 — 7일 링크
  const signed = async (bucket, paths) => {
    const out = new Map();
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { data } = await sb.storage.from(bucket).createSignedUrls(chunk, LINK_TTL);
      for (const d of data || []) if (d?.path && d.signedUrl) out.set(d.path, d.signedUrl);
    }
    return out;
  };
  const photoRows = photos.data || [], sigRows = sig.data || [];
  const [photoUrl, sigUrl] = await Promise.all([
    signed("member-photos", photoRows.map((p) => p.storage_path).filter(Boolean)),
    signed("log-signatures", sigRows.map((s) => s.path).filter(Boolean)),
  ]);

  const files = [
    { name: "트레이너.csv", data: toCsv(tr.data || [], [["name", "이름"], ["role", "역할(owner=대표)"], ["active", "활성"], [(r) => kst(r.created_at), "등록일"]]) },
    { name: "회원.csv", data: toCsv(members, [
      ["id", "회원 번호"], ["name", "이름"], ["phone_number", "전화번호"], ["gender", "성별"], ["age", "나이"], ["job", "직업"],
      [T, "담당 트레이너"], ["status", "상태"], ["goal", "목표"], ["goal_deadline", "목표 기한"], ["exercise_level", "운동 경험"],
      ["weekly_freq", "주 몇 번"], ["availability", "가능한 시간"], ["pain", "불편 부위"], ["injury_history", "부상 이력"],
      ["member_note", "메모"], ["lead_source", "알게 된 경로"], ["origin", "들어온 경로"], ["hidden", "숨김(환불 등)"],
      [(r) => kst(r.created_at), "등록일"], [(r) => kst(r.status_changed_at), "상태 바뀐 날"],
    ]) },
    { name: "계약.csv", data: toCsv(con.data || [], [
      ["id", "계약 번호"], [M, "회원"], [T, "트레이너"], ["kind", "종류(new · reregister)"], [(r) => kst(r.started_at), "시작"],
      ["sessions_total", "유료 회수"], ["service_sessions", "서비스 회수"], ["price_per_session", "회당"], ["amount_total", "금액"],
      ["counts_as_revenue", "매출 반영"], ["reg_result", "재등록 결과"], ["reg_reason", "재등록 이유"],
      ["refund_amount", "환불 금액"], [(r) => kst(r.refunded_at), "환불일"], ["handed_over", "인계됨"], [(r) => kst(r.created_at), "기록일"],
    ]) },
    { name: "운동일지.csv", data: toCsv(logs.data || [], [
      ["id", "일지 번호"], [M, "회원"], [(r) => kst(r.session_at || r.created_at), "수업 시각"], ["source", "작성 방식"], ["voided", "삭제됨"],
      ["ai_summary", "운동일지"], [(r) => setsText(r.sets_structured), "종목 · 세트"],
      [(r) => confByLog.get(r.id)?.result === "confirm" ? "확인" : confByLog.get(r.id)?.result === "dispute" ? "내용이 달라요" : "", "회원 확인"],
      [(r) => kst(confByLog.get(r.id)?.confirmed_at), "확인 시각"], [(r) => confByLog.get(r.id)?.method || "", "확인 방법"],
    ]) },
    { name: "OT 기록.csv", data: toCsv(ots.data || [], [
      ["id", "번호"], [M, "회원"], ["ot_round", "차수"], ["closing_result", "결과"], ["closing_reason", "이유"], ["closing_detail", "자세히"],
      ["note", "메모"], [(r) => kst(r.created_at), "기록일"], ["report", "대본 · 피드백(JSON)"],
    ]) },
    { name: "인바디.csv", data: toCsv(inb.data || [], [
      [M, "회원"], [(r) => kst(r.measured_at), "측정일"], ["weight", "체중"], ["skeletal_muscle", "골격근량"], ["body_fat_mass", "체지방량"],
      ["body_fat_pct", "체지방률"], ["bmr", "기초대사량"], ["visceral_fat_level", "내장지방"], ["note", "메모"],
    ]) },
    { name: "예약.csv", data: toCsv(appts.data || [], [[M, "회원"], [T, "트레이너"], [(r) => kst(r.start_at), "시각"], ["status", "상태"]]) },
    { name: "장부_매출.csv", data: toCsv(inc.data || [], [["earned_on", "날짜"], ["kind", "종류"], ["amount", "금액"], ["memo", "메모"]]) },
    { name: "장부_지출.csv", data: toCsv(exp.data || [], [["spent_on", "날짜"], ["category", "분류"], ["amount", "금액"], ["memo", "메모"]]) },
    { name: "유산소.csv", data: toCsv(cardio.data || [], [[M, "회원"], ["performed_on", "날짜"], ["kind", "종류"], ["minutes", "분"], ["note", "메모"]]) },
    { name: "개인운동 · 오운완.csv", data: toCsv(checks.data || [], [[M, "회원"], ["on_date", "날짜"], ["kind", "종류"], ["note", "내용"]]) },
    { name: "동의.csv", data: toCsv(cons.data || [], [[M, "회원"], ["kind", "종류(general · health)"], ["agreed", "동의"], ["method", "방법"], ["version", "문구 버전"], [(r) => kst(r.created_at), "시각"]]) },
    { name: "회원 사진(7일 링크).csv", data: toCsv(photoRows, [[M, "회원"], ["label", "분류"], ["taken_on", "찍은 날"], ["note", "메모"], [(r) => photoUrl.get(r.storage_path) || "", "링크(7일)"]]) },
    { name: "회원 서명(7일 링크).csv", data: toCsv(sigRows, [["log_id", "일지 번호"], [M, "회원"], [(r) => kst(r.signed_at), "서명 시각"], ["after_auto", "자동 확인 뒤"], [(r) => sigUrl.get(r.path) || "", "링크(7일)"]]) },
    { name: "회원별 변화 요약.csv", data: toCsv(change, [["m", "회원"], ["item", "항목"], ["d1", "처음 날짜"], ["v1", "처음"], ["d2", "마지막 · 최고 날짜"], ["v2", "마지막 · 최고"], ["diff", "변화"], ["n", "기록 수"]]) },
    { name: "사례 보관함.csv", data: toCsv(cases.data || [], [
      [(r) => KIND[r.kind] || r.kind, "종류"], ["label", "라벨"], [(r) => r.data?.category || "", "목적"], [caseSummary, "내용"], ["note", "메모"],
      [(r) => (r.data?.portfolio ? "다른 아이디에서 가져옴" : ""), "출처"], [(r) => kst(r.created_at), "담은 날"],
    ]) },
    { name: "읽어 주세요.txt", data: "﻿" + [
      `${acc.brand_name || acc.name || "내 계정"} · 오직 트레이너 데이터 (${kst(new Date(now).toISOString())} 기준)`,
      "",
      "· CSV 파일은 엑셀 · 구글 시트에서 바로 열려요.",
      "· '회원 번호' · '일지 번호' · '계약 번호'로 파일끼리 이어 볼 수 있어요.",
      "· '사진' 폴더에 회원별 비포 · 애프터 사진이, '사례' 폴더에 사례 보관함 사진이 파일로 들어 있어요.",
      "· '회원별 변화 요약'에 인바디 처음 → 마지막, 종목별 처음 무게 → 최고 무게가 있어요.",
      "· 서명 그림 링크는 7일 동안만 열려요. 필요한 것은 그 안에 저장해 주세요.",
      "· 회원의 개인정보 · 건강정보가 들어 있어요. 안전한 곳에 보관하고, 필요 없으면 지워 주세요.",
    ].join("\r\n") },
  ];

  const zip = makeZip(files, new Date(now + 9 * 3600000));
  const ymd = new Date(now + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, "");
  const fname = `오직트레이너_데이터_${ymd}.zip`;
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ojik-data-${ymd}.zip"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Cache-Control": "no-store",
    },
  });
}
