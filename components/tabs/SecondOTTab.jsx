"use client";

/* =========================================================================
   TAB 2  —  2차 OT 내비게이터 (member-aware)
   선택 회원의 ot_log(round-1 관찰)를 근거로 2차를 설계한다.
   커밋3: member 배선 + fetch + 3게이트(미선택/관찰없음/1차성공 스킵). AI는 커밋4.
   게이트 미통과 시 기존 하드코딩을 '데모'로 폴백(앱 안 죽음, 진짜/데모 라벨 분리).
   ========================================================================= */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Flame,
  Footprints,
  Gauge,
  Handshake,
  Microscope,
  MessageSquareQuote,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import { CLOSING_APPROACH_OPTS, labelOf } from "@/lib/labels";

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

const SECOND_ACT = [
  { id: "yes", label: "엉덩이 자극 왔다", tone: "lime" },
  { id: "partial", label: "조금 왔다", tone: "orange" },
  { id: "no", label: "아직 안 옴", tone: "red" },
];

/* 오늘 둔근 활성 결과 → 2차 세일즈 흐름 조립 (데모 폴백용) */
function buildSecondSales(act) {
  const proof = {
    yes: "지금 엉덩이에 딱 오죠? 같은 Gym80인데 세팅만 바꾼 거예요. 몸이 바로 반응했어요.",
    partial:
      "아까보단 엉덩이에 오시죠? 아직 100%는 아니지만 방향은 확실히 잡혔어요. 반복하면 완전히 옵니다.",
    no: "아직 잘 안 오시는군요. 신경 활성이 더뎌서 그래요 — 오히려 PT가 필요하다는 확실한 신호예요.",
  }[act];

  const close = {
    yes: "오늘 이 감각, 혼자선 다시 찾기 어려워요. 이 세팅을 몸에 새기는 게 앞으로의 과제예요. 계속 옆에서 잡아드릴게요.",
    partial:
      "오늘 방향을 잡았으니, 이걸 몸에 정착시키는 데 몇 세션이 필요해요. 짧게라도 이어서 확실히 마무리하죠.",
    no: "혼자 하면 계속 앞허벅지만 쓰게 돼요. 이 패턴 교정은 옆에서 봐줘야 잡힙니다. 그래서 다음 세션이 중요해요.",
  }[act];

  return [
    { n: "01", stage: "1차 소환", icon: MessageSquareQuote, tone: "담담하게, 기록을 짚듯", when: "2차 워밍업 중", line: "철수님, 지난 1차 때 '무릎은 괜찮은데 엉덩이 자극이 안 온다'고 하셨죠. 오늘은 그 원인부터 잡고 갑니다." },
    { n: "02", stage: "원인 공유", icon: Microscope, tone: "논리적으로, 브리핑하듯", when: "사전 활성 직전", line: "앞허벅지가 먼저 일하는 패턴이었어요. 그래서 오늘은 상체 각도랑 골반을 고정해서 엉덩이만 일하게 세팅합니다." },
    { n: "03", stage: "실시간 증명", icon: Flame, tone: "확신 있게, 살짝 텐션", when: "Gym80 전경사 세트 직후", line: proof, adaptive: true },
    { n: "04", stage: "차이 각인", icon: Brain, tone: "차분하게 못 박듯", when: "세트 사이 휴식", line: "이 차이는 운이 아니에요. 지난주 데이터로 원인을 찾아 세팅 하나를 바꾼 결과예요. 감으로 운동하면 안 나오는 반응이에요." },
    { n: "05", stage: "결과 예고", icon: TrendingUp, tone: "신뢰감 있게, 그림 그려주듯", when: "마무리 운동 중", line: "매 세션 이렇게 안 되는 부위를 진단하고 고쳐나가면, 바디프로필까지 군살 없이 갑니다." },
    { n: "06", stage: "클로징", icon: Handshake, tone: "담백하게, 압박 없이", when: "운동 종료 후 브리핑", line: close, adaptive: true },
  ];
}

