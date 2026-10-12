// app/api/diet — 식단 AI(2026-10-11 · 1단계). 키 · 모델은 서버에만.
//   action:
//     auto            — 회원(회원 전용 페이지를 열 때) 또는 트레이너('오늘'을 열 때)가 부른다. 트레이너가 안 한 요청(1 · 2번째 · 1시간 뒤) ·
//                       끝난 하루 피드백을 AI가 대신 보낸다(lib/dietAI runDietAuto). 예약 작업(오전 6시)과 같은 함수.
//     examples        — 트레이너: 예시 식단 3가지를 만들어 diet_plan.examples에 저장(켤 때 · 다시 만들기).
//     draft_feedback  — 트레이너: 하루 피드백 AI 초안(끼니 분석은 저장 · 초안은 diet_day.draft → 오전 6시에 재사용).
//     draft_request   — 트레이너: 식단 요청 답 AI 초안(저장 안 함 · 트레이너가 고쳐서 보낸다).
//   트레이너가 '보내기'를 누르는 저장은 화면이 RLS로 직접 한다(+ /api/push/notify).
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { runDietAuto, feedbackFor, answerFor, makeExamples, reserveDiet, accountLive } from "@/lib/dietAI";
import { finishAi } from "@/lib/aiQuota";

export const runtime = "nodejs";
export const maxDuration = 180;
// 'auto'는 이 시간이 지나면 새 AI 일을 시작하지 않는다(한 건이 1분 가까이 걸릴 수 있어 180초 제한 전에 끝내기 · 남은 건 다음에 열 때)
const AUTO_BUDGET_MS = 110000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const quotaRes = (code) => Response.json({ error: code === "quota" ? "이번 달 식단 AI를 다 썼어요. 직접 써서 보내 주세요." : code === "daily_cap" ? "오늘은 더 만들 수 없어요. 내일 다시 시도해 주세요." : "AI가 지금 답하지 못했어요. 다시 시도해 주세요.", code }, { status: code === "quota" ? 402 : code === "daily_cap" ? 429 : 502 });

export async function POST(req) {
  const t0 = Date.now();
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "준비 중이에요." }, { status: 503 });
  const who = await callerOf(sb, req);
  if (!who) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");

  if (action === "auto") {
    let ids = [];
    if (who.kind === "member") ids = [who.id];
    else {
      let q = sb.from("diet_plan").select("member_id").eq("account_id", who.account_id).eq("enabled", true).limit(200);
      const { data: plans } = await q;
      const all = (plans || []).map((p) => p.member_id);
      if (who.role === "owner") ids = all;
      else if (all.length) {
        const { data: mine } = await sb.from("user_table").select("id").in("id", all).eq("trainer_id", who.id);
        ids = (mine || []).map((m) => m.id);
      }
    }
    const r = await runDietAuto(sb, ids, { deadline: t0 + AUTO_BUDGET_MS });   // 구독이 끝난 센터는 runDietAuto가 건너뜀
    return Response.json({ ok: true, ...r });
  }

  if (who.kind !== "trainer") return Response.json({ error: "트레이너만 쓸 수 있어요." }, { status: 403 });
  // 구독이 끝난 계정(읽기 전용 30일 포함)은 식단 AI를 못 쓴다 — owner-daily-report와 같은 조건
  const { data: acc } = await sb.from("account").select("plan, subscription_status, current_period_end").eq("id", who.account_id).maybeSingle();
  if (!accountLive(acc)) return Response.json({ error: "구독이 만료돼서 지금은 식단 AI를 쓸 수 없어요.", code: "inactive" }, { status: 403 });
  const memberId = String(b.memberId || "");
  const loadMember = async (id) => {
    if (!UUID_RE.test(id)) return null;
    const { data: m } = await sb.from("user_table").select("id, account_id, trainer_id, gender, age").eq("id", id).maybeSingle();
    return m && m.account_id === who.account_id ? m : null;
  };

  if (action === "examples") {
    const m = await loadMember(memberId);
    if (!m) return Response.json({ error: "회원을 찾지 못했어요." }, { status: 404 });
    const { data: plan } = await sb.from("diet_plan").select("*").eq("member_id", m.id).maybeSingle();
    if (!plan?.enabled) return Response.json({ error: "식단 관리가 꺼져 있어요." }, { status: 400 });
    const slot = await reserveDiet(sb, { accountId: m.account_id, trainerId: who.id, memberId: m.id, unitKey: `dietex:${m.id}:${plan.started_on}` });
    if (!slot.ok) return quotaRes(slot.code);
    try {
      const r = await makeExamples(plan, m);
      await finishAi(sb, slot.id, { ok: true, model: "claude-sonnet-5-5", usage: r.usage });
      await sb.from("diet_plan").update({ examples: r.examples }).eq("member_id", m.id);
      return Response.json({ ok: true, examples: r.examples });
    } catch (e) {
      await finishAi(sb, slot.id, { ok: false, model: "claude-sonnet-5-5" });
      console.error("[diet] 예시 실패", e?.message || e);
      return quotaRes("ai");
    }
  }

  if (action === "draft_feedback") {
    const m = await loadMember(memberId);
    const day = String(b.day || "");
    if (!m || !DAY_RE.test(day)) return Response.json({ error: "회원을 찾지 못했어요." }, { status: 404 });
    const r = await feedbackFor(sb, { memberId: m.id, day, accountId: m.account_id, trainerId: who.id });
    if (!r.ok) return r.code === "empty" ? Response.json({ error: "이 날 올린 식단이 없어요." }, { status: 400 }) : quotaRes(r.code);
    await sb.from("diet_day").upsert({ user_id: m.id, day, draft: r.feedback, draft_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    return Response.json({ ok: true, feedback: r.feedback });
  }

  if (action === "draft_request") {
    const id = String(b.requestId || "");
    if (!UUID_RE.test(id)) return Response.json({ error: "요청을 찾지 못했어요." }, { status: 404 });
    const { data: q } = await sb.from("diet_request").select("*").eq("id", id).maybeSingle();
    if (!q || q.account_id !== who.account_id) return Response.json({ error: "요청을 찾지 못했어요." }, { status: 404 });
    const r = await answerFor(sb, { req: q, accountId: q.account_id, trainerId: who.id });
    if (!r.ok) return quotaRes(r.code);
    return Response.json({ ok: true, answer: r.answer });
  }

  return Response.json({ error: "알 수 없는 요청이에요." }, { status: 400 });
}
