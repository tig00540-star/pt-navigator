// lib/ownerReportAI.js — 대표 보고서 AI 총평 · 코칭(서버 전용 · 2026-10-03 분리).
// 같은 프롬프트를 두 곳이 쓴다: app/api/owner-report(대표가 열 때 · 9시 보고서가 없을 때)와
// app/api/cron/owner-daily-report(매일 9시 KST 미리 만들기). 숫자는 ownerReportData가 만든 것만 근거로.
// 회원 이름은 AI에 넘기지 않는다(트레이너 이름 · 숫자 · 이유 분류 · 회원의 말만).
import Anthropic from "@anthropic-ai/sdk";
import { tidyDeep, NO_DASH_RULE } from "@/lib/tidyText";
import { labelOf, CLOSING_REASON_OPTS, REG_REASON_OPTS } from "@/lib/labels";

export const OWNER_AI_MODEL = "claude-sonnet-5-5";

const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") + "원" : "—");

const RESULT_KO = { success: "등록", success_nocontract: "등록(계약 미입력)", hold: "보류(제안함)", none: "다음 OT로 이어감(제안 못 함)", fail: "그만하기로 함" };

/** ownerReportData 결과 → AI 입력(이름은 트레이너만). nameOf(trainerId) → 트레이너 이름. */
export function buildOwnerAIInput(d, nameOf) {
  const items = (d?.results?.items || []).map((i) => ({
    trainer: nameOf(i.trainer_id),
    what: i.kind === "rereg" ? "재등록" : i.kind === "new" ? `${i.round ? `${i.round}차 OT ` : ""}신규 등록` : `${i.round ?? 1}차 OT`,
    result: i.kind === "rereg" && i.result !== "success" ? (i.result === "hold" ? "재등록 보류" : "재등록 안 함") : RESULT_KO[i.result] || i.result,
    reason: i.reason ? labelOf(i.kind === "rereg" ? REG_REASON_OPTS : CLOSING_REASON_OPTS, i.reason) : null,
    proposed: i.proposed,
    quote: i.quote || null,
    amount: i.result === "success" ? i.amount ?? null : null,
    perSession: i.result === "success" ? i.price ?? null : null,
  }));
  return {
    ym: d.ym, yesterday: d.yesterday, today: d.today, month: d.month, members: d.members, watch: d.watch,
    top3: (d.top3 || []).map((c) => ({ title: c.kind === "trainer" ? `${nameOf(c.trainer_id)} 관리 필요` : c.title, detail: c.detail, amount: c.amount ?? null })),
    trainerCoaching: (d.trainerCoaching || []).map((c) => ({ trainer: nameOf(c.trainerId), msg: c.msg })),
    pipeline: { newCount: d.pipeline?.newCandidates?.length ?? 0, reCount: d.pipeline?.reCandidates?.length ?? 0, grandTotal: d.pipeline?.grandTotal ?? 0 },
    results: { summary: d.results?.summary || null, items },
    plan: d.plan ? { total: d.plan.total, ot: d.plan.ot.length, rereg: d.plan.rereg.length, reconnect: d.plan.reconnect.length } : null,
  };
}

function factsBlock(d) {
  const m = d?.month || {}, y = d?.yesterday || {}, t = d?.today || {}, w = d?.watch || {}, p = d?.pipeline || {};
  const top = Array.isArray(d?.top3) ? d.top3 : [];
  const coach = Array.isArray(d?.trainerCoaching) ? d.trainerCoaching : [];
  const rs = d?.results?.summary || null;
  const items = Array.isArray(d?.results?.items) ? d.results.items : [];
  const pl = d?.plan || null;
  const topLines = top.length ? top.map((it, i) => `  ${i + 1}) ${[it?.title, it?.detail].filter(Boolean).join(" · ")}`).join("\n") : "  (없음)";
  const coachLines = coach.length ? coach.map((c) => `  - ${c.trainer}: ${c.msg}`).join("\n") : "  (약점 신호 없음)";
  const itemLines = items.length
    ? items.map((i) => `  - ${i.trainer} · ${i.what} · ${i.result}${i.reason ? ` · 이유: ${i.reason}` : ""}${i.proposed === false ? " · 등록 제안 못 함" : ""}${i.quote ? ` · 회원의 말 "${i.quote}"` : ""}${i.amount ? ` · ${won(i.amount)}(회당 ${won(i.perSession)})` : ""}`).join("\n")
    : "  (어제 남긴 결과 없음)";
  return [
    `[어제 결과] ${rs ? `매출 ${won(rs.revenue)} · 신규 등록 ${rs.newCount} · 재등록 ${rs.reregCount} · 보류 ${rs.holdCount} · 그만 ${rs.failCount}` : "(없음)"}`,
    itemLines,
    `[어제 수업] ${y.sessions ?? 0}건·노쇼 ${y.noshows ?? 0} / [오늘 예약] ${t.bookings ?? 0}건`,
    pl ? `[오늘 예정] 수업 ${pl.total}건 · 오늘 오는 OT 회원 ${pl.ot}명(등록 기회) · 오늘 오는 재등록 타이밍 회원 ${pl.rereg}명 · 다시 연락할 회원 ${pl.reconnect}명` : "",
    `[이번 달] 매출 ${won(m.revenueNet)}${m.revenueTarget ? ` (목표 대비 ${m.progressPct ?? "—"}%)` : ""} · 신규등록 ${m.newRegs ?? 0}건`,
    `[매출 파이프라인] 신규 후보 ${p.newCount ?? 0}명 · 재등록 후보 ${p.reCount ?? 0}명 · 성사 시 합계 ${won(p.grandTotal)}(추정)`,
    `[주의] 이탈위험 ${w.churnRisk ?? 0}명 · 만료임박 ${w.expiring ?? 0}명 · 미처리 ${w.pastDue ?? 0}건`,
    `[오늘 챙길 것 top3]\n${topLines}`,
    `[트레이너 약점 신호]\n${coachLines}`,
  ].filter(Boolean).join("\n");
}

