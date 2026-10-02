"use client";

/* =========================================================================
   PrepReport — '오늘의 OT 사전 준비 리포트' 본문(1차·2차+ 공용 · 2026-10-02 개편).

   왜 바꿨나: 예전엔 25~35줄이 한 화면에 쏟아져 위에서부터 줄줄이 읽어야 했다(대표 피드백).
   원칙 3가지:
     ① 맨 위 '30초 요약' 3줄 — 이것만 보고 들어가도 된다(AI의 cheat 필드 · 옛 캐시는 기존 항목에서 뽑음).
     ② 나머지는 수업 순서(입장 → 운동 → 클로징 → 거절)대로 접어 둔다 — 제목 한 줄 + 미리보기만.
     ③ 펼치면 '말할 대사'는 말풍선으로 크게, '왜'는 작고 흐리게 — 외울 것과 참고할 것을 눈으로 구분.
   데이터 스키마는 그대로(app/api/ot-brief first·second) — 화면만 바꾼다.
   ========================================================================= */

import { useState } from "react";
import { ChevronDown, CreditCard, Dumbbell, ExternalLink, Flag, History, MessageCircle, ShieldCheck, Sparkles, Lightbulb } from "lucide-react";
import ClosingSequence from "@/components/ui/ClosingSequence";
import { won } from "@/lib/format";

const OBJ_LABEL = { price: "가격", hesitation: "생각해볼게요", doubt: "효과 의심", time: "시간 부족", compare: "다른 곳 비교" };

// 말할 대사 — 말풍선(크게). 이유·설명은 Why(작게).
function Say({ children, tag }) {
  if (!children) return null;
  return (
    <p className="m-0 rounded-[16px_16px_16px_4px] bg-primary-soft px-3.5 py-2.5 text-[15px] font-medium leading-[1.6] text-ink">
      {tag && <span className="mr-1.5 align-middle text-[11px] font-bold text-primary-strong">{tag}</span>}
      &ldquo;{children}&rdquo;
    </p>
  );
}
function Why({ label = "왜", children }) {
  if (!children) return null;
  return <p className="m-0 text-[12.5px] leading-[1.55] text-muted"><span className="font-medium text-sub">{label} · </span>{children}</p>;
}

