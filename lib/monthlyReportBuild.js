// lib/monthlyReportBuild.js — 계정 하나의 월간 결산을 만들어 monthly_report에 저장(서버 전용 · service_role · 2026-10-06).
//   app/api/cron/monthly-report(매월 1일 아침)와 scripts/demo/monthly-now.mjs(미리 보기 · 데모)가 같이 쓴다.
//   센터: 대표 결산 1행(kind owner · AI) + 트레이너마다 성적표(kind trainer · AI 없음 · '보완할 점'은 빼고 저장)
//   개인: '내 결산' 1행(kind solo · AI)
import { ledgerAsContracts } from "@/lib/movedOut";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchByIds } from "@/lib/fetchByIds";
import { monthlyReportData, shiftYm } from "@/lib/monthlyReport";
import { generateOwnerMonthlyAI, generateSoloMonthlyAI } from "@/lib/monthlyReportAI";

const must = (label, r) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data || []; };

async function save(sb, row) {
  // 부분 고유 인덱스라 upsert(on_conflict)를 못 쓴다 → 있으면 고치고(열어 본 시각 유지) 없으면 넣는다.
  let q = sb.from("monthly_report").select("id").eq("account_id", row.account_id).eq("kind", row.kind).eq("ym", row.ym);
  q = row.trainer_id ? q.eq("trainer_id", row.trainer_id) : q.is("trainer_id", null);
  const { data: ex, error } = await q.maybeSingle();
  if (error) throw new Error(`monthly_report 읽기: ${error.message}`);
  const res = ex
    ? await sb.from("monthly_report").update({ data: row.data, ai: row.ai, generated_at: row.generated_at }).eq("id", ex.id).select("id")
    : await sb.from("monthly_report").insert(row).select("id");
  if (res.error) throw new Error(`monthly_report 저장: ${res.error.message}`);
  return res.data?.[0]?.id;
}

/**
 * @param sb service_role 클라
 * @param account { id, type, plan, subscription_status, current_period_end }
 * @param opts { ym(결산 달), nowMs, apiKey, noAI }
 * @returns { account, ym, kind, rows, ai, notify: [{trainerIds, title, body, url}] }
 */
