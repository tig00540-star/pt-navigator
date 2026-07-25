"use client";
/* =========================================================================
   #2 전환 퍼널 (OT → PT 등록) — admin '전환' 탭.
   OT 세일즈 퍼널(유입→1차→2차→확정) 깔때기 + 트레이너별 약점 + 이번 주 클로징 임박 리스트.
   admin이 이미 로드한 members·otRows를 props로 받아 파생·렌더만(자체 fetch 0 · 쿼리 추가 0).
   ★hidden 회원은 visible로 걸러 함수에 넘긴다(#1/#4 동일 규율). closingDueSoon엔 visible·OT 게이트.
   ⚠️ 시점 스냅샷(코호트 아님) · 확정=status pt_active 기준. 색: 긍정 cyan·위험 rose, 단계막대만 OT흐름(amber→primary).
   ========================================================================= */
import { useMemo, useState } from "react";
import { Filter, AlertTriangle, Users } from "lucide-react";
import { otFunnel, otFunnelByTrainer, closingDueSoon, viewFor } from "@/lib/memberStatus";
import { personName } from "@/lib/format";
import Card from "@/components/ui/Card";
import ToneCard from "@/components/ui/ToneCard";

// 단계 막대색 — OT 흐름(amber→primary). good/bad 아니라 '단계'라 예외. 정적 리터럴.
const STAGE_BG = ["bg-amber-400", "bg-amber-500", "bg-orange-500", "bg-red-500"];
const GRADE_TEXT = { good: "text-cyan-700", warn: "text-danger-text", mid: "text-ink", neutral: "text-muted" };

// 전환율 색 — ≥45% good(cyan)·≤25% warn(rose). 표본(intake)<3이면 neutral(노이즈 회피).
function convGrade(rate, intake) {
  if (rate == null || intake < 3) return "neutral";
  if (rate >= 0.45) return "good";
  if (rate <= 0.25) return "warn";
  return "mid";
}
const rpct = (r) => (r == null ? "—" : Math.round(r * 100) + "%");

