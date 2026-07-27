"use client";
/* =========================================================================
   오늘의 리포트 — 원장 코칭용(읽기 전용). 트레이너 탭(atab==="perf") 하단 섹션.
   각 트레이너의 OT·재등록 업무 '실제 내용'까지 보고 부족한 곳을 짚어 오프라인 대면 코칭.
   제거된 "QC 모니터링"(하드코딩 데모)의 실측 대체재.
   ⚠️ write·supabase 호출 0 · 새 fetch 0 — admin이 이미 로드한 배열을 props로 받아 순수 파생만.
   뷰 2개(토글): ①오늘(기본·건별 코칭 카드) ②전체 누적(트레이너별 요약·보관).
   ========================================================================= */
import { useMemo, useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronRight } from "lucide-react";
import { kstToday } from "@/lib/date";
import {
  todayCases,
  observationQualityByTrainer,
  briefGapsByTrainer,
  logWriteRateByTrainer,
  closingStatsByRoundByTrainer,
  reregisterStatsByTrainer,
} from "@/lib/memberStatus";
import { labelOf, CLOSING_REASON_OPTS, REG_REASON_OPTS } from "@/lib/labels";
import { personName } from "@/lib/format";

/* 원장 조정 가능 임계 — 스펙 2-b. closeWarn/reRegWarn은 ④ 색·코칭용 확장(스펙 TH 외 추가). */
const TH = { obsAvgWarn: 0.5, gapWarn: 0.34, logRateWarn: 0.8, minObs: 3, minBrief: 1, minLog: 3, minClose: 3, closeWarn: 0.5, reRegWarn: 0.5 };
const OBS_MISSING_LABEL = { movements: "관찰 동작", plan2nd: "2차 계획", reactionMemo: "반응 메모", attitude: "태도 태그", goal: "목표 구체화", memberQuote: "회원 한마디", trainerNote: "종합 소견" };
const SIGNAL_LABEL = { obs_thin: "관찰 얇음", gaps: "브리핑 근거부족", closing: "클로징", log_missing: "일지 미작성" };

const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");

/* 신호 칩 한 줄. */
function SignalChips({ signals }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {signals.map((s, i) => {
        if (s.type === "obs_thin") {
          return (
            <span key={i} className="inline-flex flex-wrap items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] text-danger-text">
              {SIGNAL_LABEL.obs_thin} {s.detail}
              {Array.isArray(s.missing) && s.missing.length > 0 && (
                <span className="text-danger-text/70">· 빠짐 {s.missing.map((k) => OBS_MISSING_LABEL[k] || k).join("·")}</span>
              )}
            </span>
          );
        }
        if (s.type === "gaps") {
          return (
            <span key={i} className="inline-flex flex-wrap items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] text-danger-text">
              {SIGNAL_LABEL.gaps}
              {Array.isArray(s.detail) && s.detail.length > 0 && <span className="text-danger-text/70">· {s.detail.join(" / ")}</span>}
            </span>
          );
        }
        if (s.type === "closing") {
          const r = s.detail?.result === "hold" ? "보류" : "실패";
          const reason = s.detail?.reason ? labelOf(CLOSING_REASON_OPTS, s.detail.reason) : null;
          return (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] text-danger-text">
              클로징 {r}{reason ? ` · ${reason}` : ""}
            </span>
          );
        }
        // log_missing
        return (
          <span key={i} className="inline-flex items-center rounded-md bg-elevate px-2 py-0.5 text-[11px] text-sub">
            {SIGNAL_LABEL.log_missing}
          </span>
        );
      })}
    </div>
  );
}

