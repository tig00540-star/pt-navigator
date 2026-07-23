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
  CreditCard,
  Flame,
  Footprints,
  Gauge,
  Handshake,
  History,
  Microscope,
  MessageSquareQuote,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  BookOpen,
  RefreshCw,
  Eye,
  Pencil,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import Eyebrow from "@/components/ui/Eyebrow";
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import ClosingSequence from "@/components/ui/ClosingSequence";
import SalesbookView from "@/components/views/SalesbookView";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import { useToast } from "@/hooks/useToast";
import { CLOSING_APPROACH_OPTS, CLOSING_REASON_OPTS, CLOSING_RESULT_OPTS } from "@/lib/labels";
import { otObsHash } from "@/lib/otHash";
import { closingSuccessCount, closingCasesForTrainer, closingCaseGate } from "@/lib/memberStatus";
import { won } from "@/lib/format";
import { inputCls } from "@/components/ui/Field";

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

// 2차 거절 5종 한글 라벨(purge-safe 정적 맵). objection_defense[].reason 키와 물림.
const SECOND_OBJ_LABEL = { price: "가격 부담", hesitation: "생각해볼게요 (망설임)", doubt: "효과·필요성 의심", time: "시간 부족", compare: "타 센터 비교" };

// S2 세일즈북 스테일 판정 — 소스 브리핑 recommended_program의 안정 스냅샷(회차·빈도·기간·논리·번호).
//   세일즈북 생성 시점의 이 값을 salesbookMeta.rpSnapshot에 보관 → 브리핑 재생성으로 값이 바뀌면 '최신 아님'.
function sbRpSnapshot(rp) {
  const r = rp || {};
  return JSON.stringify({ pick_ref: r.pick_ref ?? null, alt_ref: r.alt_ref ?? null, frequency: r.frequency ?? "", duration: r.duration ?? "", session_logic: r.session_logic ?? "" });
}

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

