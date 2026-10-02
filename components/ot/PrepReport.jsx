"use client";

/* =========================================================================
   PrepReport — '오늘의 OT 사전 준비 리포트' 본문(1차·2차+ 공용).

   2026-10-02 두 번째 개편(대표: "폰에서 글이 너무 많고 복잡하다"):
     ① 기본 화면 = '말할 것'만. 왜·하는 법·바로 느낌·바꿔 쓸 운동·비유·숙제는 '자세히'를 눌러야 펼쳐진다.
     ② 빨강 강조는 30초 요약·요청·증명 운동 대사에만(나머지 대사는 굵게만 · Emph tone="quiet").
     ③ 상자 안 상자를 없앤다 — 섹션 카드 한 겹, 클로징도 카드 안에서 줄 목록.
     ④ 가격은 클로징 플랜 줄에 한 번만. 옛 '추천 프로그램' 문단은 맨 아래 '참고'로 접는다.
     ⑤ 한글 줄바꿈 — 단어 중간에서 끊기지 않게(break-keep), 마지막 한 글자만 내려가지 않게(text-pretty).
   데이터 스키마는 그대로(app/api/ot-brief first·second) — 옛 캐시(운동 이름에 하는 법이 붙은 것)도 ':' 앞뒤로 나눠 보여준다.
   ========================================================================= */

import { useState } from "react";
import { ChevronDown, Dumbbell, ExternalLink, Flag, History, MessageCircle, ShieldCheck, Sparkles, BookText } from "lucide-react";
import ClosingSequence from "@/components/ui/ClosingSequence";
import { won, wonApprox } from "@/lib/format";
import Emph, { plainText } from "@/components/ui/Emph";
import { resolvePkg } from "@/lib/pkgRef";

const OBJ_LABEL = { price: "가격", hesitation: "생각해볼게요", doubt: "효과 의심", time: "시간 부족", compare: "다른 곳 비교" };

// 말할 대사 — 말풍선. strong=빨강 강조 허용(요청·증명), 아니면 굵게만.
function Say({ children, strong = false }) {
  if (!children) return null;
  return (
    <p className="m-0 rounded-[16px_16px_16px_4px] bg-primary-soft px-3.5 py-2.5 text-[15px] font-medium leading-[1.6] text-ink">
      &ldquo;<Emph tone={strong ? "primary" : "quiet"}>{children}</Emph>&rdquo;
    </p>
  );
}

// 참고 한 줄(라벨 · 내용) — 작고 흐리게.
function Note({ label, children }) {
  if (!children) return null;
  return (
    <p className="m-0 text-[13px] leading-[1.6] text-sub">
      <span className="font-semibold text-ink">{label}</span> <span>{plainText(children)}</span>
    </p>
  );
}

// '자세히' — 눌러야 펼쳐지는 참고 묶음.
function More({ label = "자세히", children }) {
  const [open, setOpen] = useState(false);
  const has = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!has) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 text-[12px] font-semibold text-muted transition hover:text-ink">
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="mt-1 space-y-1.5 border-l-2 border-line pl-3">{children}</div>}
    </div>
  );
}

