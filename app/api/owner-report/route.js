// app/api/owner-report/route.js
// -----------------------------------------------------------------------------
// #6 원장 "오늘의 보고서" AI 서술(서버 전용). ownerDailyDigest 숫자 묶음 → 원장용 보고서 문장화.
// 순수 생성기 — 캐시는 클라. DB fetch 0(클라가 숫자 동봉). 게이트: requireTrainer + premium(auth_account_plan).
// 출력: { headline, sections:{yesterday,month,watch,today}, closing }. 실패/키부재 → 상태코드+fallback:"rule".
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = "claude-sonnet-5";
const MAX_BODY_BYTES = 96 * 1024;

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

const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") + "원" : "—");

// input 숫자·신호 → 프롬프트(라벨된 근거만 · AI는 총평+코칭만). 회원명 없음(파이프라인·주의는 클라 렌더).
function factsBlock(d) {
  const m = d?.month || {}, y = d?.yesterday || {}, t = d?.today || {}, w = d?.watch || {}, p = d?.pipeline || {};
  const top = Array.isArray(d?.top3) ? d.top3 : [];
  const coach = Array.isArray(d?.trainerCoaching) ? d.trainerCoaching : [];
  const topLines = top.length ? top.map((it, i) => `  ${i + 1}) ${[it?.title, it?.detail].filter(Boolean).join(" · ")}`).join("\n") : "  (없음)";
  const coachLines = coach.length ? coach.map((c) => `  - ${c.trainer}: ${c.msg}`).join("\n") : "  (약점 신호 없음)";
  return [
    `[어제] 수업 ${y.sessions ?? 0}건·노쇼 ${y.noshows ?? 0} / [오늘] 예약 ${t.bookings ?? 0}`,
    `[이번 달] 매출 ${won(m.revenueNet)}${m.revenueTarget ? ` (목표 대비 ${m.progressPct ?? "—"}%)` : ""} · 신규등록 ${m.newRegs ?? 0}건`,
    `[매출 파이프라인] 신규 후보 ${p.newCount ?? 0}명 · 재등록 후보 ${p.reCount ?? 0}명 · 성사 시 합계 ${won(p.grandTotal)}(추정)`,
    `[주의] 이탈위험 ${w.churnRisk ?? 0}명 · 만료임박 ${w.expiring ?? 0}명 · 미처리 ${w.pastDue ?? 0}건`,
    `[오늘 챙길 것 top3]\n${topLines}`,
    `[트레이너 약점 신호]\n${coachLines}`,
  ].join("\n");
}

const PREAMBLE = `너는 피트니스 센터 원장의 운영 참모다. 주어진 숫자·약점 신호만 근거로, 원장이 오늘 뭘 할지 콕 집어준다. 없는 사실(회원 이름·구체 수치·에피소드)을 지어내지 않고, 금액은 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.`;

function buildPrompt(d) {
  return `아래는 오늘 아침 우리 센터 실측 요약이다. 이 숫자·신호만 근거로 원장 브리핑을 써라.

${factsBlock(d)}

아래 JSON만 출력(코드블록·설명 금지):
{"headline":"오늘 상황·우선순위 한 문장","coaching":["실행 지시 1","실행 지시 2","..."]}
- headline: 오늘 가장 중요한 것 한 문장(예: 재등록 우선·특정 코치 코칭 필요).
- coaching: 3~5개. 각 항목은 '누가·무엇을·오늘 어떻게'가 담긴 구체 실행 지시.
  · [트레이너 약점 신호]가 있으면 그 코치를 지목해 오늘 할 개인 교육을 구체적으로(예: "박코치 2차 클로징이 낮으니 오늘 '가격·생각해볼게요' 거절 롤플레이 10분").
  · top3의 재등록·신규·이탈 항목은 오늘의 액션으로(예: "재등록 임박 회원부터 오늘 연락").
- 준 숫자를 새로 지어내거나 부풀리지 마라. 신호가 거의 없으면 담백하게 1~2개만.`;
}

function parseOwnerReport(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj = null;
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  try { if (s !== -1 && e > s) obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== "object") return null;
  const headline = typeof obj.headline === "string" ? obj.headline.trim() : "";
  const coaching = Array.isArray(obj.coaching)
    ? obj.coaching.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()).slice(0, 6)
    : [];
  if (!headline && coaching.length === 0) return null;
  return { headline, coaching };
}

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
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: PREAMBLE,
      messages: [{ role: "user", content: buildPrompt(d) }],
      thinking: { type: "disabled" },
    });
    const textOut = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseOwnerReport(textOut);
    if (!parsed) return Response.json({ error: "AI 응답 파싱 실패.", fallback: "rule" }, { status: 502 });
    return Response.json(parsed);
  } catch (e) {
    console.error("[owner-report] 생성 실패:", e?.message || e);
    return Response.json({ error: "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", fallback: "rule" }, { status: 502 });
  }
}