/* 전체 뷰 지표 셀 — 표본 부족은 "—"(neutral). */
function Metric({ label, value, tone, sub }) {
  const cls = tone === "warn" ? "text-danger-text" : tone === "good" ? "text-cyan-700" : "text-muted";
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-label-ko text-muted">{label}</div>
      <div className={`font-mono text-lg font-bold leading-tight ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

export default function TrainerQualityReport({ members = [], otRows = [], contracts = [], logs = [], trainers = [], ym }) {
  // hidden 필터 = 컴포넌트 책임(CLAUDE.md) — 스코어카드와 정합.
  const visible = useMemo(() => (members || []).filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(visible.filter((r) => r?.id).map((r) => [r.id, r.trainer_id ?? "unknown"])), [visible]);
  const nameById = useMemo(() => new Map((members || []).filter((r) => r?.id).map((r) => [r.id, r.name])), [members]);
  const trainerName = (id) => personName(trainers.find((t) => t.id === id)?.name) || "미배정";
  const today = kstToday();

  // 오늘 뷰
  const tc = useMemo(() => todayCases(otRows, logs, memberTrainer, { today }), [otRows, logs, memberTrainer, today]);
  // 전체 뷰(useMemo는 항상 돌고 렌더만 지연 — 시인성 규율)
  const obsQ = useMemo(() => observationQualityByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
  const gapsMap = useMemo(() => briefGapsByTrainer(otRows, contracts, memberTrainer), [otRows, contracts, memberTrainer]);
  const logRate = useMemo(() => logWriteRateByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
  const closeRnd = useMemo(() => closingStatsByRoundByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
  const reRegMap = useMemo(() => reregisterStatsByTrainer(contracts), [contracts]);

  const [mode, setMode] = useState("today"); // "today" | "all"
  const [openIds, setOpenIds] = useState({}); // 전체 뷰 트레이너별 드릴다운
  const toggle = (id) => setOpenIds((p) => ({ ...p, [id]: !p[id] }));

  // 오늘 뷰 — 코칭 카드 트레이너별 그룹핑
  const todayGroups = useMemo(() => {
    const g = new Map();
    for (const c of tc.cases) {
      const arr = g.get(c.trainer_id) || [];
      arr.push(c);
      g.set(c.trainer_id, arr);
    }
    return [...g.entries()];
  }, [tc.cases]);
  const activityZero = tc.obsCount === 0 && tc.sessionCount === 0 && tc.successCount === 0 && tc.cases.length === 0;

  return (
    <div>
      {/* 헤더 + 토글 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-fuchsia-600" />
          <div>
            <div className="text-sm font-semibold text-ink">오늘의 리포트</div>
            <div className="text-[11px] text-muted">오늘 진행한 OT·수업의 부족한 부분 — 대면 코칭용</div>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-elevate p-0.5">
          {[["today", "오늘"], ["all", "전체 누적"]].map(([m, lbl]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${mode === m ? "bg-card text-ink shadow-sm" : "text-muted hover:text-sub"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 오늘 뷰 ===== */}
      {mode === "today" && (
        <div>
          {/* 상단 요약 */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span>오늘 성공 <b className="text-cyan-700">{tc.successCount}건</b></span>
            <span className="text-line">·</span>
            <span>수업 <b className="text-ink">{tc.sessionCount}건</b></span>
            <span className="text-line">·</span>
            <span>코칭 <b className={tc.cases.length > 0 ? "text-danger-text" : "text-muted"}>{tc.cases.length}건</b></span>
          </div>

          {tc.cases.length === 0 ? (
            <div className="rounded-2xl border border-line bg-card p-5 text-center text-xs text-muted">
              {activityZero ? "오늘 진행한 OT·수업이 아직 없어요." : `오늘 챙길 부분 없어요 — 오늘 진행 ${tc.obsCount + tc.sessionCount}건 모두 양호.`}
            </div>
          ) : (
            <div className="space-y-4">
              {todayGroups.map(([tid, cases]) => (
                <div key={tid}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-semibold text-sub">{trainerName(tid)}</span>
                    <span className="text-[11px] text-muted">코칭 {cases.length}건</span>
                  </div>
                  <div className="space-y-2">
                    {cases.map((c) => (
                      <div key={c.user_id} className="rounded-xl border border-line bg-card px-4 py-3">
                        <div className="text-sm font-medium text-ink">{nameById.get(c.user_id) || "회원"}</div>
                        <SignalChips signals={c.signals} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Footnotes />
        </div>
      )}

      {/* ===== 전체 누적 뷰 ===== */}
      {mode === "all" && (
        <div>
          <div className="space-y-2">
            {trainers.map((t) => {
              const o = obsQ.get(t.id);
              const g = gapsMap.get(t.id);
              const lr = logRate.get(t.id);
              const cr = closeRnd.get(t.id);
              const rr = reRegMap.get(t.id);

              // ① 관찰
              const obsEnough = o && o.members >= TH.minObs;
              const obsWarn = obsEnough && o.avgScore != null && o.avgScore < TH.obsAvgWarn;
              // ② 브리핑
              const briefTot = g ? g.otBriefs + g.regBriefs : 0;
              const gapRatio = briefTot > 0 ? (g.otGaps + g.regGaps) / briefTot : null;
              const briefEnough = briefTot >= TH.minBrief;
              const briefWarn = briefEnough && gapRatio != null && gapRatio > TH.gapWarn;
              // ③ 일지(이달)
              const logEnough = lr && lr.total >= TH.minLog;
              const logWarn = logEnough && lr.rate != null && lr.rate < TH.logRateWarn;
              const logGood = logEnough && lr.rate != null && lr.rate >= TH.logRateWarn;
              // ④ 클로징(2차)/재등록
              const r2 = cr?.r2;
              const closeEnough = r2 && r2.attempted >= TH.minClose;
              const closeWarn = closeEnough && r2.rate != null && r2.rate < TH.closeWarn;
              const regEnough = rr && rr.attempted >= TH.minClose;
              const regWarn = regEnough && rr.rate != null && rr.rate < TH.reRegWarn;

              // 코칭 포인트 — 표본 충분 & 임계 미달만, 낙차 최대 1개(결정적).
              const cands = [];
              if (obsWarn) cands.push({ gap: TH.obsAvgWarn - o.avgScore, msg: `관찰 기록이 얇어요 — 평균 ${pct(o.avgScore)}` });
              if (briefWarn) cands.push({ gap: gapRatio - TH.gapWarn, msg: `브리핑 근거부족이 잦아요 — ${pct(gapRatio)}` });
              if (logWarn) cands.push({ gap: TH.logRateWarn - lr.rate, msg: `이달 일지 작성이 부족해요 — ${pct(lr.rate)}` });
              if (closeWarn) cands.push({ gap: TH.closeWarn - r2.rate, msg: `2차 클로징이 낮아요 — ${pct(r2.rate)}` });
              if (regWarn) cands.push({ gap: TH.reRegWarn - rr.rate, msg: `재등록이 낮아요 — ${pct(rr.rate)}` });
              cands.sort((a, b) => b.gap - a.gap);
              const coach = cands[0]?.msg || null;

              // 드릴다운 데이터
              const otFails = otRows.filter((r) => r && r.ot_round === 2 && (r.closing_result === "fail" || r.closing_result === "hold") && memberTrainer.get(r.user_id) === t.id);
              const regFails = contracts.filter((r) => r && r.trainer_id === t.id && (r.reg_result === "fail" || r.reg_result === "hold"));
              const hasDrill = (o?.thinList?.length || 0) + (g?.gapItems?.length || 0) + otFails.length + regFails.length > 0;
              const open = !!openIds[t.id];

              return (
                <div key={t.id} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{personName(t.name)}</span>
                    {hasDrill && (
                      <button type="button" onClick={() => toggle(t.id)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted hover:text-sub">
                        근거 {open ? "접기" : "펼치기"}
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* 코칭 포인트(결론 먼저) */}
                  <div className={`mt-1 text-xs ${coach ? "text-danger-text" : "text-muted"}`}>
                    {coach || "특별히 챙길 부분 없어요."}
                  </div>

                  {/* 4신호 지표 */}
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric
                      label="1차 관찰"
                      value={obsEnough ? pct(o.avgScore) : "—"}
                      tone={obsWarn ? "warn" : "neutral"}
                      sub={obsEnough ? `얇음 ${o.thin}/${o.members}` : "표본 부족"}
                    />
                    <Metric
                      label="브리핑 근거"
                      value={briefEnough ? pct(gapRatio) : "—"}
                      tone={briefWarn ? "warn" : "neutral"}
                      sub={briefEnough ? `근거부족 ${g.otGaps + g.regGaps}/${briefTot}` : "표본 부족"}
                    />
                    <Metric
                      label="일지(이달)"
                      value={logEnough ? pct(lr.rate) : "—"}
                      tone={logWarn ? "warn" : logGood ? "good" : "neutral"}
                      sub={logEnough ? `${lr.written}/${lr.total}건` : "표본 부족"}
                    />
                    <Metric
                      label="클로징·재등록"
                      value={closeEnough ? pct(r2.rate) : "—"}
                      tone={closeWarn || regWarn ? "warn" : "neutral"}
                      sub={`OT ${r2 ? `${r2.success}/${r2.attempted}` : "0/0"} · 재등록 ${rr ? `${rr.success}/${rr.attempted}` : "0/0"}`}
                    />
                  </div>

                  {/* 드릴다운 */}
                  {open && hasDrill && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      {o?.thinList?.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-muted">관찰 얇은 회원</div>
                          <div className="mt-1 space-y-1">
                            {o.thinList.map((m) => (
                              <div key={m.user_id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                <span className="font-medium text-sub">{nameById.get(m.user_id) || "회원"}</span>
                                <span className="text-danger-text">{pct(m.score)}</span>
                                {Array.isArray(m.missing) && m.missing.length > 0 && (
                                  <span className="text-[11px] text-muted">빠짐 {m.missing.map((k) => OBS_MISSING_LABEL[k] || k).join("·")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {g?.gapItems?.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-muted">브리핑 근거부족</div>
                          <div className="mt-1 space-y-1">
                            {g.gapItems.map((it, i) => (
                              <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">{it.scope === "reg" ? "재등록" : "OT"}</span>
                                <span className="font-medium text-sub">{nameById.get(it.user_id) || "회원"}</span>
                                <span className="text-[11px] text-muted">{it.gaps.join(" / ")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {otFails.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-muted">2차 클로징 실패·보류</div>
                          <div className="mt-1 space-y-1">
                            {otFails.map((r) => (
                              <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                <span className="font-medium text-sub">{nameById.get(r.user_id) || "회원"}</span>
                                <span className="text-danger-text">{r.closing_result === "hold" ? "보류" : "실패"}</span>
                                {r.closing_reason && <span className="text-[11px] text-muted">{labelOf(CLOSING_REASON_OPTS, r.closing_reason)}</span>}
                                {(r.closing_detail?.reaction || r.closing_detail?.outcome) && (
                                  <span className="text-[11px] text-muted">· {[r.closing_detail?.reaction, r.closing_detail?.outcome].filter(Boolean).join(" → ")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {regFails.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-muted">재등록 실패·보류</div>
                          <div className="mt-1 space-y-1">
                            {regFails.map((r) => (
                              <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                <span className="font-medium text-sub">{nameById.get(r.user_id) || "회원"}</span>
                                <span className="text-danger-text">{r.reg_result === "hold" ? "보류" : "실패"}</span>
                                {r.reg_reason && <span className="text-[11px] text-muted">{labelOf(REG_REASON_OPTS, r.reg_reason)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Footnotes />
        </div>
      )}
    </div>
  );
}

function Footnotes() {
  return (
    <div className="mt-4 space-y-0.5 text-[11px] leading-relaxed text-muted">
      <p>· 재등록 코칭은 「전체 누적」에서 봅니다(결과 시각 데이터 한계).</p>
      <p>· 1차 사전무장 브리핑은 저장되지 않아, 1차 품질은 관찰 충실도로 봅니다.</p>
    </div>
  );
}
