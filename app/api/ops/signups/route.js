// app/api/ops/signups/route.js — 회사 업무 사이트용 '가입 현황'(2026-10-15) · 인증 = Bearer OPS_SECRET(ops/alerts와 같음)
// -----------------------------------------------------------------------------
// 가입 = account 한 행(센터 대표 · 개인 트레이너가 가입하면 계정이 생긴다 · 센터 트레이너는 대표가 만들어 같은 계정에 들어감).
// GET ?days=60 → 숫자(오늘 · 7일 · 이번 달 · 전체 · 지금 상태별) + 최근 30일 날마다 가입 수 + 최근 N일 가입 목록.
// 목록에 나가는 것 = 센터명 또는 이름 · 이메일 가림(앞 2자) · 종류 · 상태 · 기간 · 쓰는 정도(회원 수 · 트레이너 수 · AI 사용 수)
//   + contact{email, phone}(전체 · 업무 사이트가 '연락처 보기'를 눌렀을 때만 보여 줌 · 가입 때 받은 휴대폰 = auth user_metadata.phone · 2026-10-15).
// 회원(PT 회원) 정보는 숫자만 · 이름 · 번호는 안 나간다. 시연 계정(lib/demo)은 아예 뺀다.
// 테스트 계정(회사 도메인 · 가짜 도메인 · 파일럿 · 업무 사이트가 ?hide=로 넘긴 계정 앞 8자리)은 숫자에서 빼고 목록엔 test 표시로만.
// -----------------------------------------------------------------------------
import { bearerOk } from "@/lib/bearerOk";
import { serviceClient } from "@/lib/serverCaller";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isDemoAccount } from "@/lib/demo";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400000;
const kstDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

const maskEmail = (e) => {
  const [id, dom] = String(e || "").split("@");
  return id && dom ? `${id.slice(0, 2)}${"*".repeat(Math.max(1, id.length - 2))}@${dom}` : "";
};

async function emailsById(sb, ids) {
  const want = new Set(ids);
  const out = {};
  for (let page = 1; page <= 50 && Object.keys(out).length < want.size; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("users");
    for (const u of data?.users || []) if (want.has(u.id)) out[u.id] = { email: u.email, phone: u.user_metadata?.phone || null };
    if ((data?.users || []).length < 1000) break;
  }
  return out;
}

const PILOT_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_DOMAINS = new Set(["t.com", "test.com", "a.com", "b.com", "c.com", "example.com", "onlytrainer.co.kr"]);
const testReason = (a, email, hide) => {
  if (a.id === PILOT_ID) return "파일럿";
  if (hide.has(a.id.slice(0, 8))) return "직접 뺌";
  const dom = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (FAKE_DOMAINS.has(dom) || /\.(test|invalid|local)$/.test(dom)) return "테스트 이메일";
  return null;
};

const countBy = (rows) => {
  const m = {};
  for (const r of rows || []) m[r.account_id] = (m[r.account_id] || 0) + 1;
  return m;
};

