"use client";
/* =========================================================================
   #5 가동률·스케줄 — admin '스케줄' 탭.
   요일×시간 예약 밀도(=빈 시간대) · 트레이너별 예약/완료/취소/미처리 · 노쇼율 · 미처리 예약.
   admin이 로드한 appts(최근90일)+logs+members+trainers를 props로 받아 파생·렌더만.
   ⚠️ 밀도는 '가동률 %' 아님(정원 데이터 없음) · 노쇼는 수업일지(source='noshow') 기준(예약 아님).
   색: 좋음 cyan · 주의 rose · 밀도 primary(불투명도). emerald 금지. KST 보정 일관(히트맵·리스트).
   ========================================================================= */
import { useMemo, useState } from "react";
import { CalendarClock, AlertTriangle, UserX, LayoutGrid } from "lucide-react";
import { apptWeekdayHourGrid, apptOutcomeByTrainer, noshowByTrainer, pastDueAppointments } from "@/lib/memberStatus";
import { personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import ToneCard from "@/components/ui/ToneCard";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const START_HOUR = 6, END_HOUR = 24;
const LIMIT = 20;
const pctText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");

// start_at(UTC ISO) → KST 'M/D HH:MM' (히트맵과 같은 +9h 규칙 · 어긋남 금지).
const kstTime = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const k = new Date(t + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};

const doneRateCls = (r) => (r == null ? "text-muted" : r >= 0.8 ? "text-cyan-700" : r < 0.5 ? "text-danger-text" : "text-ink");
const noshowCls = (r) => (r == null ? "text-muted" : r > 0.15 ? "text-danger-text" : "text-ink");

/* 요약 타일 — 모듈 레벨(render 중 컴포넌트 생성 금지). accent: cyan·rose·ink. */
function SummaryTile({ icon: Icon, label, value, sub, accent = "ink" }) {
  const color = accent === "rose" ? "text-danger-text" : accent === "cyan" ? "text-cyan-700" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] tracking-label-ko text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}{label}
      </div>
      <div className={`mt-1.5 font-mono text-2xl font-extrabold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-relaxed text-muted">{sub}</div>}
    </div>
  );
}

export default function ScheduleAnalytics({ appts = [], logs = [], members = [], trainers = [] }) {
  const [nowISO] = useState(() => new Date().toISOString()); // 마운트 1회 고정
  const grid = useMemo(() => apptWeekdayHourGrid(appts, { startHour: START_HOUR, endHour: END_HOUR }), [appts]);
  const outcome = useMemo(() => apptOutcomeByTrainer(appts, nowISO), [appts, nowISO]);
  const memberTrainer = useMemo(() => new Map(members.map((m) => [m.id, m.trainer_id])), [members]); // 전체(hidden 포함 · 트레이너 이력)
  const noshow = useMemo(() => noshowByTrainer(logs, memberTrainer, {}), [logs, memberTrainer]); // 전체기간(ym 생략)
  const pastDue = useMemo(() => pastDueAppointments(appts, nowISO), [appts, nowISO]);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || (tid === "unknown" ? "미배정" : String(tid).slice(0, 8));
  const memberName = (uid) => personName(members.find((m) => m.id === uid)?.name) || String(uid).slice(0, 8);

  // 센터 롤업(단순 reduce).
  const totalDone = outcome.reduce((s, t) => s + t.done, 0);
  const totalCanceled = outcome.reduce((s, t) => s + t.canceled, 0);
  const centerDoneRate = (totalDone + totalCanceled) ? totalDone / (totalDone + totalCanceled) : null;
  const nsDone = noshow.reduce((s, t) => s + t.done, 0), nsNo = noshow.reduce((s, t) => s + t.noshow, 0);
  const centerNoshowRate = (nsDone + nsNo) ? nsNo / (nsDone + nsNo) : null;
  const pastDueCount = outcome.reduce((s, t) => s + t.pastDue, 0);

  // 가장 붐비는 슬롯(라벨용).
  const peak = useMemo(() => {
    let best = null;
    grid.grid.forEach((row, wd) => row.forEach((n, ci) => { if (n > 0 && (!best || n > best.n)) best = { wd, hour: grid.hours[ci], n }; }));
    return best;
  }, [grid]);

  return (
    <div className="space-y-6">
      <p className="text-[12px] leading-relaxed text-sub">예약이 <b className="text-ink">언제 몰리고</b>, 누가 <b className="text-ink">잘 채우는지</b> — 최근 90일.</p>

      {/* 1) 요약 타일 4개 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={CalendarClock} label="최근 90일 예약" value={`${grid.total}건`} sub="취소 제외 · 밀도 기준" />
        <SummaryTile icon={LayoutGrid} label="완료율" value={pctText(centerDoneRate)} accent="cyan" sub={`완료 ${totalDone} / 취소 ${totalCanceled}`} />
        <SummaryTile icon={UserX} label="노쇼율" value={pctText(centerNoshowRate)} accent="rose" sub={`수업일지 기준 · 노쇼 ${nsNo}건`} />
        <SummaryTile icon={AlertTriangle} label="미처리 예약" value={`${pastDueCount}건`} accent="rose" sub="시간 지났는데 완료·취소 안 함" />
      </div>

      {/* 2) 요일×시간 밀도 히트맵 */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted" />
          <span className="text-[11px] font-semibold tracking-label-ko text-muted">요일·시간대 예약 밀도</span>
          {peak && <span className="text-[11px] text-cyan-700">· {DAYS[peak.wd]} {peak.hour}시가 가장 붐빔</span>}
        </div>
        {grid.total === 0 ? (
          <p className="text-[12px] text-muted">최근 90일 예약이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex">
                <div className="w-10 shrink-0" />
                {DAYS.map((d, i) => (
                  <div key={i} className={`flex-1 pb-1 text-center text-[11px] font-semibold ${i === 6 ? "text-rose-600" : i === 5 ? "text-sky-600" : "text-sub"}`}>{d}</div>
                ))}
              </div>
              {grid.hours.map((h, ci) => (
                <div key={h} className="flex items-stretch">
                  <div className="w-10 shrink-0 py-1 pr-1 text-right font-mono text-[10px] text-muted">{h}시</div>
                  {DAYS.map((_, wd) => {
                    const n = grid.grid[wd][ci];
                    const ratio = grid.max ? n / grid.max : 0;
                    return (
                      <div key={wd} className="flex-1 border border-line/60" style={{ minHeight: 20 }} title={`${DAYS[wd]} ${h}시 · ${n}건`}>
                        <div className="h-full w-full" style={{ backgroundColor: "var(--color-primary)", opacity: n === 0 ? 0 : 0.12 + ratio * 0.68 }} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          진하게 = 예약 많음 · 빈칸 = 예약 없는 시간대. ※ 트레이너 정원(근무시간) 데이터가 없어 &lsquo;가동률 %&rsquo;가 아니라 예약 <b>밀도</b>예요.
        </p>
      </Card>

      {/* 3) 트레이너별 스케줄 표 */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted" />
          <span className="text-[11px] font-semibold tracking-label-ko text-muted">트레이너별 스케줄 · 완료·노쇼</span>
        </div>
        {trainers.length === 0 ? (
          <p className="text-[12px] text-muted">트레이너 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] tracking-label-ko text-muted">
                  <th className="border-b border-line px-2.5 py-2 text-left font-semibold">트레이너</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">예약</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">완료</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">취소</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">미처리</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">완료율</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">노쇼율</th>
                </tr>
              </thead>
              <tbody>
                {trainers.map((t) => {
                  const o = outcome.find((x) => x.trainer_id === t.id) || { total: 0, done: 0, canceled: 0, pastDue: 0, doneRate: null };
                  const ns = noshow.find((x) => x.trainer_id === t.id) || { noshowRate: null };
                  return (
                    <tr key={t.id} className="border-b border-line">
                      <td className="px-2.5 py-2 text-left font-semibold text-ink">{personName(t.name)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{o.total}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{o.done}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{o.canceled}</td>
                      <td className={`px-2.5 py-2 text-right font-mono ${o.pastDue > 0 ? "text-danger-text" : "text-sub"}`}>{o.pastDue}</td>
                      <td className={`px-2.5 py-2 text-right font-mono font-semibold ${doneRateCls(o.doneRate)}`}>{pctText(o.doneRate)}</td>
                      <td className={`px-2.5 py-2 text-right font-mono font-semibold ${noshowCls(ns.noshowRate)}`}>{pctText(ns.noshowRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 px-1 text-[10px] leading-relaxed text-muted">완료율 = 완료 ÷ (완료+취소) · 노쇼율 = 수업일지 노쇼 ÷ 전체 수업(예약과 별개 집계).</p>
      </Card>

      {/* 4) 미처리 예약 리스트 */}
      <ToneCard tone="danger">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger-text" />
          <h3 className="text-sm font-bold text-ink">미처리 예약 · 완료/취소 안 됨</h3>
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-danger-text">{pastDue.length}</span>
        </div>
        {pastDue.length === 0 ? (
          <p className="text-[12px] text-muted">미처리 예약이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {pastDue.slice(0, LIMIT).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-rose-500/20 bg-card px-3 py-2.5">
                  <span className="text-sm font-semibold text-ink">{memberName(a.user_id)}</span>
                  <span className="text-[11px] text-muted">{nameOf(a.trainer_id)}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted">{kstTime(a.start_at)}</span>
                </li>
              ))}
            </ul>
            {pastDue.length > LIMIT && <p className="mt-2 text-[11px] text-muted">외 {pastDue.length - LIMIT}건</p>}
          </>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-muted">지난 예약을 완료(차감)나 취소로 정리하면 통계가 정확해져요.</p>
      </ToneCard>
    </div>
  );
}
