"use client";

/* =========================================================================
   변화 · 재등록 재료(2026-10-11 시안) — '처음보다 달라진 것'을 흡수.
   재등록 때 트레이너가 할 말이 얼마나 모였는지: 모인 재료는 실제 숫자 문장으로, 빠진 재료는 "이렇게 하면 생겨요" 한 줄.
   기한 · 숙제 없음. 회원 목적에 따라 ★ 핵심 재료 2~3개(빠졌으면 맨 위에 하나만 크게).
   데이터: 부모가 이미 가진 것(계약 · 수업 · 인바디) + 사진 · 개인운동 기록 개수만 여기서 읽는다(회원 1명 소량).
   2026-10-11 탭 나눔: 대시보드 = compact(한 줄 · 누르면 재등록 탭) · 재등록 탭 맨 위 = 전체(9칸 목록은 접어 둠).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Circle, Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildExerciseSeries } from "@/lib/workout";
import { describeGoal, goalProgress } from "@/lib/ptGoal";
import Card from "@/components/ui/Card";

// 회원 목적 — 배우기(기구 · 자세)는 따로 본다(배울 게 끝나면 이야기가 끊기는 유형)
function purposeOf(goal) {
  const g = String(goal || "");
  if (/기구|사용법|배우|자세 ?잡|운동법/.test(g)) return "learn";
  if (/바디\s*프로필|바프|촬영/.test(g)) return "diet";
  if (/벌크|근육|근력|증량/.test(g)) return "bulk";
  if (/체형|교정|통증|재활|허리|무릎|어깨|목/.test(g)) return "posture";
  if (/다이어트|감량|체지방|뱃살|살/.test(g)) return "diet";
  return "health";
}
// 받침 있으면 '이', 없으면 '가'
const josa = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가"; };
const STAR = {
  learn: ["goal", "next_step"],
  diet: ["inbody", "photo"],
  bulk: ["lift", "inbody"],
  posture: ["voice", "next_goal"],
  health: ["attend", "goal"],
};
const STAR_WHY = {
  learn: "이 회원은 배우는 게 목적이라, 다 배운 뒤에도 이어 갈 이야기가 있어야 해요.",
  diet: "다이어트는 숫자와 눈으로 보는 변화가 가장 강해요.",
  bulk: "변화가 느린 목표라 숫자로 자주 보여 줘야 해요.",
  posture: "안 아프게 된 뒤 '이제 근력'으로 넘어가는 이야기가 필요해요.",
  health: "꾸준함 자체가 성과예요. 숫자 하나만 정해 두면 더 분명해져요.",
};

// 무게 — 처음과 지금 최고 무게가 가장 많이 는 종목 하나.
function topLiftOf(logs) {
  return buildExerciseSeries(logs)
    .map((s) => { const p = s.points.filter((x) => x.topWeight != null); return p.length >= 2 ? { name: s.exercise, a: p[0].topWeight, b: p[p.length - 1].topWeight } : null; })
    .filter((x) => x && x.b !== x.a)
    .sort((x, y) => (y.b - y.a) - (x.b - x.a))[0] || null;
}

export default function ReRegReadiness({ member, contracts = [], logs = [], inbody = [], active = null, compact = false, onTasted = null }) {
  const [counts, setCounts] = useState({ photos: null, routine: null });
  // '다음 단계 맛보기' [했어요] — 계약 행 report.next_step_tasted에 저장(onTasted · 재등록 탭만 · 2026-10-11 점검: 예전엔 화면에서만 기억)
  const [tastedNow, setTastedNow] = useState(false);
  const tasted = tastedNow || Boolean(active?.report?.next_step_tasted);
  const markTasted = async () => { if (!onTasted) return; setTastedNow(true); const ok = await onTasted(); if (!ok) setTastedNow(false); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) return;
      const [ph, rl] = await Promise.all([
        supabase.from("member_photo").select("id", { count: "exact", head: true }).eq("user_id", member.id),
        supabase.from("member_routine_log").select("id", { count: "exact", head: true }).eq("user_id", member.id),
      ]);
      if (!cancelled) setCounts({ photos: ph.count ?? 0, routine: rl.error ? 0 : rl.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const purpose = purposeOf(`${member.goal || ""} ${member.pt_direction || ""}`);
  const done = logs.filter((l) => !l.voided && l.source !== "noshow");
  const noshow = logs.filter((l) => !l.voided && l.source === "noshow").length;
  const at = (l) => new Date(l.session_at ?? l.created_at).getTime();
  const span = done.length >= 2 ? (Math.max(...done.map(at)) - Math.min(...done.map(at))) / 86400000 : 0;
  const weeks = Math.max(1, Math.round(span / 7));
  const perWeek = done.length >= 4 ? Math.round((done.length / weeks) * 10) / 10 : null;

  // 인바디 — 목적에 맞는 지표 하나
  const ibFirst = inbody[0], ibLast = inbody[inbody.length - 1];
  const ibKey = purpose === "bulk" ? ["skeletal_muscle", "근육량", "kg"] : ["body_fat_pct", "체지방률", "%p"];
  const ibAlt = purpose === "bulk" ? ["weight", "체중", "kg"] : ["weight", "체중", "kg"];
  const ibPick = [ibKey, ibAlt].find(([k]) => inbody.length >= 2 && ibFirst?.[k] != null && ibLast?.[k] != null && ibFirst[k] !== ibLast[k]);
  const ibText = ibPick ? (() => {
    const [k, label, unit] = ibPick; const dlt = Math.round((ibLast[k] - ibFirst[k]) * 10) / 10;
    return `"처음보다 ${label}이 ${Math.abs(dlt)}${unit} ${dlt > 0 ? "늘었어요" : "줄었어요"}"`;
  })() : null;

  const topLift = useMemo(() => topLiftOf(logs), [logs]);
  const lift = topLift ? { name: topLift.name, first: topLift.a, best: topLift.b } : null;

  const sat = active?.report?.reg_satisfaction?.quote || [...contracts].reverse().find((c) => c.report?.reg_satisfaction?.quote)?.report?.reg_satisfaction?.quote;
  // 숫자 목표(2026-10-11 · lib/ptGoal) — 이번 계약에서 다음 목표로 넘어갔으면 그때 남긴 결과(goal_result)를, 아니면 지금 목표를.
  const goalResult = active?.report?.goal_result || null;
  const goal = !active?.report?.next_goal?.applied_at && member.pt_goal?.confirmed_at ? member.pt_goal : null;   // 반영된 뒤 pt_goal은 '다음' 목표
  const goalProg = goalResult ? null : goal ? goalProgress(goal, inbody, logs) : null;
  const goalText = goalResult ? `"${goalResult.goal} 목표에서 시작보다 ${goalResult.moved || "기록 없음"}"`
    : goal ? `"${describeGoal(goal)} 목표 · 시작보다 ${goalProg?.movedTxt || "아직 기록 없음"}"` : null;
  const nextGoal = active?.report?.next_goal || null;

  const items = [
    { k: "inbody", label: "인바디 변화", ok: Boolean(ibText), text: ibText, how: inbody.length < 2 ? "인바디를 한 번 더 재면 생겨요" : "변화가 아직 작아요. 다음 측정 때 다시 볼게요" },
    { k: "lift", label: "무게 변화", ok: Boolean(lift), text: lift ? `"${lift.name} ${lift.first}kg에서 ${lift.best}kg까지 왔어요"` : null, how: "운동일지에 무게를 적으면 생겨요" },
    { k: "attend", label: "꾸준함", ok: Boolean(perWeek), text: perWeek ? `"${weeks}주 동안 주 ${perWeek}회${noshow === 0 ? ", 한 번도 안 빠지셨어요" : " 꾸준히 오셨어요"}"` : null, how: "수업이 4번 넘게 쌓이면 생겨요" },
    { k: "photo", label: "사진으로 보는 변화", ok: (counts.photos ?? 0) >= 2, text: `비포 · 애프터 사진 ${counts.photos}장`, how: "사진을 한 번 더 찍으면 생겨요" },
    { k: "voice", label: "회원의 말", ok: Boolean(sat), text: sat ? `"${sat}"라고 하셨죠` : null, how: "재등록 화면에서 만족도를 물어 적어 두면 생겨요" },
    { k: "routine", label: "혼자 할 때와 수업 때", ok: (counts.routine ?? 0) >= 3, text: `개인운동 기록 ${counts.routine}번 · 수업 때와 비교할 수 있어요`, how: "케어 탭에서 개인운동 루틴을 켜 주면 생겨요", href: "care" },
    { k: "goal", label: "숫자 목표", ok: Boolean(goalText), text: goalText, how: "케어 탭 '현재 방향 · 목표'에 '6개월 근육량 2kg'처럼 적고 [맞아요]를 누르면 생겨요", href: "care" },
    { k: "next_step", label: "다음 단계 맛보기", ok: tasted, text: "다음 단계 운동을 보여 줬어요", how: purpose === "learn" ? "다음 수업에 한 단계 위 운동(예: 바벨 스쿼트)을 맛보여 주면 생겨요" : "다음에 할 운동을 한 번 맛보여 주면 생겨요", manual: true },
    { k: "next_goal", label: "다음 목표", ok: Boolean(nextGoal?.text), text: nextGoal?.text ? `"${nextGoal.text}"` : null, how: "케어 탭 목표 카드에서 '다음 목표'로 바꾸면 생겨요", href: "care" },
  ];
  const stars = STAR[purpose] || [];
  const missingStar = items.find((x) => stars.includes(x.k) && !x.ok);
  const okCount = items.filter((x) => x.ok).length;

  // 대시보드 한 줄 — 몇 개 모였는지 + 빠진 핵심 하나 · 누르면 재등록 탭(전체 목록).
  if (compact) {
    return (
      <Link href={`/pt/${member.id}/renewal`} className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3 no-underline shadow-sm transition hover:bg-elevate">
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-ink">재등록 재료 {okCount} / {items.length} 모였어요</span>
          <span className="block text-[13px] text-sub">
            {missingStar ? <>빠진 핵심 <span className="font-semibold text-ot-text">&lsquo;{missingStar.label}&rsquo;</span> · 눌러서 채우는 법 보기</> : "핵심 재료는 다 모였어요 · 눌러서 보기"}
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Card padding="none">
      <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
        <h2 className="m-0 text-[15px] font-bold text-ink">재등록 재료</h2>
        <span className="text-[13px] font-semibold text-sub">{okCount} / {items.length} 모였어요</span>
      </div>
      <p className="m-0 px-5 text-[12px] text-muted">재등록 때 할 말이에요. 숫자 변화 · 회원의 말 · 목표는 대본에 들어가고, 나머지는 세일즈북을 넘기며 직접 말해 주세요.</p>
      {missingStar && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5">
          <p className="m-0 flex items-center gap-1.5 text-[13px] font-bold text-ot-text"><Star className="h-3.5 w-3.5" aria-hidden="true" /> 아직 &lsquo;{missingStar.label}&rsquo;{josa(missingStar.label)} 없어요</p>
          <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-ink">{STAR_WHY[purpose]} {missingStar.how}.</p>
          {missingStar.href && <Link href={`/pt/${member.id}/${missingStar.href}`} className="mt-1 inline-flex min-h-[36px] items-center text-[13px] font-semibold text-primary-strong">케어 탭으로 가기 →</Link>}
          {missingStar.manual && onTasted && <button type="button" onClick={markTasted} className="mt-1.5 min-h-[36px] rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-ink">했어요</button>}
        </div>
      )}
      <details className="group/rr mt-2">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 px-5 text-[13px] font-semibold text-sub [&::-webkit-details-marker]:hidden">
        재료 {items.length}개 모두 보기
        <ChevronDown className="h-4 w-4 transition-transform group-open/rr:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="m-0 list-none divide-y divide-line border-t border-line p-0">
        {items.map((x) => (
          <li key={x.k} className="flex items-start gap-2.5 px-5 py-2.5">
            {x.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[12px] font-semibold text-muted">{x.label}{stars.includes(x.k) && <Star className="h-3 w-3 text-ot-text" aria-label="핵심 재료" />}</span>
              <span className={`block text-[14px] leading-snug ${x.ok ? "text-ink" : "text-sub"}`}>{x.ok ? x.text : x.how}</span>
              {!x.ok && x.href && <Link href={`/pt/${member.id}/${x.href}`} className="mt-0.5 inline-flex min-h-[32px] items-center text-[13px] font-semibold text-primary-strong">케어 탭으로 가기 →</Link>}
            </span>
            {!x.ok && x.manual && onTasted && x !== missingStar && <button type="button" onClick={markTasted} className="min-h-[32px] shrink-0 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-sub">했어요</button>}
          </li>
        ))}
      </ul>
      </details>
    </Card>
  );
}