export async function GET(req) {
  const secret = process.env.OPS_SECRET;
  if (!secret) return Response.json({ error: "OPS_SECRET 미설정" }, { status: 503 });
  if (!bearerOk(req, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 키 미설정" }, { status: 503 });

  const q = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(7, Number(q.get("days")) || 60));
  const hide = new Set(String(q.get("hide") || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}$/.test(x)));
  const nowMs = Date.now();

  const [{ data: accts, error: ae }, { data: trainers, error: te }, { data: pays, error: pe }, { data: grants, error: ge }] = await Promise.all([
    fetchAllRows(() => sb.from("account").select("id, type, name, brand_name, work_mode, created_at, subscription_status, current_period_end, cancel_at_period_end, billing_plan, billing_key")),
    fetchAllRows(() => sb.from("trainer").select("id, account_id, role, active, name, created_at")),
    fetchAllRows(() => sb.from("payment").select("id, account_id, status, plan, order_id").in("status", ["DONE", "TRIAL", "CANCELED"])),
    fetchAllRows(() => sb.from("ops_alert").select("id, key, created_at, detail").eq("kind", "trial_grant")),
  ]);
  if (ae || te || pe || ge) {
    console.error("[ops/signups] 조회 실패", ae?.message, te?.message, pe?.message, ge?.message);
    return Response.json({ error: "조회 실패" }, { status: 500 });
  }

  const all = (accts || []).filter((a) => !isDemoAccount(a.id));

  const owners = {};
  const seats = {};
  for (const t of trainers || []) {
    if (t.role === "owner" && !owners[t.account_id]) owners[t.account_id] = t;
    if (t.role !== "owner" && t.active !== false) seats[t.account_id] = (seats[t.account_id] || 0) + 1;
  }
  const paid = new Set();
  const refunded = new Set();
  for (const p of pays || []) {
    if (p.status === "DONE" && ["basic", "solo", "center"].includes(p.plan)) paid.add(p.account_id);
    if (p.status === "CANCELED" && String(p.order_id || "").startsWith("refund7_")) refunded.add(p.account_id);
  }
  const granted = {};
  for (const g of grants || []) granted[String(g.key || "").replace(/^trial_/, "")] = g;

  let emails = {};
  try {
    emails = await emailsById(sb, all.map((a) => owners[a.id]?.id).filter(Boolean));
  } catch {
    console.error("[ops/signups] 이메일 조회 실패");
  }
  const testOf = Object.fromEntries(all.map((a) => [a.id, testReason(a, emails[owners[a.id]?.id]?.email, hide)]));
  const real = all.filter((a) => !testOf[a.id]);
  const recent = all.filter((a) => Date.parse(a.created_at) >= nowMs - days * DAY);
  const recentIds = recent.map((a) => a.id);

  // 쓰는 정도(최근 가입만) — 회원 수 · AI 사용 수
  let members = {}, ai = {};
  if (recentIds.length) {
    const [{ data: mrows, error: me }, { data: urows, error: ue }] = await Promise.all([
      fetchAllRows(() => sb.from("user_table").select("id, account_id").in("account_id", recentIds).eq("hidden", false)),
      fetchAllRows(() => sb.from("ai_usage").select("id, account_id").in("account_id", recentIds)),
    ]);
    if (me || ue) console.error("[ops/signups] 사용량 조회 실패", me?.message, ue?.message);
    members = countBy(mrows);
    ai = countBy(urows);
  }

  // 지금 상태: paying 결제 이용 중 · free 무료 이용 중(업무 사이트에서 열어 줌) · manual 이용 중(결제 · 무료 기록 없음 = 손으로 연 계정)
  //           before 결제 전(카드 안 넣음)
  //           readonly 끝남(30일 볼 수만) · ended 끝남 · refunded 7일 환불
  const stateOf = (a) => {
    const end = a.current_period_end ? Date.parse(a.current_period_end) : 0;
    const live = a.subscription_status === "active" && end > nowMs;
    if (live) return paid.has(a.id) ? "paying" : granted[a.id] ? "free" : "manual";
    if (refunded.has(a.id)) return "refunded";
    if (!end) return "before";
    return end + 30 * DAY > nowMs ? "readonly" : "ended";
  };

  const today = kstDay(nowMs);
  const monthStart = today.slice(0, 7);
  const totals = { today: 0, week: 0, month: 0, all: real.length, center: 0, solo: 0,
    state: { paying: 0, free: 0, manual: 0, before: 0, readonly: 0, ended: 0, refunded: 0 } };
  const daily = {};
  for (let i = 29; i >= 0; i--) daily[kstDay(nowMs - i * DAY)] = 0;
  for (const a of real) {
    const ms = Date.parse(a.created_at);
    const d = kstDay(ms);
    if (d === today) totals.today += 1;
    if (ms >= nowMs - 7 * DAY) totals.week += 1;
    if (d.startsWith(monthStart)) totals.month += 1;
    if (a.type === "center") totals.center += 1; else totals.solo += 1;
    totals.state[stateOf(a)] += 1;
    if (daily[d] != null) daily[d] += 1;
  }

  const list = recent
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
    .map((a) => {
      const o = owners[a.id];
      const g = granted[a.id];
      return {
        id: a.id.slice(0, 8),
        createdAt: a.created_at,
        type: a.type === "center" ? "center" : "solo",
        workMode: a.type === "center" ? null : a.work_mode === "freelance" ? "freelance" : "employed",
        name: a.type === "center" ? (a.name || "") : (o?.name || a.name || ""),
        brand: a.type === "center" ? null : (a.brand_name || null),
        email: maskEmail(emails[o?.id]?.email),
        contact: { email: emails[o?.id]?.email || null, phone: emails[o?.id]?.phone || null },
        state: stateOf(a),
        plan: a.billing_plan || null,
        periodEnd: a.current_period_end || null,
        canceling: !!a.cancel_at_period_end,
        card: !!a.billing_key,
        freeGranted: g ? { at: g.created_at, until: g.detail?.until || null } : null,
        trainers: seats[a.id] || 0,
        members: members[a.id] || 0,
        aiUses: ai[a.id] || 0,
        test: testOf[a.id] || null,
      };
    });

  return Response.json({
    generatedAt: new Date().toISOString(),
    days,
    totals,
    testCount: all.length - real.length,
    daily: Object.entries(daily).map(([date, n]) => ({ date, n })),
    list,
  });
}