export default function SecondOTTab({ member, onClosingSaved }) {
  const [loading, setLoading] = useState(false);
  const [row1, setRow1] = useState(null); // round-1 전체 행 (closing_result 판정용)
  const [obs, setObs] = useState(null); // round-1 report (관찰)
  const [existingRow2Id, setExistingRow2Id] = useState(null); // round-2 행 id (커밋4~6에서 사용)
  const [row2Report, setRow2Report] = useState(null); // round-2 report (브리핑 캐시)
  const [brief, setBrief] = useState(null); // ③ 브리핑 JSON (캐시 또는 생성)
  const [briefMeta, setBriefMeta] = useState(null); // { generatedAt, model }
  // S2 세일즈북 — report.salesbook 캐시(브리핑과 별 키 · 스프레드로 공존). salesbookMeta.rpSnapshot으로 스테일 판정.
  const [salesbook, setSalesbook] = useState(null);
  const [salesbookMeta, setSalesbookMeta] = useState(null);
  const [sbGenerating, setSbGenerating] = useState(false);
  const [sbError, setSbError] = useState("");
  const [photoLabels, setPhotoLabels] = useState([]); // member_photo distinct label — 사진 슬라이드 재료
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
  // D-3 — 내 과거 클로징 케이스(게이트·재료). 게이트 OFF/미전송이면 프롬프트·출력·캐시가 지금과 동일(additive).
  const [caseData, setCaseData] = useState([]);
  const [caseGate, setCaseGate] = useState({ on: false, tier: "off" });
  const [packages, setPackages] = useState([]); // 내 active PT 패키지(recommended_program 실가격 재료)
  const [trainer, setTrainer] = useState(null);  // trainer_profile 표지·서명(S4 컬럼) — SalesbookView 재료
  const [sbOpen, setSbOpen] = useState(false);   // 세일즈북 풀스크린 오픈
  const [sbEditable, setSbEditable] = useState(false); // 오픈 모드(present=false / 편집=true)
  const { toast, showToast } = useToast();

  const canAI = Boolean(supabase && member?.id);

  // 본인 active 패키지 + 트레이너 프로필(표지·서명) 로드(마운트 1회) — 둘 다 uid 기준(회원 무관).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const [{ data: pkgs }, { data: prof }] = await Promise.all([
        supabase.from("pt_package").select("*")
          .eq("trainer_id", uid).eq("active", true)
          .order("sort", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("trainer_profile").select("display_name, credentials, signature_data_url").eq("trainer_id", uid).maybeSingle(),
      ]);
      if (!cancelled) { setPackages(pkgs || []); setTrainer(prof || null); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 세일즈북 API 호출(phase=salesbook) — 1차 관찰(obs)·recommended_program·packages·photoLabels 주입.
  //   성공 {data, meta}, 실패/키미설정/데모 null(브리핑 흐름 안 막음 · 세일즈북은 부가).
  //   report는 ot_round=1 관찰 객체(obs) — {brief} 래퍼 아님(second phase와 동일 소스).
  const callSalesbook = async (recommendedProgram) => {
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "salesbook", member, report: obs, recommendedProgram, packages, photoLabels }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return { data, meta: { generatedAt: new Date().toISOString(), model: "claude-sonnet-5", rpSnapshot: sbRpSnapshot(recommendedProgram) } };
    } catch {
      return null;
    }
  };

  // ③ 브리핑 생성 + round-2 report 캐시. ⚠️ report는 스프레드로 저장(salesbook·기존 키 보존) — jsonb 통째 교체 금지.
  //   최초(캐시 세일즈북 없음)면 세일즈북을 동반 자동생성해 '한 번의 update'로 저장(하이브리드 ①).
  //   이미 세일즈북 있으면 안 덮음(스프레드로 보존) → rp 바뀌면 렌더가 '최신 아님' 배지(하이브리드 ②).
  //   ★세일즈북 생성 실패해도 브리핑은 {...prev, brief, briefMeta}로 그냥 저장(브리핑을 세일즈북에 인질 금지).
  const generateBrief = async (obsReport, row2Id) => {
    setGenerating(true);
    setAiError("");
    try {
      // D-3 — 게이트 ON이고 케이스가 있을 때만 additive 첨부(없으면 필드 자체를 안 넣어 서버가 지금처럼 동작).
      const useCases = caseGate?.on && caseData?.length;
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          phase: "second",
          member,
          report: obsReport,
          packages,
          ...(useCases ? { closingCases: caseData, caseTier: caseGate.tier } : {}),
        }),
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
        ...(useCases ? { caseTier: caseGate.tier } : {}), // 렌더 배지·캐시용
      };
      // 최초(세일즈북 미존재)면 동반 자동생성. 이미 있으면 재생성 안 함(스프레드로 보존 · 스테일 배지 유도).
      const firstTime = !(row2Report && row2Report.salesbook);
      const sbResult = firstTime ? await callSalesbook(data.recommended_program) : null;
      // ⚠️ 스프레드 — 기존 report(특히 salesbook) 보존 + 이번 키만 덮기. closing_*는 top-level 컬럼이라 무관.
      const reportToSave = {
        ...(row2Report || {}),
        brief: data,
        briefMeta: meta,
        ...(sbResult ? { salesbook: sbResult.data, salesbookMeta: sbResult.meta } : {}),
      };
      let savedOk = false;
      if (row2Id) {
        const { data: up } = await supabase.from("ot_log").update({ report: reportToSave }).eq("id", row2Id).select();
        if (!up || up.length === 0) setAiError("브리핑 저장 실패 — 권한/정책 확인 (0행).");
        else savedOk = true;
      } else {
        const { data: ins } = await supabase.from("ot_log").insert({ user_id: member.id, ot_round: 2, report: reportToSave }).select("id").single();
        if (ins?.id) { setExistingRow2Id(ins.id); savedOk = true; }
      }
      setBrief(data);
      setBriefMeta(meta);
      if (savedOk) {
        setRow2Report(reportToSave); // 후속 저장이 최신 prevReport 참조(§5)
        if (sbResult) { setSalesbook(sbResult.data); setSalesbookMeta(sbResult.meta); }
      }
    } catch (e) {
      setAiError("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setGenerating(false);
    }
  };

  // 세일즈북만 재생성(수동 '세일즈북 다시 만들기' · 하이브리드 ①). 현재 브리핑의 recommended_program 사용.
  //   brief 보존(스프레드) · 교훈1 하드닝. 브리핑을 안 건드린다.
  const generateSalesbook = async () => {
    if (sbGenerating || !brief?.recommended_program) return;
    setSbGenerating(true);
    setSbError("");
    try {
      const sbResult = await callSalesbook(brief.recommended_program);
      if (!sbResult) { setSbError("세일즈북 생성에 실패했어요. 잠시 후 다시 시도하세요."); return; }
      const reportToSave = { ...(row2Report || {}), salesbook: sbResult.data, salesbookMeta: sbResult.meta };
      if (existingRow2Id) {
        const { data: up } = await supabase.from("ot_log").update({ report: reportToSave }).eq("id", existingRow2Id).select();
        if (!up || up.length === 0) { setSbError("세일즈북 저장 실패 — 권한/정책 확인 (0행)."); return; }
      } else {
        const { data: ins } = await supabase.from("ot_log").insert({ user_id: member.id, ot_round: 2, report: reportToSave }).select("id").single();
        if (!ins?.id) { setSbError("세일즈북 저장 실패 (0행 — 권한/정책)."); return; }
        setExistingRow2Id(ins.id);
      }
      setSalesbook(sbResult.data);
      setSalesbookMeta(sbResult.meta);
      setRow2Report(reportToSave);
      showToast("세일즈북을 새로 만들었어요");
    } catch {
      setSbError("네트워크 오류예요. 잠시 후 다시 시도하세요.");
    } finally {
      setSbGenerating(false);
    }
  };

  // 세일즈북 편집 저장(SalesbookView editable → onSave) — 스프레드로 brief 보존.
  //   ⚠️ salesbookMeta.rpSnapshot은 그대로 유지(편집은 recommended_program을 안 바꾸니 스테일 판정 계속 유효).
  //      editedAt만 덧붙임. 교훈1 하드닝. 성공 시 state 갱신하고 편집 닫아 present로 전환.
  const saveSalesbookEdits = async (edited) => {
    if (!edited) return false;
    const nextMeta = { ...(salesbookMeta || {}), editedAt: new Date().toISOString() };
    if (!supabase || !existingRow2Id) {
      // 데모/행 없음 — 로컬만 갱신(서버 저장 없음).
      setSalesbook(edited); setSalesbookMeta(nextMeta);
      showToast("수정됨(데모)"); return true;
    }
    const reportToSave = { ...(row2Report || {}), salesbook: edited, salesbookMeta: nextMeta };
    try {
      const { data: up } = await supabase.from("ot_log").update({ report: reportToSave }).eq("id", existingRow2Id).select();
      if (!up || up.length === 0) { showToast("세일즈북 저장 실패 — 권한/정책 확인 (0행)"); return false; }
      setSalesbook(edited); setSalesbookMeta(nextMeta); setRow2Report(reportToSave);
      showToast("세일즈북 수정 저장됨");
      return true;
    } catch {
      showToast("세일즈북 저장 실패 — 네트워크 확인");
      return false;
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
          setSalesbook(null);
          setSalesbookMeta(null);
          setSbError("");
          setPhotoLabels([]);
          setAiError("");
          setClosingResult("none");
          setClosingApproach("");
          setClosingReapproachAt("");
          setClosingReason("");
          setDetailApproach("");
          setDetailReaction("");
          setDetailOutcome("");
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
      const [res1, res2, res3] = await Promise.all([
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
        // 세일즈북 사진 슬라이드 재료 — 이 회원의 member_photo 라벨(distinct는 클라 dedupe).
        supabase.from("member_photo").select("label").eq("user_id", member.id),
      ]);
      if (cancelled) return;
      setLoading(false);
      const r1 = res1.data?.[0] || null;
      const r2 = res2.data?.[0] || null;
      setRow1(r1);
      setObs(r1?.report || null);
      setExistingRow2Id(r2?.id || null);
      setRow2Report(r2?.report || null);
      setSalesbook(r2?.report?.salesbook || null);
      setSalesbookMeta(r2?.report?.salesbookMeta || null);
      setSbError("");
      setPhotoLabels([...new Set((res3.data || []).map((p) => p.label).filter(Boolean))]);
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
    const gaps = Array.isArray(b.data_gaps) ? b.data_gaps.filter((g) => typeof g === "string" && g.trim()) : [];
    const rc = b.recall || {};
    const pf = b.proof || {};
    const moves = Array.isArray(pf.moves) ? pf.moves.filter(Boolean) : [];
    const sm = b.sales_metaphor || {};
    const cline = b.closing_line || "";
    const obj = Array.isArray(b.objection_defense) ? b.objection_defense.filter(Boolean) : [];
    const rp = b.recommended_program || {};
    const pick = Number.isInteger(rp.pick_ref) ? (packages[rp.pick_ref] || null) : null;
    const alt = Number.isInteger(rp.alt_ref) ? (packages[rp.alt_ref] || null) : null;
    const perSession = (p) => (p && p.sessions ? won(Math.round(p.price / p.sessions)) : null);
    // 저장된 관찰 해시 vs 현재 관찰 해시 → 다르면 스테일(관찰 수정됨).
    const stale = Boolean(meta?.obsHash && obs && meta.obsHash !== otObsHash(obs));
    const legacyCache = Boolean(b) && !rc.line && moves.length === 0 && obj.length === 0;
    // 클로징 방향 프리필(㉠ 폼) — 신 스키마엔 b.closing 없음 → "pain" 기본.
    const effApproach = closingApproach || b.closing?.yes?.approach_tag || "pain";
    return (
      <div className="space-y-8">
        {/* ── AI 지원 준비 · 수업 전 ── */}
        <div className="rounded-lg border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-strong">
          AI 지원 준비 · 수업 전
        </div>
        <AIBriefBlock
          status={stale ? "stale" : "ready"}
          title="2차 등록 당위성 브리핑"
          onRegenerate={() => generateBrief(obs, existingRow2Id)}
          meta={
            meta?.generatedAt && (
              <span>
                생성: {new Date(meta.generatedAt).toLocaleString("ko-KR")}
                {meta?.obsHash && !stale && " · 현재 관찰 기준"}
              </span>
            )
          }
        >

        {legacyCache && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            이전 형식 브리핑이에요 — &lsquo;재생성&rsquo;을 누르면 새 증명·클로징 컨닝페이퍼로 바뀝니다.
          </div>
        )}
        {b.member_read && (
          <div className="rounded-xl border border-line bg-elevate p-3.5">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-label-ko text-muted"><Sparkles className="h-3.5 w-3.5" /> 3분 각인</div>
            <p className="mt-1 text-sm leading-relaxed text-ink">{b.member_read}</p>
          </div>
        )}
        {rc.line && (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
            <div className="flex items-center gap-2"><span className="text-base">↩️</span><span className="text-[11px] font-semibold tracking-label-ko text-sky-700">지난 시간 소환</span></div>
            <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-ink">&ldquo;{rc.line}&rdquo;</p>
            {rc.why && <p className="mt-1 text-[11px] leading-relaxed text-muted">{rc.why}</p>}
          </div>
        )}
        {Array.isArray(b.session_plan) && b.session_plan.length > 0 && (
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-center gap-2"><span className="text-base">💪</span><span className="text-[11px] font-semibold tracking-label-ko text-primary-strong">오늘 수업 운동 구성</span></div>
            <ol className="mt-2 space-y-1.5">
              {b.session_plan.filter(Boolean).map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                  <span className="mt-0.5 shrink-0 rounded bg-elevate px-1.5 py-0.5 text-[10px] font-bold text-sub">{i + 1}</span>
                  <span><span className="font-semibold">{s.exercise}</span>{s.point && <span className="text-sub"> — {s.point}</span>}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {moves.length > 0 && (
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-center gap-2"><span className="text-base">🎯</span><span className="text-[11px] font-semibold tracking-label-ko text-primary-strong">오늘 증명할 동작</span></div>
            <div className="mt-2 space-y-3">
              {moves.map((mv, i) => (
                <div key={i} className={i > 0 ? "border-t border-line pt-3" : ""}>
                  <div className="flex items-start gap-1.5"><span className="mt-0.5 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">증명 {i + 1}</span>{mv.exercise && <p className="text-sm font-semibold text-ink">{mv.exercise}</p>}</div>
                  {mv.target_reaction && <p className="mt-1 text-[13px] leading-relaxed text-sub"><span className="font-semibold">노릴 반응 · </span>{mv.target_reaction}</p>}
                  {mv.point_it_out && <p className="mt-1.5 rounded-lg bg-primary-soft px-3 py-2 text-sm leading-relaxed text-ink"><span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">짚어줄 말</span>&ldquo;{mv.point_it_out}&rdquo;</p>}
                </div>
              ))}
            </div>
            {pf.so_what && <p className="mt-2.5 text-[12px] leading-relaxed text-muted"><span className="font-semibold text-sub">등록 논리 · </span>{pf.so_what}</p>}
            {pf.if_weak && <p className="mt-1 text-[11px] leading-relaxed text-amber-700"><span className="font-semibold">반응 약하면 · </span>{pf.if_weak}</p>}
          </div>
        )}
        {sm.metaphor && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2"><span className="text-base">💬</span><span className="text-[11px] font-semibold tracking-label-ko text-amber-700">세일즈 비유</span></div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">&ldquo;{sm.metaphor}&rdquo;</p>
            {sm.bridge && <p className="mt-1 text-[12px] leading-relaxed text-muted">{sm.bridge}</p>}
          </div>
        )}
        {pick ? (
          <div className="rounded-xl border border-primary/30 bg-card p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-primary-strong" />
              <span className="text-[11px] font-semibold tracking-label-ko text-primary-strong">추천 프로그램 · 왜 이 횟수</span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
              <span className="font-bold">{pick.name}</span>
              <span className="font-mono font-semibold">{won(pick.price)}</span>
              {pick.sessions != null && <span className="text-[11px] text-muted">· {pick.sessions}회</span>}
              {perSession(pick) && <span className="text-[11px] text-muted">· {perSession(pick)}/회</span>}
            </p>
            {rp.why_fit && <p className="mt-1 text-[12px] leading-relaxed text-sub">{rp.why_fit}</p>}
            {(rp.frequency || rp.duration || rp.session_logic) && (
              <div className="mt-2 space-y-1 rounded-lg bg-elevate px-3 py-2">
                {rp.frequency && <p className="text-[12px] leading-relaxed text-sub"><span className="font-semibold text-primary-strong">빈도 · </span>{rp.frequency}</p>}
                {rp.duration && <p className="text-[12px] leading-relaxed text-sub"><span className="font-semibold text-primary-strong">기간 · </span>{rp.duration}</p>}
                {rp.session_logic && <p className="text-[12px] leading-relaxed text-ink"><span className="font-semibold text-primary-strong">그래서 · </span>{rp.session_logic}</p>}
              </div>
            )}
            {alt && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                <span className="rounded bg-elevate px-1.5 py-0.5 font-semibold">대안</span> {alt.name} · {won(alt.price)}{rp.alt_why ? ` — ${rp.alt_why}` : ""}
              </p>
            )}
          </div>
        ) : packages.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-4 text-[12px] leading-relaxed text-muted">
            가격 설정 탭에서 패키지를 등록하면 이 회원에게 맞는 프로그램을 추천해드려요.
          </div>
        ) : null}
        {/* 클로징 흐름(4비트) — 옛 캐시(closing_line만)면 그 한 줄로 폴백. */}
        <ClosingSequence
          sequence={b.closing_sequence}
          fallbackLine={cline}
          icon={<Flame className="h-4 w-4 text-primary-strong" />}
        />
        {/* 세일즈북 활용 안내(정적 · 트레이너 가이드) — 세일즈북은 아래 '회원 세일즈북' 섹션에 항상 있음.
           클로징 흐름이 실제 렌더될 때만 노출(③ 요청 참조가 있으므로). 토글/state 없음. */}
        {(b.closing_sequence || cline) && (
          <div className="rounded-xl border border-line bg-elevate p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-label-ko text-sub">
              <BookOpen className="h-3.5 w-3.5 text-primary-strong" /> 세일즈북으로 클로징할 땐
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
              말로 <span className="font-semibold text-primary-strong">③ 요청</span>까지 끌고 온 다음, 아래 <span className="font-semibold">회원 세일즈북 → &lsquo;회원에게 보기&rsquo;</span>로 화면 같이 띄우세요. 추천 프로그램 슬라이드에서 &ldquo;그래서 이 횟수로 가는 거예요&rdquo; 짚고 바로 등록 제안으로 마무리. 세일즈북 없이 갈 땐 위 클로징 대사 그대로 말로 가세요.
            </p>
          </div>
        )}
        {obj.length > 0 && (
          <details open className="rounded-xl border border-line bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold tracking-label-ko text-sub"><ShieldCheck className="h-3.5 w-3.5 text-primary-strong" /> 거절 선제 방어 ({obj.length})</summary>
            <div className="space-y-2 px-3.5 pb-3.5">
              {obj.map((o, i) => (
                <div key={i} className="rounded-lg border border-line bg-elevate p-3">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold text-sub">{SECOND_OBJ_LABEL[o.reason] || o.reason}</span>{o.trigger && <span className="text-[11px] italic text-muted">&ldquo;{o.trigger}&rdquo;</span>}</div>
                  {o.defense && <p className="mt-1.5 text-[13px] leading-relaxed text-sub"><span className="font-semibold text-sub">대응 · </span>{o.defense}</p>}
                  {o.line && <p className="mt-1.5 rounded-md bg-primary-soft px-2.5 py-1.5 text-[13px] leading-relaxed text-ink"><span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>&ldquo;{o.line}&rdquo;</p>}
                </div>
              ))}
            </div>
          </details>
        )}
        {b.case_feedback && (
          <details className="rounded-xl border border-line bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold tracking-label-ko text-sub"><History className="h-3.5 w-3.5 text-primary-strong" /> 내 과거 케이스 거울 {meta?.caseTier === "confident" ? "· 뚜렷" : "· 잠정"}</summary>
            <div className="space-y-2 px-3.5 pb-3.5">
              {b.case_feedback.diagnosis && <p className="text-[13px] leading-relaxed text-ink"><span className="font-semibold text-sub">진단 · </span>{b.case_feedback.diagnosis}</p>}
              {b.case_feedback.proven_lead && <p className="text-[13px] leading-relaxed text-sub"><span className="font-semibold text-sub">통한 접근 · </span>{b.case_feedback.proven_lead}</p>}
              {b.case_feedback.avoid_repeat && <p className="text-[12px] leading-relaxed text-orange-600"><span className="font-semibold">다른 벡터 · </span>{b.case_feedback.avoid_repeat}</p>}
              {b.case_feedback.your_read && <p className="text-[11px] italic text-muted">{b.case_feedback.your_read}</p>}
            </div>
          </details>
        )}
        {gaps.length > 0 && (
          <details className="rounded-xl border border-primary/30 bg-primary-soft p-4">
            <summary className="cursor-pointer text-xs font-semibold tracking-label-ko text-primary-strong">이렇게 하면 더 좋아져요 (선택 · {gaps.length})</summary>
            <ul className="mt-3 space-y-1.5">{gaps.map((gp, i) => <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-sub"><span className="mt-0.5 text-primary-strong">＋</span> {gp}</li>)}</ul>
          </details>
        )}

        </AIBriefBlock>

        {/* ── 회원 세일즈북(회원 대면 자료) · S2 자동생성/캐시 ──
           브리핑(수업 전 트레이너용)과 별개 산출물 — 2차 수업 마친 뒤 회원에게 직접 보여줄 자료.
           브리핑 최초 생성 시 자동 동반 생성됨. 브리핑만 재생성하면 여기 '최신 아님' 배지가 뜬다. */}
        {(() => {
          const sbStale = Boolean(
            salesbook && salesbookMeta?.rpSnapshot && b?.recommended_program &&
            salesbookMeta.rpSnapshot !== sbRpSnapshot(b.recommended_program)
          );
          return (
            <section className="rounded-xl border border-line bg-card shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Eyebrow icon={BookOpen}>회원 세일즈북</Eyebrow>
                {salesbook && (
                  sbStale
                    ? <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">최신 아님 · 추천 플랜 변경됨</span>
                    : <span className="rounded-md border border-primary/30 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">준비됨</span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {sbGenerating
                  ? "회원에게 보여줄 세일즈북을 만들고 있어요…"
                  : salesbook
                    ? (sbStale
                        ? "브리핑을 다시 만들어 추천 플랜이 바뀌었어요. 세일즈북도 새로 만들면 최신 내용으로 맞춰집니다."
                        : "2차 수업을 마친 뒤 회원에게 그대로 보여줄 수 있어요.")
                    : "아직 세일즈북이 없어요. 브리핑을 만들면 자동으로 함께 준비되고, 여기서 다시 만들 수도 있어요."}
              </p>
              {salesbookMeta?.generatedAt && !sbGenerating && (
                <p className="mt-1 text-[11px] text-muted">생성: {new Date(salesbookMeta.generatedAt).toLocaleString("ko-KR")}</p>
              )}
              {sbError && <p className="mt-2 text-[12px] text-danger-text">{sbError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {salesbook && (
                  <>
                    <Button variant="primary" size="sm" onClick={() => { setSbEditable(false); setSbOpen(true); }}>
                      <Eye className="h-3.5 w-3.5" /> 회원에게 보기
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSbEditable(true); setSbOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> 편집
                    </Button>
                  </>
                )}
                <Button variant={salesbook ? "ghost" : "primary"} size="sm" onClick={generateSalesbook} disabled={sbGenerating || !b?.recommended_program}>
                  <RefreshCw className={`h-3.5 w-3.5 ${sbGenerating ? "animate-spin" : ""}`} />
                  {sbGenerating ? "만드는 중…" : salesbook ? "다시 만들기" : "세일즈북 만들기"}
                </Button>
              </div>
            </section>
          );
        })()}

        {/* ── 클로징 결과 기록 · 수업 후 ──
           ⚠️ AIBriefBlock 밖에 둔다. 브리핑(수업 전 읽는 것)과 결과 기록(수업 후 쓰는 것)은
           시점도 성격도 다르다. 한 블록에 넣으면 '브리핑의 일부'로 읽힌다. */}
        <div className="rounded-lg border border-line bg-elevate px-3 py-1.5 text-xs font-bold text-sub">
          클로징 결과 기록 · 수업 후
        </div>
        {/* ㉠ 2차 클로징 결과 기록 (round-2 closing_* 컬럼 — 브리핑 캐시와 공존) */}
        <section className="rounded-xl border border-line bg-card shadow-sm p-4">
          <Eyebrow icon={Handshake}>㉠ 2차 클로징 결과 기록</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-3">
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
              <Button variant="primary" size="md" fullWidth onClick={() => saveClosing(effApproach)} disabled={savingClose}>
                {savingClose ? "저장 중…" : "결과 저장"}
              </Button>
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

        {/* 회원 세일즈북 풀스크린 — present(보기) / 편집. salesbook 있을 때만 오픈됨. */}
        {sbOpen && salesbook && (
          <SalesbookView
            salesbook={salesbook}
            member={member}
            trainer={trainer}
            packages={packages}
            recommendedProgram={b?.recommended_program}
            editable={sbEditable}
            onSave={saveSalesbookEdits}
            onClose={() => setSbOpen(false)}
          />
        )}
      </div>
    );
  };

  /* 생성 중 — 45초 대기 UX는 AIBriefBlock이 강제한다(진행바 + waitingHint).
     기존엔 pulse 스켈레톤이었는데, 스켈레톤은 "곧 나온다"는 신호라 45초에는 안 맞는다.
     대기 중 할 일을 주는 쪽이 낫다. */
  const renderGenerating = () => (
    <AIBriefBlock
      status="loading"
      title="2차 등록 당위성 브리핑"
      waitingHint="최대 1분 걸려요. 기다리는 동안 1차 관찰 기록을 다시 훑어보세요. (처음 한 번만 만들고, 다음부터는 저장된 걸 바로 보여드려요)"
    />
  );

  // 캐시 없음(첫 생성 전) — 자동 호출 대신 버튼 트리거(결정#2).
  const renderPreGenerate = () => (
    <AIBriefBlock
      status="idle"
      title="2차 등록 당위성 브리핑"
      generateLabel="2차 OT 준비하기"
      idleDescription={`${member.name} 회원의 1차 피드백을 근거로 2차 OT를 준비합니다. 수업 전에 한 번 만들면, 다음부터는 저장된 걸 바로 보여드려요.`}
      onGenerate={() => generateBrief(obs, existingRow2Id)}
    />
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
