"use client";

/* =========================================================================
   TAB 2  —  2차 OT 내비게이터 (member-aware)
   선택 회원의 ot_log(round-1 관찰)를 근거로 2차를 설계한다.
   커밋3: member 배선 + fetch + 3게이트(미선택/관찰없음/1차성공 스킵). AI는 커밋4.
   게이트 미통과 시 기존 하드코딩을 '데모'로 폴백(앱 안 죽음, 진짜/데모 라벨 분리).
   ========================================================================= */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Flame,
  Footprints,
  Gauge,
  Handshake,
  Microscope,
  MessageSquareQuote,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import { useToast } from "@/hooks/useToast";
import { CLOSING_APPROACH_OPTS, CLOSING_REASON_OPTS, CLOSING_RESULT_OPTS, labelOf } from "@/lib/labels";
import { otObsHash } from "@/lib/otHash";

/* ---- 데모 폴백 데이터 (키/회원/관찰 없을 때만 노출) ---- */
const RAW_FEEDBACK =
  "무릎은 하나도 안 아파서 신기했는데, 엉덩이(둔근)에 자극이 잘 안 오고 허벅지 앞쪽만 힘이 들어가는 느낌이었어요.";

const FEEDBACK_ANALYSIS = {
  headline: "대퇴사두 우세 + 둔근 신경 활성 미흡",
  cause: [
    {
      t: "골반 전방경사",
      d: "좌식 근무로 장요근이 단축 → 골반이 앞으로 기울며 둔근이 늘어난 채 약화(신장성 약화).",
    },
    {
      t: "대퇴사두 우세 (Quad-dominant)",
      d: "하체 동작에서 앞허벅지가 먼저 동원 → 둔근이 개입할 타이밍을 빼앗김.",
    },
    {
      t: "둔근 신경 지연",
      d: "평소 미사용으로 둔근 점화 신호가 느림 → '자극이 안 온다'는 체감의 실체.",
    },
  ],
  win: "무릎 통증 0 = 1차 우회 세팅은 성공. 2차 과제는 '대퇴사두 차단 → 둔근 단독 자극' 재교육.",
};

const ADJUST_TIPS = [
  {
    icon: Gauge,
    t: "상체 각도",
    d: "상체를 15° 앞으로 힙힌지 → 대둔근 상부·중둔근 개입↑, 대퇴근막장근(TFL) 개입↓.",
  },
  {
    icon: ShieldCheck,
    t: "골반 고정",
    d: "반대손으로 패드 고정, 코어로 골반 회전 차단 → 허리·허벅지 보상 제거.",
  },
  {
    icon: Footprints,
    t: "발끝 방향",
    d: "발끝 살짝 안쪽(내회전) → 중둔근 타겟. 바깥으로 벌어지면 TFL이 자극을 훔쳐감.",
  },
  {
    icon: Repeat,
    t: "템포",
    d: "벌릴 때 2초 · 끝 정지 1초 · 복귀 3초. 신장성 구간을 늘려 둔근 긴장 시간 확보.",
  },
];

const ROUTINE_2 = [
  {
    id: "a1",
    name: "밴드 클램쉘 (사전 활성)",
    machine: "미니밴드",
    sets: "20회 × 2",
    tip: "머신 들어가기 전에 둔근 신경부터 깨우기.",
    muscles: ["중둔근"],
  },
  {
    id: "a2",
    name: "Gym80 아웃싸이 · 전경사 세팅",
    machine: "Gym80",
    sets: "15회 × 4",
    tip: "상체 15° 숙이고 발끝 안쪽, 골반 고정. 앞허벅지 힘 빠지는 지점을 찾기.",
    muscles: ["중둔근", "대둔근"],
  },
  {
    id: "a3",
    name: "Gym80 아웃싸이 · 끝범위 홀드",
    machine: "Gym80",
    sets: "12회 × 3",
    tip: "최대 외전 지점에서 2초 정지. 둔근 등척성 자극 극대화.",
    muscles: ["중둔근"],
  },
  {
    id: "a4",
    name: "글루트 브리지 마치 (마무리)",
    machine: "맨몸",
    sets: "20회 × 3",
    tip: "앞허벅지 아닌 엉덩이로 밀어 올리는 감각으로 마감.",
    muscles: ["대둔근", "코어"],
  },
];

