// lib/monthlyReport.js — 월간 결산 숫자(2026-10-06 · 순수 함수 · 서버 예약 작업과 화면 미리 보기가 같이 쓴다).
// -----------------------------------------------------------------------------
// 대표 결산(센터 + 트레이너별 카드) · 트레이너 성적표 · 개인 계정 '내 결산'의 숫자를 한 번에 만든다.
//   · 지표 정의는 lib/memberStatus와 같다(매출 = 계약 시작월 · 환불 = 처리월 · 진행 수업 = voided/노쇼 제외 · OT = otHeld).
//   · 비율(등록률 · 재등록률)은 그달에 결과를 남긴 것만(closing_recorded_at · reg_recorded_at · 없으면 행 생성 시각).
//   · 표본이 작으면 비율로 평가하지 않는다 → OT 양이 적다는 신호로(대표 결정 2026-10-06).
//   · 회원 이름은 data에만(같은 센터 화면용) · AI 입력에는 넣지 않는다(lib/monthlyReportAI).
// -----------------------------------------------------------------------------
import {
  viewFor, revenueByTrainer, revenueCompositionInMonth, otSessionsThisMonthByTrainer,
  sessionsThisMonthByTrainer, logWriteRateByTrainer, churnRiskMembers, expiringMembers,
  reregisterStatsByTrainer, reregisterStats, avgNewAmount, avgReregisterAmount, otFunnel,
  resolveScheme, payForScheme, sessionCountByTrainer, sessionPriceSumByTrainer,
} from "@/lib/memberStatus";

const kstYm = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : new Date(t + 9 * 3600000).toISOString().slice(0, 7); };
const kstYmd = (iso) => { const t = Date.parse(iso || ""); return Number.isNaN(t) ? null : new Date(t + 9 * 3600000).toISOString().slice(0, 10); };
export function shiftYm(ym, d) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
/** 결산할 달 = 지금(KST) 기준 지난달 */
export function lastMonthYm(nowMs = Date.now()) { return shiftYm(new Date(nowMs + 9 * 3600000).toISOString().slice(0, 7), -1); }

const pct = (r) => (r == null ? null : Math.round(r * 100));
const round100k = (n) => Math.round(n / 100000) * 100000;

// OT 결과(그달에 남긴 것) — 회원 기준 dedupe(하나라도 등록이면 등록)
function otResultsInMonth(otRows, mt, ym) {
  const byMember = new Map();
  for (const r of otRows) {
    if (!r || r.user_id == null) continue;
    const res = r.closing_result;
    if (res !== "success" && res !== "hold" && res !== "fail") continue;
    if (kstYm(r.closing_recorded_at || r.created_at) !== ym) continue;
    const s = byMember.get(r.user_id) || new Set();
    s.add(res);
    byMember.set(r.user_id, s);
  }
  const map = new Map();
  for (const [uid, set] of byMember) {
    const tid = mt.get(uid) ?? "unknown";
    const c = map.get(tid) || { attempted: 0, success: 0 };
    c.attempted += 1;
    if (set.has("success")) c.success += 1;
    map.set(tid, c);
  }
  for (const c of map.values()) c.rate = c.attempted ? c.success / c.attempted : null;
  return map;
}

// 그달 운동 기록이 있는 날(오운완과 같은 규칙: PT 수업 + 개인운동 + 유산소) — 회원별 날짜 Set
function ounwanDaysByMember(logs, selfLogs, ym) {
  const m = new Map();
  const add = (uid, ymd) => {
    if (!uid || !ymd || ymd.slice(0, 7) !== ym) return;
    const s = m.get(uid) || new Set();
    s.add(ymd);
    m.set(uid, s);
  };
  for (const l of logs) if (l && !l.voided && l.source !== "noshow") add(l.user_id, kstYmd(l.session_at || l.created_at));
  for (const s of selfLogs) add(s.user_id, s.date);
  return m;
}

