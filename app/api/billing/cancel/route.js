// app/api/billing/cancel/route.js — 해지 예약 · 해지 취소(2026-10-07 · 계획서 1단계)
// -----------------------------------------------------------------------------
// 대표(개인 계정은 본인)만. account UPDATE 정책은 열지 않고 여기(service_role)서만 쓴다.
//   action 'cancel' = 해지 예약: 지금 이용 기간 끝까지는 그대로 · 다음 결제 없음(결제 작업이 cancel_at_period_end를 보고 건너뜀)
//                    · 기간이 끝나면 30일 동안 볼 수만 → 그 뒤 기록 파기(약관 11조).
//   action 'resume' = 해지 취소: 기간이 아직 남아 있을 때만(끝났으면 카드 다시 등록 = 결제벽).
// 이유(reason)는 선택 · 300자 · 대표에게만 보이고 서비스 개선용으로 읽는다.
// -----------------------------------------------------------------------------
import { serviceClient, callerOf } from "@/lib/serverCaller";

export const runtime = "nodejs";

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  if (me.role !== "owner") return Response.json({ error: "대표만 구독을 바꿀 수 있어요." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== "cancel" && action !== "resume") return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { data: acc, error: ae } = await sb.from("account")
    .select("id, subscription_status, current_period_end, cancel_at_period_end, billing_key")
    .eq("id", me.account_id).maybeSingle();
  if (ae || !acc) { console.error("[billing/cancel] 계정 조회 실패", ae?.message); return Response.json({ error: "계정을 찾지 못했어요." }, { status: 404 }); }

  const now = Date.now();
  const end = acc.current_period_end ? Date.parse(acc.current_period_end) : null;
  const running = acc.subscription_status === "active" && (end == null || end > now);
  if (!running) return Response.json({ error: "이용 기간이 이미 끝났어요. 다시 쓰려면 카드를 등록해 주세요." }, { status: 409 });

  let patch;
  if (action === "cancel") {
    // 기간이 없는(무기한 · 시범 운영) 계정은 해지 예약 대상이 아니다 — 끝나는 날이 없어서
    if (end == null) return Response.json({ error: "이 계정은 따로 해지할 기간이 없어요. 고객센터로 알려 주세요." }, { status: 409 });
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    patch = { cancel_at_period_end: true, cancel_requested_at: new Date(now).toISOString(), cancel_reason: reason || null };
  } else {
    if (!acc.billing_key) return Response.json({ error: "등록된 카드가 없어요. 기간이 끝난 뒤 카드를 다시 등록해 주세요." }, { status: 409 });
    patch = { cancel_at_period_end: false, cancel_requested_at: null };
  }

  const { data: up, error: ue } = await sb.from("account").update(patch).eq("id", acc.id)
    .select("cancel_at_period_end, current_period_end");
  if (ue || !up?.length) { console.error("[billing/cancel] 저장 실패", ue?.message); return Response.json({ error: "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 }); }
  return Response.json({ ok: true, cancelAtPeriodEnd: up[0].cancel_at_period_end, periodEnd: up[0].current_period_end });
}
