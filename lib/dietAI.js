// lib/dietAI.js — 서버 전용(라우트 · 예약 작업에서만 import). 식단 AI(2026-10-11 · 1단계).
//   ① 하루 피드백(사진을 보고 끼니 분석 + 잘한 점 · 오늘 하나만 · 먹은 시간 한 줄)
//   ② '식단 짜 주세요' 답(오늘 남은 끼니 / 이번 주)  ③ 예시 식단 3가지(켤 때)
//   ④ 자동 처리(runDietAuto): 요청 1 · 2번째는 1시간 뒤 · 하루 피드백은 그날(오전 6시 마감)이 끝난 뒤 — 트레이너가 안 했을 때만.
//   회원에게는 트레이너 이름으로만 보인다(ai 칸은 트레이너 화면에만 · 회원용 화면엔 없음).
//   원가 줄이기(설계): 끼니 분석은 처음 필요할 때 한 번 저장(diet_meal.analysis) → 다음엔 새 사진만 보냄 ·
//   트레이너가 열어 본 초안(diet_day.draft)이 있고 그 뒤 새 사진이 없으면 그대로 보냄.
//   AI 한도 = 'diet' 묶음(DB ai_reserve) · 계정 = 회원의 센터 · 트레이너 = 담당.
import Anthropic from "@anthropic-ai/sdk";
import { tidyDeep } from "@/lib/tidyText";
import { finishAi } from "@/lib/aiQuota";
import { sendPush } from "@/lib/pushServer";
import { personName } from "@/lib/format";
import { dietToday, addDays, timeLabel, timingFacts, purposeLabel, DIET_AUTO_AFTER_MIN, DIET_AUTO_SEQ } from "@/lib/diet";

const MODEL = "claude-sonnet-5-5";
const MAX_NEW_PHOTOS = 8;
const KST = 9 * 3600000, SIX = 6 * 3600000;
const dayStartIso = (ymd) => new Date(Date.parse(`${ymd}T00:00:00Z`) - KST + SIX).toISOString();   // 그 식단 하루의 시작(KST 06:00)

const RULES = `[말투 · 금지]
- 담당 트레이너가 회원에게 직접 보내는 말이다. 트레이너 1인칭 · 해요체 · 짧고 따뜻하게. AI · 분석기라고 말하지 마라.
- 긴 줄표(— –) 금지. 이모지는 쓰지 마라.
- 숫자(열량 · 탄단지)는 사진 기준 추정이다. '약'을 붙이고 반올림해서 말해라. 정확한 척하지 마라.
- 의료 단정 · 질환 식단 · 약 · 보충제 처방 금지. 굶기 · 원푸드 · 기초대사량보다 크게 모자란 식사 권유 금지.
- 먹은 것을 탓하지 마라. 잘한 점을 먼저, 바꿀 것은 하나만 구체적으로(무엇을 · 언제 · 얼마나).
- 한국 일상 음식(편의점 · 배달 · 식당 · 회사 근처)으로 말해라.`;

function parseJson(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j < i) throw new Error("bad_json");
  return JSON.parse(t.slice(i, j + 1));
}

async function callAI(content, maxTokens = 1800) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("no_key");
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: maxTokens, thinking: { type: "between_tools" },
    system: "너는 PT 트레이너의 식단 관리를 돕는다. 반드시 요청한 JSON 한 덩어리만 출력한다.",
    messages: [{ role: "user", content }],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: tidyDeep(parseJson(text), false), usage: msg.usage };
}

// AI 자리 잡기(회원의 센터 · 담당 트레이너) — 실패하면 { ok:false, code }
export async function reserveDiet(sb, { accountId, trainerId, memberId, unitKey }) {
  const { data, error } = await sb.rpc("ai_reserve", { p_account: accountId, p_trainer: trainerId || null, p_kind: "diet", p_unit_key: unitKey, p_member: memberId });
  if (error) { console.error("[diet] 자리 잡기 실패(막지 않음):", error.message); return { ok: true, id: null }; }
  return data || { ok: true, id: null };
}