function Section({ n, icon: Icon, title, preview, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-line bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex min-h-[54px] w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevate text-[12px] font-semibold text-sub">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />}{title}
          </span>
          {!open && preview && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{plainText(preview)}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t border-line px-4 pb-4 pt-3.5">{children}</div>}
    </div>
  );
}

// 운동 이름 — 새 형식은 name(짧게)+how, 옛 캐시는 "이름: 하는 법" 한 줄이라 ':' 앞뒤로 나눈다.
function splitName(ex) {
  const name = plainText(ex?.name || "");
  if (ex?.how) return { name, how: ex.how };
  const i = name.indexOf(":");
  return i > 0 && i < 30 ? { name: name.slice(0, i).trim(), how: name.slice(i + 1).trim() } : { name, how: "" };
}

// 30초 요약 — AI의 cheat(3줄). 옛 캐시엔 없으니 기존 항목에서 3줄을 뽑는다.
function cheatLines(kind, d) {
  if (Array.isArray(d.cheat) && d.cheat.filter(Boolean).length) return { lines: d.cheat.filter(Boolean).slice(0, 3), derived: false };
  const seq = d.closing_sequence || {};
  const proof = kind === "first"
    ? (d.exercises || []).find((e) => e?.proof) || (d.exercises || [])[0]
    : (d.proof?.moves || [])[0];
  const proofLine = kind === "first"
    ? proof && `${splitName(proof).name}${proof.cue ? `: "${proof.cue}"` : ""}`
    : proof && `${proof.exercise}${proof.point_it_out ? `: "${proof.point_it_out}"` : ""}`;
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
  const seqForHint = d.closing_sequence || {};
  // 만들 때 저장한 패키지(pick_pkg)가 먼저 — 순번만 보면 다른 트레이너·가격표 순서 변경에 엉뚱한 가격이 붙는다(lib/pkgRef).
  const pick = resolvePkg({ snap: rp.pick_pkg, ref: rp.pick_ref, packages, hint: seqForHint.plan_pitch || rp.session_logic });
  const alt = resolvePkg({ snap: rp.alt_pkg, ref: rp.alt_ref, packages, hint: rp.alt_why });
  const per = pick?.sessions ? Math.round(pick.price / pick.sessions) : null;
  const priceLine = pick ? `${pick.name} · ${won(pick.price)}${per ? ` · 회당 약 ${wonApprox(per)}` : ""}` : "";
  const gaps = (d.data_gaps || []).filter((g) => typeof g === "string" && g.trim());
  const seq = d.closing_sequence || {};
  const entry = kind === "first" ? d.opening || {} : d.recall || {};

  const sections = [];
  if (entry.line || d.workout_intro) {
    sections.push({
      k: "entry", icon: MessageCircle, title: kind === "first" ? "입장 · 첫 마디" : "입장 · 지난번 소환", preview: entry.line,
      body: (<><Say>{entry.line}</Say><More label="왜"><Note label="왜">{entry.why}</Note></More></>),
    });
  }
  if (exercises.length || plan.length || moves.length) {
    const names = kind === "first" ? exercises.map((e) => splitName(e).name) : plan.map((p) => p.exercise);
    sections.push({
      k: "work", icon: Dumbbell, title: kind === "first" ? `오늘 운동 ${exercises.length}개` : `오늘 운동 ${plan.length}개 · 증명 ${moves.length}개`,
      preview: names.filter(Boolean).join(" · "),
      body: kind === "first" ? (
        <>
          {d.workout_intro && <Say>{d.workout_intro}</Say>}
          {exercises.map((ex, i) => {
            const lib = Number.isInteger(ex.lib_ref) ? favorites[ex.lib_ref] || null : null;
            const alts = (Array.isArray(ex.alts) ? ex.alts : []).filter((a) => a && a.name);
            const { name, how } = splitName(ex);
            return (
              <div key={i} className="space-y-2 border-t border-line pt-3">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="text-[15px] font-bold text-ink">{name}</span>
                  {ex.slot && <span className="text-[12px] text-muted">{ex.slot}</span>}
                  {ex.proof && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10.5px] font-bold text-white">증명</span>}
                </p>
                <Say strong={ex.proof}>{ex.cue}</Say>
                <More>
                  <Note label="하는 법">{how}</Note>
                  <Note label="왜">{ex.reason}</Note>
                  <Note label="바로 느낌">{ex.feel}</Note>
                  {alts.length > 0 && (
                    <div className="space-y-1">
                      <p className="m-0 text-[12px] font-semibold text-muted">바꿔 쓸 운동</p>
                      {alts.map((a, j) => <Note key={j} label={plainText(a.name)}>{a.why}</Note>)}
                    </div>
                  )}
                  {lib && (
                    <a href={lib.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-pt-text hover:underline">
                      <ExternalLink className="h-3 w-3" /> 내 자료: {lib.title}
                    </a>
                  )}
                </More>
              </div>
            );
          })}
          {d.workout_structure && <Note label="오늘 구성">{d.workout_structure}</Note>}
        </>
      ) : (
        <>
          {plan.length > 0 && (
            <ol className="m-0 list-none space-y-1 p-0">
              {plan.map((p, i) => (
                <li key={i} className="text-[14px] leading-[1.55] text-ink">
                  <span className="font-semibold">{i + 1}. {plainText(p.exercise)}</span>
                </li>
              ))}
            </ol>
          )}
          {moves.map((mv, i) => (
            <div key={i} className="space-y-2 border-t border-line pt-3">
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10.5px] font-bold text-white">증명 {i + 1}</span>
                <span className="text-[15px] font-bold text-ink">{plainText(mv.exercise)}</span>
              </p>
              <Say strong>{mv.point_it_out}</Say>
              <More><Note label="노릴 반응">{mv.target_reaction}</Note></More>
            </div>
          ))}
          <More label="운동별 포인트 · 반응 약하면">
            {plan.map((p, i) => <Note key={i} label={`${i + 1}.`}>{p.point}</Note>)}
            <Note label="반응 약하면">{d.proof?.if_weak}</Note>
          </More>
        </>
      ),
    });
  }
  if (seq.ask || seq.trial_close || d.closing_line || d.sales_metaphor?.metaphor) {
    sections.push({
      k: "close", icon: Flag, title: "클로징", preview: seq.ask || d.closing_line,
      body: <ClosingSequence compact sequence={d.closing_sequence} fallbackLine={d.closing_line || ""} metaphor={d.sales_metaphor} priceLine={priceLine} />,
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
          <Note label="이럴 때">{cur.trigger}</Note>
          <Say>{cur.line}</Say>
          <More label="방향"><Note label="방향">{cur.defense}</Note></More>
        </>
      ),
    });
  }
  if (d.case_feedback) {
    const cf = d.case_feedback;
    sections.push({
      k: "case", icon: History, title: `내 과거 케이스${caseTier === "confident" ? "" : " · 참고"}`, preview: cf.proven_lead,
      body: (<><Note label="진짜 걸림돌">{cf.diagnosis}</Note><Note label="통했던 접근">{cf.proven_lead}</Note><Note label="이번엔 다르게">{cf.avoid_repeat}</Note>{cf.your_read && <p className="m-0 text-[12.5px] italic text-muted">{cf.your_read}</p>}</>),
    });
  }
  // 참고 — 추천 근거(옛 '추천 프로그램' 문단) + 더 좋아지려면. 수업 직전엔 안 봐도 되는 것.
  if (pick || rp.why_fit || gaps.length) {
    sections.push({
      k: "ref", icon: BookText, title: "참고 · 추천 근거", preview: pick ? `${pick.name} · ${won(pick.price)}` : gaps[0],
      body: (
        <>
          <Note label="맞는 이유">{rp.why_fit}</Note>
          <Note label="빈도">{rp.frequency}</Note>
          <Note label="기간">{rp.duration}</Note>
          <Note label="그래서">{rp.session_logic}</Note>
          {alt && <Note label="대안">{`${alt.name} · ${won(alt.price)}${rp.alt_why ? `. ${rp.alt_why}` : ""}`}</Note>}
          {gaps.length > 0 && (
            <div className="space-y-1 border-t border-line pt-2.5">
              <p className="m-0 text-[12px] font-semibold text-muted">더 좋아지려면</p>
              {gaps.map((g, i) => <p key={i} className="m-0 text-[13px] leading-[1.6] text-sub">＋ {g}</p>)}
            </div>
          )}
        </>
      ),
    });
  }

  // '모두 펼치기'는 참고(추천 근거·더 좋아지려면)는 빼고 연다 — 수업 직전엔 안 봐도 되는 칸.
  const main = sections.filter((x) => x.k !== "ref");
  const allOpen = main.length > 0 && main.every((x) => open[x.k]);
  const setAll = (v) => setOpen((o) => ({ ...o, ...Object.fromEntries(main.map((x) => [x.k, v])) }));

  return (
    <div className="space-y-3 break-keep text-pretty">
      {lines.length > 0 && (
        <div className="rounded-2xl bg-primary-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-strong">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> 30초 요약 · 이것만 외우기
          </div>
          <ol className="m-0 mt-2 list-none space-y-2 p-0">
            {lines.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] font-medium leading-[1.55] text-ink">
                {derived ? (
                  <span className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-primary-strong">{i + 1}</span>
                ) : (
                  <span className="mt-[3px] w-[46px] shrink-0 text-[12px] font-semibold text-primary-strong">{["이 회원", "오늘 꼭", "요청"][i]}</span>
                )}
                <span className="min-w-0"><Emph>{t}</Emph></span>
              </li>
            ))}
          </ol>
          {derived && <p className="m-0 mt-2 text-[11.5px] text-sub">리포트를 다시 만들면 더 짧은 요약으로 바뀌어요.</p>}
        </div>
      )}

      {sections.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[12.5px] text-muted">수업 순서대로 · 누르면 대사</span>
            <button type="button" onClick={() => setAll(!allOpen)} className="min-h-[32px] rounded-lg px-2 text-[12.5px] font-semibold text-sub hover:text-ink">
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