export const OWNER_PREAMBLE = `너는 피트니스 센터 대표의 운영 참모다. 주어진 숫자·약점 신호만 근거로, 대표가 오늘 뭘 할지 콕 집어준다. 없는 사실(회원 이름·구체 수치·에피소드)을 지어내지 않고, 금액은 추정이라 단정하지 않는다. 재촉·과장·감탄사·업계 은어·의료 단정을 쓰지 않는다.

★ 문체: 대표에게 보고하는 글이다. 호칭은 "대표님"(원장·관리자 아님). 모든 문장을 존댓말로 쓴다(~합니다 / ~하세요 / ~해 주세요).
반말·명령조(~해라, ~하자, ~임, ~함)를 절대 쓰지 않는다.`;

export function buildOwnerPrompt(d) {
  return `아래는 오늘 아침 우리 센터 실측 요약이다. 이 숫자·신호만 근거로 대표 브리핑을 써라.

${factsBlock(d)}

아래 JSON만 출력(코드블록·설명 금지):
{"headline":"오늘 상황·우선순위 한 문장","coaching":["실행 지시 1","실행 지시 2","..."]}
- headline: 오늘 가장 중요한 것 한 문장. 어제 결과(특히 보류·그만)와 오늘 기회(오늘 오는 OT · 재등록 타이밍)를 잇는다(예: 재등록 우선·특정 코치 코칭 필요).
- coaching: 3~5개. 각 항목은 '누가·무엇을·오늘 어떻게'가 담긴 구체 실행 지시.
  · [어제 결과]에 보류·그만·제안 못 함이 있으면 그 트레이너를 지목해, 그 이유(가격 · 생각해볼게요 · 시간 등)에 맞춘 오늘의 개인 피드백을 구체적으로(예: "박코치는 어제 2차 OT에서 가격 이유로 보류됐으니, 오늘 OT 전에 회당 단가를 생활비 비유로 바꾸는 연습을 5분 해 보세요").
  · '등록 제안 못 함'은 제안 자체를 못 한 것이라 다음 OT에서 반드시 제안하도록 짚는다.
  · [트레이너 약점 신호]가 있으면 그 코치를 지목해 오늘 할 개인 교육을 구체적으로.
  · [오늘 예정]의 등록 기회 · 재등록 기회 · 다시 연락할 회원은 오늘의 액션으로.
  · headline·coaching 전부 존댓말로 씁니다(반말·명령조 금지).
- 준 숫자를 새로 지어내거나 부풀리지 마라. 신호가 거의 없으면 담백하게 1~2개만.`;
}

export function parseOwnerReport(text) {
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

/** AI 총평 · 코칭 생성 — 성공이면 { headline, coaching }, 실패면 null(호출부가 기본 코칭으로). */
export async function generateOwnerAI(input, apiKey, onUsage = null) {
  if (!apiKey || !input) return null;
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: OWNER_AI_MODEL,
    max_tokens: 2048, // 총평 + 코칭 5개가 1024에 가까워 잘리면 JSON이 깨져 총평이 빠졌다(2026-10-06)
    system: `${OWNER_PREAMBLE}
${NO_DASH_RULE}`,
    messages: [{ role: "user", content: buildOwnerPrompt(input) }],
    thinking: { type: "between_tools" }, // Sonnet 5.5 끄기 값
  });
  if (onUsage) { try { await onUsage(OWNER_AI_MODEL, msg.usage); } catch { /* 원가 기록은 비차단 */ } }
  const textOut = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = parseOwnerReport(textOut);
  return parsed ? tidyDeep(parsed) : null;
}