/** 한 회원 · 한 하루의 재료(설정 · 끼니 · 운동 시각 · 인바디 · 사진) */
export async function loadDietContext(sb, memberId, day) {
  const [{ data: m }, { data: plan }, { data: meals }, { data: ib }, { data: logs }, { data: sch }] = await Promise.all([
    sb.from("user_table").select("id, name, gender, age, goal, pt_direction, account_id, trainer_id, status, hidden, member_token").eq("id", memberId).maybeSingle(),
    sb.from("diet_plan").select("*").eq("member_id", memberId).maybeSingle(),
    sb.from("diet_meal").select("*").eq("user_id", memberId).eq("day", day).order("eaten_at", { ascending: true }),
    sb.from("inbody_log").select("measured_at, weight, skeletal_muscle, body_fat_pct, bmr").eq("user_id", memberId).order("measured_at", { ascending: false }).limit(1),
    sb.from("daily_workout_log").select("session_at, created_at, voided, source").eq("user_id", memberId).gte("session_at", dayStartIso(day)).lt("session_at", dayStartIso(addDays(day, 1))),
    sb.from("schedule_check").select("on_date, kind, created_at").eq("user_id", memberId).eq("on_date", day),
  ]);
  // 회원이 '오늘 식단 끝'을 눌렀나 — 눌렀으면 그날 먹을 건 다 먹은 것(남은 끼니 이야기 금지 · 2026-10-12 실서비스 시험)
  const { data: dd } = await sb.from("diet_day").select("closed_at").eq("user_id", memberId).eq("day", day).maybeSingle();
  const workouts = [
    ...(logs || []).filter((l) => !l.voided && l.source !== "noshow").map((l) => l.session_at || l.created_at),
    ...(sch || []).filter((s) => s.kind === "personal" && s.created_at).map((s) => s.created_at),
  ];
  return { member: m, plan, meals: meals || [], inbody: ib?.[0] || null, workouts, trained: workouts.length > 0, ended: day < dietToday(), closed: Boolean(dd?.closed_at) };
}

