// app/api/cron/weekly-report/route.js
// -----------------------------------------------------------------------------
// 대수님(운영자)용 주간 사업 KPI 리포트 — 매주 1회 Vercel Cron.
// Supabase 전체(모든 센터)를 읽어 지표 계산 → 노션 '주간 사업 지표' DB에 한 줄 append.
// 지표는 앱의 순수 함수(lib/memberStatus)를 그대로 재사용 → admin 대시보드와 정의 일치.
// 인증: Authorization: Bearer <CRON_SECRET>.
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { createNotionPage } from "@/lib/notion";
import { PLANS } from "@/lib/plans";
import {
  otFunnel,
  reregisterStats,
  revenueInMonth,
  logWriteRateByTrainer,
  churnRiskMembers,
  expiringMembers,
} from "@/lib/memberStatus";

export const runtime = "nodejs";
export const maxDuration = 60;

const METRICS_DB_ID = process.env.NOTION_METRICS_DB_ID;

function authorized(req) {
  const s = process.env.CRON_SECRET;
  return Boolean(s) && (req.headers.get("authorization") || "") === `Bearer ${s}`;
}

const kstShift = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString();
const kstYmNow = (ms) => kstShift(ms).slice(0, 7); // YYYY-MM (KST)
const kstDateNow = (ms) => kstShift(ms).slice(0, 10); // YYYY-MM-DD (KST)
const pct = (x) => (x == null ? 0 : Math.round(x * 100));

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "supabase 키 미설정" }, { status: 503 });
  if (!process.env.NOTION_TOKEN || !METRICS_DB_ID)
    return Response.json({ error: "notion 키/DB id 미설정" }, { status: 503 });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 전체 로드(계정 필터 없음 = SaaS 전체 관점). 큰 표는 fetchAllRows로 1000행 잘림 방지.
  const [membersR, otR, contractsR, logsR, accountsR] = await Promise.all([
    sb.from("user_table").select("*"),
    sb.from("ot_log").select("*"),
    fetchAllRows(() => sb.from("session_log").select("*")),
    fetchAllRows(() => sb.from("daily_workout_log").select("*")),
    sb.from("account").select("id, type, subscription_status, current_period_end"),
  ]);
  const firstErr = membersR.error || otR.error || contractsR.error || logsR.error || accountsR.error;
  if (firstErr) return Response.json({ error: `조회 실패: ${firstErr.message}` }, { status: 500 });

  const membersAll = membersR.data || [];
  const otRows = otR.data || [];
  const contracts = contractsR.data || [];
  const logs = logsR.data || [];
  const accounts = accountsR.data || [];

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const ym = kstYmNow(now);

  // 환불·소프트삭제(hidden) 제외 — admin과 동일 규율.
  const visible = membersAll.filter((m) => m && !m.hidden);
  const memberTrainer = new Map(visible.map((m) => [m.id, m.trainer_id ?? "unknown"]));

  // 전환율(OT→PT)
  const funnel = otFunnel(visible, otRows);
  const convRate = funnel.intake ? Math.round((funnel.confirmed / funnel.intake) * 100) : 0;

  // 재등록률
  const rr = reregisterStats(contracts);
  const reRate = pct(rr.rate);

  // 앱이 만든 가치(GMV) — 센터들 이번달 PT 계약 매출 합
  const gmv = Math.round(revenueInMonth(contracts, ym));

  // 수업일지 작성률(전체 평균)
  const lw = logWriteRateByTrainer(logs, memberTrainer, ym);
  let written = 0, total = 0;
  for (const c of lw.values()) { written += c.written; total += c.total; }
  const writeRate = total ? Math.round((written / total) * 100) : 0;

  // 최근 7일 활성 트레이너(비보이드·비노쇼 수업 작성 기준)
  const weekAgo = now - 7 * 86400000;
  const activeTrainers = new Set();
  for (const l of logs) {
    if (!l || l.voided || l.source === "noshow") continue;
    const at = l.session_at ?? l.created_at;
    if (!at) continue;
    if (Date.parse(at) >= weekAgo) {
      const tid = memberTrainer.get(l.user_id);
      if (tid && tid !== "unknown") activeTrainers.add(tid);
    }
  }

  // 이탈위험·만료임박(전체 센터 합)
  const churn = churnRiskMembers(visible, contracts, logs, { nowISO }).length;
  const expiring = expiringMembers(visible, contracts, logs, { nowISO }).length;

  // 구독 현황 + MRR 추정(활성 구독의 좌석 플랜 금액 합)
  let activeSub = 0, trial = 0, convTarget = 0, churned = 0, mrr = 0;
  for (const a of accounts) {
    const end = a.current_period_end ? Date.parse(a.current_period_end) : null;
    const active = a.subscription_status === "active" && (end === null || end > now);
    if (active) {
      activeSub += 1;
      mrr += PLANS[a.type]?.amount ?? 0;
      if (end !== null && end - now < 3 * 86400000) convTarget += 1;
      else trial += 1;
    } else if (a.subscription_status && a.subscription_status !== "inactive") {
      churned += 1;
    }
  }

  const summary = {
    "전환율(%)": convRate,
    OT유입: funnel.intake,
    PT전환: funnel.confirmed,
    활성구독: activeSub,
    무료체험: trial,
    유료전환대상: convTarget,
    해지: churned,
    MRR추정: mrr,
    활성트레이너7d: activeTrainers.size,
    "일지작성률(%)": writeRate,
    GMV이번달: gmv,
    "재등록률(%)": reRate,
    이탈위험: churn,
    만료임박: expiring,
  };

  const props = {
    "주차": { title: [{ text: { content: `${kstDateNow(now)} 주간` } }] },
    "날짜": { date: { start: kstDateNow(now) } },
  };
  for (const [k, v] of Object.entries(summary)) props[k] = { number: v };

  try {
    await createNotionPage(METRICS_DB_ID, props);
  } catch (e) {
    return Response.json({ error: `notion 기록 실패: ${e.message}` }, { status: 502 });
  }

  return Response.json({ ok: true, date: kstDateNow(now), ...summary });
}
