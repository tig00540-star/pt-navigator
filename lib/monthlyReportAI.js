// lib/monthlyReportAI.js — 월간 결산 AI(서버 전용 · 2026-10-06).
//   대표 결산: 한 줄 총평 + 트레이너별 잘한 점 · 보완할 점(대표만 봄 · 면담용) · 이번 달 해 볼 것
//   개인 계정 '내 결산': 한 줄 총평 + 잘한 점 · 보완할 점 · 이번 달 해 볼 것(내 지난달과 비교)
//   근거 = lib/monthlyReport 숫자 + 규칙 신호만. 회원 이름은 넘기지 않는다(트레이너 이름 · 숫자만).
import Anthropic from "@anthropic-ai/sdk";
import { tidyDeep, NO_DASH_RULE } from "@/lib/tidyText";

export const MONTHLY_AI_MODEL = "claude-sonnet-5-5";
const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") + "원" : "—");
const pct = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
const ymKo = (ym) => `${Number(ym.slice(5, 7))}월`;

function trainerLine(t, idx, named) {
  const who = named ? t.name || `트레이너 ${idx + 1}` : "나";
  return [
    `■ ${who}`,
    `  매출 ${won(t.revenue.total)}(지난달 ${won(t.revenue.prev)} · 신규 ${t.revenue.cntNew}건 · 재등록 ${t.revenue.cntRe}건)${t.goal ? ` · 목표 ${won(t.goal)}의 ${pct(t.goalRate)}` : ""}`,
    `  OT 진행 ${t.ot.held}건(지난달 ${t.ot.heldPrev}건) · 등록 ${t.ot.success}/${t.ot.attempted} · 재등록 ${t.rereg.success}/${t.rereg.attempted}`,
    `  PT 수업 ${t.sessions}회 · 담당 PT 회원 ${t.activePt}명 · 운동일지 작성 ${pct(t.logRate)} · 회원 확인 ${pct(t.confirmRate)}`,
    `  회원 운동한 날 합계 ${t.ounwanDays}일 · 무게 늘어난 회원 ${t.gainedMembers}명 · 2주+ 안 온 회원 ${t.churn.length}명 · 재등록 대상 ${t.expiring.length}명`,
    `  잘한 신호: ${t.signals.good.map((s) => s.text).join(" / ") || "(없음)"}`,
    `  보완 신호: ${t.signals.bad.map((s) => s.text).join(" / ") || "(없음)"}`,
  ].join("\n");
}

function centerBlock(d) {
  const c = d.center;
  return [
    `[${ymKo(d.ym)} 센터] 매출 ${won(c.revenue.net)}(지난달 ${won(c.revenue.prev)} · 신규 ${won(c.revenue.newRev)} · 재등록 ${won(c.revenue.reRev)} · 환불 ${won(c.revenue.refund)})${c.goal ? ` · 목표의 ${pct(c.goalRate)}` : ""}`,
    `  OT 진행 ${c.otHeld}건(지난달 ${c.otHeldPrev}건) · 클로징률 ${pct(c.ot.rate)}(${c.ot.success}/${c.ot.attempted}) · 재등록률 ${pct(c.rereg.rate)}(${c.rereg.success}/${c.rereg.attempted})`,
    `  PT 수업 ${c.sessions}회 · 2주+ 안 온 회원 ${c.churn}명 · 재등록 대상 ${c.expiring}명${c.ledger ? ` · 장부 순이익 ${won(c.ledger.net)}` : ""}`,
  ].join("\n");
}

const STYLE = `★ 문체: 존댓말(~해요 · ~하세요). 반말 · 명령조 · 감탄사 · 과장 금지. 숫자는 주어진 것만 쓰고 새로 지어내지 않는다. 회원 이름 · 의료 단정 금지.
★ 표본이 작아 비율이 의미 없으면(OT 결과 5건 미만 등) 비율로 평가하지 말고 '양을 늘리자'로 말한다.
${NO_DASH_RULE}`;

function parseJson(text) {
  if (typeof text !== "string") return null;
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
const strs = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, n) : []);

async function call(apiKey, system, prompt, maxTokens, onUsage = null) {
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: MONTHLY_AI_MODEL, max_tokens: maxTokens, system, thinking: { type: "between_tools" },
    messages: [{ role: "user", content: prompt }],
  });
  if (onUsage) { try { await onUsage(MONTHLY_AI_MODEL, msg.usage); } catch { /* 원가 기록은 비차단 */ } }
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

