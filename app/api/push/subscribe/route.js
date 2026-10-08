// app/api/push/subscribe — 이 기기에서 알림 켜기(POST) · 끄기(DELETE) · 2026-10-06.
//   트레이너 · 회원 모두 이 라우트로만(구독 표는 클라 정책 없음). 같은 기기(endpoint)는 마지막에 켠 사람에게 묶인다.
import { serviceClient, callerOf } from "@/lib/serverCaller";

export const runtime = "nodejs";

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "server" }, { status: 503 });
  const who = await callerOf(sb, req);
  if (!who) return Response.json({ error: "auth" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const s = b.subscription || {};
  const endpoint = String(s.endpoint || "");
  if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !s.keys?.p256dh || !s.keys?.auth) return Response.json({ error: "bad" }, { status: 400 });
  // 알려진 푸시 서비스 주소만(2026-10-08 · 아무 주소나 넣어 우리 서버가 거기로 요청을 보내게 하는 것 막기)
  let host = "";
  try { host = new URL(endpoint).hostname; } catch { host = ""; }
  if (!/(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/i.test(host)) {
    return Response.json({ error: "bad" }, { status: 400 });
  }
  const row = {
    endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) }, account_id: who.account_id,
    trainer_id: who.kind === "trainer" ? who.id : null, member_id: who.kind === "member" ? who.id : null,
  };
  const { error } = await sb.from("push_subscription").upsert(row, { onConflict: "endpoint" });
  if (error) { console.error("[push/subscribe] 저장 실패", error.message); return Response.json({ error: "server" }, { status: 500 }); }
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "server" }, { status: 503 });
  const who = await callerOf(sb, req);
  if (!who) return Response.json({ error: "auth" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const endpoint = String(b.endpoint || "");
  if (!endpoint) return Response.json({ error: "bad" }, { status: 400 });
  await sb.from("push_subscription").delete().eq("endpoint", endpoint).eq(who.kind === "trainer" ? "trainer_id" : "member_id", who.id);
  return Response.json({ ok: true });
}
