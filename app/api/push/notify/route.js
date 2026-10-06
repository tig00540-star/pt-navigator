// app/api/push/notify — 화면이 무언가를 저장한 '직후' 알림을 보내 달라고 부른다(2026-10-06).
//   보낼 내용 · 받는 사람은 클라를 믿지 않고 서버가 DB에서 다시 읽어 정한다({type, id}만 받음).
//   같은 센터 · 맞는 역할(대표 / 담당 트레이너 / 본인 회원)일 때만. 받는 트레이너가 그 종류를 꺼 두면 안 감.
//   ot_assigned(대표 → 트레이너) · owner_feedback(대표 → 트레이너) · payroll(대표 → 트레이너)
//   routine_request(회원 → 담당 트레이너) · log_written(트레이너 → 회원) · test(내 기기)
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { sendPush } from "@/lib/pushServer";
import { personName } from "@/lib/format";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const md = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ ok: false }, { status: 503 });
  const who = await callerOf(sb, req);
  if (!who) return Response.json({ error: "auth" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const type = String(b.type || ""), id = String(b.id || "");
  // 시험 알림 — 내 기기에만(설정 · 회원 페이지의 '시험 알림 보내기').
  if (type === "test") {
    let url = "/settings/notify";
    if (who.kind === "member") { const { data: m } = await sb.from("user_table").select("member_token").eq("id", who.id).maybeSingle(); url = m?.member_token ? `/m/${m.member_token}` : "/"; }
    const r = await sendPush(sb, { ...(who.kind === "trainer" ? { trainerIds: [who.id] } : { memberIds: [who.id] }),
      title: "오직 트레이너 알림이 켜졌어요", body: "앞으로 오직 트레이너 알림을 받아요.", url, tag: "test" });
    return Response.json({ ok: true, ...r });
  }
  if (!UUID_RE.test(id)) return Response.json({ error: "bad" }, { status: 400 });
  const isOwner = who.kind === "trainer" && who.role === "owner";
  const memberName = async (mid) => {
    const { data } = await sb.from("user_table").select("name").eq("id", mid).maybeSingle();
    return personName(data?.name) || "회원";
  };

  let r = { sent: 0 };
  if (type === "ot_assigned" && isOwner) {
    const { data: a } = await sb.from("ot_application").select("account_id, trainer_id, member_id, name, status, slots").eq("id", id).maybeSingle();
    if (a?.account_id === who.account_id && a.status === "assigned" && a.trainer_id) {
      r = await sendPush(sb, { trainerIds: [a.trainer_id], type: "ot_new", title: "새 OT 회원이 배정됐어요",
        body: `${a.name} 님${a.slots?.text ? ` · 원하는 시간 ${a.slots.text}` : ""}`, url: a.member_id ? `/ot/${a.member_id}` : "/today" });
    }
  } else if (type === "owner_feedback" && isOwner) {
    const { data: f } = await sb.from("owner_feedback").select("account_id, trainer_id, member_id").eq("id", id).maybeSingle();
    if (f?.account_id === who.account_id && f.trainer_id && f.trainer_id !== who.id) {
      r = await sendPush(sb, { trainerIds: [f.trainer_id], type: "owner_feedback", title: "대표 피드백이 왔어요",
        body: `${f.member_id ? await memberName(f.member_id) : "회원"} 건이에요. 다음 수업 전에 확인해 주세요`, url: "/today" });
    }
  } else if (type === "payroll" && isOwner) {
    const { data: p } = await sb.from("payroll_run").select("account_id, trainer_id, ym, final_total").eq("id", id).maybeSingle();
    if (p?.account_id === who.account_id && p.final_total != null && p.trainer_id !== who.id) {
      r = await sendPush(sb, { trainerIds: [p.trainer_id], type: "payroll", title: "급여가 확정됐어요",
        body: `${Number(p.ym.slice(5))}월 급여를 확인해 보세요. 한 달 고생하셨어요!`, url: "/stats" });
    }
  } else if (type === "routine_request" && who.kind === "member") {
    const { data: q } = await sb.from("member_routine_request").select("user_id, status").eq("id", id).maybeSingle();
    if (q?.user_id === who.id && q.status === "open" && who.trainer_id) {
      r = await sendPush(sb, { trainerIds: [who.trainer_id], type: "routine_request", title: "루틴 요청이 왔어요",
        body: `${await memberName(who.id)} 회원이 개인운동 루틴을 요청했어요`, url: `/pt/${who.id}/logs` });
    }
  } else if (type === "log_written" && who.kind === "trainer") {
    const { data: l } = await sb.from("daily_workout_log").select("user_id, session_at, created_at, voided, source").eq("id", id).maybeSingle();
    if (l && !l.voided && l.source !== "noshow") {
      const { data: m } = await sb.from("user_table").select("id, account_id, member_token, status, hidden").eq("id", l.user_id).maybeSingle();
      if (m?.account_id === who.account_id && !m.hidden && m.status !== "inactive" && m.member_token) {
        r = await sendPush(sb, { memberIds: [m.id], type: "log_written", title: "운동일지가 올라왔어요",
          body: `${md(l.session_at || l.created_at)} 수업 일지를 확인해 주세요`, url: `/m/${m.member_token}` });
      }
    }
  }
  return Response.json({ ok: true, ...r });
}