// 그달에 어떤 종목이든 전보다 무거운 무게를 든 회원
function gainedMembers(logs, ym) {
  const before = new Map(), during = new Map();   // uid → Map(종목 → 최고 kg)
  for (const l of logs) {
    if (!l || l.voided || l.source === "noshow" || !Array.isArray(l.sets_structured)) continue;
    const lym = kstYm(l.session_at || l.created_at);
    if (!lym || lym > ym) continue;
    const bucket = lym === ym ? during : before;
    const mm = bucket.get(l.user_id) || new Map();
    for (const e of l.sets_structured) {
      if (!e?.exercise || !Array.isArray(e.sets)) continue;
      const top = Math.max(0, ...e.sets.map((s) => Number(s?.weight) || 0));
      if (top > (mm.get(e.exercise) || 0)) mm.set(e.exercise, top);
    }
    bucket.set(l.user_id, mm);
  }
  const out = new Set();
  for (const [uid, mm] of during) {
    const b = before.get(uid);
    if (!b) continue;
    for (const [ex, w] of mm) if ((b.get(ex) || 0) > 0 && w > b.get(ex)) { out.add(uid); break; }
  }
  return out;
}

/**
 * @param {object} p
 *  members(hidden 포함 가능) · trainers[{id,name,role,active}] · otRows · contracts · logs · goals
 *  confirms[{log_id,result}] · selfLogs[{user_id,date}] · events(member_event) · joins(member_event_join)
 *  incomes · expenses · runs(payroll_run) · ym(결산 달) · nowISO(만드는 시각 = 다음 달 초) · solo(개인 계정이면 true)
 */
