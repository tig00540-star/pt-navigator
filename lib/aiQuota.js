// lib/aiQuota.js — 서버 전용(라우트에서만 import). AI 월 한도 · 사용 기록(2026-10-07 요금제 개편).
//   AI를 부르기 전 reserveAi로 자리를 잡고(남은 수 0이면 402), 끝나면 finishAi로 토큰 · 원가를 남긴다.
//   세는 규칙 · 한도 숫자는 DB(ai_reserve · ai_quota_for · docs/migrations/2026-10-07-pricing.sql) 한 곳.
//   ⚠️ 서비스 키가 없거나 SQL을 아직 안 돌렸으면 막지 않는다(기록만 건너뜀 · 콘솔에 남김) — 설정 실수로 AI 전체가 멈추지 않게.
import { createClient } from "@supabase/supabase-js";

// $ / 100만 토큰 [입력, 출력, 캐시 읽기] — Claude API 공시가(2026-09) · 바뀌면 여기만.
const PRICE = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-haiku-4-5": [1, 5, 0.1],
};

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function costOf(model, usage) {
  const p = PRICE[model];
  if (!p || !usage) return null;
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25;
  const cache = usage.cache_read_input_tokens || 0;
  return (inTok * p[0] + (usage.output_tokens || 0) * p[1] + cache * p[2]) / 1e6;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 호출자(트레이너)의 계정 · AI 자리 잡기. 반환: { ok, id, counted, ... } | { ok:false, code:'quota'|'daily_cap'|'forbidden', ... }
 *  memberId가 있으면 호출자 계정의 회원인지 서버가 확인한다(2026-10-08 · 남의 회원 번호로 한도 우회 막기). */
export async function reserveAi(sb, { userId, kind, unitKey, memberId = null }) {
  if (!sb || !userId) return { ok: true, id: null, skipped: true };
  const { data: t } = await sb.from("trainer").select("account_id").eq("id", userId).maybeSingle();
  if (!t?.account_id) return { ok: true, id: null, skipped: true };
  const mid = typeof memberId === "string" && UUID_RE.test(memberId) ? memberId : null;
  if (typeof memberId === "string" && memberId && !mid) return { ok: false, code: "forbidden" };   // 회원 번호 모양이 아님
  if (mid) {
    const { data: m } = await sb.from("user_table").select("account_id").eq("id", mid).maybeSingle();
    if (!m || m.account_id !== t.account_id) return { ok: false, code: "forbidden" };
  }
  const { data, error } = await sb.rpc("ai_reserve", {
    p_account: t.account_id, p_trainer: userId, p_kind: kind, p_unit_key: unitKey, p_member: mid,
  });
  if (error) { console.error("[aiQuota] 자리 잡기 실패(막지 않음):", error.message); return { ok: true, id: null, skipped: true }; }
  return { ...(data || { ok: true }), accountId: t.account_id };
}

export async function finishAi(sb, id, { ok, model = null, usage = null, extraUsd = 0 } = {}) {
  if (!sb || !id) return;
  const c = costOf(model, usage);
  const { error } = await sb.rpc("ai_finish", {
    p_id: id, p_ok: Boolean(ok), p_model: model,
    p_in: usage?.input_tokens ?? null, p_out: usage?.output_tokens ?? null, p_cache: usage?.cache_read_input_tokens ?? null,
    p_cost: c == null && !extraUsd ? null : Number(((c || 0) + (extraUsd || 0)).toFixed(5)),
  });
  if (error) console.error("[aiQuota] 기록 실패:", error.message);
}

/** 이 회원을 이번 달에 '준비'(OT · 재등록)로 센 적이 있는지 — 베이직 세일즈북 허용 판단 */
export async function preparedThisMonth(sb, accountId, memberId) {
  if (!sb || !accountId || !memberId) return false;
  const { data } = await sb.rpc("ai_quota_for", { p_account: accountId });
  const ym = data?.ym;
  if (!ym) return false;
  const { count } = await sb.from("ai_usage").select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("ym", ym).eq("target_member", memberId).eq("counted", true).in("kind", ["ot", "rereg"]);
  return (count || 0) > 0;
}

export async function tierOf(sb, accountId) {
  if (!sb || !accountId) return null;
  const { data } = await sb.rpc("ai_quota_for", { p_account: accountId });
  return data?.tier || null;
}

const LABEL = { voice: "음성일지", ot: "OT 대본", rereg: "재등록 대본", prep: "OT · 재등록 대본", inbody: "인바디 분석", roadmap: "로드맵 초안" };

/** 한도 초과 응답(402) — 화면은 code 'quota'를 보고 잠금 카드를 띄운다. */
export function quotaResponse(r) {
  if (r.code === "forbidden") return Response.json({ error: "이 회원의 정보를 찾지 못했어요. 새로고침한 뒤 다시 시도해 주세요.", code: "forbidden" }, { status: 403 });
  if (r.code === "daily_cap") return Response.json({ error: "오늘은 이 기능을 많이 써서 잠시 쉬어요. 내일 다시 시도해 주세요.", code: "daily_cap" }, { status: 429 });
  if (r.code === "no_account") return Response.json({ error: "계정 정보를 찾지 못했어요. 다시 로그인해 주세요.", code: "no_account" }, { status: 403 });
  const label = LABEL[r.group] || "AI";
  const msg = r.tier === "basic"
    ? `이번 달 ${label} 무료 ${r.limit ?? 3}번을 다 썼어요. 프로에서 계속 쓸 수 있어요.`
    : `이번 달 ${label} ${r.limit ?? ""}번을 다 썼어요. 추가 팩으로 바로 이어 쓸 수 있어요.`;
  return Response.json({ error: msg, code: "quota", group: r.group, tier: r.tier }, { status: 402 });
}

/** 세지 않는 AI(대표 보고서 · 월간 결산 · 장비 큐) 원가만 기록 — 계정을 이미 아는 서버 작업용 */
export async function logUsage(sb, { accountId, trainerId = null, kind, model, usage }) {
  if (!sb || !accountId || !usage) return;
  const ym = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
  const c = costOf(model, usage);
  const { error } = await sb.from("ai_usage").insert({
    account_id: accountId, trainer_id: trainerId, kind, unit_key: `${kind}:${crypto.randomUUID()}`, counted: false, ok: true, ym, model,
    input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null, cache_read_tokens: usage.cache_read_input_tokens ?? null,
    cost_usd: c == null ? null : Number(c.toFixed(5)),
  });
  if (error) console.error("[aiQuota] 원가 기록 실패:", error.message);
}
