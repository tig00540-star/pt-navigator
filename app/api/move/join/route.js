// app/api/move/join/route.js — 개인 계정 → 센터 합류(2026-10-07 · 계획서 2단계)
// -----------------------------------------------------------------------------
// GET  ?code=  미리 보기: 센터 이름 · 내 회원 수 · 남은 기간 환불 예상 · 할 수 있는지(개인 계정 주인만 · 좌석)
// POST {code}  합류: DB 함수 _join_center(트레이너 이동 · 트레이너 것 옮김 · 회원 동의 요청 · 개인 계정 닫기)
//              → 남은 개인 구독 기간 일할 환불(토스 부분 취소 · A안). 환불이 실패해도 합류는 그대로(기록 · 고객센터 안내).
// service_role · 호출자 본인만.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { cancelPayment, tossReady } from "@/lib/toss";
import { proratedRefund } from "@/lib/refund";
import { sendPush, ownerIds } from "@/lib/pushServer";
import { after } from "next/server";

export const runtime = "nodejs";

const ERR = {
  invalid: "초대 링크가 올바르지 않아요. 대표에게 새 링크를 받아 주세요.",
  used: "이미 쓴 초대 링크예요. 대표에게 새 링크를 받아 주세요.",
  canceled: "대표가 끈 초대 링크예요.",
  expired: "초대 링크 기간(7일)이 지났어요. 대표에게 새 링크를 받아 주세요.",
  not_solo: "개인 계정으로 쓰던 트레이너만 합류할 수 있어요.",
  same: "이미 이 센터 소속이에요.",
  seat_limit: "센터의 트레이너 자리(3명)가 꽉 찼어요. 대표에게 알려 주세요.",
  no_trainer: "트레이너 정보를 찾지 못했어요. 다시 로그인해 주세요.",
};

async function lastPaid(sb, accountId) {
  const { data } = await sb.from("payment").select("id, order_id, toss_payment_key, amount, status, period_start, period_end, paid_at")
    .eq("account_id", accountId).eq("status", "DONE").in("plan", ["basic", "solo", "center"])   // 월 구독 결제만(차액 · 팩 결제 제외 · 2026-10-07)
    .order("paid_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

async function preview(sb, me, code) {
  const { data: info } = await sb.rpc("join_invite_info", { p_code: code });
  if (!info || info.error) return { error: info?.error || "invalid" };
  const { data: acc } = await sb.from("account").select("id, type").eq("id", me.account_id).maybeSingle();
  if (me.role !== "owner" || acc?.type !== "solo") return { error: "not_solo", center_name: info.center_name };
  const { count } = await sb.from("user_table").select("id", { count: "exact", head: true }).eq("account_id", me.account_id).or("hidden.is.null,hidden.eq.false");
  const refund = proratedRefund(await lastPaid(sb, me.account_id));
  return { center_name: info.center_name, members: count ?? 0, refund };
}

export async function GET(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const code = new URL(req.url).searchParams.get("code") || "";
  const p = await preview(sb, me, code);
  if (p.error) return Response.json({ error: ERR[p.error] || ERR.invalid, code: p.error, center_name: p.center_name }, { status: 409 });
  return Response.json(p);
}

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !code) return Response.json({ error: ERR.invalid }, { status: 400 });

  const from = me.account_id;
  const paid = await lastPaid(sb, from);           // 닫기 전에 읽어 둔다(환불 근거)
  const { data: res, error } = await sb.rpc("_join_center", { p_trainer: me.id, p_code: code });
  if (error) { console.error("[move/join] 합류 실패", error.message); return Response.json({ error: "합류하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }
  if (!res?.ok) {
    // DB 함수는 '이미 씀 · 끔 · 기간 지남'을 하나(expired)로 돌려준다 → 정확한 이유는 링크 정보로
    let why = res?.error;
    if (why === "expired") { const { data: info } = await sb.rpc("join_invite_info", { p_code: code }); if (info?.error) why = info.error; }
    return Response.json({ error: ERR[why] || ERR.invalid, code: why }, { status: 409 });
  }

  // 남은 개인 구독 기간 일할 환불(A안)
  const refund = proratedRefund(paid);
  let refunded = 0, refundError = null;
  if (refund.amount > 0) {
    if (!tossReady()) refundError = "결제 키 미설정";
    else {
      const r = await cancelPayment(paid.toss_payment_key, {
        cancelReason: "센터 합류 · 남은 기간 환불",
        cancelAmount: refund.amount,
        idempotencyKey: `join_refund_${paid.id}`,
      });
      if (r.ok) refunded = refund.amount;
      else refundError = r.error?.code || r.status || "unknown";
    }
    await sb.from("payment").insert({
      account_id: from, order_id: `refund_${paid.id}`, toss_payment_key: paid.toss_payment_key,
      amount: -refund.amount, status: refunded ? "CANCELED" : "REFUND_FAILED", plan: null,
      raw: { reason: "join_center", days: refund.days, error: refundError },
    });
    if (refundError) console.error(`[move/join] 환불 실패(수동 처리 필요) account=${from} amount=${refund.amount}`, refundError);
  }

  // 센터 대표에게 알림
  after(async () => {
    try {
      const { data: t } = await sb.from("trainer").select("name").eq("id", me.id).maybeSingle();
      await sendPush(sb, { trainerIds: await ownerIds(sb, res.to), type: "ot_pending", url: "/admin?tab=ops",
        title: "트레이너가 합류했어요", body: `${t?.name || "트레이너"} 트레이너가 센터에 합류했어요. 회원은 동의한 사람부터 옮겨져요.` });
      // 회원에게 — 회원 전용 페이지에서 옮길지 골라 달라고(알림 켠 회원만 · 회원마다 자기 링크)
      const { data: mt } = await sb.from("member_transfer").select("member_id").eq("to_account", res.to).eq("trainer_id", me.id).eq("status", "pending");
      const mids = (mt || []).map((m) => m.member_id);
      if (mids.length) {
        const { data: ms } = await sb.from("user_table").select("id, member_token").in("id", mids);
        for (const m of ms || []) {
          if (!m.member_token) continue;
          await sendPush(sb, { memberIds: [m.id], type: "transfer", url: `/m/${m.member_token}`,
            title: "기록을 함께 옮길까요?", body: `앞으로 ${res.center_name}에서 기록을 관리해요. 회원 페이지에서 옮길지 골라 주세요.` });
        }
      }
    } catch (e) { console.error("[move/join] 알림 실패", e); }
  });

  return Response.json({ ok: true, center_name: res.center_name, members: res.members, refund: refund.amount, refunded, refundError: refundError ? true : false });
}
