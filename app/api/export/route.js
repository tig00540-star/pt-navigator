// app/api/export/route.js — 내 데이터 내려받기(2026-10-07 · 계획서 1단계)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만 · 이용 중이거나 읽기 전용 30일 안. service_role로 읽되 반드시 호출자 계정(account_id)만.
// 결과 = 엑셀에서 열리는 CSV 묶음 ZIP(+ 사진 · 서명 그림은 7일짜리 링크 목록).
// 약관 11조의 '사본 제공(지금은 수동)'을 이걸로 대신한다.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchByIds } from "@/lib/fetchByIds";
import { makeZip, toCsv } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

const LINK_TTL = 7 * 24 * 3600; // 사진 · 서명 링크 7일

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
  const [tr, mem, con, logs, ots, inb, appts, inc, exp, cons, sig] = await Promise.all([
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
  ]);
  const firstErr = [tr, mem, con, logs, ots, inb, appts, inc, exp, cons, sig].find((r) => r.error);
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
      ["ai_summary", "운동일지"], ["sets_structured", "종목 · 세트(JSON)"],
      [(r) => confByLog.get(r.id)?.result === "confirm" ? "확인" : confByLog.get(r.id)?.result === "dispute" ? "내용이 달라요" : "", "회원 확인"],
      [(r) => kst(confByLog.get(r.id)?.confirmed_at), "확인 시각"], [(r) => confByLog.get(r.id)?.method || "", "확인 방법"],
    ]) },
    { name: "OT 기록.csv", data: toCsv(ots.data || [], [
      ["id", "번호"], [M, "회원"], ["ot_round", "차수"], ["closing_result", "결과"], ["closing_reason", "이유"], ["closing_detail", "자세히"],
      ["note", "메모"], [(r) => kst(r.created_at), "기록일"], ["report", "준비 리포트 · 피드백(JSON)"],
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
    { name: "읽어 주세요.txt", data: "﻿" + [
      `${acc.brand_name || acc.name || "내 계정"} · 오직 트레이너 데이터 (${kst(new Date(now).toISOString())} 기준)`,
      "",
      "· CSV 파일은 엑셀 · 구글 시트에서 바로 열려요.",
      "· '회원 번호' · '일지 번호' · '계약 번호'로 파일끼리 이어 볼 수 있어요.",
      "· 사진 · 서명 그림 링크는 7일 동안만 열려요. 필요한 것은 그 안에 저장해 주세요.",
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