async function imageBlocks(sb, meals) {
  const out = [];
  for (const meal of meals.slice(0, MAX_NEW_PHOTOS)) {
    const { data: blob } = await sb.storage.from("diet-photos").download(meal.photo_path);
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    out.push({ meal, block: { type: "image", source: { type: "base64", media_type: blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg", data: buf.toString("base64") } } });
  }
  return out;
}

function memberBlock(ctx) {
  const m = ctx.member || {}, p = ctx.plan || {}, ib = ctx.inbody;
  const target = p.no_numbers ? "숫자 목표 없음(기록 관리만 · 숫자로 말하지 마라)"
    : `오늘 목표 약 ${ctx.trained ? p.kcal_pt : p.kcal_rest}kcal(${ctx.trained ? "운동한 날" : "운동 없는 날"}) · 탄 ${p.carb_g ?? "-"}g · 단 ${p.protein_g ?? "-"}g · 지 ${p.fat_g ?? "-"}g`;
  return `[회원] ${m.gender || ""} ${m.age ? m.age + "세" : ""} · 목적 ${purposeLabel(p.purpose)}${p.goal_kg ? ` ${p.goal_kg > 0 ? "+" : ""}${p.goal_kg}kg · ${p.months}개월` : ""}
[인바디] ${ib ? `체중 ${ib.weight ?? "-"}kg · 골격근 ${ib.skeletal_muscle ?? "-"}kg · 체지방률 ${ib.body_fat_pct ?? "-"}%` : "없음"}
[목표] ${target}`;
}

/** 하루 피드백 — 끼니 분석(새 사진만) + 피드백 글. 반환 { feedback, analyses:[{id, ...}], usage } */
export async function makeDayFeedback(sb, ctx) {
  const known = ctx.meals.filter((m) => m.analysis);
  const fresh = ctx.meals.filter((m) => !m.analysis && m.photo_path);
  const textOnly = ctx.meals.filter((m) => !m.analysis && !m.photo_path);
  const imgs = await imageBlocks(sb, fresh);
  const facts = timingFacts(ctx.meals.map((m) => ({ eaten_at: m.eaten_at, kcal: m.analysis?.kcal })), ctx.workouts);
  const listLine = (m, how) => `- id=${m.id} · ${timeLabel(m.eaten_at)}${m.memo ? ` · 회원 메모 "${m.memo}"` : ""}${how}`;
  const content = [
    { type: "text", text: `${memberBlock(ctx)}
[오늘 운동] ${ctx.workouts.length ? ctx.workouts.map(timeLabel).join(", ") : "없음"}
[이미 분석한 끼니]
${known.length ? known.map((m) => listLine(m, ` · ${m.analysis.items} · 약 ${m.analysis.kcal}kcal 탄${m.analysis.carb} 단${m.analysis.protein} 지${m.analysis.fat}`)).join("\n") : "없음"}
[글로만 남긴 끼니]
${textOnly.length ? textOnly.map((m) => listLine(m, "")).join("\n") : "없음"}
[새로 분석할 사진] 아래 사진이 순서대로 이 끼니들이다:
${imgs.length ? imgs.map((x, i) => `${i + 1}번 사진 = ${listLine(x.meal, "")}`).join("\n") : "없음"}
[먹은 시간 사실 — 앱이 계산 · 이 중 가장 중요한 하나만 timing에 말로]
${facts.length ? facts.map((f) => "- " + f.text).join("\n") : "특이사항 없음(timing은 빈 문자열)"}

${RULES}

${ctx.ended
  ? "[이 하루] 이미 끝난 하루(회원은 다음 날 아침에 읽는다). 먹은 것은 '어제'로 말하고, next는 '오늘은 …'처럼 오늘 할 것으로."
  : ctx.closed
  ? "[이 하루] 회원이 '오늘 식단 끝'을 눌렀다 = 오늘 먹을 것은 다 먹었다. 먹은 것은 '오늘'로 말하고, next는 '내일은 …'처럼 내일 할 것 하나로. 남은 끼니 · 저녁에 더 먹으라는 말은 하지 마라."
  : "[이 하루] 아직 진행 중인 오늘. 먹은 것은 '오늘'로, next는 남은 끼니 · 남은 시간에 할 것으로."}
[할 일] 이 하루 식단 피드백.
- meals: 새 사진 · 글 끼니마다 무엇을 얼마나 먹었는지(items 짧게)와 약 kcal · 탄 · 단 · 지(g). 이미 분석한 끼니는 다시 쓰지 마라.
- totals: 이미 분석한 끼니 + 새 끼니 합계(정수).
- good: 잘한 점 한두 문장. next: 다음에 하나만 바꿀 것 한 문장(구체적으로). timing: 시간 사실이 있으면 그걸 근거로 한 문장 · 없으면 "".
${ctx.plan?.no_numbers ? "- 이 회원은 숫자 목표가 없다. good · next에 열량 숫자를 쓰지 마라." : "- 목표와 비교해 많거나 적으면 next에 반영해라."}

[출력 JSON]
{"meals":[{"id":"...","items":"...","kcal":0,"carb":0,"protein":0,"fat":0}],"totals":{"kcal":0,"carb":0,"protein":0,"fat":0},"good":"...","next":"...","timing":""}` },
    ...imgs.map((x) => x.block),
  ];
  const { data, usage } = await callAI(content);
  const byId = new Map((data.meals || []).filter((x) => x && x.id).map((x) => [String(x.id), x]));
  const analyses = [...fresh, ...textOnly].map((m) => (byId.has(m.id) ? { id: m.id, ...byId.get(m.id) } : null)).filter(Boolean);
  const t = data.totals || {};
  const feedback = {
    totals: ctx.plan?.no_numbers ? null : { kcal: Math.round(Number(t.kcal) || 0), carb: Math.round(Number(t.carb) || 0), protein: Math.round(Number(t.protein) || 0), fat: Math.round(Number(t.fat) || 0) },
    target: ctx.plan?.no_numbers ? null : { kcal: ctx.trained ? ctx.plan?.kcal_pt : ctx.plan?.kcal_rest, carb: ctx.plan?.carb_g, protein: ctx.plan?.protein_g, fat: ctx.plan?.fat_g },
    good: String(data.good || "").slice(0, 300), next: String(data.next || "").slice(0, 300), timing: String(data.timing || "").slice(0, 200),
  };
  return { feedback, analyses, usage };
}

/** '식단 짜 주세요' 답 */
export async function makeRequestAnswer(sb, ctx, req) {
  const known = ctx.meals.filter((m) => m.analysis);
  const content = [{ type: "text", text: `${memberBlock(ctx)}
[요청] ${req.scope === "today" ? "오늘 남은 끼니" : "이번 주"} 식단을 짜 달라 · 상황: ${(req.situations || []).join(", ") || "없음"}${req.note ? ` · 회원 메모 "${req.note}"` : ""}
[오늘 이미 먹은 것] ${known.length ? known.map((m) => `${timeLabel(m.eaten_at)} ${m.analysis.items}(약 ${m.analysis.kcal}kcal)`).join(" / ") : ctx.meals.length ? ctx.meals.map((m) => `${timeLabel(m.eaten_at)} ${m.memo || "사진"}`).join(" / ") : "기록 없음"}

${RULES}

[할 일] ${req.scope === "today"
    ? "오늘 남은 끼니를 짜라. 이미 먹은 양을 빼고 남은 목표에 맞춰 끼니 2~3개(언제 · 무엇을 · 얼마나). 상황(회식 · 편의점 등)에 맞는 현실적인 메뉴로."
    : "이번 주에 돌려 쓸 하루 식단 3가지(평일 A · 평일 B · 주말)와 상황별 요령 2개. 메뉴는 구하기 쉬운 것으로."}
${ctx.plan?.no_numbers ? "숫자(kcal)는 쓰지 마라." : "끼니마다 약 kcal을 덧붙여라."}

[출력 JSON]
{"intro":"한 문장","plan":[{"title":"${req.scope === "today" ? "저녁" : "평일 A"}","items":"메뉴와 양","tip":"짧게 · 없으면 빈 문자열"}],"closing":"한 문장"}` }];
  const { data, usage } = await callAI(content, 1500);
  const plan = (Array.isArray(data.plan) ? data.plan : []).slice(0, 6).map((p) => ({ title: String(p.title || "").slice(0, 30), items: String(p.items || "").slice(0, 300), tip: String(p.tip || "").slice(0, 150) }));
  return { answer: { intro: String(data.intro || "").slice(0, 200), plan, closing: String(data.closing || "").slice(0, 200) }, usage };
}

/** 예시 식단 3가지(켤 때) */
export async function makeExamples(plan, member) {
  const content = [{ type: "text", text: `[회원] ${member?.gender || ""} ${member?.age ? member.age + "세" : ""} · 목적 ${purposeLabel(plan.purpose)}
[목표] ${plan.no_numbers ? "숫자 없음" : `하루 약 ${plan.kcal_rest}kcal(운동하는 날 ${plan.kcal_pt}) · 탄 ${plan.carb_g}g · 단 ${plan.protein_g}g · 지 ${plan.fat_g}g`}

${RULES}

[할 일] 회원이 따라 하기 쉬운 하루 예시 식단 3가지(아침 · 점심 · 저녁 · 간식). 1번은 집밥, 2번은 회사 다니는 날(외식 · 편의점), 3번은 바쁜 날(간편식).
${plan.no_numbers ? "숫자(kcal)는 쓰지 마라." : "하루 합계 약 kcal을 total에."}

[출력 JSON]
{"examples":[{"title":"집밥 하루","meals":[{"when":"아침","menu":"..."}],"total":"약 1,500kcal"}],"note":"한 문장"}` }];
  const { data, usage } = await callAI(content, 1500);
  const examples = (Array.isArray(data.examples) ? data.examples : []).slice(0, 3).map((e) => ({
    title: String(e.title || "").slice(0, 30), total: plan.no_numbers ? "" : String(e.total || "").slice(0, 30),
    meals: (Array.isArray(e.meals) ? e.meals : []).slice(0, 5).map((x) => ({ when: String(x.when || "").slice(0, 10), menu: String(x.menu || "").slice(0, 120) })),
  }));
  return { examples: { list: examples, note: String(data.note || "").slice(0, 200) }, usage };
}

async function saveAnalyses(sb, analyses) {
  for (const a of analyses) {
    const { id, ...rest } = a;
    await sb.from("diet_meal").update({ analysis: { items: String(rest.items || "").slice(0, 200), kcal: Math.round(Number(rest.kcal) || 0), carb: Math.round(Number(rest.carb) || 0), protein: Math.round(Number(rest.protein) || 0), fat: Math.round(Number(rest.fat) || 0) } }).eq("id", id);
  }
}

/** 하루 피드백 만들기(초안 또는 자동). 저장: 끼니 분석 · draft(초안) 또는 feedback(자동) */
export async function feedbackFor(sb, { memberId, day, accountId, trainerId }) {
  const ctx = await loadDietContext(sb, memberId, day);
  if (!ctx.member || !ctx.plan || !ctx.meals.length) return { ok: false, code: "empty" };
  const slot = await reserveDiet(sb, { accountId, trainerId, memberId, unitKey: `dietfb:${memberId}:${day}` });
  if (!slot.ok) return { ok: false, code: slot.code || "quota" };
  try {
    const r = await makeDayFeedback(sb, ctx);
    await finishAi(sb, slot.id, { ok: true, model: MODEL, usage: r.usage });
    await saveAnalyses(sb, r.analyses);
    return { ok: true, feedback: r.feedback, ctx };
  } catch (e) {
    await finishAi(sb, slot.id, { ok: false, model: MODEL });
    console.error("[diet] 피드백 실패", e?.message || e);
    return { ok: false, code: "ai" };
  }
}

export async function answerFor(sb, { req, accountId, trainerId }) {
  const ctx = await loadDietContext(sb, req.user_id, req.day);
  if (!ctx.member || !ctx.plan) return { ok: false, code: "empty" };
  // 먹은 것은 저장된 끼니 분석을 쓰고(싸게), 분석 전 끼니는 메모로만 본다
  const slot = await reserveDiet(sb, { accountId, trainerId, memberId: req.user_id, unitKey: `dietrq:${req.id}` });
  if (!slot.ok) return { ok: false, code: slot.code || "quota" };
  try {
    const r = await makeRequestAnswer(sb, ctx, req);
    await finishAi(sb, slot.id, { ok: true, model: MODEL, usage: r.usage });
    return { ok: true, answer: r.answer };
  } catch (e) {
    await finishAi(sb, slot.id, { ok: false, model: MODEL });
    console.error("[diet] 요청 답 실패", e?.message || e);
    return { ok: false, code: "ai" };
  }
}

const memberUrl = (m) => (m?.member_token ? `/m/${m.member_token}` : "/");

// 구독이 살아 있는 계정만 식단 AI를 쓴다(2026-10-12) — owner-daily-report · DB auth_account_plan()과 같은 조건.
//   account.plan='premium'은 베이직 · 프로 · 센터 모두 그대로(요금 등급은 billing_plan)라 '이용 중'만 가른다.
export const accountLive = (a, nowMs = Date.now()) => Boolean(a) && a.plan === "premium" && a.subscription_status === "active"
  && (!a.current_period_end || Date.parse(a.current_period_end) > nowMs);
export async function liveAccountIds(sb, accountIds, nowMs = Date.now()) {
  const ids = [...new Set((accountIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await sb.from("account").select("id, plan, subscription_status, current_period_end").in("id", ids);
  if (error) { console.error("[diet] 계정 읽기 실패", error.message); return new Set(); }
  return new Set((data || []).filter((a) => accountLive(a, nowMs)).map((a) => a.id));
}

// 자동 처리 중 표시가 이보다 오래되면(작업이 중간에 끊김) 다시 가져간다 — 요청 · 하루 피드백 공통
const CLAIM_STALE_MIN = 10;

/**
 * 자동 처리 — 트레이너가 안 했을 때만. memberIds를 주면 그 회원들만(회원 페이지 열 때 · 트레이너 '오늘' 열 때 · 예약 작업).
 * deadline(ms 시각)을 넘기면 새 AI 일을 시작하지 않는다(플랫폼 시간 제한 전에 끝내기 · 남은 건 다음에 이어서).
 * 구독이 끝난 센터의 회원은 건너뛴다.
 * 반환 { requests, feedbacks, skipped, stopped }
 */
export async function runDietAuto(sb, memberIds, { now = Date.now(), deadline = Infinity } = {}) {
  const out = { requests: 0, feedbacks: 0, skipped: 0, stopped: false };
  if (!memberIds?.length) return out;
  const today = dietToday();
  const timeUp = () => { if (Date.now() < deadline) return false; out.stopped = true; return true; };
  const { data: plans } = await sb.from("diet_plan").select("member_id, account_id").in("member_id", memberIds).eq("enabled", true);
  const ids = (plans || []).map((p) => p.member_id);
  if (!ids.length) return out;
  const { data: members } = await sb.from("user_table").select("id, name, account_id, trainer_id, status, hidden, member_token").in("id", ids);
  const okAcc = await liveAccountIds(sb, (members || []).map((m) => m.account_id), now);
  const live = new Map((members || []).filter((m) => !m.hidden && m.status === "pt_active" && okAcc.has(m.account_id)).map((m) => [m.id, m]));
  if (!live.size) return out;
  const stale = new Date(now - CLAIM_STALE_MIN * 60000).toISOString();
  const claimFree = `auto_claim_at.is.null,auto_claim_at.lt.${stale}`;   // 비었거나 끊긴 지 오래된 것

  // ① 요청 1 · 2번째 — 1시간 지난 것
  const cutoff = new Date(now - DIET_AUTO_AFTER_MIN * 60000).toISOString();
  const { data: reqs } = await sb.from("diet_request").select("*").in("user_id", [...live.keys()]).eq("status", "open")
    .lte("seq", DIET_AUTO_SEQ).lte("created_at", cutoff).or(claimFree).gte("day", addDays(today, -1));
  for (const q of reqs || []) {
    if (timeUp()) return out;
    const m = live.get(q.user_id);
    const { data: claimed } = await sb.from("diet_request").update({ auto_claim_at: new Date().toISOString() })
      .eq("id", q.id).eq("status", "open").or(claimFree).select("id");
    if (!claimed?.length) continue;
    const r = await answerFor(sb, { req: q, accountId: m.account_id, trainerId: m.trainer_id });
    if (!r.ok) { await sb.from("diet_request").update({ auto_claim_at: null }).eq("id", q.id); out.skipped++; continue; }
    // 그 사이 트레이너가 답했거나 회원이 취소했으면 0행 → 알림도 안 보낸다
    const { data: done } = await sb.from("diet_request").update({ status: "answered", answer: r.answer, answered_at: new Date().toISOString(), answered_by: null, ai: true })
      .eq("id", q.id).eq("status", "open").select("id");
    if (!done?.length) { out.skipped++; continue; }
    await sendPush(sb, { memberIds: [m.id], type: "diet_answer", title: "식단이 도착했어요", body: `${q.scope === "today" ? "오늘 남은 끼니" : "이번 주"} 식단을 확인해 보세요`, url: memberUrl(m) });
    out.requests++;
  }

  // ② 하루 피드백 — 끝난 하루(어제 · 그제)에 끼니가 있고 피드백이 없는 것
  const { data: meals } = await sb.from("diet_meal").select("user_id, day, created_at").in("user_id", [...live.keys()])
    .gte("day", addDays(today, -2)).lt("day", today);
  const pairs = new Map();
  for (const x of meals || []) { const k = `${x.user_id}|${x.day}`; const p = pairs.get(k); if (!p || x.created_at > p.last) pairs.set(k, { user_id: x.user_id, day: x.day, last: x.created_at }); }
  for (const { user_id, day, last } of pairs.values()) {
    if (timeUp()) return out;
    const m = live.get(user_id);
    await sb.from("diet_day").upsert({ user_id, day }, { onConflict: "user_id,day", ignoreDuplicates: true });
    const { data: claimed } = await sb.from("diet_day").update({ auto_claim_at: new Date().toISOString() })
      .eq("user_id", user_id).eq("day", day).is("feedback", null).or(claimFree).select("draft, draft_at");
    if (!claimed?.length) continue;
    let fb = null;
    const d = claimed[0];
    if (d.draft && d.draft_at && d.draft_at >= last) fb = d.draft;   // 트레이너가 열어 본 초안 · 그 뒤 새 사진 없음
    else {
      const r = await feedbackFor(sb, { memberId: user_id, day, accountId: m.account_id, trainerId: m.trainer_id });
      if (r.ok) fb = r.feedback;
    }
    if (!fb) { await sb.from("diet_day").update({ auto_claim_at: null }).eq("user_id", user_id).eq("day", day); out.skipped++; continue; }
    const { data: done } = await sb.from("diet_day").update({ feedback: fb, feedback_at: new Date().toISOString(), feedback_by: null, ai: true })
      .eq("user_id", user_id).eq("day", day).is("feedback", null).select("user_id");
    if (!done?.length) { out.skipped++; continue; }   // 그 사이 트레이너가 보냄 → 알림 안 보냄
    await sendPush(sb, { memberIds: [m.id], type: "diet_feedback", title: "식단 피드백이 왔어요", body: `${personName(m.name) || "회원"}님, 어제 식단 피드백을 확인해 보세요`, url: memberUrl(m) });
    out.feedbacks++;
  }
  return out;
}
