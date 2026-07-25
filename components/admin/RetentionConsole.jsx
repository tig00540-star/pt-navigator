"use client";
/* =========================================================================
   #4 재등록·이탈 관제 콘솔 — admin '리텐션' 탭.
   원장용 센터 전체 관제(트레이너 화면 ChurnRiskToday/RegisterDueToday와 원천 로직 공유·숫자 일치).
   admin이 이미 로드한 데이터를 props로 받아 파생·렌더만(자체 fetch 0 · 쿼리 추가 0).
   ★hidden(환불·소프트삭제) 회원은 컴포넌트에서 visible로 걸러 관제 함수에 넘긴다(#1과 동일 규율).
   색: 긍정=cyan · 위험=rose(danger) — DS 초록제거 정책. 예상 재등록매출은 '추정' 명시(허위 긴급성 금지).
   ========================================================================= */
import { useMemo, useState } from "react";
import { TrendingDown, AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import {
  churnRiskMembers, expiringMembers, avgReregisterAmount, reregisterStatsByTrainer,
} from "@/lib/memberStatus";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import ToneCard from "@/components/ui/ToneCard";

const LIMIT = 20; // 리스트 상위 N + "외 M명" 접기.

/* 요약 타일 — 모듈 레벨(render 중 컴포넌트 생성 금지). accent: cyan(긍정)·rose(위험)·ink. */
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

export default function RetentionConsole({ members = [], contracts = [], logs = [], trainers = [], ym }) {
  const [nowISO] = useState(() => new Date().toISOString());
  const [showAllExp, setShowAllExp] = useState(false);
  const [showAllChurn, setShowAllChurn] = useState(false);

  // ★hidden 제외 — 관제 함수엔 전부 visible을 넘긴다(트레이너 화면과 숫자 일치).
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);

  const nameById = useMemo(() => {
    const m = new Map();
    for (const r of visible) if (r?.id) m.set(r.id, personName(r.name));
    return m;
  }, [visible]);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || (tid === "unknown" ? "미배정" : String(tid).slice(0, 8));
  const memberName = (uid) => nameById.get(uid) || String(uid).slice(0, 8);

  const churn = useMemo(() => churnRiskMembers(visible, contracts, logs, { nowISO }), [visible, contracts, logs, nowISO]);
  const expiring = useMemo(() => expiringMembers(visible, contracts, logs, { nowISO }), [visible, contracts, logs, nowISO]);
  const avgRe = useMemo(() => avgReregisterAmount(contracts), [contracts]);
  const reregByTrainer = useMemo(() => reregisterStatsByTrainer(contracts), [contracts]);

  const expectedReRev = avgRe != null ? expiring.length * avgRe : null;
  const idleSessions = churn.reduce((s, c) => s + c.rem.total, 0);

  const expShown = showAllExp ? expiring : expiring.slice(0, LIMIT);
  const churnShown = showAllChurn ? churn : churn.slice(0, LIMIT);

  return (
    <div className="space-y-6">
      {/* 1) 요약 타일 4개 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={RefreshCw} label="만료 임박" value={`${expiring.length}명`} accent="cyan"
          sub="유료 잔여 10회 미만" />
        <SummaryTile icon={Wallet} label="예상 재등록 매출" value={expectedReRev != null ? won(expectedReRev) : "표본 부족"} accent="cyan"
          sub={avgRe != null ? `추정 · 과거 재등록 평균 ${won(avgRe)} 기준` : "재등록 이력 쌓이면 표시"} />
        <SummaryTile icon={AlertTriangle} label="이탈 위험" value={`${churn.length}명`} accent="rose"
          sub="14일+ 무수업 (잔여 있음)" />
        <SummaryTile icon={TrendingDown} label="방치 잔여세션" value={`${idleSessions}회`} accent="rose"
          sub="이탈위험 회원 잔여 합" />
      </div>

      {/* 2) 만료 임박 리스트 (renewal=sky) */}
      <ToneCard tone="renewal">
        <div className="mb-2 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-cyan-700" />
          <h3 className="text-sm font-bold text-ink">만료 임박 · 재등록 대상</h3>
          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-700">{expiring.length}</span>
        </div>
        {expiring.length === 0 ? (
          <p className="text-[12px] text-muted">임박 회원이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {expShown.map((e) => (
                <li key={e.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-card px-3 py-2.5">
                  <span className="text-sm font-semibold text-ink">{memberName(e.user_id)}</span>
                  <span className="text-[11px] text-muted">{nameOf(e.trainer_id)}</span>
                  <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                    잔여 유료 {e.rem.paid}{e.rem.service ? ` · 서비스 ${e.rem.service}` : ""}회
                  </span>
                  {e.gap != null && <span className="text-[11px] text-muted">마지막 {e.gap}일 전</span>}
                  {avgRe != null && <span className="ml-auto font-mono text-[12px] font-semibold text-cyan-700">≈ {won(avgRe)}</span>}
                </li>
              ))}
            </ul>
            {expiring.length > LIMIT && (
              <button onClick={() => setShowAllExp((v) => !v)} className="mt-2 text-[12px] font-semibold text-cyan-700 hover:underline">
                {showAllExp ? "접기" : `외 ${expiring.length - LIMIT}명 더 보기`}
              </button>
            )}
          </>
        )}
      </ToneCard>

      {/* 3) 이탈 위험 리스트 (danger=rose) */}
      <ToneCard tone="danger">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger-text" />
          <h3 className="text-sm font-bold text-ink">이탈 위험 · 최근 14일 무수업</h3>
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-danger-text">{churn.length}</span>
        </div>
        {churn.length === 0 ? (
          <p className="text-[12px] text-muted">이탈 위험 회원이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {churnShown.map((c) => (
                <li key={c.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-rose-500/20 bg-card px-3 py-2.5">
                  <span className="text-sm font-semibold text-ink">{memberName(c.user_id)}</span>
                  <span className="text-[11px] text-muted">{nameOf(c.trainer_id)}</span>
                  <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger-text">
                    {c.everCame ? `${c.gap}일째 무수업` : `등록 후 ${c.gap}일 미방문`}
                  </span>
                  <span className="ml-auto text-[11px] text-muted">잔여 {c.rem.total}회</span>
                </li>
              ))}
            </ul>
            {churn.length > LIMIT && (
              <button onClick={() => setShowAllChurn((v) => !v)} className="mt-2 text-[12px] font-semibold text-danger-text hover:underline">
                {showAllChurn ? "접기" : `외 ${churn.length - LIMIT}명 더 보기`}
              </button>
            )}
          </>
        )}
      </ToneCard>

      {/* 4) 트레이너별 재등록률 비교 (#1 리더보드 재등록 열과 값 일치) */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-bold text-ink">트레이너별 재등록률{ym ? ` · 누적` : ""}</h3>
        </div>
        {trainers.length === 0 ? (
          <p className="text-[12px] text-muted">트레이너 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {trainers.map((t) => {
              const st = reregByTrainer.get(t.id) || { attempted: 0, success: 0, rate: null };
              const rate = st.rate;
              return (
                <div key={t.id}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-ink">{personName(t.name)}</span>
                    <span className="font-mono text-sub">
                      {rate == null ? "—" : `${Math.round(rate * 100)}%`}
                      <span className="ml-1 text-[10px] text-muted">({st.success}/{st.attempted})</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-cyan-500" style={{ width: `${rate == null ? 0 : Math.round(rate * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
