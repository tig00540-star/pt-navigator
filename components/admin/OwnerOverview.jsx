"use client";

/* =========================================================================
   OwnerOverview — 대표 "한눈에" 데스크톱 콘솔 (Phase A · 2026-09)
   -------------------------------------------------------------------------
   /admin 의 새 기본 랜딩. 넓은 화면=멀티컬럼 그리드, 폰=세로 스택(반응형).
   ⚠️ 신규 데이터 0 — admin이 이미 로드한 배열(members/contracts/logs/trainers/appts)을
      props로 받아 파생만. 인증·격리는 /admin(owner 게이트·RLS)이 이미 처리.
   ⚠️ hidden(환불·소프트삭제) 필터는 컴포넌트 책임(visible) — admin 규율 준수.
   매출 귀속 = 등록일(started_at·counts_as_revenue) 기준. 스케줄 = 당일 타임테이블.
   지출·순이익(Phase B)·공지(C)·회원권 매출(D)는 "준비 중" 슬롯으로 자리만.
   ========================================================================= */

import { useMemo } from "react";
import { Users, Wallet, Receipt, PiggyBank, CalendarDays, UserCircle, ChevronRight, Clock } from "lucide-react";
import Card from "@/components/ui/Card";
import { revenueInMonth, revenueByTrainer, sessionsThisMonthByTrainer, sessionsCount } from "@/lib/memberStatus";
import { expenseInMonth } from "@/lib/expenses";

const WON = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const kstDate = (s) => new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstWeekday = (s) => new Date(new Date(s).getTime() + 9 * 3600e3).getUTCDay();
const kstHM = (s) => new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(11, 16);

