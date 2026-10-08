// app/api/owner-report/route.js
// -----------------------------------------------------------------------------
// #6 원장 "오늘의 보고서" AI 서술(서버 전용). ownerDailyDigest 숫자 묶음 → 원장용 보고서 문장화.
// 순수 생성기 — 캐시는 클라. DB fetch 0(클라가 숫자 동봉). 게이트: requireTrainer + premium(auth_account_plan).
// 출력: { headline, sections:{yesterday,month,watch,today}, closing }. 실패/키부재 → 상태코드+fallback:"rule".
// -----------------------------------------------------------------------------
import { requireTrainer } from "@/lib/requireTrainer";
import { generateOwnerAI } from "@/lib/ownerReportAI";
import { adminClient, reserveAi, finishAi, quotaResponse } from "@/lib/aiQuota"; // 프롬프트 · 파싱은 lib(9시 예약 작업과 공유 · 2026-10-03)
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

async function accountIsPremium(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!url || !anon || !token) return false;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.rpc("auth_account_plan");
  if (error) return false;
  const plan = Array.isArray(data) ? (data[0]?.auth_account_plan ?? data[0]) : data;
  return plan === "premium";
}

const MAX_BODY_BYTES = 96 * 1024;

export async function POST(request) {
  const auth = await requireTrainer(request);           // 인증+구독+스로틀(공용 · 불변)
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 키가 설정되지 않았습니다.", fallback: "rule" }, { status: 503 });

  if (!(await accountIsPremium(request))) {
    return Response.json({ error: "프리미엄 전용 기능입니다.", code: "premium_required", fallback: "rule" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 }); }

  let bodyBytes = 0;
  try { bodyBytes = JSON.stringify(body).length; } catch { bodyBytes = MAX_BODY_BYTES + 1; }
  if (bodyBytes > MAX_BODY_BYTES) return Response.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 });

  const d = body?.input;
  if (!d || typeof d !== "object") {
    return Response.json({ error: "보고서 데이터가 없습니다.", fallback: "rule" }, { status: 400 });
  }

  try {
    const admin = adminClient();
    // 대표만(2026-10-08 · 트레이너가 이 주소를 반복 호출해 원가를 쓰지 못하게)
    if (admin && auth.user?.id) {
      const { data: me } = await admin.from("trainer").select("role").eq("id", auth.user.id).maybeSingle();
      if (me?.role !== "owner") return Response.json({ error: "대표만 볼 수 있어요.", fallback: "rule" }, { status: 403 });
    }
    const slot = await reserveAi(admin, { userId: auth.user?.id, kind: "owner", unitKey: `owner:${crypto.randomUUID()}` });
    if (!slot.ok) return quotaResponse(slot);
    const parsed = await generateOwnerAI(d, apiKey, (model, usage) => finishAi(admin, slot.id, { ok: true, model, usage }));
    if (!parsed) return Response.json({ error: "AI 응답 파싱 실패.", fallback: "rule" }, { status: 502 });
    return Response.json(parsed);
  } catch (e) {
    console.error("[owner-report] 생성 실패:", e?.message || e);
    return Response.json({ error: "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", fallback: "rule" }, { status: 502 });
  }
}
