// app/api/member-confirm/route.js — 회원이 자기 운동일지(daily_workout_log)를 '확인' 또는 '내용이 달라요'. 서버전용.
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
  const logId = String(body.log_id || "").trim();
  const result = String(body.result || "").trim();
  if (!UUID_RE.test(logId)) return Response.json({ error: "잘못된 요청" }, { status: 400 });
  if (result !== "confirm" && result !== "dispute") return Response.json({ error: "잘못된 요청" }, { status: 400 });
  const note = result === "dispute" ? String(body.note || "").trim().slice(0, 200) || null : null;

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // ① 회원 JWT 검증 → auth uid → member_id(user_table.id). getUser는 auth.users.id를 주므로
  //    회원 스코프 매핑(member_auth_id)으로 한 번 변환한다(auth_member_id() 헬퍼가 SQL에서 하는 그 일).
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) {
    console.warn("[member-confirm] 401 세션무효:", ue?.message || "no uid");
    return Response.json({ error: "세션 무효" }, { status: 401 });
  }
  const { data: me } = await sb.from("user_table").select("id, status").eq("member_auth_id", u.user.id).maybeSingle();
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
  const { data: log } = await sb
    .from("daily_workout_log")
    .select("*")   // edited_at(2026-10-06 SQL)이 아직 없어도 깨지지 않게
    .eq("id", logId)
    .eq("user_id", memberId)
    .maybeSingle();
  if (!log) {
    console.warn(`[member-confirm] 403 대상없음/타회원 member_id=${memberId} log=${logId}`);
    return Response.json({ error: "대상 일지를 찾을 수 없습니다." }, { status: 403 });
  }
  if (log.voided === true || log.source === "noshow") {
    return Response.json({ error: "확인 대상이 아닌 일지입니다." }, { status: 400 });
  }

  // ③ content_hash = 확인 시점 일지 내용 동결(서버 계산). 나중에 트레이너가 내용을 고치면
  //    저장된 해시와 어긋나 "확인 후 변경됨"을 감지한다(§5 대조 뱃지).
  //    ★lib/workoutHash 공용 — 트레이너 뱃지(contentHashBrowser)와 반드시 같은 입력을 써야 오탐이 안 난다.
  const contentHash = contentHashNode(log, crypto);

  // '내용이 달라요' — 이미 확인된 일지엔 못 함 · 트레이너가 안 고친 채 열린 이의가 있으면 또 안 받음.
  if (result === "dispute") {
    const { data: prev } = await sb.from("workout_log_confirmation").select("result, confirmed_at").eq("log_id", logId);
    if ((prev || []).some((c) => c.result === "confirm")) return Response.json({ error: "이미 확인한 일지예요." }, { status: 409 });
    const base = Date.parse(log.edited_at ?? log.created_at ?? "") || 0;
    if ((prev || []).some((c) => c.result === "dispute" && Date.parse(c.confirmed_at) > base)) {
      return Response.json({ ok: true, already: true });
    }
  }

  // ④ insert(교훈1: .select() 후 0행이면 실패). confirm 중복은 unique 위반 → 409.
  const { data, error } = await sb
    .from("workout_log_confirmation")
    .insert({
      log_id: logId,
      member_id: memberId,
      result,
      method: "tap",                 // 손서명(drawn)은 후속 — 서버가 tap 고정 · 자동 확인(auto)은 DB cron만
      content_hash: contentHash,
      dispute_note: note,
    })
    .select("confirmed_at")
    .maybeSingle();

  if (error) {
    // 확인 1건/일지(unique 부분 인덱스) 위반 = 이미 확인함 → 409(재확인 방지).
    if (error.code === "23505") {
      return Response.json({ error: "이미 확인한 일지입니다." }, { status: 409 });
    }
    console.error(`[member-confirm] insert 실패 member_id=${memberId} log=${logId}:`, error.message);
    return Response.json({ error: "저장 실패" }, { status: 500 });
  }
  if (!data?.confirmed_at) {
    console.error(`[member-confirm] insert 0행 member_id=${memberId} log=${logId}`);
    return Response.json({ error: "저장 실패" }, { status: 500 });
  }

  // '내용이 달라요' → 담당 트레이너 폰으로(응답 뒤 · 꺼 두면 안 감)
  if (result === "dispute") after(async () => {
    try {
      const { data: m } = await sb.from("user_table").select("name, trainer_id").eq("id", memberId).maybeSingle();
      if (m?.trainer_id) await sendPush(sb, { trainerIds: [m.trainer_id], type: "dispute", title: "회원이 '내용이 달라요'라고 했어요",
        body: `${m.name || "회원"} · ${note ? `"${note.slice(0, 60)}"` : "운동일지를 확인해 주세요"}`, url: `/pt/${memberId}/logs` });
    } catch (e) { console.error("[member-confirm] 알림 실패", e?.message || e); }
  });
  return Response.json({ ok: true, confirmed_at: data.confirmed_at });
}