function Section({ n, icon: Icon, title, preview, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-line bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevate text-[12px] font-semibold text-sub">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            {Icon && <Icon className="h-4 w-4 text-primary-strong" aria-hidden="true" />}{title}
          </span>
          {!open && preview && <span className="mt-0.5 block truncate text-[12px] text-muted">{preview}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="space-y-2.5 border-t border-line px-3.5 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

// 30초 요약 — AI의 cheat(3줄). 옛 캐시엔 없으니 기존 항목에서 3줄을 뽑는다.
function cheatLines(kind, d) {
  if (Array.isArray(d.cheat) && d.cheat.filter(Boolean).length) return { lines: d.cheat.filter(Boolean).slice(0, 3), derived: false };
  const seq = d.closing_sequence || {};
  const proof = kind === "first"
    ? (d.exercises || []).find((e) => e?.proof) || (d.exercises || [])[0]
    : (d.proof?.moves || [])[0];
  const proofLine = kind === "first"
    ? proof && `${proof.name}${proof.cue ? ` — "${proof.cue}"` : ""}`
    : proof && `${proof.exercise}${proof.point_it_out ? ` — "${proof.point_it_out}"` : ""}`;
  const ask = seq.ask || d.closing_line;
  return { lines: [d.member_read, proofLine, ask && `"${ask}"`].filter(Boolean), derived: true };
}

export default function PrepReport({ kind = "first", data, packages = [], favorites = [], caseTier }) {
  const d = data || {};
  const [open, setOpen] = useState({});
  const [objSel, setObjSel] = useState(0);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const { lines, derived } = cheatLines(kind, d);
  const exercises = (d.exercises || []).filter(Boolean);
  const plan = (d.session_plan || []).filter(Boolean);
  const moves = (d.proof?.moves || []).filter(Boolean);
  const obj = (d.objection_defense || []).filter(Boolean);
  const rp = d.recommended_program || {};
  const pick = Number.isInteger(rp.pick_ref) ? packages[rp.pick_ref] || null : null;
  const alt = Number.isInteger(rp.alt_ref) ? packages[rp.alt_ref] || null : null;
  const gaps = (d.data_gaps || []).filter((g) => typeof g === "string" && g.trim());
  const seq = d.closing_sequence || {};
  const entry = kind === "first" ? d.opening || {} : d.recall || {};

  const sections = [];
  if (entry.line || d.workout_intro) {
    sections.push({
      k: "entry", icon: MessageCircle, title: kind === "first" ? "입장 · 첫 마디" : "입장 · 지난번 소환", preview: entry.line,
      body: (<><Say>{entry.line}</Say><Why>{entry.why}</Why>{d.workout_intro && <Say tag="운동 소개">{d.workout_intro}</Say>}</>),
    });
  }
  if (exercises.length || plan.length || moves.length) {
    const names = kind === "first" ? exercises.map((e) => e.name) : plan.map((p) => p.exercise);
    sections.push({
      k: "work", icon: Dumbbell, title: kind === "first" ? `오늘 운동 ${exercises.length}개` : `오늘 운동 ${plan.length}개 · 증명 ${moves.length}개`,
      preview: names.filter(Boolean).join(" · "),
      body: kind === "first" ? (
        <>
          {exercises.map((ex, i) => {
            const lib = Number.isInteger(ex.lib_ref) ? favorites[ex.lib_ref] || null : null;
            return (
              <div key={i} className={`space-y-1.5 ${i ? "border-t border-line pt-2.5" : ""}`}>
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {i + 1}. {ex.name}
                  {ex.proof && <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary-strong">증명</span>}
                </p>
                <Say>{ex.cue}</Say>
                <Why>{ex.reason}</Why>
                <Why label="바로 느낌">{ex.feel}</Why>
                {lib && (
                  <a href={lib.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-pt-text hover:underline">
                    <ExternalLink className="h-3 w-3" /> 내 자료: {lib.title}
                  </a>
                )}
              </div>
            );
          })}
          <Why label="그래서">{d.so_what}</Why>
        </>
      ) : (
        <>
          {plan.length > 0 && (
            <ol className="m-0 list-none space-y-1 p-0">
              {plan.map((p, i) => (
                <li key={i} className="text-[13.5px] leading-[1.5] text-ink">
                  <span className="font-semibold">{i + 1}. {p.exercise}</span>{p.point && <span className="text-muted"> — {p.point}</span>}
                </li>
              ))}
            </ol>
          )}
          {moves.map((mv, i) => (
            <div key={i} className="space-y-1.5 border-t border-line pt-2.5">
              <p className="m-0 text-[14px] font-semibold text-ink">
                <span className="mr-1.5 rounded bg-primary-soft px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary-strong">증명 {i + 1}</span>{mv.exercise}
              </p>
              <Say>{mv.point_it_out}</Say>
              <Why label="노릴 반응">{mv.target_reaction}</Why>
            </div>
          ))}
          <Why label="그래서">{d.proof?.so_what}</Why>
          <Why label="반응 약하면">{d.proof?.if_weak}</Why>
        </>
      ),
    });
  }
  if (seq.ask || seq.trial_close || d.closing_line || d.sales_metaphor?.metaphor) {
    sections.push({
      k: "close", icon: Flag, title: "클로징", preview: seq.ask || d.closing_line,
      body: <ClosingSequence sequence={d.closing_sequence} fallbackLine={d.closing_line || ""} metaphor={d.sales_metaphor} />,
    });
  }
  if (pick || packages.length === 0) {
    sections.push({
      k: "plan", icon: CreditCard, title: "추천 프로그램", preview: pick ? `${pick.name} · ${won(pick.price)}` : "패키지를 등록하면 추천해 드려요",
      body: pick ? (
        <>
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[14px] text-ink">
            <span className="font-semibold">{pick.name}</span><span className="font-mono font-semibold">{won(pick.price)}</span>
            {pick.sessions != null && <span className="text-[12px] text-muted">· {pick.sessions}회</span>}
          </p>
          <Why label="맞는 이유">{rp.why_fit}</Why>
          <Why label="빈도">{rp.frequency}</Why>
          <Why label="기간">{rp.duration}</Why>
          <Why label="그래서">{rp.session_logic}</Why>
          {alt && <Why label="대안">{`${alt.name} · ${won(alt.price)}${rp.alt_why ? ` — ${rp.alt_why}` : ""}`}</Why>}
        </>
      ) : <p className="m-0 text-[13px] text-muted">설정 › 가격에서 PT 패키지를 등록하면 이 회원에게 맞는 걸 골라 드려요.</p>,
    });
  }
  if (obj.length) {
    const cur = obj[Math.min(objSel, obj.length - 1)] || {};
    sections.push({
      k: "obj", icon: ShieldCheck, title: `거절 대응 ${obj.length}가지`, preview: obj.map((o) => OBJ_LABEL[o.reason] || o.reason).join(" · "),
      body: (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="거절 종류">
            {obj.map((o, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === objSel} onClick={() => setObjSel(i)}
                className={`min-h-[36px] rounded-full px-3 text-[13px] transition ${i === objSel ? "bg-ink font-semibold text-white" : "bg-elevate font-normal text-sub hover:text-ink"}`}>
                {OBJ_LABEL[o.reason] || o.reason}
              </button>
            ))}
          </div>
          <Why label="이럴 때">{cur.trigger}</Why>
          <Say>{cur.line}</Say>
          <Why label="방향">{cur.defense}</Why>
        </>
      ),
    });
  }
  if (d.case_feedback) {
    const cf = d.case_feedback;
    sections.push({
      k: "case", icon: History, title: `내 과거 케이스${caseTier === "confident" ? "" : " · 참고"}`, preview: cf.proven_lead,
      body: (<><Why label="진짜 걸림돌">{cf.diagnosis}</Why><Why label="통했던 접근">{cf.proven_lead}</Why><Why label="이번엔 다르게">{cf.avoid_repeat}</Why>{cf.your_read && <p className="m-0 text-[12px] italic text-muted">{cf.your_read}</p>}</>),
    });
  }
  if (gaps.length) {
    sections.push({
      k: "gaps", icon: Lightbulb, title: "더 좋아지려면", preview: gaps[0],
      body: <ul className="m-0 list-none space-y-1 p-0">{gaps.map((g, i) => <li key={i} className="text-[12.5px] leading-[1.55] text-sub">＋ {g}</li>)}</ul>,
    });
  }

  const allOpen = sections.length > 0 && sections.every((s) => open[s.k]);
  const setAll = (v) => setOpen(Object.fromEntries(sections.map((s) => [s.k, v])));

  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-primary-strong">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> 30초 요약 · 이것만 외우기
          </div>
          <ol className="m-0 mt-2 list-none space-y-1.5 p-0">
            {lines.map((t, i) => (
              <li key={i} className="flex gap-2 text-[15px] font-medium leading-[1.55] text-ink">
                <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-primary-strong">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          {derived && <p className="m-0 mt-2 text-[11px] text-sub">리포트를 다시 만들면 더 짧은 요약으로 바뀌어요.</p>}
        </div>
      )}

      {sections.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[12px] text-muted">수업 순서대로 · 누르면 대사</span>
            <button type="button" onClick={() => setAll(!allOpen)} className="min-h-[32px] rounded-lg px-2 text-[12px] font-semibold text-sub hover:text-ink">
              {allOpen ? "모두 접기" : "모두 펼치기"}
            </button>
          </div>
          {sections.map((s, i) => (
            <Section key={s.k} n={i + 1} icon={s.icon} title={s.title} preview={s.preview} open={!!open[s.k]} onToggle={() => toggle(s.k)}>
              {s.body}
            </Section>
          ))}
        </>
      )}
    </div>
  );
}