/** 대표 결산 → { headline, trainers: [{ trainer_id, praise[], improve[], action }] } | null */
export async function generateOwnerMonthlyAI(d, apiKey, onUsage = null) {
  if (!apiKey || !d?.trainers?.length) return null;
  const list = d.trainers.filter((t) => t.sessions + t.ot.held + t.revenue.total + t.activePt > 0);
  if (!list.length) return null;
  const prompt = `아래는 우리 센터 ${ymKo(d.ym)} 결산 숫자와 규칙으로 뽑은 신호다. 대표가 월초 트레이너 면담에 쓸 자료를 만든다.

${centerBlock(d)}

${list.map((t, i) => trainerLine(t, i, true)).join("\n\n")}

아래 JSON만 출력(코드블록 · 설명 금지):
{"headline":"지난달 센터 한 문장(잘된 것 하나 + 이번 달 챙길 것 하나)","trainers":[{"name":"트레이너 이름 그대로","praise":["잘한 점 1~2개"],"improve":["보완할 점 1~2개"],"action":"이번 달 해 볼 것 1개(구체적 · 오늘부터 할 수 있는 것)"}]}
- 트레이너는 위 목록 순서 그대로 모두. praise는 '잘한 신호'와 숫자에서, improve는 '보완 신호'에서. 신호가 없으면 숫자를 보고 담백하게 1개.
- OT 진행이 적은 트레이너는 improve에 OT 양을 먼저 짚는다(다른 트레이너 대비 몇 건인지).
- 각 문장 60자 안팎.`;
  const text = await call(apiKey, `너는 피트니스 센터 대표의 운영 참모다. 호칭은 "대표님". ${STYLE}`, prompt, 4000, onUsage);
  const j = parseJson(text);
  if (!j) return null;
  const byName = new Map(list.map((t) => [t.name, t.trainer_id]));
  const trainers = (Array.isArray(j.trainers) ? j.trainers : []).map((x, i) => ({
    trainer_id: byName.get(x?.name) || list[i]?.trainer_id || null,
    praise: strs(x?.praise, 2), improve: strs(x?.improve, 2), action: typeof x?.action === "string" ? x.action.trim() : "",
  })).filter((x) => x.trainer_id);
  const headline = typeof j.headline === "string" ? j.headline.trim() : "";
  if (!headline && !trainers.length) return null;
  return tidyDeep({ headline, trainers });
}

/** 개인 계정 '내 결산' → { headline, praise[], improve[], action } | null */
export async function generateSoloMonthlyAI(d, apiKey, onUsage = null) {
  const t = d?.trainers?.[0];
  if (!apiKey || !t) return null;
  const c = d.center;
  const biz = c.ledger ? `장부: PT 외 매출 ${won(c.ledger.income)} · 지출 ${won(c.ledger.expense)} · 남은 돈 ${won(c.ledger.net)}` : c.received != null ? `받은 금액 ${won(c.received)}` : "";
  const prompt = `아래는 혼자 일하는 트레이너의 ${ymKo(d.ym)} 결산 숫자와 규칙 신호다. 본인이 읽고 이번 달을 계획하는 자료다(비교 대상은 본인의 지난달).

${trainerLine(t, 0, false)}
${biz}

아래 JSON만 출력(코드블록 · 설명 금지):
{"headline":"지난달 한 문장(잘된 것 하나 + 이번 달 챙길 것 하나)","praise":["잘한 점 1~2개"],"improve":["보완할 점 1~2개"],"action":"이번 달 해 볼 것 1개(구체적)"}
- 호칭 없이 '~했어요 · ~해 보세요'로. 각 문장 60자 안팎.`;
  const text = await call(apiKey, `너는 1인 트레이너의 사업 코치다. ${STYLE}`, prompt, 1500, onUsage);
  const j = parseJson(text);
  if (!j) return null;
  const out = { headline: typeof j.headline === "string" ? j.headline.trim() : "", praise: strs(j.praise, 2), improve: strs(j.improve, 2), action: typeof j.action === "string" ? j.action.trim() : "" };
  if (!out.headline && !out.praise.length) return null;
  return tidyDeep(out);
}