export function monthlyReportData(p) {
  const { ym, nowISO = new Date().toISOString(), solo = false } = p;
  const members = (p.members || []).filter((m) => m && !m.hidden);
  const trainers = (p.trainers || []).filter((t) => t && t.active !== false);
  const otRows = p.otRows || [], contracts = p.contracts || [], logs = p.logs || [], goals = p.goals || [];
  const prev = shiftYm(ym, -1);
  const next = shiftYm(ym, 1);
  const mt = new Map(members.map((m) => [m.id, m.trainer_id]));
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  // ── 트레이너별 숫자 ─────────────────────────────────────────────
  const revBy = (y) => new Map(revenueByTrainer(contracts, y).map((r) => [r.trainer_id, r]));
  const rev = revBy(ym), revP = revBy(prev), rev2 = revBy(shiftYm(ym, -2));
  const otHeldBy = otSessionsThisMonthByTrainer(otRows, mt, ym);
  const otHeldP = otSessionsThisMonthByTrainer(otRows, mt, prev);
  const otRes = otResultsInMonth(otRows, mt, ym);
  const reregM = reregisterStatsByTrainer(contracts.filter((c) => c && c.reg_result && kstYm(c.reg_recorded_at || c.created_at) === ym));
  const reregAll = reregisterStatsByTrainer(contracts);
  const sess = sessionsThisMonthByTrainer(logs, mt, ym);
  const writeRate = logWriteRateByTrainer(logs, mt, ym);
  const confirmed = new Set((p.confirms || []).filter((c) => c.result === "confirm").map((c) => c.log_id));
  const monthLogs = logs.filter((l) => l && !l.voided && l.source !== "noshow" && kstYm(l.session_at) === ym);
  const churn = churnRiskMembers(members, contracts, logs, { nowISO });
  const expiring = expiringMembers(members, contracts, logs, { nowISO });
  const ounwan = ounwanDaysByMember(logs, p.selfLogs || [], ym);
  const gained = gainedMembers(logs, ym);
  const fun = otFunnel(members, otRows);
  const convRate = fun.intake ? fun.confirmed / fun.intake : null;
  const avgNew = avgNewAmount(contracts), avgRe = avgReregisterAmount(contracts);
  const centerReRate = reregisterStats(contracts).rate;
  // OT 보류(다시 연락할 OT 회원) — 회원별 최신 차수 결과가 보류
  const latestOt = new Map();
  for (const r of otRows) {
    if (!r || r.user_id == null) continue;
    const cur = latestOt.get(r.user_id);
    if (!cur || (r.ot_round || 0) > (cur.ot_round || 0)) latestOt.set(r.user_id, r);
  }

  const ids = solo ? trainers.map((t) => t.id).slice(0, 1) : trainers.map((t) => t.id);
  const rows = ids.map((tid) => {
    const t = trainers.find((x) => x.id === tid) || {};
    const mine = members.filter((m) => m.trainer_id === tid);
    const minePt = mine.filter((m) => viewFor(m) === "pt");
    const mineOt = mine.filter((m) => viewFor(m) === "ot");
    const r = rev.get(tid) || { total: 0, newRev: 0, reRev: 0, refund: 0, cntNew: 0, cntRe: 0 };
    const goal = goals.find((g) => g.trainer_id === tid && g.ym === ym)?.target_revenue ?? null;
    const ml = monthLogs.filter((l) => mt.get(l.user_id) === tid);
    const conf = ml.length ? ml.filter((l) => confirmed.has(l.id)).length / ml.length : null;
    const oRes = otRes.get(tid) || { attempted: 0, success: 0, rate: null };
    const rr = reregM.get(tid) || { attempted: 0, success: 0, rate: null };
    const days = mine.reduce((a, m) => a + (ounwan.get(m.id)?.size || 0), 0);
    const exp = expiring.filter((e) => e.trainer_id === tid);
    const holdOt = mineOt.filter((m) => latestOt.get(m.id)?.closing_result === "hold");
    // 이벤트(내가 열었거나 내 회원 대상) — 그달에 걸친 것
    const evs = (p.events || []).filter((e) => (e.created_by === tid || e.target_trainer === tid)
      && (!e.starts_on || e.starts_on.slice(0, 7) <= ym) && (!e.ends_on || e.ends_on.slice(0, 7) >= ym)
      && (e.created_at || "").slice(0, 7) <= ym);
    const events = evs.map((e) => {
      const js = (p.joins || []).filter((j) => j.event_id === e.id && mt.get(j.member_id) === tid);
      let achieved = 0, pending = 0;
      if (e.kind === "challenge" && e.goal_count) {
        for (const j of js) {
          const days2 = [...(ounwan.get(j.member_id) || [])].filter((d) => (!e.starts_on || d >= e.starts_on) && (!e.ends_on || d <= e.ends_on)).length;
          if (days2 >= e.goal_count) { achieved += 1; if (!j.rewarded_at) pending += 1; }
        }
      }
      return { id: e.id, title: e.title, kind: e.kind, joined: js.length, achieved, pendingReward: pending, reward: e.reward_text || null };
    });
    // 추천 목표(다음 달) — max(최근 3개월 평균 × 1.1, 들어올 매출 예측)
    const avg3 = Math.round(([rev.get(tid), revP.get(tid), rev2.get(tid)].reduce((a, x) => a + (x?.total || 0), 0)) / 3);
    const reRate = reregAll.get(tid)?.attempted >= 3 ? reregAll.get(tid).rate : centerReRate;
    const fcRe = reRate != null && avgRe != null ? exp.length * reRate * avgRe : 0;
    const fcNew = convRate != null && avgNew != null ? mineOt.length * convRate * avgNew : 0;
    const forecast = Math.round(fcRe + fcNew);
    const target = Math.max(round100k(avg3 * 1.1), round100k(forecast));
    return {
      trainer_id: tid, name: t.name || "", role: t.role || null,
      revenue: { total: r.total, newRev: r.newRev, reRev: r.reRev, refund: r.refund, cntNew: r.cntNew, cntRe: r.cntRe, prev: revP.get(tid)?.total || 0 },
      goal, goalRate: goal ? r.total / goal : null,
      ot: { held: otHeldBy.get(tid) || 0, heldPrev: otHeldP.get(tid) || 0, attempted: oRes.attempted, success: oRes.success, rate: oRes.rate, pipeline: mineOt.length },
      rereg: { attempted: rr.attempted, success: rr.success, rate: rr.rate },
      sessions: sess.get(tid) || 0,
      logRate: writeRate.get(tid)?.rate ?? null, logTotal: writeRate.get(tid)?.total || 0,
      confirmRate: conf, activePt: minePt.length,
      churn: churn.filter((c) => c.trainer_id === tid).map((c) => ({ id: c.user_id, name: nameOf.get(c.user_id) || "", gap: c.gap })),
      expiring: exp.map((e) => ({ id: e.user_id, name: nameOf.get(e.user_id) || "", rem: e.rem?.paid ?? null })),
      otHold: holdOt.map((m) => ({ id: m.id, name: m.name })),
      ounwanDays: days, ounwanMembers: mine.filter((m) => ounwan.get(m.id)?.size).length,
      gainedMembers: mine.filter((m) => gained.has(m.id)).length,
      events,
      recommend: target > 0 ? { ym: next, target, avg3, forecast, expiring: exp.length, otPipeline: mineOt.length } : null,
    };
  });

  // ── 비교 기준(센터 평균 · 개인은 내 지난 3개월) + 규칙 신호 ─────────────
  const active = rows.filter((r) => r.sessions + r.ot.held + r.revenue.total > 0);
  const avg = (f) => (active.length ? active.reduce((a, r) => a + (f(r) || 0), 0) / active.length : null);
  const peer = { otHeld: avg((r) => r.ot.held), revenue: avg((r) => r.revenue.total), sessions: avg((r) => r.sessions) };
  const rateAvg = (get) => {
    const xs = active.map(get).filter((x) => x && x.attempted >= 3);
    const att = xs.reduce((a, x) => a + x.attempted, 0), suc = xs.reduce((a, x) => a + x.success, 0);
    return att ? suc / att : null;
  };
  peer.otRate = rateAvg((r) => r.ot);
  peer.reregRate = rateAvg((r) => r.rereg);
  const compareToPeers = !solo && active.length >= 2;
  for (const r of rows) {
    const good = [], bad = [];
    const otBase = compareToPeers ? peer.otHeld : (r.ot.heldPrev || null);
    if (otBase != null && otBase >= 2 && r.ot.held < otBase * 0.5) {
      bad.push({ key: "ot_volume", text: `OT 진행 ${r.ot.held}건 · ${compareToPeers ? "센터 평균" : "지난달"} ${Math.round(otBase)}건의 절반이 안 돼요. 등록률보다 OT를 먼저 늘려야 해요.` });
    } else if (r.ot.held >= 3 && otBase != null && r.ot.held >= otBase * 1.3) {
      good.push({ key: "ot_volume", text: `OT ${r.ot.held}건 진행 · ${compareToPeers ? "센터 평균" : "지난달"}보다 많아요.` });
    }
    if (r.ot.attempted >= 5 && r.ot.rate != null) {
      const base = compareToPeers && peer.otRate != null ? peer.otRate : 0.45;
      if (r.ot.rate >= base + 0.15) good.push({ key: "ot_rate", text: `등록률 ${pct(r.ot.rate)}%(${r.ot.success}/${r.ot.attempted})` });
      else if (r.ot.rate <= base - 0.15) bad.push({ key: "ot_rate", text: `등록률 ${pct(r.ot.rate)}%(${r.ot.success}/${r.ot.attempted}) · 기준 ${pct(base)}%보다 낮아요.` });
    }
    if (r.rereg.attempted >= 3 && r.rereg.rate != null) {
      if (r.rereg.rate >= 0.7) good.push({ key: "rereg", text: `재등록 ${r.rereg.success}/${r.rereg.attempted}(${pct(r.rereg.rate)}%)` });
      else if (r.rereg.rate <= 0.4) bad.push({ key: "rereg", text: `재등록 ${r.rereg.success}/${r.rereg.attempted}(${pct(r.rereg.rate)}%) · 재등록 대화를 더 일찍 시작해 보세요.` });
    }
    if (r.revenue.prev > 0) {
      const ch = (r.revenue.total - r.revenue.prev) / r.revenue.prev;
      if (ch >= 0.2) good.push({ key: "revenue", text: `매출이 지난달보다 ${pct(ch)}% 늘었어요.` });
      else if (ch <= -0.2) bad.push({ key: "revenue", text: `매출이 지난달보다 ${pct(-ch)}% 줄었어요.` });
    }
    if (r.goalRate != null) {
      if (r.goalRate >= 1) good.push({ key: "goal", text: `목표 달성(${pct(r.goalRate)}%)` });
      else if (r.goalRate < 0.7) bad.push({ key: "goal", text: `목표의 ${pct(r.goalRate)}%` });
    }
    if (r.logTotal >= 5 && r.logRate != null) {
      if (r.logRate >= 0.99) good.push({ key: "log", text: "운동일지 100% 작성" });
      else if (r.logRate < 0.8) bad.push({ key: "log", text: `운동일지 작성 ${pct(r.logRate)}% · 수업 뒤 바로 남겨 주세요.` });
    }
    if (r.logTotal >= 5 && r.confirmRate != null) {
      if (r.confirmRate >= 0.9) good.push({ key: "confirm", text: `회원 확인 ${pct(r.confirmRate)}%` });
      else if (r.confirmRate < 0.6) bad.push({ key: "confirm", text: `회원 확인 ${pct(r.confirmRate)}% · 회원에게 확인을 부탁해 주세요.` });
    }
    if (r.churn.length >= 2) bad.push({ key: "churn", text: `2주 넘게 안 온 PT 회원 ${r.churn.length}명` });
    if (r.gainedMembers >= 3) good.push({ key: "gain", text: `무게가 늘어난 회원 ${r.gainedMembers}명` });
    r.signals = { good, bad };
  }

  // ── 센터(또는 개인) 합계 ─────────────────────────────────────────
  const comp = revenueCompositionInMonth(contracts, ym), compP = revenueCompositionInMonth(contracts, prev);
  const sum = (f) => rows.reduce((a, r) => a + (f(r) || 0), 0);
  const inYm = (d) => String(d || "").slice(0, 7) === ym;
  const income = (p.incomes || []).filter((x) => inYm(x.earned_on)).reduce((a, x) => a + (x.amount || 0), 0);
  const expense = (p.expenses || []).filter((x) => inYm(x.spent_on)).reduce((a, x) => a + (x.amount || 0), 0);
  const hasLedger = (p.incomes || []).length + (p.expenses || []).length > 0;
  const goalSum = goals.filter((g) => g.ym === ym && ids.includes(g.trainer_id)).reduce((a, g) => a + (g.target_revenue || 0), 0);
  const otAtt = sum((r) => r.ot.attempted), otSuc = sum((r) => r.ot.success);
  const reAtt = sum((r) => r.rereg.attempted), reSuc = sum((r) => r.rereg.success);
  const run = solo ? (p.runs || []).find((x) => x.trainer_id === ids[0] && x.ym === ym && x.final_total != null) : null;
  // 개인 계정 PT 몫(내 실적 맨 위와 같은 규칙): 적은 금액 > 급여 방식 자동 계산 > (방식 없음) PT 매출 전부 · 수동인데 안 적었으면 null
  let ptPart = comp.net, ptLabel = "PT 매출";
  if (solo && ids[0]) {
    const scheme = resolveScheme(p.schemes || [], ids[0]);
    if (run) { ptPart = run.final_total; ptLabel = "받은 금액(내가 적은 것)"; }
    else if (scheme) {
      const pay = payForScheme(scheme, { monthRevenue: comp.net, sessionCount: sessionCountByTrainer(logs, contracts, ym).get(ids[0]) || 0, sessionPriceSum: sessionPriceSumByTrainer(logs, contracts, ym).get(ids[0]) || 0 });
      ptPart = pay.computed; ptLabel = pay.computed == null ? "받은 금액(안 적음)" : "내 몫(급여 방식)";
    }
  }
  const center = {
    revenue: { net: comp.net, newRev: comp.newRev, reRev: comp.reRev, refund: comp.refund, cntNew: comp.cntNew, cntRe: comp.cntRe, prev: compP.net },
    goal: goalSum || null, goalRate: goalSum ? comp.net / goalSum : null,
    otHeld: sum((r) => r.ot.held), otHeldPrev: sum((r) => r.ot.heldPrev),
    ot: { attempted: otAtt, success: otSuc, rate: otAtt ? otSuc / otAtt : null },
    rereg: { attempted: reAtt, success: reSuc, rate: reAtt ? reSuc / reAtt : null },
    sessions: sum((r) => r.sessions), churn: sum((r) => r.churn.length), expiring: sum((r) => r.expiring.length),
    ledger: hasLedger ? { income, expense, ptPart, ptLabel, net: (ptPart ?? 0) + income - expense } : null,
    received: solo ? (ptPart === comp.net && !run ? null : ptPart) : null,
    recommend: rows.some((r) => r.recommend) ? { ym: next, target: sum((r) => r.recommend?.target) } : null,
    events: rows.flatMap((r) => r.events).filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i),
  };
  return { ym, prev, next, generatedFor: nowISO, solo, peer: compareToPeers ? peer : null, center, trainers: rows };
}
