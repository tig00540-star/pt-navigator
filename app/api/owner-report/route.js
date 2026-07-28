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

// digest 숫자 → 프롬프트(라벨된 근거만 · AI는 이 숫자만 서술).
function factsBlock(d) {
  const m = d?.month || {}, y = d?.yesterday || {}, t = d?.today || {}, mem = d?.members || {}, w = d?.watch || {};
  const top = Array.isArray(d?.top3) ? d.top3 : [];
  const topLines = top.length
    ? top.map((it, i) => `  ${i + 1}) ${[it?.title, it?.detail, typeof it?.amount === "number" ? "추정 임팩트 약 " + won(it.amount) : null].filter(Boolean).join(" · ")}`).join("\n")
    : "  (오늘 급히 챙길 항목 없음)";
  return [
    `[어제] 진행 수업 ${y.sessions ?? 0}건 · 노쇼 ${y.noshows ?? 0}건`,
    `[오늘] 예약(booked) ${t.bookings ?? 0}건`,
    `[이번 달 ${d?.ym || ""}] 매출 ${won(m.revenueNet)}${m.revenueTarget ? ` / 목표 ${won(m.revenueTarget)} (진도 ${m.progressPct ?? "—"}%)` : " (목표 미설정)"} · 진행수업 OT ${m.sessionsOT ?? 0}·PT ${m.sessionsPT ?? 0} · 신규등록 ${m.newRegs ?? 0}건(재등록 ${m.reRegs ?? 0}건)`,
    `[회원] 활성 ${mem.activeTotal ?? 0}명(PT ${mem.activePt ?? 0}·OT ${mem.ot ?? 0})`,
    `[주의] 이탈위험 ${w.churnRisk ?? 0}명 · 만료임박 ${w.expiring ?? 0}명 · 이번주 클로징 임박 ${w.closingSoon ?? 0}명 · 미처리 예약 ${w.pastDue ?? 0}건`,
    `[오늘 챙길 것 top3]\n${topLines}`,
  ].join("\n");
}

const PREAMBLE = `너는 피트니스 센터 원장의 운영 참모다. 매일 아침 원장이 30초 안에 센터 상황을 파악하도록, 주어진 숫자만 근거로 담백한 보고서를 쓴다. 없는 사실(회원 이름·구체 수치·에피소드)을 지어내지 않고, 금액은 과거 평균 기반 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.`;

function buildPrompt(d) {
  return `아래는 오늘 아침 우리 센터의 실측 숫자다. 이 숫자만 근거로 원장용 "오늘의 보고서"를 써라.

${factsBlock(d)}

아래 JSON만 출력(코드블록·설명·군더더기 금지):
{"headline":"오늘 상황 한 문장 총평","sections":{"yesterday":"어제 마감 1~2문장","month":"이번 달 진행 상황 1~3문장(매출 진도·수업·신규 중심)","watch":"지금 주의할 회원 1~2문장(이탈·만료·클로징·미처리)","today":"오늘 우선 챙길 것 2~3문장(top3를 행동 지시로)"},"closing":"짧은 마무리 1문장"}
- 각 섹션은 준 숫자를 자연스러운 실무 문장으로. 숫자를 새로 지어내지 마라.
- 매출·임팩트 금액은 '추정'이다. "확실히 X원"이 아니라 "목표 대비 ~%", "성사되면 대략" 식으로.
- 데이터가 0이거나 없으면 억지로 부풀리지 말고 담백히("어제 진행 수업은 없었습니다").`;
}

function parseReport(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj = null;
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  try { if (s !== -1 && e > s) obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== "object") return null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const sec = obj.sections && typeof obj.sections === "object" ? obj.sections : {};
  const out = {
    headline: str(obj.headline),
    sections: { yesterday: str(sec.yesterday), month: str(sec.month), watch: str(sec.watch), today: str(sec.today) },
    closing: str(obj.closing),
  };
  const any = out.headline || out.closing || Object.values(out.sections).some(Boolean);
  return any ? out : null;
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

  const digest = body?.digest;
  if (!digest || typeof digest !== "object") {
    return Response.json({ error: "보고서 데이터가 없습니다.", fallback: "rule" }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: PREAMBLE,
      messages: [{ role: "user", content: buildPrompt(digest) }],
      thinking: { type: "disabled" },
    });
    const textOut = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseReport(textOut);
    if (!parsed) return Response.json({ error: "AI 응답 파싱 실패.", fallback: "rule" }, { status: 502 });
    return Response.json(parsed);
  } catch (e) {
    console.error("[owner-report] 생성 실패:", e?.message || e);
    return Response.json({ error: "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", fallback: "rule" }, { status: 502 });
  }
}