export default function ConversionFunnel({ members = [], otRows = [], trainers = [] }) {
  // 오늘/이번주말(KST) — 마운트 1회 고정(렌더 순수).
  const [{ todayISO, horizonISO }] = useState(() => {
    const kstMs = new Date().getTime() + 9 * 3600 * 1000;
    return {
      todayISO: new Date(kstMs).toISOString().slice(0, 10),
      horizonISO: new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10),
    };
  });

  // ★hidden 제외 — 퍼널·임박 함수엔 전부 visible을 넘긴다.
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);

  const funnel = useMemo(() => otFunnel(visible, otRows), [visible, otRows]);
  const byTrainer = useMemo(() => otFunnelByTrainer(visible, otRows), [visible, otRows]);

  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || (tid === "unknown" ? "미배정" : String(tid).slice(0, 8));
  const memberMeta = useMemo(() => {
    const m = new Map();
    for (const r of visible) if (r?.id) m.set(r.id, { name: personName(r.name), trainer: nameOf(r.trainer_id ?? "unknown") });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, trainers]);

  // 이번 주 클로징 임박 — visible·OT 게이트 후 user_id dedup(unclosed 우선).
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

  const stages = [
    { label: "유입", n: funnel.intake },
    { label: "1차 클로징", n: funnel.first },
    { label: "2차 클로징", n: funnel.second },
    { label: "등록 확정", n: funnel.confirmed },
  ];
  const convRate = funnel.intake ? funnel.confirmed / funnel.intake : null;
  const firstRate = funnel.firstAttempt ? funnel.firstSuccess / funnel.firstAttempt : null;
  const secondRate = funnel.secondAttempt ? funnel.secondSuccess / funnel.secondAttempt : null;

  return (
    <div className="space-y-6">
      {/* 1) 깔때기 시각화 */}
      <Card>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <span className="text-[11px] font-semibold tracking-label-ko text-muted">OT → PT 전환 퍼널</span>
        </div>
        {funnel.intake === 0 ? (
          <p className="mt-3 text-[12px] text-muted">OT 유입 회원이 없습니다.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-4xl font-extrabold text-cyan-700">{rpct(convRate)}</span>
              <span className="text-[13px] text-sub">유입 <b className="text-ink">{funnel.intake}명</b> → 등록 확정 <b className="text-cyan-700">{funnel.confirmed}명</b></span>
            </div>
            <div className="mt-4 space-y-2">
              {stages.map((s, i) => {
                const w = funnel.intake ? Math.round((s.n / funnel.intake) * 100) : 0;
                const prev = i > 0 ? stages[i - 1].n : null;
                const drop = prev && prev > 0 ? Math.round(((prev - s.n) / prev) * 100) : null;
                return (
                  <div key={s.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-ink">{s.label} <span className="text-muted">{s.n}명</span></span>
                      <span className="font-mono text-muted">
                        {w}%{drop != null && drop > 0 && <span className="ml-1.5 text-danger-text">↓{drop}%</span>}
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
              <span>1차 성공률 <b className="text-ink">{rpct(firstRate)}</b> <span className="text-muted">({funnel.firstSuccess}/{funnel.firstAttempt})</span></span>
              <span>2차 성공률 <b className="text-ink">{rpct(secondRate)}</b> <span className="text-muted">({funnel.secondSuccess}/{funnel.secondAttempt})</span></span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              현재 각 단계 분포(시점 스냅샷 · 코호트 아님) · 확정은 status(pt_active) 기준. ②③④는 엄밀 단조 아님(즉등록 가능).
            </p>
          </>
        )}
      </Card>

      {/* 2) 트레이너별 퍼널 비교 */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" />
          <span className="text-[11px] font-semibold tracking-label-ko text-muted">트레이너별 퍼널 · 어디서 새는지</span>
        </div>
        {byTrainer.length === 0 ? (
          <p className="text-[12px] text-muted">OT 유입 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] tracking-label-ko text-muted">
                  <th className="border-b border-line px-2.5 py-2 text-left font-semibold">트레이너</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">유입</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">1차</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">2차</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">확정</th>
                  <th className="border-b border-line px-2.5 py-2 text-right font-semibold">전환율</th>
                  <th className="border-b border-line px-2.5 py-2 text-left font-semibold">약점</th>
                </tr>
              </thead>
              <tbody>
                {byTrainer.map((t) => {
                  const g = convGrade(t.convRate, t.intake);
                  const weak = [];
                  if (t.intake >= 3 && t.first / t.intake < 0.5) weak.push("1차 시도율↓");
                  if (t.second > 0 && t.confirmed / t.second < 0.5) weak.push("마감 전환↓");
                  return (
                    <tr key={t.trainer_id} className="border-b border-line">
                      <td className="px-2.5 py-2 text-left font-semibold text-ink">{nameOf(t.trainer_id)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{t.intake}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{t.first}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-sub">{t.second}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-ink">{t.confirmed}</td>
                      <td className={`px-2.5 py-2 text-right font-mono font-semibold ${GRADE_TEXT[g]}`}>{rpct(t.convRate)}</td>
                      <td className="px-2.5 py-2 text-left">
                        {weak.length === 0 ? <span className="text-[11px] text-muted">—</span> : (
                          <span className="flex flex-wrap gap-1">
                            {weak.map((w) => <span key={w} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger-text">{w}</span>)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 3) 이번 주 클로징 임박 (unclosed = 우선순위 red) */}
      <ToneCard tone="unclosed">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger-text" />
          <h3 className="text-sm font-bold text-ink">이번 주 클로징 임박</h3>
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-danger-text">{due.length}</span>
        </div>
        {due.length === 0 ? (
          <p className="text-[12px] text-muted">이번 주 임박한 클로징이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {due.map((d) => {
              const meta = memberMeta.get(d.user_id) || { name: String(d.user_id).slice(0, 8), trainer: "미배정" };
              return (
                <li key={d.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-card px-3 py-2.5">
                  <span className="text-sm font-semibold text-ink">{meta.name}</span>
                  <span className="text-[11px] text-muted">{meta.trainer}</span>
                  {d.kind === "unclosed" ? (
                    <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger-text">2차 미마감 · 결정 필요</span>
                  ) : (
                    <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">재접근 {d.date}{d.ot_round ? ` · ${d.ot_round}차` : ""}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ToneCard>
    </div>
  );
}