export default function SecondOTTab({ member }) {
  const [act, setAct] = useState("yes");
  const [loading, setLoading] = useState(false);
  const [row1, setRow1] = useState(null); // round-1 전체 행 (closing_result 판정용)
  const [obs, setObs] = useState(null); // round-1 report (관찰)
  const [existingRow2Id, setExistingRow2Id] = useState(null); // round-2 행 id (커밋4~6에서 사용)
  const [row2Report, setRow2Report] = useState(null); // round-2 report (브리핑 캐시)
  const [brief, setBrief] = useState(null); // ③ 브리핑 JSON (캐시 또는 생성)
  const [briefMeta, setBriefMeta] = useState(null); // { generatedAt, model }
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

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
      const meta = { generatedAt: new Date().toISOString(), model: "claude-sonnet-5" };
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

      // ③ 캐시 우선: round-2 report.brief 있으면 렌더(재호출 X), 없으면 관찰 있고 미성공 시 1회 생성.
      const cached = r2?.report?.brief || null;
      if (cached) {
        setBrief(cached);
        setBriefMeta(r2.report.briefMeta || null);
      } else if (r1?.report && r1?.closing_result !== "success") {
        await generateBrief(r1.report, r2?.id || null);
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

  const actCls = (tone, on) => {
    if (!on) return "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700";
    return {
      lime: "border-lime-500/40 bg-lime-500/10 text-lime-400",
      orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
      red: "border-red-500/40 bg-red-500/10 text-red-400",
    }[tone];
  };

  const flow = buildSecondSales(act);

  /* ---- 데모/폴백 본문 (기존 하드코딩) ---- */
  const renderDemo = (note) => (
    <div className="space-y-8">
      {note && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          {note}
        </div>
      )}

      {/* 피드백 분석 카드 */}
      <section>
        <Eyebrow icon={Microscope}>회원 피드백 AI 분석</Eyebrow>

        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <MessageSquareQuote className="h-3.5 w-3.5" /> 1차 OT 직후 · 회원의 말
            </div>
            <p className="text-sm italic leading-relaxed text-zinc-200">“{RAW_FEEDBACK}”</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-md bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-400">
              AI 진단
            </span>
            <span className="text-sm font-semibold text-zinc-100">{FEEDBACK_ANALYSIS.headline}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FEEDBACK_ANALYSIS.cause.map((c, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-orange-400">0{i + 1}</span>
                  <span className="text-sm font-semibold text-zinc-100">{c.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-lime-500/20 bg-lime-500/5 p-3.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
            <p className="text-sm leading-relaxed text-zinc-200">{FEEDBACK_ANALYSIS.win}</p>
          </div>
        </div>
      </section>

      {/* 조정 팁 + 2차 루틴 */}
      <section>
        <Eyebrow icon={Target}>둔근 100% · 조정 팁 & 2차 루틴</Eyebrow>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Gym80 아웃싸이 · 대퇴사두 차단 세팅
            </div>
            <div className="space-y-2.5">
              {ADJUST_TIPS.map((tip) => {
                const Icon = tip.icon;
                return (
                  <div key={tip.t} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10">
                      <Icon className="h-4 w-4 text-orange-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{tip.t}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{tip.d}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
            {ROUTINE_2.map((r) => (
              <div key={r.id} className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-zinc-100">{r.name}</h4>
                  <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                    {r.machine}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">
                  <span className="text-orange-400">◆</span> {r.tip}
                </p>
                <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-2">
                  <span className="font-mono text-xs font-semibold text-lime-400">{r.sets}</span>
                  <span className="text-zinc-700">·</span>
                  <div className="flex flex-wrap gap-1">
                    {r.muscles.map((m) => (
                      <span key={m} className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
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

      {/* 2차 세일즈 흐름 */}
      <section>
        <Eyebrow icon={Handshake}>2차 세일즈 흐름 · 1차 연결 → 실시간 증명 → 클로징</Eyebrow>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">오늘 둔근 자극 결과:</span>
          {SECOND_ACT.map((o) => (
            <button
              key={o.id}
              onClick={() => setAct(o.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${actCls(o.tone, act === o.id)}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          {flow.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.n}
                className={`flex gap-3 rounded-xl border p-4 ${
                  step.adaptive ? "border-lime-500/30 bg-lime-500/5" : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="flex shrink-0 flex-col items-center">
                  <span className="font-mono text-xs font-bold text-lime-400">{step.n}</span>
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950">
                    <Icon className="h-4 w-4 text-lime-400" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{step.stage}</span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">🗣 {step.tone}</span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-500">⏱ {step.when}</span>
                    {step.adaptive && (
                      <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                        상황 연동
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-200">“{step.line}”</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  // example(예시 문장)은 흐리게 + "예시" 라벨 — 낭독기 방지(⭐⭐ 철학). §8-훅.
  const renderExample = (ex) =>
    ex ? (
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        <span className="mr-1 rounded bg-zinc-800/70 px-1 py-0.5 text-[9px] font-semibold text-zinc-500">
          예시
        </span>
        {ex}
      </p>
    ) : null;

  /* ---- 실 AI 브리핑 렌더 ---- */
  const renderBrief = (b, meta) => {
    const gaps = Array.isArray(b.data_gaps) ? b.data_gaps : [];
    const bf = b.briefing || {};
    const cl = b.closing?.[act] || null;
    const briefRows = [
      { k: "1차 확인", v: bf.proven_in_1st, c: "text-lime-400" },
      { k: "혼자 하면 위험", v: bf.risk_if_alone, c: "text-orange-400" },
      { k: "2차에 증명할 것", v: bf.to_prove_in_2nd, c: "text-sky-400" },
      { k: "클로징 논리", v: bf.closing_logic, c: "text-lime-400" },
    ];
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-400">
            실 AI
          </span>
          {meta?.generatedAt && (
            <span className="text-[10px] text-zinc-500">
              생성: {new Date(meta.generatedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>

        {gaps.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> 데이터 부족 — 트레이너가 채우세요
            </div>
            <ul className="list-disc space-y-0.5 pl-4">
              {gaps.map((gp, i) => (
                <li key={i}>{gp}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ★ 클로징 — 화면 주인공 (4단계 enter→paint→land→hold) */}
        <section>
          <Eyebrow icon={Flame}>실시간 자극 결과별 클로징 · 오늘의 주무기</Eyebrow>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">오늘 자극 결과:</span>
            {SECOND_ACT.map((o) => (
              <button
                key={o.id}
                onClick={() => setAct(o.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${actCls(
                  o.tone,
                  act === o.id
                )}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {cl ? (
            <div className="space-y-3 rounded-2xl border border-lime-500/40 bg-lime-500/5 p-5 shadow-lg shadow-lime-500/10">
              {cl.approach_tag && (
                <span className="inline-block rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                  방향: {labelOf(CLOSING_APPROACH_OPTS, cl.approach_tag)}
                </span>
              )}
              {[
                { key: "enter", label: "① 진입 · So what?", v: cl.enter },
                { key: "paint", label: "② 그림 · 비유", v: cl.paint, accent: true },
                { key: "land", label: "③ 착지 · 왜+지금", v: cl.land },
              ].map((s) => (
                <div
                  key={s.key}
                  className={`rounded-xl border p-4 ${
                    s.accent
                      ? "border-orange-500/40 bg-orange-500/10"
                      : "border-zinc-800 bg-zinc-900/60"
                  }`}
                >
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      s.accent ? "text-orange-400" : "text-lime-400"
                    }`}
                  >
                    {s.label}
                  </div>
                  <p className="mt-1.5 text-base leading-relaxed text-zinc-100">{s.v || "—"}</p>
                </div>
              ))}
              {/* hold — 침묵 강조 */}
              <div className="rounded-xl border border-dashed border-zinc-600 bg-zinc-950 p-4 text-center">
                <div className="text-sm font-bold text-zinc-100">🤐 여기서 멈추고 답 기다리기</div>
                {cl.hold && (
                  <p className="mt-1 text-[11px] italic leading-relaxed text-zinc-500">{cl.hold}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">이 분기의 클로징 데이터가 없습니다.</p>
          )}
        </section>

        {/* 근거들 — 접어둠 (클로징이 주인공) */}
        <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-zinc-400">
            등록 당위성 브리핑
          </summary>
          <div className="mt-3 space-y-2.5">
            {briefRows.map((r) => (
              <div key={r.k} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${r.c}`}>{r.k}</div>
                <p className="mt-1 text-sm leading-relaxed text-zinc-200">{r.v || "—"}</p>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-zinc-400">
            2차 대화 흐름 · arc
          </summary>
          <div className="mt-3 space-y-2.5">
            {(b.arc || []).map((beat, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                    {beat.when}
                  </span>
                  {beat.tone && (
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                      🗣 {beat.tone}
                    </span>
                  )}
                </div>
                {beat.intent && (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    <span className="text-zinc-400">왜: </span>
                    {beat.intent}
                  </p>
                )}
                {beat.direction && (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-200">{beat.direction}</p>
                )}
                {renderExample(beat.example)}
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-zinc-400">
            거절 대처 · 황현진 4유형
          </summary>
          <div className="mt-3 space-y-2.5">
            {(b.objections || []).map((o, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                    {o.type}
                  </span>
                  {o.customer_says && (
                    <span className="text-[11px] italic text-zinc-400">“{o.customer_says}”</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{o.reframe_direction}</p>
                {renderExample(o.example)}
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  };

  // 생성 중 스켈레톤
  const renderGenerating = () => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
        <Sparkles className="h-3.5 w-3.5 text-lime-400" /> 1차 관찰을 근거로 2차 브리핑을 생성하는 중… (최초 1회, 이후 캐시)
      </div>
      <div className="space-y-2.5">
        <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800/70" />
        <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
      </div>
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
    return <div className="py-10 text-center text-sm text-zinc-500">불러오는 중…</div>;
  }
  if (!obs) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
        <Microscope className="mx-auto h-8 w-8 text-zinc-700" />
        <p className="mt-3 text-sm text-zinc-300">
          <span className="font-semibold text-zinc-100">{member.name}</span> 회원의 1차 관찰 기록이 없습니다.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          &lsquo;관찰 기록&rsquo; 탭에서 1차 관찰을 먼저 입력하면 2차 AI 브리핑을 생성할 수 있어요.
        </p>
      </div>
    );
  }
  if (row1?.closing_result === "success") {
    return (
      <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-10 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-lime-400" />
        <p className="mt-3 text-base font-semibold text-zinc-100">1차 OT에서 등록 완료</p>
        <p className="mt-1 text-sm text-zinc-400">
          {member.name} 회원은 1차 클로징에 성공해 2차 AI 브리핑을 건너뜁니다.
        </p>
      </div>
    );
  }

  // 관찰 있음 · 미성공 → ③ 실 AI (캐시 우선).
  if (generating) return renderGenerating();
  if (brief) return renderBrief(brief, briefMeta);
  if (aiError)
    return renderDemo(`데모 폴백 (AI 실패: ${aiError}) — 아래는 예시(하드코딩)입니다.`);
  return renderGenerating();
}