export async function buildMonthlyForAccount(sb, account, { ym, nowMs = Date.now(), apiKey = null, noAI = false } = {}) {
  const aid = account.id;
  const solo = account.type === "solo";
  const nowISO = new Date(nowMs).toISOString();
  const from = `${shiftYm(ym, -13)}-01`;
  const [mR, oR, cR, lR, gR, tR, eR, inR, exR, rnR, psR] = await Promise.all([
    sb.from("user_table").select("*").eq("account_id", aid),
    fetchAllRows(() => sb.from("ot_log").select("*").eq("account_id", aid)),
    fetchAllRows(() => sb.from("session_log").select("*").eq("account_id", aid)),
    fetchAllRows(() => sb.from("daily_workout_log").select("*").eq("account_id", aid)),
    sb.from("trainer_goal").select("*").eq("account_id", aid),
    sb.from("trainer").select("id, name, role, active").eq("account_id", aid),
    sb.from("member_event").select("*").eq("account_id", aid),
    fetchAllRows(() => sb.from("income").select("*").eq("account_id", aid).gte("earned_on", from)),
    fetchAllRows(() => sb.from("expense").select("*").eq("account_id", aid).gte("spent_on", from)),
    sb.from("payroll_run").select("*").eq("account_id", aid).eq("ym", ym),
    sb.from("pay_scheme").select("*").eq("account_id", aid),
  ]);
  const members = must("user_table", mR), logs = must("daily_workout_log", lR), events = must("member_event", eR);
  const ids = members.map((m) => m.id);
  const monthLogIds = logs.filter((l) => String(l.session_at || "").length && new Date(Date.parse(l.session_at) + 9 * 3600000).toISOString().slice(0, 7) === ym).map((l) => l.id);
  const monthStart = `${ym}-01`, monthEnd = `${shiftYm(ym, 1)}-01`;
  const [cfR, scR, caR, jR] = await Promise.all([
    fetchByIds(sb, "workout_log_confirmation", "log_id, result", "log_id", monthLogIds),
    fetchByIds(sb, "schedule_check", "user_id, on_date", "user_id", ids, (q) => q.eq("kind", "personal").gte("on_date", monthStart).lt("on_date", monthEnd)),
    fetchByIds(sb, "cardio_log", "user_id, performed_on", "user_id", ids, (q) => q.gte("performed_on", monthStart).lt("performed_on", monthEnd)),
    // member_event_join은 id 열이 없어(복합 키) fetchAllRows의 id 정렬을 못 쓴다 · 이벤트 수가 적어 한 번에
    events.length ? sb.from("member_event_join").select("event_id, member_id, joined_at, rewarded_at").in("event_id", events.map((e) => e.id)).limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);
  const selfLogs = [
    ...must("schedule_check", scR).map((s) => ({ user_id: s.user_id, date: s.on_date })),
    ...must("cardio_log", caR).map((c) => ({ user_id: c.user_id, date: c.performed_on })),
  ];
  const trainers = must("trainer", tR);
  // 독립한 트레이너를 따라 옮겨 간 회원의 계약 사본 — 센터 매출 숫자가 줄지 않게(표가 없으면 빈 배열 · 2026-10-07)
  const { data: moved } = solo ? { data: [] } : await sb.from("moved_out_ledger").select("*").eq("account_id", aid).limit(5000);
  const d = monthlyReportData({
    members, trainers: solo ? trainers.filter((t) => t.role === "owner") : trainers,
    otRows: must("ot_log", oR), contracts: [...must("session_log", cR), ...ledgerAsContracts(moved)], logs, goals: must("trainer_goal", gR),
    confirms: must("workout_log_confirmation", cfR), selfLogs, events, joins: must("member_event_join", jR),
    incomes: must("income", inR), expenses: must("expense", exR), runs: must("payroll_run", rnR), schemes: must("pay_scheme", psR),
    ym, nowISO, solo,
  });

  // 그달 활동이 하나도 없으면(수업 · OT · 매출 · 장부 · 담당 회원 0) 결산을 만들지 않는다 — 빈 결산 · 빈 AI 칭찬 방지(2026-10-06)
  const c0 = d.center;
  if (!(c0.sessions + c0.otHeld + Math.abs(c0.revenue.net) + (c0.ledger ? c0.ledger.income + c0.ledger.expense : 0) + d.trainers.reduce((a, t) => a + t.activePt, 0))) {
    return { account: aid, ym, kind: solo ? "solo" : "center", rows: 0, ai: false, notify: [], empty: true };
  }

  const premium = account.plan === "premium" && account.subscription_status === "active"
    && (!account.current_period_end || Date.parse(account.current_period_end) > nowMs);
  let ai = null;
  if (premium && apiKey && !noAI) {
    try { ai = solo ? await generateSoloMonthlyAI(d, apiKey) : await generateOwnerMonthlyAI(d, apiKey); }
    catch (e) { console.error("[monthly-report] AI 실패", aid, e?.message || e); }
  }
  const aiCol = ai ? { ...ai, state: "ready" } : { state: premium ? (noAI ? "skipped" : "failed") : "premium" };
  const mon = Number(ym.slice(5, 7));
  const notify = [];
  let rows = 0;

  if (solo) {
    const me = d.trainers[0];
    if (me) {
      await save(sb, { account_id: aid, trainer_id: me.trainer_id, kind: "solo", ym, data: d, ai: aiCol, generated_at: nowISO });
      rows++;
      notify.push({ trainerIds: [me.trainer_id], title: `${mon}월 결산이 나왔어요`, body: "지난달 숫자와 이번 달 추천 목표를 확인해 보세요", url: "/stats" });
    }
  } else {
    await save(sb, { account_id: aid, trainer_id: null, kind: "owner", ym, data: d, ai: aiCol, generated_at: nowISO });
    rows++;
    const owners = trainers.filter((t) => t.role === "owner" && t.active !== false).map((t) => t.id);
    notify.push({ trainerIds: owners, title: `${mon}월 결산이 준비됐어요`, body: "트레이너별 잘한 점 · 보완할 점과 이번 달 추천 목표를 확인해 보세요", url: "/admin?tab=monthly" });
    for (const t of d.trainers) {
      // 담당 회원도 활동도 없는 사람(회원 없는 대표 등)은 성적표를 만들지 않는다
      if (!(t.activePt + t.ot.pipeline + t.sessions + t.ot.held + t.revenue.total + t.events.length)) continue;
      const mine = { ...t, signals: { good: t.signals.good } };   // 보완할 점은 대표만(면담용)
      await save(sb, { account_id: aid, trainer_id: t.trainer_id, kind: "trainer", ym,
        data: { ym: d.ym, prev: d.prev, next: d.next, generatedFor: d.generatedFor, solo: false, trainer: mine }, ai: null, generated_at: nowISO });
      rows++;
      notify.push({ trainerIds: [t.trainer_id], title: `${mon}월 성적표가 나왔어요`, body: "지난달 내 숫자와 이번 달 추천 목표를 확인해 보세요", url: "/stats" });
    }
  }
  return { account: aid, ym, kind: solo ? "solo" : "center", rows, ai: Boolean(ai), notify };
}
