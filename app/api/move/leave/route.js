// app/api/move/leave/route.js — 센터 → 개인 독립(2026-10-07 · 계획서 3단계)
// -----------------------------------------------------------------------------
// GET  미리 보기: 센터 이름 · 대표 허락(회원 함께?) · 담당 회원 수 · 할 수 있는지(센터 소속 트레이너만)
// POST {work_mode, brand} 독립: DB _leave_center → 새 개인 계정(체험 없음 · 카드 등록하면 바로 첫 결제) ·
//      같은 로그인 · 본인 가격표 · 프로필 · QR 이동 · 허락이 '회원 함께'면 회원마다 이동 동의 요청(계정이 열린 뒤 보임).
//      대표 허락이 없어도 된다(회원 없이 · 2026-10-07 대표 결정).
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { sendPush, ownerIds } from "@/lib/pushServer";
import { after } from "next/server";

export const runtime = "nodejs";

const ERR = {
  no_trainer: "트레이너 정보를 찾지 못했어요. 다시 로그인해 주세요.",
  not_center_trainer: "센터 소속 트레이너만 개인 계정으로 독립할 수 있어요.",
};

async function allowOf(sb, me) {
  const { data } = await sb.from("leave_allow").select("id, with_members, expires_at")
    .eq("trainer_id", me.id).eq("account_id", me.account_id).is("used_at", null).is("canceled_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

export async function GET(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { data: acc } = await sb.from("account").select("type, name").eq("id", me.account_id).maybeSingle();
  if (me.role !== "trainer" || acc?.type !== "center") return Response.json({ error: ERR.not_center_trainer, code: "not_center_trainer" }, { status: 409 });
  const allow = await allowOf(sb, me);
  let members = 0;
  if (allow?.with_members) {
    const { count } = await sb.from("user_table").select("id", { count: "exact", head: true })
      .eq("account_id", me.account_id).eq("trainer_id", me.id).or("hidden.is.null,hidden.eq.false");
    members = count ?? 0;
  }
  return Response.json({ center_name: acc.name, allowed: Boolean(allow), with_members: Boolean(allow?.with_members), members });
}

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const mode = body.work_mode === "freelance" ? "freelance" : "employed";
  const brand = typeof body.brand === "string" ? body.brand.slice(0, 40) : "";

  const from = me.account_id;
  const { data: res, error } = await sb.rpc("_leave_center", { p_trainer: me.id, p_work_mode: mode, p_brand: brand });
  if (error) { console.error("[move/leave] 독립 실패", error.message); return Response.json({ error: "독립하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }
  if (!res?.ok) return Response.json({ error: ERR[res?.error] || "독립하지 못했어요. 다시 시도해 주세요.", code: res?.error }, { status: 409 });

  after(async () => {
    try {
      const { data: t } = await sb.from("trainer").select("name").eq("id", me.id).maybeSingle();
      await sendPush(sb, { trainerIds: await ownerIds(sb, from), type: "ot_pending", url: "/admin?tab=ops",
        title: "트레이너가 개인 계정으로 독립했어요",
        body: `${t?.name || "트레이너"} 트레이너가 독립했어요. ${res.with_members ? "동의한 회원은 그 트레이너에게 옮겨지고, " : ""}남은 담당 회원은 다른 트레이너에게 배정해 주세요.` });
    } catch (e) { console.error("[move/leave] 알림 실패", e); }
  });

  return Response.json({ ok: true, members: res.members, with_members: res.with_members });
}
