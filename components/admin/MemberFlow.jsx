"use client";
/* =========================================================================
   등록·이탈 — 구 '회원 흐름'(하위탭 2개: OT 전환 + PT 유지)을 한 화면으로 합친 것.

   ── 왜 합쳤나 ──
   두 화면에 성격이 다른 세 가지가 섞여 있었고 둘은 이미 주인이 따로 있었다.
     · 트레이너별 등록 흐름 표 / 트레이너별 재등록률 표 → 트레이너 탭 리더보드가 같은 열을 갖는다
       (RetentionConsole 주석도 "리더보드 재등록 열과 값 일치"라고 인정했다)
     · 이탈 위험·만료 임박 명단 → '오늘 챙길 것' 카드 펼침에서 이미 본다
   남는 고유 가치는 하나, **어디서 새는가**. 그래서 위는 흐름·추세, 아래는 지금 챙길 명단으로
   한 줄기로 세운다. 트레이너별 비교는 링크 한 줄로 넘긴다.

   ⚠️ 위 깔때기는 '지금 시점 스냅샷'이라 추세를 못 본다 → 월별 코호트(otFunnelByMonth)를 같이 둔다.
   ★hidden(환불·소프트삭제) 제외는 컴포넌트 책임 — 모든 파생에 visible을 넘긴다.
   admin이 이미 로드한 배열만 쓴다(fetch 0 · 쿼리 0 · 마이그레이션 0).
   색: 긍정 cyan · 위험 rose(danger) · 단계막대만 OT 흐름(amber→primary) 예외.
   ========================================================================= */
import { useMemo, useState } from "react";
import { ChevronDown, Filter, TrendingDown, RefreshCw, Users, Wallet, AlertTriangle, ChevronRight } from "lucide-react";
import {
  otFunnel, otFunnelByMonth, closingDueSoon, churnRiskMembers, expiringMembers,
  avgReregisterAmount, reregisterStats, viewFor, isClosingStatSubject,
} from "@/lib/memberStatus";
import { wonApprox, personName } from "@/lib/format";
import Card from "@/components/ui/Card";

const STAGE_BG = ["bg-amber-400", "bg-amber-500", "bg-orange-500", "bg-red-500"];
const rpct = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
const LIMIT = 20;

