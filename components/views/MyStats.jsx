"use client";

/* =========================================================================
   내 실적 (트레이너 본인) — 이달 매출·예상 급여·클로징률.
   session_log는 RLS로 본인 계약만. ot_log는 본인 회원(members)으로 필터.
   admin과 동일 함수 재사용(revenueByTrainer·sessionPriceSumByTrainer·closingStats·payForScheme).
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, ChevronDown, ChevronRight, Coins, Dumbbell, FileText, Target, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import SectionTitle from "@/components/ui/SectionTitle";
import { revenueByTrainer, sessionPriceSumByTrainer, closingStats, resolveScheme, payForScheme, payLinesForTrainer, sessionCountByTrainer, revenueContractsInMonth, refundsInMonth, remainingSessions, viewFor } from "@/lib/memberStatus";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import MonthlyReport from "@/components/views/MonthlyReport";
import MonthlySelfReport from "@/components/reports/MonthlySelfReport";
import Card from "@/components/ui/Card";
import { fetchAllRows } from "@/lib/fetchAllRows";
import SettlementPanel from "@/components/admin/SettlementPanel";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

// 'M월 D일'(KST) — 매출 내역 날짜.
const dayKo = (iso) => { const t = Date.parse(iso || ""); if (Number.isNaN(t)) return ""; const d = new Date(t + 9 * 3600 * 1000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

// 장부 창(13개월) — 대표 정산 화면과 같은 기준.
function ledgerFrom() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const t = k.getUTCFullYear() * 12 + k.getUTCMonth() - 13;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

// isFreelance = 개인 계정 중 프리랜서(2026-10-06): 맨 위 = 매출 · 지출 · 남은 돈 + 장부 · 정산(급여 칸 없음).
//   개인 · 센터 소속은 지금처럼 급여가 맨 위 · 급여 방식이 '수동'이면 받은 금액을 직접 적는다(대표 확정 화면이 없으므로).
export default function MyStats({ members = [], isSolo = false, isFreelance = false, onSelect }) {
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [otRows, setOtRows] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [uid, setUid] = useState(null);
  const [email, setEmail] = useState("");        // 리포트 헤더 폴백(실명 없을 때) · personName 가드
  const [trainerName, setTrainerName] = useState("");  // trainer.name(실명) · 없으면 email 폴백
  const [loading, setLoading] = useState(true);
  const [contractNames, setContractNames] = useState(new Map());
  const [reportOpen, setReportOpen] = useState(false);
  // '이달 매출' 칸을 누르면 아래 매출 내역을 펼치고 그리로 내려간다(2026-10-03 대표: "누르면 언제 · 누구 · 몇 회 · 얼마").
  const revRef = useRef(null);
  const payRef = useRef(null);
  const openDetails = (el) => {
    if (!el) return;
    el.open = true;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const openRevenue = () => openDetails(revRef.current); // 펼친 뒤 높이가 잡히고 나서 내려간다(setTimeout)
  const openPay = () => openDetails(payRef.current);
  const [goals, setGoals] = useState([]);        // trainer_goal(월별 목표) — 달성률·리포트 전달
  // 프리랜서 장부(income · expense · 정산 시작일) — 대표 정산 화면과 같은 표 · 개인 계정 주인은 DB가 허용(owner)
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [startDay, setStartDay] = useState(1);
  const [ledgerView, setLedgerView] = useState("view");
  const ledgerRef = useRef(null);
  // 개인 · 센터 소속 + 수동 급여: 이달 받은 금액 직접 적기
  const [manualAmt, setManualAmt] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [manualEdit, setManualEdit] = useState(false);   // 적은 금액 고치기

  const loadIncomes = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await fetchAllRows(() => supabase.from("income").select("*").gte("earned_on", ledgerFrom()));
    if (error) { console.error("장부(매출) 읽기 실패", error); return; }
    setIncomes(data || []);
  }, []);
  const loadExpenses = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await fetchAllRows(() => supabase.from("expense").select("*").gte("spent_on", ledgerFrom()));
    if (error) { console.error("장부(지출) 읽기 실패", error); return; }
    setExpenses(data || []);
  }, []);
  useEffect(() => {
    if (!isFreelance || !supabase) return;
    let alive = true;
    (async () => {
      await Promise.all([loadIncomes(), loadExpenses()]);
      const { data } = await supabase.from("account").select("settlement_start_day").maybeSingle();
      if (alive) setStartDay(data?.settlement_start_day ?? 1);
    })();
    return () => { alive = false; };
  }, [isFreelance, loadIncomes, loadExpenses]);
  const saveStartDay = async (d) => {
    const prev = startDay;
    setStartDay(d);
    if (!supabase) return;
    const { error } = await supabase.rpc("set_settlement_start_day", { d });
    if (error) { console.error("정산 기준일 저장 실패", error); setStartDay(prev); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setLoading(false); return; }
      try {
      const { data: au } = await supabase.auth.getUser();
      const myId = au?.user?.id ?? null;
      const [c, l, o, ps, pr, tr, tg] = await Promise.all([
        // ⚠️ 페이지 페처 — 1000행 잘림 방지(P0-6). session_log·daily_workout_log는 급여
        //    자동계산·잔여·매출의 입력이라 잘리면 돈 숫자가 틀린다. RLS로 본인 계약만 오지만
        //    수업 로그는 트레이너 1인도 하루 15~16건이면 두 달여에 1000 도달한다.
        fetchAllRows(() => supabase.from("session_log").select("*")),        // RLS: 본인 계약
        fetchAllRows(() => supabase.from("daily_workout_log").select("*")),
        supabase.from("ot_log").select("*"),
        supabase.from("pay_scheme").select("*"),
        supabase.from("payroll_run").select("*"),
        // trainer RLS(id = auth.uid())로 본인 행 select 허용 · maybeSingle은 행 없어도 에러 아님.
        myId ? supabase.from("trainer").select("name").eq("id", myId).maybeSingle()
             : Promise.resolve({ data: null }),
        supabase.from("trainer_goal").select("*"),       // 월별 목표(본인 것 · RLS)
      ]);
      // hidden(소프트삭제) 회원 이름 폴백 — 계약에 등장하는 회원 id를 user_table에서 직접 조회.
      // members(활성 목록)엔 hidden이 빠져 있어 이름을 못 찾음. RLS 7c2a는 hidden 무관 본인 회원 조회 허용.
      const uids = [...new Set((c.data || []).map((r) => r.user_id).filter(Boolean))];
      let names = new Map();
      if (uids.length) {
        const { data: nrows } = await supabase.from("user_table").select("id, name").in("id", uids);
        names = new Map((nrows || []).map((r) => [r.id, r.name]));
      }
      if (cancelled) return;
      setUid(au?.user?.id ?? null);
      setEmail(au?.user?.email ?? "");
      setTrainerName(tr?.data?.name || au?.user?.email || "");
      setGoals(tg.data || []);
      setContracts(c.data || []);
      setLogs(l.data || []);
      setOtRows(o.data || []);
      setSchemes(ps.data || []);
      setRuns(pr.data || []);
      setContractNames(names);
      setLoading(false);
    } catch {
      // 조회 실패 — finally에서 로딩 해제(무한 스피너 방지). MyStats는 별도 에러 표시 없음(빈 통계로 degrade).
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
    return () => { cancelled = true; };
  }, []);

  // 파생 집계 전체를 useMemo로 감싼다(P1-10). 이 블록엔 O(계약×로그) reduce(remAll)와
  // 로그 전체 순회 3~4개가 들어 있는데, 컴포넌트에 reportOpen 모달 state가 있어
  // 리포트를 여닫을 때마다(그 외 어떤 렌더에도) 통째로 다시 돌았다.
  // 입력(fetch 결과 + members + uid)이 안 바뀌면 결과는 같으므로 그 deps에만 묶는다.
  // admin(app/admin/page.jsx)이 같은 계열 집계를 useMemo로 감싼 것과 같은 규율.
  // ⚠️ 하위 헬퍼가 순수(입력만 읽고 부수효과 없음)라 안전. 훅은 early return 앞이라 순서 불변.
  const {
    ym, memberIds, rev, target, closing, pay, myRun, confirmed, rate,
    nameById, displayName, revRows, refundRows,
    ptMemberIds, sessTotalAll, remAll, doneAll,
    scheme, sessionCount, priceSum, payLines,
  } = useMemo(() => {
    const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    // 내 회원만(원장이 남의 회원 수업/클로징까지 세던 버그 수정 — 급여 스코프와 일치).
    const memberIds = new Set(members.filter((m) => m.trainer_id === uid).map((m) => m.id));
    const myOt = otRows.filter((r) => r && memberIds.has(r.user_id));
    const rev = revenueByTrainer(contracts, ym).find((r) => r.trainer_id === uid) || { newRev: 0, reRev: 0, refund: 0, total: 0, cntNew: 0, cntRe: 0 };
    const goalRow = goals.find((g) => g.ym === ym) || null;
    const target = goalRow?.target_revenue ?? null;
    const priceSum = sessionPriceSumByTrainer(logs, contracts, ym).get(uid) || 0;
    const closing = closingStats(myOt);
    const sessionCount = sessionCountByTrainer(logs, contracts, ym).get(uid) || 0;
    const scheme = resolveScheme(schemes, uid);
    const pay = payForScheme(scheme, { monthRevenue: rev.total, sessionCount, sessionPriceSum: priceSum });
    const myRun = runs.find((r) => r.trainer_id === uid && r.ym === ym) || null;
    const confirmed = myRun?.final_total != null;
    const rate = closing.rate == null ? "—" : Math.round(closing.rate * 100) + "%";
    // P2 — drill-down 파생. memberIds·ym·uid·logs·contracts·members는 이미 있음.
    const nameById = new Map(members.map((m) => [m.id, m.name]));
    // hidden 회원은 members에 없으니 계약 이름 조회(contractNames)로 폴백.
    const displayName = (id) => nameById.get(id) || contractNames.get(id) || "(알 수 없음)";
    const revRows = revenueContractsInMonth(contracts, uid, ym);        // session_log 행[]
    const refundRows = refundsInMonth(contracts, uid, ym);              // 이달 처리 환불[]

    // #1 — 내 활성 PT 회원(pt_active) 전체의 총/잔여 수업 합. inactive·OT·남의 회원 제외.
    const ptMemberIds = new Set(
      members.filter((m) => m.trainer_id === uid && viewFor(m) === "pt").map((m) => m.id)
    );
    // 내 계약만(2026-10-06) — 인계받은 회원은 앞 트레이너 계약(인계로 닫힘 · 남은 0)까지 더하면 '진행'이 부풀었다.
    const ptContracts = contracts.filter((c) => ptMemberIds.has(c.user_id) && c.trainer_id === uid && !c.handed_over);
    const sessTotalAll = ptContracts.reduce(
      (s, c) => s + (c.sessions_total ?? 0) + (c.service_sessions ?? 0), 0
    );
    const remAll = ptContracts.reduce((a, c) => {
      const r = remainingSessions(c, logs);
      a.paid += r.paid; a.service += r.service; a.total += r.total; return a;
    }, { paid: 0, service: 0, total: 0 });
    const doneAll = sessTotalAll - remAll.total; // 진행+노쇼(차감분). 총 상한·음수 없음.

    return {
      ym, memberIds, rev, target, closing, pay, myRun, confirmed, rate,
      nameById, displayName, revRows, refundRows,
      ptMemberIds, sessTotalAll, remAll, doneAll,
      scheme, sessionCount, priceSum,
      payLines: payLinesForTrainer(logs, contracts, ym, uid), // 급여 내역(회원 × 계약) — 위 수업 수 · 수업료 합과 같은 거름
    };
  }, [members, contracts, logs, otRows, schemes, runs, uid, goals, contractNames]);

  const manualPay = isSolo && pay.computed == null && scheme?.type === "manual";
  // 프리랜서 PT 몫: 적은 금액 > 급여 방식 계산 > (방식 없음) PT 매출 전부. 수동인데 아직 안 적었으면 0(입력 안내).
  const hasScheme = scheme != null;
  const ptShare = confirmed ? myRun.final_total : hasScheme ? (pay.computed ?? 0) : rev.total;
  const ptShareLabel = confirmed ? "내 몫(적은 금액)" : hasScheme ? (manualPay ? "내 몫(아직 안 적음)" : "내 몫(급여 방식)") : "PT 매출";
  const saveManual = async () => {
    const amt = Math.round(Number(String(manualAmt).replace(/[^0-9]/g, "")));
    if (!Number.isFinite(amt) || amt <= 0) { setManualNote("금액을 입력해 주세요."); return; }
    if (!supabase || !uid) return;
    setManualBusy(true); setManualNote("");
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("payroll_run")
      .upsert({ trainer_id: uid, ym, final_total: amt, computed_total: null, note: "본인 입력", seen_at: now, updated_at: now }, { onConflict: "account_id,trainer_id,ym" })
      .select();
    setManualBusy(false);
    if (error || !data?.length) { console.error("받은 금액 저장 실패", error); setManualNote("저장하지 못했어요. 다시 시도해 주세요."); return; }
    setRuns((rs) => [...rs.filter((r) => !(r.trainer_id === uid && r.ym === ym)), data[0]]);
    setManualAmt("");
    setManualEdit(false);
  };
  const showManual = manualPay && (!confirmed || manualEdit);
  const editLink = manualPay && confirmed && !manualEdit ? (
    <button type="button" onClick={() => { setManualAmt(String(myRun.final_total ?? "")); setManualEdit(true); }}
      className="mt-2 min-h-[36px] text-[13px] font-semibold text-sub underline underline-offset-2 hover:text-ink">받은 금액 고치기</button>
  ) : null;
  // 개인 계정 + 수동 급여 — 대표 확정 화면이 없으니 받은 금액(내 몫)을 직접 적는다
  const manualCard = (
    <div className="rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-strong">
        <Wallet className="h-4 w-4" aria-hidden="true" /> 이달 받은 금액{isFreelance ? "(내 몫)" : ""}
      </div>
      <p className="m-0 mt-1 text-[13px] text-sub">{isFreelance ? "센터 · 짐과 나눈 뒤 이달 내 몫을 적어 두면 남은 돈에 반영돼요." : "센터에서 받은 이달 급여 · 수수료를 적어 두면 지난달과 비교할 수 있어요."}</p>
      <div className="mt-2.5 flex gap-2">
        <input type="text" inputMode="numeric" value={manualAmt} onChange={(e) => setManualAmt(e.target.value.replace(/[^0-9,]/g, ""))}
          placeholder="예: 2,800,000" aria-label="이달 받은 금액" className={`${inputCls} min-w-0 flex-1`} />
        <Button variant="primary" size="md" onClick={saveManual} disabled={manualBusy}>{manualBusy ? "저장 중…" : "저장"}</Button>
      </div>
      {manualNote && <p className="m-0 mt-1.5 text-[13px] text-danger-text">{manualNote}</p>}
    </div>
  );
  // 프리랜서 이달(달력 월) — PT 매출(내 계약) + PT 외 매출 − 지출. 자세한 기간 정산은 아래 장부 · 정산.
  const monthIncome = incomes.filter((r) => String(r.earned_on || "").startsWith(ym)).reduce((a, r) => a + (r.amount || 0), 0);
  const monthExpense = expenses.filter((e) => String(e.spent_on || "").startsWith(ym)).reduce((a, e) => a + (e.amount || 0), 0);
  const monthNet = ptShare + monthIncome - monthExpense;

  return (
    /* 넓은 화면(lg~): 왼쪽 급여·매출·수업 | 오른쪽 오운완 랭킹. 폰은 위아래 한 줄. */
    <div className="space-y-4 break-keep text-pretty lg:max-w-3xl">
      <div className="space-y-4">
      {loading ? (
        <div className="py-10 text-center text-[13px] text-muted">불러오는 중…</div>
      ) : (
        <>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[13px] text-muted">{Number(ym.slice(5))}월</p>
          <h1 className="mt-0.5 flex items-center gap-1.5 text-[22px] font-bold tracking-[-0.03em] text-ink">
            <Award className="h-5 w-5 text-primary-strong" aria-hidden="true" /> 내 실적
          </h1>
        </div>
        <button onClick={() => setReportOpen(true)}
          className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-[13px] font-semibold text-ink shadow-sm transition hover:border-line-strong">
          <FileText className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 지난 달 · 보고서
        </button>
      </div>

      {/* 월간 결산 · 성적표(매월 1일 서버가 만든 것 · 2026-10-06) */}
      <MonthlySelfReport goals={goals} />

      {isFreelance ? (
        <>
        {/* 프리랜서 헤드라인 — 이달 남은 돈(내 몫 + PT 외 − 지출) · 누르면 장부 · 정산 */}
        <button type="button" onClick={() => openDetails(ledgerRef.current)} className="block w-full rounded-2xl border border-primary/30 bg-primary-soft p-5 text-left shadow-sm transition hover:border-primary/60 active:scale-[0.99]">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-strong">
            <Wallet className="h-4 w-4" aria-hidden="true" /> 이달 남은 돈(매출 − 지출)
            <ChevronRight className="ml-auto h-4 w-4 text-primary-strong/70" aria-hidden="true" />
          </div>
          <div className={`mt-1.5 tabular-nums text-[30px] font-bold tracking-[-0.03em] ${monthNet < 0 ? "text-danger-text" : "text-ink"}`}>{won(monthNet)}</div>
          <div className="mt-0.5 text-[13px] text-sub">{ptShareLabel} {won(ptShare)}{hasScheme ? ` (PT 매출 ${won(rev.total)} 중)` : ""}{monthIncome ? ` + PT 외 ${won(monthIncome)}` : ""} − 지출 {won(monthExpense)}</div>
        </button>
        {showManual ? <div className="mt-3">{manualCard}</div> : editLink}
        </>
      ) : showManual ? (
        manualCard
      ) : (
      <button type="button" onClick={openPay} className="block w-full rounded-2xl border border-primary/30 bg-primary-soft p-5 text-left shadow-sm transition hover:border-primary/60 active:scale-[0.99]">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-strong">
          <Wallet className="h-4 w-4" aria-hidden="true" /> 이달 {isSolo ? (confirmed ? "받은 금액" : "급여(자동 계산)") : `${confirmed ? "확정" : "예상"} 급여`}
          <ChevronRight className="ml-auto h-4 w-4 text-primary-strong/70" aria-hidden="true" />
        </div>
        {confirmed ? (
          <>
            <div className="mt-1.5 tabular-nums text-[30px] font-bold tracking-[-0.03em] text-ink">{won(myRun.final_total)}</div>
            <div className="mt-0.5 text-[13px] text-sub">{isSolo ? "내가 적은 금액" : "대표 확정"}{pay.computed != null && pay.computed !== myRun.final_total ? ` · 자동 계산 ${won(pay.computed)}` : ""}</div>
          </>
        ) : pay.computed != null ? (
          <>
            <div className="mt-1.5 tabular-nums text-[30px] font-bold tracking-[-0.03em] text-ink">{won(pay.computed)}</div>
            <div className="mt-0.5 text-[13px] text-sub">미확정 · 기본 {won(pay.base)}{pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}</div>
          </>
        ) : (
          <>
            <div className="mt-1.5 text-[22px] font-bold text-muted">{isSolo ? "급여 방식 미설정" : "대표 확정 대기"}</div>
            <div className="mt-0.5 text-[13px] text-sub">{isSolo ? "설정 › 가격 · 급여에서 급여 방식을 정하면 자동으로 계산돼요" : "대표가 직접 정하는 급여예요"}</div>
          </>
        )}
      </button>
      )}
      {!isFreelance && editLink}

      {/* 매출 — 목표가 있으면 같은 칸 안에 진행 막대(2026-10-03 · 따로 있던 '목표 달성' 카드를 합침 · 같은 숫자를 두 번 보여주지 않게) */}
      <StatTile label="이달 매출(내 등록)" value={won(rev.total)} onClick={openRevenue}>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-sub">
          <span>신규 <b className="text-ink">{won(rev.newRev)}</b> · {rev.cntNew}건</span>
          <span>재등록 <b className="text-sky-700">{won(rev.reRev)}</b> · {rev.cntRe}건</span>
          {rev.refund > 0 && (
            <span>환불 <b className="text-rose-600">-{won(rev.refund)}</b></span>
          )}
        </div>
        {target != null && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className="text-sub">목표 {won(target)}</span>
              <span className="tabular-nums font-semibold text-ink">{Math.round((rev.total / target) * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-elevate">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((rev.total / target) * 100))}%` }} />
            </div>
          </div>
        )}
      </StatTile>

      {/* 등록률 | 이번 달 수업 — 수업 수는 급여 기준(노쇼 포함 · 취소 · 보강 제외 · 계약 담당 기준)이 정본(2026-10-03 대표). 누르면 급여 내역(회원별). */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Target} label="등록률" value={rate}>
          <div className="mt-1.5 text-[12.5px] text-sub">등록 제안 {closing.attempted}명 중 {closing.success}명</div>
        </StatTile>
        <StatTile icon={Dumbbell} label="이번 달 수업" value={`${sessionCount}회`} onClick={isFreelance && !hasScheme ? undefined : openPay}>
          <div className="mt-1.5 text-[12.5px] text-sub">
            회원 {new Set(payLines.map((l) => l.user_id)).size}명{payLines.some((l) => l.noshow) ? ` · 노쇼 ${payLines.reduce((s, l) => s + l.noshow, 0)}회 포함` : ""}
          </div>
        </StatTile>
      </div>

      {/* #1 — PT 수업 현황(내 활성 PT 회원 전체 합). 회원 없으면 숨김. */}
      {ptMemberIds.size > 0 && (
        <Card>
          <SectionTitle icon={Dumbbell} aside={`PT 회원 ${ptMemberIds.size}명`}>PT 수업 현황</SectionTitle>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] text-sub">남은 수업</span>
            <span className="tabular-nums text-[26px] font-bold tracking-[-0.02em] text-ink">{remAll.total}</span>
            <span className="text-[14px] text-sub">회</span>
          </div>
          <div className="mt-0.5 text-[13px] text-sub">
            완료 <b className="tabular-nums text-ink">{doneAll}</b> / 총{" "}
            <b className="tabular-nums text-ink">{sessTotalAll}</b>회
            <span className="ml-1 text-muted">(유료 {remAll.paid} · 서비스 {remAll.service})</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevate">
            <div className="h-full rounded-full bg-primary"
              style={{ width: `${sessTotalAll ? Math.round((doneAll / sessTotalAll) * 100) : 0}%` }} />
          </div>
        </Card>
      )}

      {/* 매출 내역 — 누구·얼마·언제 (P2) */}
      <details ref={revRef} className="group scroll-mt-20 rounded-2xl border border-line bg-card px-5 shadow-sm">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
            <Wallet className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 매출 내역
            {revRows.length + refundRows.length > 0 && <span className="text-[13px] font-normal text-muted">{revRows.length + refundRows.length}건</span>}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums text-[15px] font-semibold text-ink">{won(rev.total)} <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" /></span>
        </summary>
        {revRows.length === 0 && refundRows.length === 0 ? (
          <EmptyState className="pb-4 text-[13px]">이번 달 매출이 없어요.</EmptyState>
        ) : (
          <ul className="space-y-1.5 pb-4">
            {/* 한 줄 = 한 계약: 누구 · 신규/재등록 · 얼마 / 언제 · 몇 회(+서비스) · 회당 */}
            {revRows.map((c) => (
              <li key={c.id} className="rounded-xl bg-elevate px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{displayName(c.user_id)}</span>
                    <Badge tone={c.kind === "reregister" ? "sky" : "primary"}>{c.kind === "reregister" ? "재등록" : "신규"}</Badge>
                  </span>
                  <span className="shrink-0 tabular-nums text-[15px] font-bold text-ink">{won(c.amount_total ?? 0)}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-sub">
                  {dayKo(c.started_at)} · PT {c.sessions_total ?? 0}회{c.service_sessions ? ` + 서비스 ${c.service_sessions}회` : ""}
                  {c.price_per_session ? ` · 회당 ${won(c.price_per_session)}` : ""}
                </p>
              </li>
            ))}
            {refundRows.map((c) => (
              <li key={"rf-" + c.id} className="rounded-xl bg-rose-500/5 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{displayName(c.user_id)}</span>
                    <Badge tone="rose">환불</Badge>
                  </span>
                  <span className="shrink-0 tabular-nums text-[15px] font-bold text-danger-text">-{won(c.refund_amount)}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-sub">
                  {dayKo(c.refunded_at)} 환불 · 원래 계약 PT {c.sessions_total ?? 0}회{c.started_at ? ` (${dayKo(c.started_at)} 등록)` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* 프리랜서 장부 · 정산 — 대표 화면의 정산을 그대로(FC 칸만 숨김) */}
      {isFreelance && (
        <details ref={ledgerRef} className="group scroll-mt-20 rounded-2xl border border-line bg-card px-5 shadow-sm">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <Coins className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 장부 · 정산
            </span>
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="pb-4">
            <div className="mb-3 inline-flex gap-1 rounded-full bg-elevate p-[3px]" role="tablist" aria-label="장부">
              {[["view", "정산 보기"], ["entry", "장부 적기"]].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={ledgerView === k} onClick={() => setLedgerView(k)}
                  className={`min-h-[36px] rounded-full px-3.5 text-[14px] ${ledgerView === k ? "bg-card font-semibold text-ink shadow-sm" : "text-sub"}`}>{l}</button>
              ))}
            </div>
            <SettlementPanel solo view={ledgerView} contracts={contracts} incomes={incomes} expenses={expenses} ym={ym}
              startDay={startDay} onChangeStartDay={saveStartDay} onIncomeChanged={loadIncomes} onExpenseChanged={loadExpenses} />
          </div>
        </details>
      )}

      {/* 급여 내역 — 회원 · 수업 횟수 · 회당 단가 · 받는 수업료(2026-10-03) · 프리랜서는 급여 방식을 정했을 때만 */}
      {(!isFreelance || hasScheme) && (<>
      <details ref={payRef} className="group scroll-mt-20 rounded-2xl border border-line bg-card px-5 shadow-sm">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
            <Coins className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 급여 내역
            {payLines.length > 0 && <span className="text-[13px] font-normal text-muted">수업 {sessionCount}회</span>}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums text-[15px] font-semibold text-ink">
            {confirmed ? won(myRun.final_total) : pay.computed != null ? won(pay.computed) : "—"}
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <PayBreakdown lines={payLines} pay={pay} scheme={scheme} sessionCount={sessionCount} priceSum={priceSum}
          revenue={rev.total} confirmedTotal={confirmed ? myRun.final_total : null} nameOf={displayName} isSolo={isSolo} />
      </details>

      <p className="text-[12px] leading-relaxed text-muted">{isSolo ? (manualPay ? "받은 금액은 내가 적은 금액이에요. 이번 달 안에 고칠 수 있어요." : "자동 계산은 이번 달 완료한 수업 기준이에요.") : "확정 전 예상 급여는 이번 달 완료한 수업으로 자동 계산한 금액이에요. 실제 지급액은 대표가 확정한 금액이에요."}</p>
      </>)}
        </>
      )}
      </div>

      {/* 오운완 랭킹은 홈으로 옮겼다(2026-10-03 · 홈 출석 랭킹과 같은 데이터라 하나로 · components/home/OunwanRanking). */}

      {/* 월간 리포트 오버레이 (4-a) — 읽기 전용 재집계, MyStats 데이터 그대로 전달. */}
      {reportOpen && (
        <MonthlyReport
          onClose={() => setReportOpen(false)}
          data={{
            contracts, logs, otRows, schemes, runs, uid,
            memberIds,        // 내 회원 Set(파생) — 재집계 스코프
            members,
            contractNames,
            goals,            // 월별 목표 배열 — 리포트가 선택 ym으로 조회
            trainerName: trainerName || email, // 실명 우선(trainer.name), 없으면 이메일 폴백(personName이 @앞만)
            isSolo, isFreelance,  // 개인 계정 문구(받은 금액 · 프리랜서는 급여 칸 없음)
          }}
        />
      )}
    </div>
  );
}

/* 급여 내역(2026-10-03) — 이달 급여에 들어간 수업을 회원 × 계약별로: 회원 · 수업 횟수 · 회당 단가 · 받는 수업료.
   받는 수업료 = 적용 구간의 지급 방식으로 줄마다 계산(수업료의 % · 1회당 정액). 고정급 · 대표가 정하는 급여는 줄마다 나눌 수 없어 수업료만.
   맨 아래 합계는 payForScheme 결과 그대로(기본급 + 인센티브) — 줄 합과 원 단위 반올림 차이가 날 수 있다. */
function PayBreakdown({ lines, pay, scheme, sessionCount, priceSum, revenue, confirmedTotal, nameOf, isSolo }) {
  const band = pay.band;
  const pv = Number(band?.payout_value ?? 0);
  const kind = pay.type === "manual" ? "manual" : !band ? "none" : band.payout_type; // pct_of_price | flat_per_session | fixed
  const recv = (l) => (kind === "pct_of_price" ? Math.round((l.fee * pv) / 100) : kind === "flat_per_session" ? l.count * pv : null);
  const basisText = (min) => (scheme?.band_basis === "session_count" ? `이달 수업 ${min ?? 0}회 이상` : `이달 매출 ${won(min ?? 0)} 이상`);
  const payoutText = kind === "pct_of_price" ? `수업료의 ${pv}%` : kind === "flat_per_session" ? `수업 1회당 ${won(pv)}` : kind === "fixed" ? `고정 ${won(pv)}` : "";
  const incText = band?.incentive_type === "pct" ? `이달 매출 ${won(revenue)}의 ${Number(band.incentive_value ?? 0)}%` : band?.incentive_type === "flat" ? "고정 인센티브" : "";
  const sorted = (Array.isArray(scheme?.bands) ? scheme.bands : []).slice().sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  const firstBand = sorted[0];
  // 다음 구간까지 — 기준(매출 · 수업 수)이 얼마 남았고 그 구간은 얼마를 주는지.
  const basisVal = scheme?.band_basis === "session_count" ? sessionCount : revenue;
  const nextBand = sorted.find((b) => (b.min ?? 0) > basisVal) || null;
  const bandPay = (b) => (b.payout_type === "pct_of_price" ? `수업료의 ${Number(b.payout_value ?? 0)}%` : b.payout_type === "flat_per_session" ? `수업 1회당 ${won(Number(b.payout_value ?? 0))}` : `고정 ${won(Number(b.payout_value ?? 0))}`);
  const toNext = nextBand ? (nextBand.min ?? 0) - basisVal : 0;

  if (!lines.length) return <EmptyState className="pb-4 text-[13px]">이번 달 급여에 들어간 수업이 아직 없어요.</EmptyState>;

  return (
    <div className="space-y-3 pb-4">
      {kind === "manual" && (
        <p className="rounded-xl bg-elevate px-3.5 py-2.5 text-[13px] leading-relaxed text-sub">
          {isSolo ? "급여 방식을 설정하면 회원별로 받는 돈까지 계산돼요." : "대표가 직접 정하는 급여라, 회원별 받는 돈은 나누지 않고 수업 기록만 보여요."}
        </p>
      )}
      {kind === "none" && firstBand && (
        <p className="rounded-xl bg-elevate px-3.5 py-2.5 text-[13px] leading-relaxed text-sub">
          아직 첫 구간({basisText(firstBand.min)})에 못 미쳐서 기본급이 0원이에요.
        </p>
      )}
      <ul className="m-0 list-none space-y-1.5 p-0">
        {lines.map((l) => {
          const r = recv(l);
          return (
            <li key={l.contract_id} className="rounded-xl bg-elevate px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{nameOf(l.user_id)}</span>
                <span className="shrink-0 tabular-nums text-[15px] font-bold text-ink">
                  {r != null ? won(r) : <span className="font-semibold text-sub">수업료 {won(l.fee)}</span>}
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-sub">
                수업 {l.count}회{l.noshow ? ` (노쇼 ${l.noshow}회 포함)` : ""} · 회당 {won(l.price)}
                {kind === "pct_of_price" ? ` · 수업료 ${won(l.fee)} × ${pv}%` : kind === "flat_per_session" ? ` · 1회 ${won(pv)} × ${l.count}회` : ""}
              </p>
            </li>
          );
        })}
      </ul>

      {kind !== "manual" && (
        <div className="space-y-1.5 border-t border-line pt-3 text-[13.5px]">
          <div className="flex justify-between gap-3 text-sub"><span>수업료 합계 · 수업 {sessionCount}회</span><span className="tabular-nums">{won(priceSum)}</span></div>
          <div className="flex justify-between gap-3 text-sub">
            <span>기본급{payoutText ? ` · ${payoutText}` : ""}</span><span className="tabular-nums text-ink">{won(pay.base)}</span>
          </div>
          {pay.incentive > 0 && (
            <div className="flex justify-between gap-3 text-sub"><span>인센티브{incText ? ` · ${incText}` : ""}</span><span className="tabular-nums text-ink">{won(pay.incentive)}</span></div>
          )}
          <div className="flex justify-between gap-3 pt-1 text-[15px] font-bold text-ink"><span>예상 급여</span><span className="tabular-nums">{won(pay.computed ?? 0)}</span></div>
          {confirmedTotal != null && (
            <div className="flex justify-between gap-3 text-[15px] font-bold text-primary-strong"><span>대표 확정</span><span className="tabular-nums">{won(confirmedTotal)}</span></div>
          )}
          {band && <p className="pt-1 text-[12px] text-muted">적용 구간: {(band.min ?? 0) > 0 ? basisText(band.min) : "기본 구간"}</p>}
          {nextBand && (
            <p className="rounded-xl bg-primary-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
              {scheme?.band_basis === "session_count" ? `수업 ${toNext}회` : `매출 ${won(toNext)}`} 더 하면 다음 구간이에요. {bandPay(nextBand)}{nextBand.incentive_type === "pct" ? ` + 매출의 ${Number(nextBand.incentive_value ?? 0)}%` : ""}로 올라가요.
            </p>
          )}
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-muted">노쇼도 차감된 수업이라 급여에 들어가요. 취소한 수업 · 보강(계약 없는 수업)은 빠져요.</p>
    </div>
  );
}
