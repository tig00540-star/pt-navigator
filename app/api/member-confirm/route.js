// app/api/member-confirm/route.js — 회원이 자기 운동일지(daily_workout_log)를 '확인'(+ 손서명) · '내용이 달라요' · 자동 확인 뒤 '서명'. 서버전용.
//   2026-10-06: 48시간 자동 확인을 넣으며 '내용이 달라요'(dispute + 메모)를 되살렸다 — 가만히 있으면 확인으로 보려면
//   아니라고 말할 길이 있어야 한다. 열린 이의가 있으면 자동 확인이 멈추고, 트레이너가 고치면 닫힌다.
//   증거력의 무결성·본인확인을 클라에 안 맡긴다:
//   ① 회원 JWT 검증 → auth uid → member_auth_id로 user_table.id(member_id) 매핑
//   ② service_role로 일지를 다시 읽어 소유·상태 검증(남의 일지·voided·noshow 차단)
//   ③ content_hash를 서버가 DB 내용으로 계산(클라 위조 불가)
//   ④ service_role로 insert(교훈1: .select() 0행이면 실패)
//   ★IP·User-Agent 등은 수집하지 않음(테이블에 컬럼 없음 · 개인정보/저조 증거가치 회피).
//   member-auth/member-revoke의 JWT 검증 패턴 재사용.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { contentHashNode } from "@/lib/workoutHash";
import { after } from "next/server";
import { sendPush } from "@/lib/pushServer";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 키 부재(DEMO) → 503 fail-closed. 클라는 이 응답을 받으면 게이트를 끈다(회원 락아웃 금지).
  if (!url || !key) {
    console.error("[member-confirm] 503 서버키 미설정");
    return Response.json({ error: "서버 키 미설정" }, { status: 503 });
  }

  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) {
    console.warn("[member-confirm] 401 인증필요 — 토큰 없음");
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // 2026-10-06 서명: result = confirm(확인 · 서명 있으면 method drawn) | dispute(내용이 달라요 · 한 건) | sign(이미 확인된(자동 포함) 일지에 서명만)
  //   log_ids(밀린 여러 건 · 서명 한 번 · 최대 10) 또는 log_id. signature = PNG data URL(손가락 서명 · 서버가 저장소에 올림).
  const result = String(body.result || "").trim();
  const ids = [...new Set((Array.isArray(body.log_ids) ? body.log_ids : [body.log_id]).map((x) => String(x || "").trim()))].filter((x) => UUID_RE.test(x));
  if (!ids.length || ids.length > 10) return Response.json({ error: "잘못된 요청" }, { status: 400 });
  if (!["confirm", "dispute", "sign"].includes(result)) return Response.json({ error: "잘못된 요청" }, { status: 400 });
  if (result === "dispute" && ids.length !== 1) return Response.json({ error: "잘못된 요청" }, { status: 400 });
  const note = result === "dispute" ? String(body.note || "").trim().slice(0, 200) || null : null;
  const sigRaw = typeof body.signature === "string" ? body.signature : "";
  const sigB64 = sigRaw.startsWith("data:image/png;base64,") ? sigRaw.slice(22) : "";
  if (sigRaw && (!sigB64 || sigB64.length > 400000)) return Response.json({ error: "서명이 올바르지 않아요" }, { status: 400 });
  if (result === "sign" && !sigB64) return Response.json({ error: "서명이 필요해요" }, { status: 400 });

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // ① 회원 JWT 검증 → auth uid → member_id(user_table.id). getUser는 auth.users.id를 주므로
  //    회원 스코프 매핑(member_auth_id)으로 한 번 변환한다(auth_member_id() 헬퍼가 SQL에서 하는 그 일).
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) {
    console.warn("[member-confirm] 401 세션무효:", ue?.message || "no uid");
    return Response.json({ error: "세션 무효" }, { status: 401 });
  }
  const { data: me } = await sb.from("user_table").select("id, status, account_id").eq("member_auth_id", u.user.id).maybeSingle();
  if (!me?.id) {
    console.warn(`[member-confirm] 403 회원 미매핑 uid=${u.user.id}`);
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }
  // 지난 회원(PT 종료) = 회원 페이지 읽기 전용(2026-10-05) — 확인도 새로 쓰는 것이라 막는다.
  if (me.status === "inactive") {
    console.warn(`[member-confirm] 403 지난 회원 member_id=${me.id}`);
    return Response.json({ error: "PT가 끝나서 기록을 볼 수만 있어요." }, { status: 403 });
  }
  const memberId = me.id;

  // ② 대상 일지 재조회(RLS 우회 · 소유·상태 검증). 남의 일지/존재X → 403, voided/noshow → 400.
  const { data: logs } = await sb.from("daily_workout_log").select("*").in("id", ids).eq("user_id", memberId);
  if (!logs || logs.length !== ids.length) {
    console.warn(`[member-confirm] 403 대상없음/타회원 member_id=${memberId}`);
    return Response.json({ error: "대상 일지를 찾을 수 없습니다." }, { status: 403 });
  }
  if (logs.some((l) => l.voided === true || l.source === "noshow")) {
    return Response.json({ error: "확인 대상이 아닌 일지입니다." }, { status: 400 });
  }
  const { data: prevAll } = await sb.from("workout_log_confirmation").select("log_id, result, method, confirmed_at").in("log_id", ids);
  const prevOf = (id) => (prevAll || []).filter((c) => c.log_id === id);

  // '내용이 달라요' — 이미 확인된 일지엔 못 함 · 트레이너가 안 고친 채 열린 이의가 있으면 또 안 받음.
  if (result === "dispute") {
    const log = logs[0], prev = prevOf(log.id);
    if (prev.some((c) => c.result === "confirm")) return Response.json({ error: "이미 확인한 일지예요." }, { status: 409 });
    const base = Date.parse(log.edited_at ?? log.created_at ?? "") || 0;
    if (prev.some((c) => c.result === "dispute" && Date.parse(c.confirmed_at) > base)) return Response.json({ ok: true, already: true });
    const { data, error } = await sb.from("workout_log_confirmation")
      .insert({ log_id: log.id, member_id: memberId, result: "dispute", method: "tap", content_hash: contentHashNode(log, crypto), dispute_note: note })
      .select("confirmed_at").maybeSingle();
    if (error || !data?.confirmed_at) { console.error("[member-confirm] dispute 실패", error?.message || "0행"); return Response.json({ error: "저장 실패" }, { status: 500 }); }
    after(async () => {
      try {
        const { data: m } = await sb.from("user_table").select("name, trainer_id").eq("id", memberId).maybeSingle();
        if (m?.trainer_id) await sendPush(sb, { trainerIds: [m.trainer_id], type: "dispute", title: "회원이 '내용이 달라요'라고 했어요",
          body: `${m.name || "회원"} · ${note ? `"${note.slice(0, 60)}"` : "운동일지를 확인해 주세요"}`, url: `/pt/${memberId}/logs` });
      } catch (e) { console.error("[member-confirm] 알림 실패", e?.message || e); }
    });
    return Response.json({ ok: true, confirmed_at: data.confirmed_at });
  }

  // ③ 서명 그림 저장(한 번 올려 여러 일지가 같이 가리킴) — 비공개 버킷 · {센터}/{회원}/{시각}-{난수}.png
  let sigPath = null;
  if (sigB64) {
    const buf = Buffer.from(sigB64, "base64");
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isPng || buf.length > 300000) return Response.json({ error: "서명이 올바르지 않아요" }, { status: 400 });
    sigPath = `${me.account_id}/${memberId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const { error: upErr } = await sb.storage.from("log-signatures").upload(sigPath, buf, { contentType: "image/png", upsert: false });
    if (upErr) { console.error("[member-confirm] 서명 저장 실패", upErr.message); return Response.json({ error: "서명을 저장하지 못했어요" }, { status: 500 }); }
  }

  // ④ 일지마다: 확인(없으면) + 서명 기록. content_hash = 그 순간 내용(서버 계산 · 클라 위조 불가).
  const out = [];
  for (const log of logs) {
    const hash = contentHashNode(log, crypto);
    const prevConfirm = prevOf(log.id).find((c) => c.result === "confirm");
    let confirmedAt = prevConfirm?.confirmed_at || null;
    if (!prevConfirm) {
      if (result === "sign") { out.push({ id: log.id, error: "not_confirmed" }); continue; }
      const { data, error } = await sb.from("workout_log_confirmation")
        .insert({ log_id: log.id, member_id: memberId, result: "confirm", method: sigPath ? "drawn" : "tap", content_hash: hash })
        .select("confirmed_at").maybeSingle();
      if (error && error.code !== "23505") { console.error(`[member-confirm] 확인 실패 log=${log.id}`, error.message); out.push({ id: log.id, error: "save" }); continue; }
      confirmedAt = data?.confirmed_at || confirmedAt;
    }
    let signed = false;
    if (sigPath) {
      const { data: s1, error: se } = await sb.from("workout_log_signature")
        .insert({ log_id: log.id, member_id: memberId, account_id: me.account_id, path: sigPath, content_hash: hash, after_auto: prevConfirm?.method === "auto" })
        .select("signed_at").maybeSingle();
      if (se || !s1) console.error(`[member-confirm] 서명 기록 실패 log=${log.id}`, se?.message || "0행");
      else signed = true;
    }
    out.push({ id: log.id, confirmed_at: confirmedAt, signed });
  }
  if (out.every((o) => o.error)) return Response.json({ error: "저장 실패", results: out }, { status: 500 });
  return Response.json({ ok: true, results: out });
}