export default function MemberFlow({ members = [], otRows = [], contracts = [], logs = [], trainers = [], ym, onGoTab }) {
  const [{ nowISO, todayISO, horizonISO }] = useState(() => {
    const now = new Date();
    const kstMs = now.getTime() + 9 * 3600 * 1000;
    return {
      nowISO: now.toISOString(),
      todayISO: new Date(kstMs).toISOString().slice(0, 10),
      horizonISO: new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10),
    };
  });
  const [open, setOpen] = useState(null); // 한 번에 하나만 펼친다

  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || (tid === "unknown" ? "미배정" : String(tid).slice(0, 8));
  const nameById = useMemo(() => new Map(visible.filter((m) => m?.id).map((m) => [m.id, personName(m.name)])), [visible]);
  const memberName = (uid) => nameById.get(uid) || String(uid).slice(0, 8);
  const trainerOf = useMemo(() => new Map(visible.filter((m) => m?.id).map((m) => [m.id, m.trainer_id ?? "unknown"])), [visible]);

  const funnel = useMemo(() => otFunnel(visible, otRows), [visible, otRows]);
  const trend = useMemo(() => otFunnelByMonth(visible, ym, 6), [visible, ym]);
  const churn = useMemo(() => churnRiskMembers(visible, contracts, logs, { nowISO }), [visible, contracts, logs, nowISO]);
  const expiring = useMemo(() => expiringMembers(visible, contracts, logs, { nowISO }), [visible, contracts, logs, nowISO]);
  const avgRe = useMemo(() => avgReregisterAmount(contracts), [contracts]);
  const rereg = useMemo(() => reregisterStats(contracts), [contracts]);

  // 이번 주 챙길 등록 — 2차 미마감 + 보류 재접근 도래(user_id dedup · unclosed 우선).
  const due = useMemo(() => {
    const otIds = new Set(visible.filter((m) => viewFor(m) === "ot").map((m) => m.id));
    const validIds = new Set(visible.map((m) => m.id));
    const raw = closingDueSoon(otRows, { todayISO, horizonISO, otMemberIds: otIds, validMemberIds: validIds });
    const byUser = new Map();
    for (const d of raw) {
      const prev = byUser.get(d.user_id);
      if (!prev || (d.kind === "unclosed" && prev.kind !== "unclosed")) byUser.set(d.user_id, d);
    }
    return [...byUser.values()];
  }, [visible, otRows, todayISO, horizonISO]);

  // 1차 OT 대기 — OT로 들어왔는데 아직 1차 기록이 없는 회원(= 깔때기 첫 칸에서 빠지는 자리).
  const waitingFirst = useMemo(() => {
    const hasRound1 = new Set(
      otRows.filter((r) => r && r.ot_round === 1 && r.user_id != null).map((r) => r.user_id)
    );
    return visible
      .filter((m) => isClosingStatSubject(m) && viewFor(m) === "ot" && !hasRound1.has(m.id))
      .map((m) => ({ user_id: m.id, trainerId: m.trainer_id ?? "unknown" }));
  }, [visible, otRows]);

  const stages = [
    { label: "OT 회원 (전체)", n: funnel.intake },
    { label: "1차 OT 진행", n: funnel.first },
    { label: "2차 OT 진행", n: funnel.second },
    { label: "PT 등록", n: funnel.confirmed },
  ];
  const convRate = funnel.intake ? funnel.confirmed / funnel.intake : null;
  const firstRate = funnel.firstAttempt ? funnel.firstSuccess / funnel.firstAttempt : null;
  const secondRate = funnel.secondAttempt ? funnel.secondSuccess / funnel.secondAttempt : null;
  const idleSessions = churn.reduce((s, c) => s + c.rem.total, 0);
  const expectedReRev = avgRe != null ? expiring.length * avgRe : null;

  // 아래 명단 4줄 — 숫자를 탭하면 그 자리에서 펼친다('오늘 챙길 것'과 같은 방식).
  const lists = [
    {
      key: "waiting", icon: Users, tone: "muted",
      title: `1차 OT 대기 ${waitingFirst.length}명`, hint: "상담 약속만 잡고 아직 1차를 안 한 회원",
      rows: waitingFirst.map((r) => ({ id: r.user_id, user_id: r.user_id, trainerId: r.trainerId })),
    },
    {
      key: "due", icon: AlertTriangle, tone: "rose",
      title: `이번 주 챙길 등록 ${due.length}명`, hint: "2차 OT 후 미결정 · 재상담 예정",
      rows: due.map((d) => ({
        id: d.user_id, user_id: d.user_id, trainerId: trainerOf.get(d.user_id) ?? "unknown",
        tag: d.kind === "unclosed" ? "2차 OT 후 미결정" : `재상담 ${d.date}`,
      })),
    },
    {
      key: "expiring", icon: RefreshCw, tone: "cyan",
      title: `만료 임박 ${expiring.length}명`,
      hint: expectedReRev != null ? `모두 재등록하면 ${wonApprox(expectedReRev)}` : "유료 잔여 10회 미만",
      rows: expiring.slice(0, LIMIT).map((e) => ({
        id: e.user_id, user_id: e.user_id, trainerId: e.trainer_id ?? "unknown",
        tag: `잔여 유료 ${e.rem.paid}회`, note: e.gap != null ? `마지막 ${e.gap}일 전` : "",
      })),
      more: Math.max(0, expiring.length - LIMIT),
    },
    {
      key: "churn", icon: TrendingDown, tone: "rose",
      title: `이탈 위험 ${churn.length}명`, hint: `남은 수업 ${idleSessions}회 · 이미 받은 수업료`,
      rows: churn.slice(0, LIMIT).map((c) => ({
        id: c.user_id, user_id: c.user_id, trainerId: c.trainer_id ?? "unknown",
        tag: c.everCame ? `${c.gap}일째 무수업` : `등록 후 ${c.gap}일 미방문`,
        note: `잔여 ${c.rem.total}회`,
      })),
      more: Math.max(0, churn.length - LIMIT),
    },
  ];

  const maxIntake = Math.max(1, ...trend.map((t) => t.intake));

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-sub">
        회원이 들어와서 <b className="text-ink">어디서 새는지</b>, 그리고 지금 챙길 사람이 누구인지.
      </p>

      {/* ── 신규 → 등록 ── */}
      <Card>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-primary-strong" />
          <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">신규 OT → PT 등록</span>
        </div>

        {funnel.intake === 0 ? (
          <p className="mt-3 text-[13px] text-muted">OT로 들어온 회원이 없어요.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-4xl font-extrabold text-cyan-700">{rpct(convRate)}</span>
              <span className="text-[13px] text-sub">OT 회원 <b className="text-ink">{funnel.intake}명</b> 중 <b className="text-cyan-700">{funnel.confirmed}명</b> 등록</span>
            </div>

            <div className="mt-4 space-y-2">
              {stages.map((s, i) => {
                const w = funnel.intake ? Math.round((s.n / funnel.intake) * 100) : 0;
                const prev = i > 0 ? stages[i - 1].n : null;
                const drop = prev && prev > 0 ? prev - s.n : null;
                return (
                  <div key={s.label}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-ink">{s.label} <span className="text-muted">{s.n}명</span></span>
                      <span className="font-mono text-muted">
                        {w}%{drop != null && drop > 0 && <span className="ml-1.5 text-danger-text">−{drop}명</span>}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
                      <div className={`h-full rounded-full ${STAGE_BG[i]}`} style={{ width: `${Math.max(w, s.n > 0 ? 3 : 0)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-sub">
              <span>1차에서 등록 <b className="text-ink">{rpct(firstRate)}</b> <span className="text-muted">({funnel.firstSuccess}/{funnel.firstAttempt})</span></span>
              <span>2차에서 등록 <b className="text-ink">{rpct(secondRate)}</b> <span className="text-muted">({funnel.secondSuccess}/{funnel.secondAttempt})</span></span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              각 단계는 앞 단계에 포함돼요(2차 진행 회원은 1차에도 들어감). 지금 시점 기준이라 이번 달 성적이 아니라 누적입니다.
            </p>
          </>
        )}
      </Card>

      {/* ── 월별 전환(코호트) — "나아지고 있나"에 답하는 자리 ── */}
      <Card>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary-strong" />
          <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">달마다 클로징률 · 나아지고 있나</span>
        </div>
        {trend.every((t) => t.intake === 0) ? (
          <p className="mt-3 text-[12px] text-muted">아직 달별로 비교할 유입이 없어요.</p>
        ) : (
          <>
            <div className="mt-4 flex items-stretch justify-between gap-2" style={{ height: 110 }}>
              {trend.map((t, i) => {
                const last = i === trend.length - 1;
                const h = Math.max(3, Math.round((t.intake / maxIntake) * 100));
                const fill = t.intake ? Math.round((t.confirmed / t.intake) * 100) : 0;
                return (
                  <div key={t.ym} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div className="relative mx-auto w-6 overflow-hidden rounded-t bg-line" style={{ height: `${h}%` }}
                        title={`${t.ym} · 유입 ${t.intake}명 중 ${t.confirmed}명 등록`}>
                        <div className="absolute inset-x-0 bottom-0 bg-cyan-500" style={{ height: `${fill}%` }} />
                      </div>
                    </div>
                    <div className={`font-mono text-[12px] font-bold ${last ? "text-muted" : "text-ink"}`}>{rpct(t.rate)}</div>
                    <div className="text-[12px] text-muted">{Number(t.ym.slice(5))}월</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              그 달에 <b className="text-ink">들어온</b> 회원 중 몇 %가 등록했는지예요(회색 막대=유입 인원, 파란 부분=등록).
              이번 달은 아직 진행 중이라 낮게 보여요. 등록은 다음 달에도 일어나요.
            </p>
          </>
        )}
      </Card>

      {/* ── PT 회원 유지 ── */}
      <Card>
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 shrink-0 text-primary-strong" />
          <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">PT 회원 · 재등록과 이탈</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="재등록률" value={rpct(rereg.rate)} sub={rereg.attempted ? `${rereg.success}/${rereg.attempted}건` : "이력 없음"} accent="cyan" />
          <Stat label="만료 임박" value={`${expiring.length}명`} sub={expectedReRev != null ? wonApprox(expectedReRev) : "—"} accent="cyan" />
          <Stat label="이탈 위험" value={`${churn.length}명`} sub={`남은 수업 ${idleSessions}회`} accent="rose" />
        </div>
      </Card>

      {/* ── 지금 챙길 명단 — 숫자를 탭하면 제자리에서 펼친다 ── */}
      <div className="space-y-2">
        {lists.map((l) => {
          const Icon = l.icon;
          const isOpen = open === l.key;
          const empty = l.rows.length === 0;
          const color = l.tone === "rose" ? "text-danger-text" : l.tone === "cyan" ? "text-cyan-700" : "text-muted";
          return (
            <Card key={l.key} interactive={!empty} onClick={() => !empty && setOpen(isOpen ? null : l.key)}>
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${empty ? "text-muted" : color}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-bold ${empty ? "text-muted" : "text-ink"}`}>{l.title}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{l.hint}</div>
                </div>
                {!empty && (
                  <div className="mt-0.5 inline-flex shrink-0 items-center text-[12px] text-muted">
                    {isOpen ? "접기" : "누구인지 보기"}
                    <ChevronDown className={`h-3 w-3 transition ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                )}
              </div>

              {isOpen && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {l.rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                      <span className="font-medium text-sub">{memberName(r.user_id)}</span>
                      <span className="text-[12px] text-muted">{nameOf(r.trainerId)}</span>
                      {r.tag && <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${l.tone === "rose" ? "bg-rose-500/10 text-danger-text" : "bg-cyan-500/10 text-cyan-700"}`}>{r.tag}</span>}
                      {r.note && <span className="ml-auto font-mono text-[12px] text-muted">{r.note}</span>}
                    </li>
                  ))}
                  {l.more > 0 && <li className="pt-1 text-[12px] text-muted">외 {l.more}명 더 있어요</li>}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {/* 트레이너별 비교는 리더보드가 주인 — 여기서 표를 또 그리지 않는다. */}
      {onGoTab && (
        <button type="button" onClick={() => onGoTab("perf")}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted underline-offset-2 hover:text-sub hover:underline">
          <Wallet className="h-3.5 w-3.5" /> 트레이너별 클로징률·재등록률 보기 <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  const color = accent === "rose" ? "text-danger-text" : accent === "cyan" ? "text-cyan-700" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-elevate px-3 py-2.5">
      <div className="text-[12px] tracking-label-ko text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-extrabold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
