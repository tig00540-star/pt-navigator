// app/api/cron/sync-notion/route.js
// -----------------------------------------------------------------------------
// Supabase `account` → 노션 '앱 고객 관리' 단방향 동기화(주기적 · Vercel Cron).
// - upsert 키: 노션 '계정ID' 속성 = Supabase account.id (중복 생성 방지).
// - 앱이 진실인 필드만 덮어씀: 고객명·단계·플랜·규모·가입일·만료일·구독상태·계정ID.
// - 사람이 노션에서 직접 쓰는 필드는 절대 안 건드림: 다음 액션 · 기한 · 상태 · 연락처.
// - 해지/이탈 계정도 노션에서 삭제하지 않음(이력 보존). 단계만 갱신.
// 인증: Vercel Cron이 Authorization: Bearer <CRON_SECRET> 을 실어 보냄(수동 호출도 동일).
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import {
  notionReady,
  fetchNotionRowsByAccount,
  createNotionPage,
  updateNotionPage,
} from "@/lib/notion";

export const runtime = "nodejs";
export const maxDuration = 60; // Hobby 플랜이 60초 미지원이면 10으로 낮추세요.

const DB_ID = process.env.NOTION_CUSTOMER_DB_ID;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 시크릿 미설정 = fail-closed
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

// 구독 필드 → 노션 '단계'. ⚠️ 매핑 규칙은 여기 한 곳에서만 조정하세요.
// 결제 웹훅이 아직 수동인 현재 기준(문서 PRODUCT.md). 웹훅 붙이면 hasPaid 정확도가 올라갑니다.
function deriveStage(acc, hasPaid, now) {
  const end = acc.current_period_end ? new Date(acc.current_period_end).getTime() : null;
  const active = acc.subscription_status === "active" && (end === null || end > now);
  if (!acc.subscription_status || acc.subscription_status === "inactive") return "리드";
  if (active && acc.cancel_at_period_end) return "이탈위험";
  if (active && !hasPaid) {
    // 무료체험 중 — 만료 3일 이내면 전환 대상으로 승격
    if (end !== null && end - now < 3 * 86400000) return "유료전환대상";
    return "무료체험";
  }
  if (active && hasPaid) return "활성";
  return "해지"; // 만료 또는 비활성
}

function planLabel(billingPlan) {
  if (billingPlan === "solo") return "솔로";
  if (billingPlan === "center") return "센터";
  return "체험";
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "supabase 키 미설정" }, { status: 503 });
  if (!notionReady() || !DB_ID) return Response.json({ error: "notion 키/DB id 미설정" }, { status: 503 });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) 계정 + 트레이너(좌석수·원장명) + 결제(유료 여부)
  const [{ data: accounts, error: ae }, { data: trainers }, { data: payments }] = await Promise.all([
    sb
      .from("account")
      .select(
        "id, name, type, subscription_status, plan, billing_plan, current_period_end, cancel_at_period_end, created_at"
      ),
    sb.from("trainer").select("account_id, role, name, active"),
    sb.from("payment").select("account_id, amount, status"),
  ]);
  if (ae) return Response.json({ error: `account 조회 실패: ${ae.message}` }, { status: 500 });

  const seatCount = new Map(); // account_id -> 활성 트레이너 수
  const ownerName = new Map(); // account_id -> 원장 이름(계정명 폴백)
  for (const t of trainers || []) {
    if (t.active) seatCount.set(t.account_id, (seatCount.get(t.account_id) || 0) + 1);
    if (t.role === "owner" && t.name) ownerName.set(t.account_id, t.name);
  }

  // 실결제 존재 여부(무료체험 vs 유료 구분). 성공 상태 + amount>0.
  const PAID_OK = new Set(["DONE", "PAID", "APPROVED", "SUCCESS", "COMPLETED"]);
  const hasPaid = new Set();
  for (const p of payments || []) {
    if ((p.amount || 0) > 0 && PAID_OK.has(String(p.status || "").toUpperCase())) {
      hasPaid.add(p.account_id);
    }
  }

  // 2) 노션 기존 행(계정ID → pageId)
  let existing;
  try {
    existing = await fetchNotionRowsByAccount(DB_ID);
  } catch (e) {
    return Response.json({ error: `notion 조회 실패: ${e.message}` }, { status: 502 });
  }

  // 3) upsert
  const now = Date.now();
  let created = 0,
    updated = 0,
    failed = 0;
  const errors = [];

  for (const acc of accounts || []) {
    const title = acc.name || ownerName.get(acc.id) || "(이름없음)";
    const stage = deriveStage(acc, hasPaid.has(acc.id), now);
    const size = seatCount.get(acc.id) ?? (acc.type === "center" ? null : 1);

    // 앱이 진실인 필드만. (다음 액션·기한·상태·연락처는 사람 몫이라 제외)
    const props = {
      "고객명 (센터/트레이너)": { title: [{ text: { content: title } }] },
      "계정ID": { rich_text: [{ text: { content: acc.id } }] },
      "단계": { select: { name: stage } },
      "플랜": { select: { name: planLabel(acc.billing_plan) } },
      "구독상태": { rich_text: [{ text: { content: acc.subscription_status || "-" } }] },
    };
    if (size != null) props["규모(인원)"] = { number: size };
    if (acc.created_at) props["가입일"] = { date: { start: String(acc.created_at).slice(0, 10) } };
    if (acc.current_period_end)
      props["만료일"] = { date: { start: String(acc.current_period_end).slice(0, 10) } };

    try {
      const found = existing.get(acc.id);
      if (found) {
        await updateNotionPage(found.pageId, props);
        updated++;
      } else {
        await createNotionPage(DB_ID, props);
        created++;
      }
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(`${acc.id}: ${e.message}`);
    }
  }

  return Response.json({
    ok: true,
    total: (accounts || []).length,
    created,
    updated,
    failed,
    errors,
  });
}
