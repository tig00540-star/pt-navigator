"use client";

/* =========================================================================
   n차 OT 준비하기(2차 이상) — '오늘의 OT 사전 준비 리포트' (member-aware)
   1차 관찰(round-1 report)을 기본 근거로, 2차~(n-1)차 관찰·모든 이전 차수의 클로징 결과·사유를
   history로 함께 넘겨 n차를 설계한다(2026-10-02 · 구: 2차 고정·1차 관찰만).
   결과 기록(클로징)은 이 화면이 아니라 'n차 OT 피드백'(ObservationTab round=n)에서 한다.
   커밋3: member 배선 + fetch + 3게이트(미선택/관찰없음/1차성공 스킵). AI는 커밋4.
   게이트 미통과 시 기존 하드코딩을 '데모'로 폴백(앱 안 죽음, 진짜/데모 라벨 분리).
   ========================================================================= */

import { useEffect, useState } from "react";
import Link from "next/link";
import { otStepPath } from "@/lib/otRounds";
import { markPending, clearPending, usePendingResult, isNewerThan } from "@/lib/aiPending";
import {
  CheckCircle2,
  Footprints,
  Gauge,
  Handshake,
  Microscope,
  MessageSquareQuote,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import Eyebrow from "@/components/ui/Eyebrow";
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import PrepReport from "@/components/ot/PrepReport";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { otObsHash } from "@/lib/otHash";
import { closingSuccessCount, closingCasesForTrainer, closingCaseGate } from "@/lib/memberStatus";
import { refreshAiQuota } from "@/lib/useAiQuota";

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


// D-3 개발용: URL에 ?d3=1 이면 게이트 무시 + 실 케이스 5건 미만이면 데모 케이스로 렌더/프롬프트 경로 점검.
// 실사용자는 이 플래그를 안 쓰므로 영향 0. ⑦ 상용화 때 제거 권장.
const D3_FORCE = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("d3") === "1";

// 명백히 가짜인 데모 케이스(오버라이드일 때만·실데이터 5건 미만일 때만 사용).
const DEMO_CLOSING_CASES = [
  { result: "success", approach: "value", reason: null,
    profile: { age: 41, job: "개발자", residence: "판교", mbti: "INTJ", pain: "목·어깨", goal: "체형개선", goal_type: "appearance" },
    detail: { approach: "오늘 자극 들어간 순간 사진 보여주고 '혼자선 이 세팅 못 잡는다'로 착지",
              reaction: "'확실히 다르네요' 하며 스스로 다음 주 얘기 꺼냄", outcome: "10회 등록" } },
  { result: "hold", approach: "pain", reason: "decider",
    profile: { age: 36, job: "주부", residence: "분당", mbti: null, pain: "허리", goal: "통증개선", goal_type: "pain" },
    detail: { approach: "통증 개선 근거로 바로 가격 제안", reaction: "'남편이랑 상의할게요'", outcome: "보류·2주 뒤 재접근" } },
];

// 이전 차수 기록(1 ~ round-1) → AI 입력. 1차 관찰은 report로 따로 가니 여기엔 결과만, 2차부터는 관찰까지.
//   rows는 created_at 내림차순 — 차수별 첫 행이 최신.
function buildHistory(rows, round) {
  const out = [];
  for (let k = 1; k < round; k++) {
    const row = rows.find((r) => r.ot_round === k);
    if (!row) continue;
    const r = row.report || {};
    out.push({
      round: k,
      closing_result: row.closing_result || "none",
      // 등록 제안을 했나(새 피드백 양식) — 옛 행은 결과로 추정(보류·실패=제안함).
      proposed: typeof r.proposed === "boolean" ? r.proposed : ["hold", "fail", "success"].includes(row.closing_result),
      closing_reason: row.closing_reason || null,
      closing_detail: row.closing_detail || null,
      ...(k >= 2 ? { observation: { movements: r.movements ?? [], reaction: r.reaction ?? {}, goal: r.goal ?? {}, memberQuote: r.memberQuote ?? "", trainer_note: r.trainer_note ?? "" } } : {}),
      ...(r.brief?.member_read ? { prev_read: r.brief.member_read } : {}),
    });
  }
  return out;
}

// 스테일 판정 해시 — 1차 관찰 + 이전 차수 결과·제안 여부·사유·관찰. 피드백(결과 포함)이 바뀌면 '최신 아님'.
//   (2026-10-02 피드백 개편 때 2차도 이전 차수 결과를 포함하도록 바꿈 — 옛 2차 캐시는 한 번 '최신 아님'으로 뜬다.
//    클로징 우선 모드·30초 요약이 들어간 새 리포트로 다시 만들라는 신호라 의도된 동작.)
const briefHash = (obs, history) =>
  `${otObsHash(obs)}.${otObsHash({ movements: history.flatMap((h) => h.observation?.movements || []), memberQuote: history.map((h) => `${h.round}:${h.closing_result}:${h.proposed ? 1 : 0}:${h.closing_reason || ""}:${h.observation?.trainer_note || ""}:${h.observation?.memberQuote || ""}`).join("|") })}`;

export default function SecondOTTab({ member, round = 2, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [row1, setRow1] = useState(null); // round-1 전체 행 (closing_result 판정용)
  const [obs, setObs] = useState(null); // round-1 report (관찰)
  const [existingRow2Id, setExistingRow2Id] = useState(null); // round-2 행 id (커밋4~6에서 사용)
  const [row2Report, setRow2Report] = useState(null); // 이번 차수(round) report (브리핑 캐시)
  const [history, setHistory] = useState([]); // 이전 차수 기록(buildHistory) — AI 입력·스테일 판정
  const [brief, setBrief] = useState(null); // ③ 브리핑 JSON (캐시 또는 생성)
  const [briefMeta, setBriefMeta] = useState(null); // { generatedAt, model }
  // 회원 세일즈북은 이 화면에서 빠졌다(2026-10-02 대표: 운동 다 시키고 홈 › 세일즈북에서 보여준다).
  //   만들기는 서버가 2차 리포트 저장 뒤 이어서 한다(ot-brief follow) — 사진 장 재료(photoLabels)만 같이 보낸다.
  const [photoLabels, setPhotoLabels] = useState([]); // member_photo distinct label — 세일즈북 사진 장 재료
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  // D-3 — 내 과거 클로징 케이스(게이트·재료). 게이트 OFF/미전송이면 프롬프트·출력·캐시가 지금과 동일(additive).
  const [caseData, setCaseData] = useState([]);
  const [caseGate, setCaseGate] = useState({ on: false, tier: "off" });
  const [packages, setPackages] = useState([]); // 내 active PT 패키지(recommended_program 실가격 재료)
  const [favorites, setFavorites] = useState([]); // 내 라이브러리에서 별표한 운동자료(대본이 수업 구성에 우선 반영 · lib_ref)
  const { toast, showToast } = useToast();

  const canAI = Boolean(supabase && member?.id);

  // 본인 active 패키지 + 트레이너 프로필(표지·서명) 로드(마운트 1회) — 둘 다 uid 기준(회원 무관).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const { data: pkgs } = await supabase.from("pt_package").select("*")
        .eq("trainer_id", uid).eq("active", true)
        .order("sort", { ascending: true }).order("created_at", { ascending: true });
      if (!cancelled) setPackages(pkgs || []);
      // 별표한 운동자료(1차와 같은 조회 · favorite 컬럼이 없으면 에러 → [] 비차단).
      const { data: favs } = await supabase
        .from("library_item").select("id, title, category, url, note")
        .eq("trainer_id", uid).eq("favorite", true)
        .order("category", { ascending: true }).order("created_at", { ascending: true });
      if (!cancelled) setFavorites(favs || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // ③ 브리핑 생성 + round-2 report 캐시. ⚠️ report는 스프레드로 저장(salesbook·기존 키 보존) — jsonb 통째 교체 금지.
  //   최초(캐시 세일즈북 없음)면 세일즈북을 동반 자동생성해 '한 번의 update'로 저장(하이브리드 ①).
  //   이미 세일즈북 있으면 안 덮음(스프레드로 보존) → rp 바뀌면 렌더가 '최신 아님' 배지(하이브리드 ②).
  //   ★세일즈북 생성 실패해도 브리핑은 {...prev, brief, briefMeta}로 그냥 저장(브리핑을 세일즈북에 인질 금지).
  // 생성·저장은 서버가 끝까지(다른 화면·창 닫기에도 안 끊김 · 2026-10-02). 세일즈북은 그다음 화면이 이어 만든다
  //   (도중에 나가면 세일즈북만 빠지고 리포트는 남는다 — '세일즈북 만들기' 버튼으로 다시).
  const pendingKey = member?.id ? `second:${member.id}:${round}` : null;
  const generateBrief = async (obsReport) => {
    setGenerating(true);
    setAiError("");
    if (pendingKey) markPending(pendingKey);
    try {
      // D-3 — 게이트 ON이고 케이스가 있을 때만 additive 첨부(없으면 필드 자체를 안 넣어 서버가 지금처럼 동작).
      const useCases = caseGate?.on && caseData?.length;
      const metaIn = { obsHash: briefHash(obsReport, history), ...(useCases ? { caseTier: caseGate.tier } : {}) };
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          phase: "second",
          member,
          report: obsReport,
          round,
          history,
          packages,
          favorites,
          photoLabels, // 서버가 이어서 만드는 세일즈북의 사진 장 재료
          ...(useCases ? { closingCases: caseData, caseTier: caseGate.tier } : {}),
          save: { kind: "ot", memberId: member.id, round, meta: metaIn },
        }),
      });
      // 서버가 답을 준 순간에만 '만드는 중' 표시를 지운다 — 화면 이동·창 닫기로 끊긴 경우엔 남겨 두고 돌아왔을 때 이어 받는다.
      if (pendingKey) clearPending(pendingKey);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAiError(d.error || "리포트를 만들지 못했어요. 다시 시도해 주세요.");
        return;
      }
      const data = await res.json();
      const meta = { ...metaIn, generatedAt: new Date().toISOString(), model: res.headers.get("x-ai-model") || "" };
      const savedRow = res.headers.get("x-saved-row");
      setBrief(data);
      setBriefMeta(meta);
      if (!savedRow) { setAiError("리포트를 저장하지 못했어요. 지금은 이 화면에서만 보여요."); return; }
      setExistingRow2Id(savedRow);
      // 서버가 저장한 최신 report를 다시 읽어 그 위에 세일즈북을 얹는다(다른 키 덮어쓰기 방지).
      const { data: fresh } = await supabase.from("ot_log").select("report").eq("id", savedRow).maybeSingle();
      const base = fresh?.report || { ...(row2Report || {}), brief: data, briefMeta: meta };
      setRow2Report(base);
      onSaved?.(); // 대시보드 진행(준비 ✓) 갱신
    } catch {
      setAiError("인터넷 연결을 확인하고 다시 시도해 주세요. (다른 화면에 다녀와도 만들던 리포트는 이어서 저장돼요)");
    } finally {
      setGenerating(false);
      refreshAiQuota();
    }
  };

  // 돌아왔을 때 이어 받기 — 다른 화면에 갔다 오는 사이 서버가 저장한 리포트.
  const waiting = usePendingResult(pendingKey, async (since) => {
    const { data: rows } = await supabase.from("ot_log").select("id, report")
      .eq("user_id", member.id).eq("ot_round", round).order("created_at", { ascending: false }).limit(1);
    const row = rows?.[0];
    return isNewerThan(row?.report?.briefMeta?.generatedAt, since) ? row : null;
  }, (row) => {
    setExistingRow2Id(row.id);
    setRow2Report(row.report);
    setBrief(row.report.brief);
    setBriefMeta(row.report.briefMeta);
    onSaved?.();
  });

  // 회원·차수 변경 시 이 회원 ot_log 전부 조회 → round-1(관찰)·이번 차수(캐시)·이전 차수(history).
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
          setPhotoLabels([]);
          setAiError("");
          setHistory([]);
          setCaseData([]);
          setCaseGate({ on: false, tier: "off" });
        }
        return;
      }
      setLoading(true);
      try {
      setBrief(null); // 회원 전환 시 이전 브리핑 즉시 클리어
      setBriefMeta(null);
      setAiError("");
      const [resAll, res3] = await Promise.all([
        supabase
          .from("ot_log")
          .select("*")
          .eq("user_id", member.id)
          .order("created_at", { ascending: false }),
        // 세일즈북 사진 슬라이드 재료 — 이 회원의 member_photo 라벨(distinct는 클라 dedupe).
        supabase.from("member_photo").select("label").eq("user_id", member.id),
      ]);
      if (cancelled) return;
      setLoading(false);
      const all = resAll.data || [];
      const r1 = all.find((r) => r.ot_round === 1) || null;
      const r2 = all.find((r) => r.ot_round === round) || null; // 이번 차수(이름은 옛 2차 고정 시절 그대로)
      setHistory(buildHistory(all, round));
      setRow1(r1);
      setObs(r1?.report || null);
      setExistingRow2Id(r2?.id || null);
      setRow2Report(r2?.report || null);
      setPhotoLabels([...new Set((res3.data || []).map((p) => p.label).filter(Boolean))]);

      // ③ 캐시 우선: round-2 report.brief 있으면 재방문 즉시 렌더(재호출 X). 없으면 자동 호출 대신
      // 버튼 트리거(결정#2) — renderPreGenerate의 "AI 지원 준비 생성하기" 클릭 시 generateBrief.
      // ⚠️ D-3 케이스 조회보다 앞에 둔다 — 캐시된 회원 재방문 시 카운트 쿼리를 안 기다리고 즉시 렌더.
      const cached = r2?.report?.brief || null;
      if (cached) {
        setBrief(cached);
        setBriefMeta(r2.report.briefMeta || null);
      } else {
        setBrief(null);
        setBriefMeta(null);
      }

      // D-3 — 내 과거 케이스 로드(트레이너 스코프). caseData는 generateBrief 버튼 클릭 때만 쓰여
      // 캐시 렌더 뒤로 미룸(재방문 즉시성). 게이트 ON(성공 5건+)이면 실 케이스,
      // OFF+오버라이드(?d3=1)면 실 케이스 or 데모, 그 외 미전송(지금 동작). trainer_id 없으면 스킵.
      const tid = member.trainer_id || null;
      if (tid) {
        const cnt = await closingSuccessCount(supabase, tid, member.id);
        const gate = closingCaseGate(cnt);
        let cases = [];
        if (gate.on) cases = await closingCasesForTrainer(supabase, tid, { excludeUserId: member.id });
        else if (D3_FORCE()) {
          const real = await closingCasesForTrainer(supabase, tid, { excludeUserId: member.id });
          cases = real.length ? real : DEMO_CLOSING_CASES;
        }
        if (!cancelled) {
          setCaseGate(gate.on || D3_FORCE() ? { on: true, tier: gate.tier === "off" ? "tentative" : gate.tier } : gate);
          setCaseData(cases);
        }
      } else if (!cancelled) {
        setCaseGate({ on: false, tier: "off" });
        setCaseData([]);
      }
    } catch {
      // 조회 실패 — finally에서 로딩 해제. 부분(케이스) 실패는 해당 섹션 빈 채로 degrade.
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, round]);

  /* ---- 데모/폴백 본문 (기존 하드코딩) ---- */
  const renderDemo = (note) => (
    <div className="space-y-8">
      {note && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {note}
        </div>
      )}

      {/* 피드백 분석 카드 */}
      <section className="rounded-2xl border border-line bg-card shadow-sm p-5 sm:p-6">
        <Eyebrow icon={Microscope}>회원 피드백 AI 분석</Eyebrow>

        <div>
          <div className="rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-label-ko text-muted">
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
            <div className="mb-3 text-xs font-semibold tracking-label-ko text-muted">
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

  /* ---- 실 AI 브리핑 렌더 ---- */
  const renderBrief = (b, meta) => {
    const rc = b.recall || {};
    const moves = Array.isArray(b.proof?.moves) ? b.proof.moves.filter(Boolean) : [];
    const obj = Array.isArray(b.objection_defense) ? b.objection_defense.filter(Boolean) : [];
    // 저장된 관찰 해시 vs 현재 관찰 해시 → 다르면 스테일(관찰 수정됨).
    const stale = Boolean(meta?.obsHash && obs && meta.obsHash !== briefHash(obs, history));
    const legacyCache = Boolean(b) && !rc.line && moves.length === 0 && obj.length === 0;
    return (
      <div className="space-y-8">
        <AIBriefBlock
          bare
          status={stale ? "stale" : "ready"}
          title={`오늘의 OT 대본 · ${round}차`}
          onRegenerate={() => generateBrief(obs)}
          meta={
            meta?.generatedAt && (
              <span>{new Date(meta.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}에 만들었어요</span>
            )
          }
        >

        {legacyCache && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            이전 형식 리포트예요. &lsquo;재생성&rsquo;을 누르면 새 형식으로 바뀌어요.
          </div>
        )}
        <PrepReport kind="second" data={b} packages={packages} favorites={favorites} caseTier={meta?.caseTier} />

        </AIBriefBlock>

        {/* 결과 기록은 'n차 OT 피드백' 칸에서(모든 차수 같은 양식 · 2026-10-02). 브리핑(수업 전)과 기록(수업 후)을 나눈다. */}
        <Link href={otStepPath(member.id, "feedback", round)}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3.5 no-underline shadow-sm transition hover:border-line-strong">
          <span>
            <span className="block text-[12px] font-semibold text-muted">수업이 끝나면</span>
            <span className="block text-[15px] font-bold text-ink">{round}차 OT 피드백에 관찰·결과 남기기</span>
          </span>
          <Handshake className="h-5 w-5 text-ot-text" aria-hidden="true" />
        </Link>

        <Toast message={toast} />

      </div>
    );
  };

  /* 생성 중 — 45초 대기 UX는 AIBriefBlock이 강제한다(진행바 + waitingHint).
     기존엔 pulse 스켈레톤이었는데, 스켈레톤은 "곧 나온다"는 신호라 45초에는 안 맞는다.
     대기 중 할 일을 주는 쪽이 낫다. */
  const renderGenerating = () => (
    <AIBriefBlock
      bare
      status="loading"
      title={`오늘의 OT 대본 · ${round}차`}
      waitingHint="1~2분 걸려요. 다른 화면에 다녀와도 괜찮아요. 만들던 리포트는 저장돼 있다가 돌아오면 바로 떠요."
    />
  );

  // 캐시 없음(첫 생성 전) — 자동 호출 대신 버튼 트리거(결정#2).
  const renderPreGenerate = () => (
    <AIBriefBlock
      bare
      status="idle"
      title={`오늘의 OT 대본 · ${round}차`}
      quotaKind="ot"
      generateLabel={`${round}차 OT 대본 만들기`}
      idleDescription={`${member.name} 회원의 ${round > 2 ? `1~${round - 1}차` : "1차"} OT 기록·피드백을 모두 근거로 ${round}차 OT를 준비해요. 수업 전에 한 번 만들면, 다음부터는 저장된 걸 바로 보여드려요.`}
      onGenerate={() => generateBrief(obs)}
    />
  );

  // ---- 게이트 ----
  if (!canAI) {
    return renderDemo(
      !supabase
        ? "데모 모드라 AI가 동작하지 않아요. 아래는 예시예요."
        : "회원을 먼저 선택해 주세요. 아래는 예시(하드코딩)입니다."
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
          <span className="font-semibold text-ink">{member.name}</span> 회원의 1차 OT 피드백이 아직 없어요.
        </p>
        <p className="mt-1 text-xs text-muted">
          1차 &lsquo;OT 피드백&rsquo;에 관찰을 먼저 남기면 {round}차 대본을 만들 수 있어요.
        </p>
      </div>
    );
  }
  const wonAt = history.find((h) => h.closing_result === "success")?.round;
  if (wonAt) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary-soft p-10 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-primary-strong" />
        <p className="mt-3 text-base font-semibold text-ink">{wonAt}차 OT에서 등록 완료</p>
        <p className="mt-1 text-sm text-sub">
          {member.name} 회원은 {wonAt}차에 등록해서 {round}차 준비가 필요 없어요.
        </p>
      </div>
    );
  }

  // 관찰 있음 · 미성공 → ③ 실 AI (캐시 우선, 캐시 없으면 버튼 트리거).
  if (generating || waiting) return renderGenerating();
  // AI 실패 · 저장 실패는 그대로 알리고 다시 만들 수 있게(2026-10-06) — 예전엔 실제 회원 화면에 가짜 예시를 띄웠다.
  const errNote = aiError ? <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-[14px] leading-relaxed text-danger-text">{aiError}</p> : null;
  if (brief) return <>{errNote}{renderBrief(brief, briefMeta)}</>;
  if (aiError) return <>{errNote}{renderPreGenerate()}</>;
  return renderPreGenerate();
}