// ⚠️ 모듈 레벨(렌더 내부 정의 금지 · react-hooks/static-components)
function KPI({ icon: Icon, label, value, sub, muted }) {
  return (
    <Card padding="sm" className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-1 truncate font-mono text-[20px] font-bold tracking-tight ${muted ? "text-muted" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}

function GoLink({ tab, onGoTab, children }) {
  return (
    <button type="button" onClick={() => onGoTab?.(tab)} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-fuchsia-700 hover:underline">
      {children} <ChevronRight className="h-3 w-3" />
    </button>
  );
}

export default function OwnerOverview({ members = [], contracts = [], logs = [], trainers = [], appts = [], expenses = [], ym, onGoTab }) {
  // hidden 제외 · 회원→담당 트레이너 맵(TrainerScorecard와 동일 규율)
  const visible = useMemo(() => members.filter((m) => !m?.hidden), [members]);
  const memberTrainer = useMemo(() => {
    const m = new Map();
    for (const r of visible) if (r?.id) m.set(r.id, r.trainer_id ?? "unknown");
    return m;
  }, [visible]);

  const monthRev = useMemo(() => revenueInMonth(contracts, ym), [contracts, ym]);
  const monthSess = useMemo(() => sessionsCount(logs, { ym }), [logs, ym]);
  const monthExpense = useMemo(() => expenseInMonth(expenses, ym), [expenses, ym]);
  const netProfit = monthRev - monthExpense;
  const revMap = useMemo(() => new Map(revenueByTrainer(contracts, ym).map((r) => [r.trainer_id, r])), [contracts, ym]);
  const sessMap = useMemo(() => sessionsThisMonthByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const countByTrainer = useMemo(() => {
    const m = new Map();
    for (const r of visible) { const t = r.trainer_id ?? "unknown"; m.set(t, (m.get(t) || 0) + 1); }
    return m;
  }, [visible]);

  // 트레이너별 현황(매출순)
  const trainerRows = useMemo(
    () => trainers
      .map((t) => ({ id: t.id, name: t.name || "—", count: countByTrainer.get(t.id) || 0, sess: sessMap.get(t.id) || 0, rev: revMap.get(t.id)?.total || 0 }))
      .sort((a, b) => b.rev - a.rev),
    [trainers, countByTrainer, sessMap, revMap]
  );

  // 요일별 매출(이번달 · 등록일=started_at 기준). 월~일 순서로 표시.
  const weekdayRev = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0];
    for (const c of contracts) {
      if (!c?.counts_as_revenue || typeof c.started_at !== "string") continue;
      if (kstDate(c.started_at).slice(0, 7) !== ym) continue;
      arr[kstWeekday(c.started_at)] += c.amount_total || 0;
    }
    return arr;
  }, [contracts, ym]);
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월→일
  const wdMax = Math.max(1, ...weekdayRev);

  // 오늘 타임테이블(당일 예약 · 시간순)
  const today = kstDate(new Date().toISOString());
  const todayAppts = useMemo(
    () => appts.filter((a) => a?.start_at && kstDate(a.start_at) === today).sort((a, b) => (a.start_at < b.start_at ? -1 : 1)),
    [appts, today]
  );
  const trainerName = (id) => trainers.find((t) => t.id === id)?.name || (id === "unknown" ? "미배정" : "—");
  const memberName = (id) => visible.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.name || "회원";
  const STATUS_KO = { booked: "예약", done: "완료", canceled: "취소" };

  return (
    <div className="space-y-5">
      {/* ── KPI 상단바 ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KPI icon={Wallet} label="이번달 매출" value={WON(monthRev)} sub="등록일 기준" />
        <KPI icon={Receipt} label="이번달 지출" value={WON(monthExpense)} sub="인앱 장부" />
        <KPI icon={PiggyBank} label="순이익" value={WON(netProfit)} sub="매출−지출" />
        <KPI icon={CalendarDays} label="이번달 수업" value={`${monthSess.toLocaleString("ko-KR")}회`} />
        <KPI icon={Users} label="회원" value={`${visible.length.toLocaleString("ko-KR")}명`} />
        <KPI icon={UserCircle} label="트레이너" value={`${trainers.length}명`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── 트레이너별 현황 ── */}
        <Card padding="md" className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-bold tracking-[-0.02em] text-ink">트레이너별 현황 · 이번달</h3>
            <GoLink tab="perf" onGoTab={onGoTab}>리더보드</GoLink>
          </div>
          {trainerRows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted">트레이너를 초대하면 현황이 표시됩니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] text-muted">
                    <th className="py-2 pr-2 text-left font-semibold">트레이너</th>
                    <th className="px-2 py-2 text-right font-semibold">담당</th>
                    <th className="px-2 py-2 text-right font-semibold">수업</th>
                    <th className="py-2 pl-2 text-right font-semibold">매출</th>
                  </tr>
                </thead>
                <tbody>
                  {trainerRows.map((t) => (
                    <tr key={t.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 pr-2 text-left font-semibold text-ink">{t.name}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-sub">{t.count}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-sub">{t.sess}</td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-ink">{WON(t.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── 오늘 타임테이블 ── */}
        <Card padding="md">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[14px] font-bold tracking-[-0.02em] text-ink"><Clock className="h-4 w-4 text-muted" />오늘 타임테이블</h3>
            <GoLink tab="schedule" onGoTab={onGoTab}>스케줄</GoLink>
          </div>
          {todayAppts.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted">오늘 예약이 없습니다.</p>
          ) : (
            <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
              {todayAppts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-elevate px-2.5 py-2">
                  <span className="font-mono text-[12px] font-bold text-ink">{kstHM(a.start_at)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{memberName(a.user_id)}</span>
                  <span className="truncate text-[11px] text-muted">{trainerName(a.trainer_id)}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${a.status === "canceled" ? "bg-danger/10 text-danger-text" : a.status === "done" ? "bg-cyan-50 text-cyan-700" : "bg-elevate text-sub"}`}>
                    {STATUS_KO[a.status] || a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── 요일별 매출(이번달) ── */}
        <Card padding="md" className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-bold tracking-[-0.02em] text-ink">요일별 매출 · 이번달</h3>
            <span className="text-[11px] text-muted">등록일 기준 · PT</span>
          </div>
          <div className="flex flex-col gap-2">
            {WD_ORDER.map((d) => (
              <div key={d} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-sub">{WD[d]}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-fuchsia-600" style={{ width: `${Math.round((weekdayRev[d] / wdMax) * 100)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink">{WON(weekdayRev[d])}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 준비 중 슬롯(Phase B·C·D) ── */}
        <Card padding="md">
          <h3 className="mb-3 text-[14px] font-bold tracking-[-0.02em] text-ink">준비 중</h3>
          <ul className="flex flex-col gap-2.5 text-[12px] leading-relaxed text-muted">
            <li className="flex items-start gap-2"><Wallet className="mt-0.5 h-3.5 w-3.5 flex-none" /><span><b className="text-sub">회원권(FC) 매출</b> — PT/회원권 분리, 준비 중</span></li>
            <li className="flex items-start gap-2"><Users className="mt-0.5 h-3.5 w-3.5 flex-none" /><span><b className="text-sub">공지사항</b> — 대표 공지 위젯 예정</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