// 자극 결과 id↔화면 라벨(읽기전용 3분기 클로징 스택 라벨용). 저장/필터 값은 b.closing 키(yes/partial/no) — 화면 라벨만(교훈4).
const ACT_LABEL = { yes: "자극 잘 옴", partial: "약하게 옴", no: "아직 없음" };

const inputCls =
  "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary";

export default function SecondOTTab({ member, onClosingSaved }) {
  const [loading, setLoading] = useState(false);
  const [row1, setRow1] = useState(null); // round-1 전체 행 (closing_result 판정용)
  const [obs, setObs] = useState(null); // round-1 report (관찰)
  const [existingRow2Id, setExistingRow2Id] = useState(null); // round-2 행 id (커밋4~6에서 사용)
  const [row2Report, setRow2Report] = useState(null); // round-2 report (브리핑 캐시)
  const [brief, setBrief] = useState(null); // ③ 브리핑 JSON (캐시 또는 생성)
  const [briefMeta, setBriefMeta] = useState(null); // { generatedAt, model }
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [closingResult, setClosingResult] = useState("none"); // ㉠ 2차 클로징 결과
  const [closingApproach, setClosingApproach] = useState(""); // "" → AI approach_tag로 프리필
  const [closingReapproachAt, setClosingReapproachAt] = useState(""); // 보류 재접근 예정일
  const [closingReason, setClosingReason] = useState(""); // 실패/보류 사유 카테고리
  const [detailApproach, setDetailApproach] = useState(""); // 케이스 ① 접근
  const [detailReaction, setDetailReaction] = useState(""); // 케이스 ② 반응
  const [detailOutcome, setDetailOutcome] = useState(""); // 케이스 ③ 결과
  const [savingClose, setSavingClose] = useState(false);
  const { toast, showToast } = useToast();

  const canAI = Boolean(supabase && member?.id);

  // ③ 생성 + round-2 report에 캐시 저장. report만 갱신 → 같은 행의 closing_* 컬럼 보존.
  const generateBrief = async (obsReport, row2Id) => {
    setGenerating(true);
    setAiError("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "second", member, report: obsReport }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAiError(d.error || "AI 생성에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const meta = {
        generatedAt: new Date().toISOString(),
        model: "claude-sonnet-5",
        obsHash: otObsHash(obsReport), // 생성 시점 관찰 스냅샷 → 스테일 감지
      };
      const report2 = { brief: data, briefMeta: meta };
      if (row2Id) {
        const { data: up } = await supabase
          .from("ot_log")
          .update({ report: report2 })
          .eq("id", row2Id)
          .select();
        if (!up || up.length === 0) setAiError("브리핑 저장 실패 — 권한/정책 확인 (0행).");
      } else {
        const { data: ins } = await supabase
          .from("ot_log")
          .insert({ user_id: member.id, ot_round: 2, report: report2 })
          .select("id")
          .single();
        if (ins?.id) setExistingRow2Id(ins.id);
      }
      setBrief(data);
      setBriefMeta(meta);
    } catch (e) {
      setAiError("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setGenerating(false);
    }
  };

  // ㉠ 2차 클로징 결과 저장 — round-2 행의 closing_* 컬럼만 갱신(브리핑 report는 보존).
  const saveClosing = async (approachValue) => {
    if (!canAI || savingClose) return;
    setSavingClose(true);
    try {
      const isClosed = ["success", "fail", "hold"].includes(closingResult);
      const hasDetail = detailApproach || detailReaction || detailOutcome;
      const payload = {
        closing_result: closingResult,
        closing_approach: approachValue,
        // 보류일 때만 재접근 예정일 top-level 추가(그 외 미포함). report(브리핑 캐시)·closing_* 안 덮음.
        ...(closingResult === "hold"
          ? { closing_reapproach_at: closingReapproachAt || null }
          : {}),
        ...((closingResult === "fail" || closingResult === "hold")
          ? { closing_reason: closingReason || null }
          : {}),
        ...(isClosed
          ? {
              closing_detail: hasDetail
                ? {
                    approach: detailApproach || null,
                    reaction: detailReaction || null,
                    outcome: detailOutcome || null,
                  }
                : null,
            }
          : {}),
        // D-3 재료 — 클로징 시점 회원 프로파일 스냅샷(2차 성공 케이스에도 필요). 2차는 form.goal 없음 → round1 goal_type 재사용.
        ...(isClosed
          ? {
              closing_profile: {
                age: member.age ?? null, job: member.job ?? null, residence: member.residence ?? null,
                mbti: member.mbti ?? null, pain: member.pain ?? null, goal: member.goal ?? null,
                goal_type: row1?.goal_type ?? null,
              },
            }
          : {}),
      };
      if (existingRow2Id) {
        const { data, error } = await supabase
          .from("ot_log")
          .update(payload) // report 미포함 → 브리핑 캐시 보존
          .eq("id", existingRow2Id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          showToast("저장 안 됨 — 권한/정책을 확인하세요 (0행)");
          return;
        }
      } else {
        const { data, error } = await supabase
          .from("ot_log")
          .insert({ user_id: member.id, ot_round: 2, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setExistingRow2Id(data.id);
      }
      setClosingApproach(approachValue);
      showToast("2차 클로징 결과가 저장되었습니다");
      onClosingSaved?.(); // 하드닝 통과(update 0행 return·insert throw 이후)한 성공 시점에만 → 부모가 배너 재조회
    } catch (e) {
      showToast("저장 실패: " + (e?.message || "unknown"));
    } finally {
      setSavingClose(false);
    }
  };

  // 회원 변경 시 round-1(관찰)·round-2(캐시/클로징) 행 조회.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canAI) {
        if (!cancelled) {
          setRow1(null);
          setObs(null);
          setExistingRow2Id(null);
          setRow2Report(null);
          setBrief(null);
          setBriefMeta(null);
          setAiError("");
          setClosingResult("none");
          setClosingApproach("");
          setClosingReapproachAt("");
          setClosingReason("");
          setDetailApproach("");
          setDetailReaction("");
          setDetailOutcome("");
        }
        return;
      }
      setLoading(true);
      setBrief(null); // 회원 전환 시 이전 브리핑 즉시 클리어
      setBriefMeta(null);
      setAiError("");
      const [res1, res2] = await Promise.all([
        supabase
          .from("ot_log")
          .select("*")
          .eq("user_id", member.id)
          .eq("ot_round", 1)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("ot_log")
          .select("*")
          .eq("user_id", member.id)
          .eq("ot_round", 2)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;
      setLoading(false);
      const r1 = res1.data?.[0] || null;
      const r2 = res2.data?.[0] || null;
      setRow1(r1);
      setObs(r1?.report || null);
      setExistingRow2Id(r2?.id || null);
      setRow2Report(r2?.report || null);
      setClosingResult(r2?.closing_result || "none"); // 저장된 2차 클로징 결과 프리필
      setClosingApproach(r2?.closing_approach || "");
      setClosingReapproachAt(r2?.closing_reapproach_at || "");
      setClosingReason(r2?.closing_reason || "");
      const cd = r2?.closing_detail || {};
      setDetailApproach(cd.approach || "");
      setDetailReaction(cd.reaction || "");
      setDetailOutcome(cd.outcome || "");

      // ③ 캐시 우선: round-2 report.brief 있으면 재방문 즉시 렌더(재호출 X). 없으면 자동 호출 대신
      // 버튼 트리거(결정#2) — renderPreGenerate의 "AI 지원 준비 생성하기" 클릭 시 generateBrief.
      const cached = r2?.report?.brief || null;
      if (cached) {
        setBrief(cached);
        setBriefMeta(r2.report.briefMeta || null);
      } else {
        setBrief(null);
        setBriefMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  /* ---- 데모/폴백 본문 (기존 하드코딩) ---- */
  const renderDemo = (note) => (
    <div className="space-y-8">
      {note && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {note}
        </div>
      )}

      {/* 피드백 분석 카드 */}
      <section>
        <Eyebrow icon={Microscope}>회원 피드백 AI 분석</Eyebrow>

        <div className="rounded-2xl border border-line bg-card shadow-sm p-5 sm:p-6">
          <div className="rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <MessageSquareQuote className="h-3.5 w-3.5" /> 1차 OT 직후 · 회원의 말
            </div>
            <p className="text-sm italic leading-relaxed text-ink">“{RAW_FEEDBACK}”</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-md bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-600">
              AI 진단
            </span>
            <span className="text-sm font-semibold text-ink">{FEEDBACK_ANALYSIS.headline}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FEEDBACK_ANALYSIS.cause.map((c, i) => (
              <div key={i} className="rounded-xl border border-line bg-card shadow-sm p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-orange-600">0{i + 1}</span>
                  <span className="text-sm font-semibold text-ink">{c.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-sub">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-primary/30 bg-primary-soft p-3.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
            <p className="text-sm leading-relaxed text-ink">{FEEDBACK_ANALYSIS.win}</p>
          </div>
        </div>
      </section>

      {/* 조정 팁 + 2차 루틴 */}
      <section>
        <Eyebrow icon={Target}>둔근 100% · 조정 팁 & 2차 루틴</Eyebrow>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-line bg-card shadow-sm p-4 lg:col-span-2">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Gym80 아웃싸이 · 대퇴사두 차단 세팅
            </div>
            <div className="space-y-2.5">
              {ADJUST_TIPS.map((tip) => {
                const Icon = tip.icon;
                return (
                  <div key={tip.t} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10">
                      <Icon className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{tip.t}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-sub">{tip.d}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
            {ROUTINE_2.map((r) => (
              <div key={r.id} className="flex flex-col rounded-xl border border-line bg-card shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">{r.name}</h4>
                  <span className="shrink-0 rounded-md border border-line bg-elevate px-2 py-0.5 font-mono text-[10px] font-semibold text-sub">
                    {r.machine}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-sub">
                  <span className="text-orange-600">◆</span> {r.tip}
                </p>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-2">
                  <span className="font-mono text-xs font-semibold text-primary-strong">{r.sets}</span>
                  <span className="text-muted">·</span>
                  <div className="flex flex-wrap gap-1">
                    {r.muscles.map((m) => (
                      <span key={m} className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">
                        #{m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  // example(예시 문장)은 흐리게 + "예시" 라벨 — 낭독기 방지(⭐⭐ 철학). §8-훅.
  const renderExample = (ex) =>
    ex ? (
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        <span className="mr-1 rounded bg-elevate px-1 py-0.5 text-[9px] font-semibold text-muted">
          예시
        </span>
        {ex}
      </p>
    ) : null;

  /* ---- 실 AI 브리핑 렌더 ---- */
  const renderBrief = (b, meta) => {
    const gaps = Array.isArray(b.data_gaps) ? b.data_gaps : [];
    const bf = b.briefing || {};
    // 저장된 관찰 해시 vs 현재 관찰 해시 → 다르면 스테일(관찰 수정됨).
    const stale = Boolean(meta?.obsHash && obs && meta.obsHash !== otObsHash(obs));
    // 클로징 방향 프리필: 저장값 > yes분기 AI approach_tag > pain (토글 제거 후 결정적 분기).
    const effApproach = closingApproach || b.closing?.yes?.approach_tag || "pain";
    const briefRows = [
      { k: "1차 확인", v: bf.proven_in_1st, c: "text-primary-strong" },
      { k: "혼자 하면 위험", v: bf.risk_if_alone, c: "text-orange-600" },
      { k: "2차에 증명할 것", v: bf.to_prove_in_2nd, c: "text-sky-700" },
      { k: "클로징 논리", v: bf.closing_logic, c: "text-primary-strong" },
    ];
    return (
      <div className="space-y-8">
        {/* ── AI 지원 준비 · 수업 전 ── */}
        <div className="rounded-lg border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-strong">
          AI 지원 준비 · 수업 전
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-strong">
            실 AI
          </span>
          {meta?.generatedAt && (
            <span className="text-[10px] text-muted">
              생성: {new Date(meta.generatedAt).toLocaleString("ko-KR")}
              {meta?.obsHash && !stale && " · 현재 관찰 기준"}
            </span>
          )}
          {stale && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              관찰이 바뀌었습니다 — 재생성 권장
            </span>
          )}
          <button
            onClick={() => generateBrief(obs, existingRow2Id)}
            disabled={generating}
            className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-elevate px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-primary disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> 재생성
          </button>
        </div>

        {/* 클로징 — 3분기 읽기전용 아코디언(yes/partial/no · 기본 접힘, 동시 펼침 허용). 신규 AI 생성 없음(캐시 재사용). */}
        <section>
          <Eyebrow icon={Flame}>오늘의 클로징 · 수업 전 준비</Eyebrow>
          <div className="space-y-4">
            {["yes", "partial", "no"].map((id) => {
              const c = b.closing?.[id] || null;
              return (
                <details key={id} className="rounded-xl border border-line bg-card shadow-sm p-3">
                  <summary className="cursor-pointer">
                    <span className="rounded-md bg-elevate px-2.5 py-0.5 text-[11px] font-semibold text-sub">
                      {ACT_LABEL[id]}
                    </span>
                  </summary>
                  <div className="mt-3">
                  {c ? (
                    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
                      {c.approach_tag && (
                        <span className="inline-block rounded-md bg-elevate px-2 py-0.5 text-[10px] font-semibold text-sub">
                          방향: {labelOf(CLOSING_APPROACH_OPTS, c.approach_tag)}
                        </span>
                      )}
                      {[
                        { key: "enter", label: "① 진입 · So what?", v: c.enter },
                        { key: "paint", label: "② 그림 · 비유", v: c.paint, accent: true },
                        { key: "land", label: "③ 착지 · 왜+지금", v: c.land },
                      ].map((s) => (
                        <div
                          key={s.key}
                          className={`rounded-xl border p-4 ${
                            s.accent
                              ? "border-orange-500/40 bg-orange-500/10"
                              : "border-line bg-card"
                          }`}
                        >
                          <div
                            className={`text-xs font-semibold uppercase tracking-wider ${
                              s.accent ? "text-orange-600" : "text-primary-strong"
                            }`}
                          >
                            {s.label}
                          </div>
                          <p className="mt-1.5 text-base leading-relaxed text-ink">{s.v ? <>&ldquo;{s.v}&rdquo;</> : "—"}</p>
                        </div>
                      ))}
                      {/* hold — 침묵 강조 */}
                      <div className="rounded-xl border border-dashed border-line bg-card p-4 text-center">
                        <div className="text-sm font-bold text-ink">🤐 여기서 멈추고 답 기다리기</div>
                        {c.hold && (
                          <p className="mt-1 text-[11px] italic leading-relaxed text-muted">{c.hold}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">이 분기의 클로징 데이터가 없습니다.</p>
                  )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* 자극 결과별 운동 대처(stimulus_response) — 클로징과 분리(세일즈 아님·운동 도구). 옛 캐시엔 없어 방어 렌더. */}
        {b.stimulus_response && (
          <section>
            <Eyebrow icon={Wrench}>자극 결과별 운동 대처 · 수업 전 준비</Eyebrow>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              세일즈가 아니라 &lsquo;몸을 어떻게 조정하나&rsquo;. 수업 전에 3갈래를 미리 훑어두세요.
            </p>
            <div className="space-y-3">
              {["yes", "partial", "no"].map((id) => {
                const s = b.stimulus_response?.[id] || null;
                return (
                  <details key={id} className="rounded-xl border border-line bg-card shadow-sm p-3">
                    <summary className="cursor-pointer">
                      <span className="rounded-md bg-elevate px-2.5 py-0.5 text-[11px] font-semibold text-sub">
                        {ACT_LABEL[id]}
                      </span>
                    </summary>
                    <div className="mt-3">
                      {s ? (
                        <div className="space-y-2.5 rounded-xl border border-line bg-elevate p-4">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">원인</div>
                            <p className="mt-0.5 text-sm leading-relaxed text-sub">{s.cause || "—"}</p>
                          </div>
                          <div className="rounded-lg border border-primary/30 bg-primary-soft p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-strong">조정 방향</div>
                            <p className="mt-0.5 text-base leading-relaxed text-ink">{s.adjustment || "—"}</p>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">노리는 것</div>
                            <p className="mt-0.5 text-sm leading-relaxed text-sub">{s.direction || "—"}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted">이 분기 대처 데이터가 없습니다.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {/* 근거들 — 접어둠 (클로징이 주인공) */}
        <details className="rounded-xl border border-line bg-card shadow-sm p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-sub">
            등록 당위성 브리핑
          </summary>
          <div className="mt-3 space-y-2.5">
            {briefRows.map((r) => (
              <div key={r.k} className="rounded-xl border border-line bg-card shadow-sm p-3.5">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${r.c}`}>{r.k}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink">{r.v || "—"}</p>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-line bg-card shadow-sm p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-sub">
            2차 대화 흐름 · arc
          </summary>
          <div className="mt-3 space-y-2.5">
            {(b.arc || []).map((beat, i) => (
              <div key={i} className="rounded-xl border border-line bg-card shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
                    {beat.when}
                  </span>
                  {beat.tone && (
                    <span className="rounded-md bg-elevate px-2 py-0.5 text-[10px] text-sub">
                      🗣 {beat.tone}
                    </span>
                  )}
                </div>
                {beat.intent && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    <span className="text-sub">왜: </span>
                    {beat.intent}
                  </p>
                )}
                {beat.direction && (
                  <p className="mt-1 text-sm leading-relaxed text-ink">{beat.direction}</p>
                )}
                {renderExample(beat.example)}
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-line bg-card shadow-sm p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-sub">
            거절 대처 · 황현진 4유형
          </summary>
          <div className="mt-3 space-y-2.5">
            {(b.objections || []).map((o, i) => (
              <div key={i} className="rounded-xl border border-line bg-card shadow-sm p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                    {o.type}
                  </span>
                  {o.customer_says && (
                    <span className="text-[11px] italic text-sub">“{o.customer_says}”</span>
                  )}
                </div>
                {o.reframe_direction && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">
                    <span className="font-semibold text-sub">공감 · </span>{o.reframe_direction}
                  </p>
                )}
                {o.sales_move && (
                  <p className="mt-1 text-[13px] leading-relaxed text-sub">
                    <span className="font-semibold text-sub">세일즈 · </span>{o.sales_move}
                  </p>
                )}
                {o.example && (
                  <p className="mt-1.5 rounded-md bg-primary-soft px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
                    <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>
                    &ldquo;{o.example}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>

        {/* 성장 팁 — 하단에 접힘(격려 톤). 주인공은 클로징. */}
        {gaps.length > 0 && (
          <details className="rounded-xl border border-primary/30 bg-primary-soft p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary-strong">
              이렇게 하면 더 좋아져요 (선택 · {gaps.length})
            </summary>
            <ul className="mt-3 space-y-1.5">
              {gaps.map((gp, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-sub">
                  <span className="mt-0.5 text-primary-strong">＋</span> {gp}
                </li>
              ))}
            </ul>
          </details>
        )}
        {/* ── 클로징 결과 기록 · 수업 후 ── */}
        <div className="rounded-lg border border-line bg-elevate px-3 py-1.5 text-xs font-bold text-sub">
          클로징 결과 기록 · 수업 후
        </div>
        {/* ㉠ 2차 클로징 결과 기록 (round-2 closing_* 컬럼 — 브리핑 캐시와 공존) */}
        <section>
          <Eyebrow icon={Handshake}>㉠ 2차 클로징 결과 기록</Eyebrow>
          <div className="grid gap-3 rounded-xl border border-line bg-card shadow-sm p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">결과</label>
              <select
                value={closingResult}
                onChange={(e) => setClosingResult(e.target.value)}
                className={inputCls}
              >
                {CLOSING_RESULT_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">
                방향 <span className="text-muted">(AI 제안 프리필)</span>
              </label>
              <select
                value={effApproach}
                onChange={(e) => setClosingApproach(e.target.value)}
                className={inputCls}
              >
                {CLOSING_APPROACH_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => saveClosing(effApproach)}
                disabled={savingClose}
                className="w-full rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
              >
                {savingClose ? "저장 중…" : "결과 저장"}
              </button>
            </div>

            {/* 실패/보류일 때만 사유 카테고리 (약점 진단 · 집계) — full width */}
            {(closingResult === "fail" || closingResult === "hold") && (
              <div className="sm:col-span-3">
                <label className="mb-1 block text-[11px] font-medium text-muted">
                  사유 <span className="text-muted">(약점 진단 · 집계)</span>
                </label>
                <select
                  value={closingReason}
                  onChange={(e) => setClosingReason(e.target.value)}
                  className={inputCls}
                >
                  <option value="">선택 안 함</option>
                  {CLOSING_REASON_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 성공/실패/보류일 때 클로징 케이스 3박자 (선택 · AI 리딩 재료) — full width */}
            {["success", "fail", "hold"].includes(closingResult) && (
              <div className="sm:col-span-3 space-y-2">
                <p className="text-[11px] text-muted">클로징 케이스 (선택 · 나중 AI 리딩 재료)</p>
                {[
                  { v: detailApproach, set: setDetailApproach, label: "① 어떻게 접근했나", ph: "어떤 방향·멘트로 제안했나" },
                  { v: detailReaction, set: setDetailReaction, label: "② 회원 반응·멘트", ph: "회원이 뭐라 했나(가능하면 그대로) — 마음 연/거절한 말" },
                  { v: detailOutcome, set: setDetailOutcome, label: "③ 그래서 어떻게 됐나", ph: "결과·내 대응 — 예: 등록(12주) / 물러섬·재접근일 안 잡음" },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="mb-1 block text-[11px] font-medium text-muted">{f.label}</label>
                    <textarea
                      value={f.v}
                      onChange={(e) => f.set(e.target.value)}
                      rows={2}
                      placeholder={f.ph}
                      className={inputCls + " resize-none"}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 보류('hold')일 때만 재접근 예정일 (B안: 프리셋 + 수동) — full width */}
            {closingResult === "hold" && (
              <div className="sm:col-span-3">
                <ReapproachDateField
                  value={closingReapproachAt}
                  onChange={setClosingReapproachAt}
                />
              </div>
            )}
          </div>
        </section>

        <Toast message={toast} />
      </div>
    );
  };

  // 생성 중 스켈레톤
  const renderGenerating = () => (
    <div className="rounded-2xl border border-line bg-card shadow-sm p-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <Sparkles className="h-3.5 w-3.5 text-primary-strong" /> 1차 관찰을 근거로 2차 브리핑을 생성하는 중… 최대 1분 걸릴 수 있어요 (최초 1회, 이후 캐시)
      </div>
      <div className="space-y-2.5">
        <div className="h-4 w-1/3 animate-pulse rounded bg-elevate" />
        <div className="h-3 w-full animate-pulse rounded bg-elevate" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-elevate" />
        <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-elevate" />
        <div className="h-3 w-full animate-pulse rounded bg-elevate" />
      </div>
    </div>
  );

  // 캐시 없음(첫 생성 전) — 자동 호출 대신 버튼 트리거(결정#2). 클릭 → generateBrief → 스켈레톤/실패 폴백 유지.
  const renderPreGenerate = () => (
    <div className="rounded-2xl border border-line bg-card shadow-sm p-6 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-primary-strong" />
      <p className="mt-3 text-sm text-sub">
        <span className="font-semibold text-ink">{member.name}</span> 회원의 1차 관찰을 근거로 2차 AI 지원(등록 당위성·클로징·거절 대처)을 준비합니다.
      </p>
      <p className="mt-1 text-xs text-muted">수업 전에 한 번 생성하면, 이후 다시 열 때는 저장돼 바로 떠요.</p>
      <button
        onClick={() => generateBrief(obs, existingRow2Id)}
        disabled={generating}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2.5} /> AI 지원 준비 생성하기
      </button>
    </div>
  );

  // ---- 게이트 ----
  if (!canAI) {
    return renderDemo(
      !supabase
        ? "데모 모드 — Supabase 키가 없어 AI가 동작하지 않습니다. 아래는 예시(하드코딩)입니다."
        : "회원을 먼저 선택하세요. 아래는 예시(하드코딩)입니다."
    );
  }
  if (loading) {
    return <div className="py-10 text-center text-sm text-muted">불러오는 중…</div>;
  }
  if (!obs) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <Microscope className="mx-auto h-8 w-8 text-muted" />
        <p className="mt-3 text-sm text-sub">
          <span className="font-semibold text-ink">{member.name}</span> 회원의 1차 관찰 기록이 없습니다.
        </p>
        <p className="mt-1 text-xs text-muted">
          &lsquo;관찰 기록&rsquo; 탭에서 1차 관찰을 먼저 입력하면 2차 AI 브리핑을 생성할 수 있어요.
        </p>
      </div>
    );
  }
  if (row1?.closing_result === "success") {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary-soft p-10 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-primary-strong" />
        <p className="mt-3 text-base font-semibold text-ink">1차 OT에서 등록 완료</p>
        <p className="mt-1 text-sm text-sub">
          {member.name} 회원은 1차 클로징에 성공해 2차 AI 브리핑을 건너뜁니다.
        </p>
      </div>
    );
  }

  // 관찰 있음 · 미성공 → ③ 실 AI (캐시 우선, 캐시 없으면 버튼 트리거).
  if (generating) return renderGenerating();
  if (brief) return renderBrief(brief, briefMeta);
  if (aiError)
    return renderDemo(`데모 폴백 (AI 실패: ${aiError}) — 아래는 예시(하드코딩)입니다.`);
  return renderPreGenerate();
}
