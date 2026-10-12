"use client";

/* =========================================================================
   PrepReport — '오늘의 OT 사전 준비 리포트' 본문(1차·2차+ 공용 · 2026-10-02부터 재등록도 같은 문서 모양 · kind="reregister").

   2026-10-02 두 번째 개편(대표: "폰에서 글이 너무 많고 복잡하다"):
     ① 기본 화면 = '말할 것'만. 왜·하는 법·바로 느낌·바꿔 쓸 운동·비유·숙제는 '자세히'를 눌러야 펼쳐진다.
     ② 빨강 강조는 30초 요약·요청·증명 운동 대사에만(나머지 대사는 굵게만 · Emph tone="quiet").
     ③ 상자 안 상자를 없앤다 — 섹션 카드 한 겹, 클로징도 카드 안에서 줄 목록.
     ④ 가격은 클로징 플랜 줄에 한 번만. 옛 '추천 프로그램' 문단은 맨 아래 '참고'로 접는다.
     ⑤ 한글 줄바꿈 — 단어 중간에서 끊기지 않게(break-keep), 마지막 한 글자만 내려가지 않게(text-pretty).
   데이터 스키마는 그대로(app/api/ot-brief first·second) — 옛 캐시(운동 이름에 하는 법이 붙은 것)도 ':' 앞뒤로 나눠 보여준다.
   ========================================================================= */

import { useState } from "react";
import { ChevronDown, Dumbbell, ExternalLink, Flag, History, MessageCircle, ShieldCheck, Sparkles, BookText, TrendingUp, Route } from "lucide-react";
import ClosingSequence from "@/components/ui/ClosingSequence";
import { won, wonApprox } from "@/lib/format";
import Emph, { plainText } from "@/components/ui/Emph";
import { resolvePkg } from "@/lib/pkgRef";
import { labelOf, REG_REASON_OPTS } from "@/lib/labels";

// AI가 목록 칸을 목록이 아닌 값으로 보내도 화면이 죽지 않게(옛 캐시 포함 · 서버도 고쳐 저장).
const arr = (v) => (Array.isArray(v) ? v : []);

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
// 대본이 쓴 '내 자료'(라이브러리 별표 자료) — http(s) 링크만 연다. 링크가 없으면 제목만.
function LibLink({ lib }) {
  if (!lib?.title) return null;
  const href = typeof lib.url === "string" && /^https?:\/\//i.test(lib.url) ? lib.url : null;
  const cls = "inline-flex items-center gap-1 text-[12px] font-semibold text-pt-text";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline`}>
      <ExternalLink className="h-3 w-3" /> 내 자료: {lib.title}
    </a>
  ) : <span className={cls}>내 자료: {lib.title}</span>;
}

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

/* 세일즈북을 넘기며 클로징(2026-10-11 시안) — 대본의 클로징 비트를 세일즈북 장에 붙여 보여 준다.
   숫자 · 사진 · 가격은 세일즈북 화면이, 말은 대본이(book_lines = 장과 장을 잇는 짧은 줄 · AI).
   book_lines가 없는 옛 대본은 이 화면을 안 쓰고 예전 클로징 그대로.
   세일즈북이 없으면(onOpenBook 없음 · 지난 회차 등) 장 이름 칸 · 화면 안내는 숨기고 순서 · 대사만. */
const BOOK_FLOW = {
  second: [
    { slide: "표지", label: "시작", from: "open" },
    { slide: "당신의 목표", label: "되짚기", seq: "echo", alt: "goal" },
    { slide: "오늘 함께 확인한 것", label: "회원이 말하게", seq: "trial_close" },
    { slide: "오늘 함께 확인한 것", label: "왜 PT가 필요한지", seq: "stakes" },
    { slide: "오늘 함께 확인한 것", label: "쉽게 말하면", metaphor: true },
    { slide: "이런 변화를 만들어요", label: "한마디", from: "cases", act: "숫자는 화면이 말하게 2~3초 두기" },
    { slide: "여기까지 함께 갑니다", label: "앞으로", seq: "next_goal", alt: "roadmap" },
    { slide: "추천 플랜", label: "추천 플랜", seq: "plan_pitch", price: true },
    { slide: "약속드릴게요", label: "약속", promise: true },
    { slide: "약속드릴게요", label: "요청", seq: "ask", ask: true, hold: true },
    { slide: "약속드릴게요", label: "웃으며 한마디", seq: "nudge" },
    { slide: "약속드릴게요", label: "망설이면", seq: "flush" },
  ],
  reregister: [
    { slide: "표지", label: "시작", from: "open" },
    { slide: "그동안의 여정", label: "인정", from: "journey" },
    { slide: "그동안의 여정", label: "되짚기", seq: "echo" },
    { slide: "숫자로 확인된 변화", label: "회원이 말하게", seq: "trial_close", act: "회원이 직접 고르게 하고, 고른 걸 끝까지 짚어요" },
    { slide: "사진 기록", label: "한마디", from: "photo" },
    { slide: "지금 어디까지 · 앞으로", label: "다음 목표", seq: "next_goal", alt: "roadmap" },
    { slide: "지금 멈추면 · 이어가면", label: "왜 지금 이어가야 하나", seq: "stakes" },
    { slide: "지금 멈추면 · 이어가면", label: "쉽게 말하면", metaphor: true },
    { slide: "추천 플랜", label: "추천 플랜", seq: "plan_pitch", price: true },
    { slide: "추천 플랜", label: "혜택(덤)", sweet: true },
    { slide: "약속드릴게요", label: "약속", promise: true },
    { slide: "약속드릴게요", label: "요청", seq: "ask", ask: true, hold: true },
    { slide: "약속드릴게요", label: "망설이면", seq: "flush" },
  ],
};
// 핵심 4줄(2026-10-11 대표 · "클로징이 외울 수 없을 만큼 길다") — 기본 화면은 되짚기 · 왜 · 추천 플랜 · 요청만.
//   나머지(장마다 한마디 · 회원이 말하게 · 쉽게 말하면 · 앞으로 · 혜택 · 약속 · 망설이면)는 '장 순서대로 전부 보기'에 접는다.
//   AI 출력은 그대로 · 화면만(옛 대본에도 바로 적용).
const CORE_SEQ = ["echo", "stakes", "plan_pitch", "ask"];
const CORE_LABEL = { echo: "되짚기", stakes: "왜 PT가 필요한지", plan_pitch: "추천 플랜", ask: "요청" };
const coreLabel = (kind, k) => (kind === "reregister" && k === "stakes" ? "왜 지금 이어가야 하나" : CORE_LABEL[k]);   // 재등록 회원은 이미 PT 중
const HOLD_TEXT = "요청한 뒤엔 먼저 말하지 말고 기다려요.";

function BookClosing({ kind, d, priceLine, onOpenBook }) {
  const [all, setAll] = useState(false);
  const seq = d.closing_sequence || {};
  const bl = d.book_lines || {};
  const promises = (Array.isArray(seq.promise) ? seq.promise : []).filter(Boolean);
  const rows = (BOOK_FLOW[kind] || []).map((r) => ({ ...r, text: r.promise ? (promises.length ? promises : null) : r.metaphor ? (d.sales_metaphor?.metaphor || "").replace(/^쉽게 말하면[,\s]*/, "") : r.sweet ? d.sweetener : r.from ? bl[r.from] : seq[r.seq] || (r.alt ? bl[r.alt] : null) })).filter((r) => r.text)
    .map((r, i, arr) => ({ ...r, newSlide: i === 0 || arr[i - 1].slide !== r.slide }));
  const core = rows.filter((r) => CORE_SEQ.includes(r.seq));
  const slidePill = (slide) => onOpenBook && <p className="m-0 inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-0.5 text-[12px] font-bold text-white"><BookText className="h-3 w-3" aria-hidden="true" />{slide}</p>;
  const extras = (r) => (
    <>
      {r.price && priceLine && <p className="m-0 text-[13px] font-semibold text-ink">{onOpenBook ? "화면의 추천 칸 · " : ""}{priceLine}</p>}
      {r.hold && seq.hold && <p className="m-0 text-[12px] text-sub">{HOLD_TEXT}</p>}
    </>
  );
  return (
    <div className="space-y-3">
      {onOpenBook && (
        <button type="button" onClick={onOpenBook}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-bold text-white">
          <BookText className="h-4 w-4" aria-hidden="true" /> 세일즈북 열기
        </button>
      )}
      {/* 핵심 4줄 — 이것만 외워도 클로징이 된다 */}
      <ol className="m-0 list-none space-y-3 p-0">
        {core.map((r, i) => (
          <li key={r.seq} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-primary-strong">{"①②③④"[i]} {coreLabel(kind, r.seq)}</span>
              {slidePill(r.slide)}
            </div>
            <Say strong={r.ask}>{r.text}</Say>
            {extras(r)}
          </li>
        ))}
      </ol>
      <div>
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          className="inline-flex min-h-[40px] items-center gap-1 text-[13px] font-semibold text-sub transition hover:text-ink">
          {onOpenBook ? "세일즈북 장 순서대로 전부 보기" : "전체 순서로 보기"} · {rows.length}줄
          <ChevronDown className={`h-4 w-4 transition-transform ${all ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {all && (
          <ol className="m-0 mt-2 list-none space-y-2.5 border-l-2 border-line p-0 pl-3">
            {rows.map((r, i) => (
              <li key={i} className="space-y-1">
                {r.newSlide && slidePill(r.slide)}
                <p className="m-0 text-[12px] font-semibold text-muted">{r.label}{CORE_SEQ.includes(r.seq) && <span className="ml-1.5 text-primary-strong">핵심</span>}</p>
                {Array.isArray(r.text) ? r.text.map((t, j) => <Say key={j}>{t}</Say>) : <Say strong={r.ask}>{r.text}</Say>}
                {extras(r)}
                {r.act && onOpenBook && <p className="m-0 text-[12px] text-sub">{r.act}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
      {(seq.fallback?.next_line || arr(seq.fallback?.homework).length > 0) && (
        <More label="오늘 안 되면 · 숙제">
          <Note label="다음 OT">{seq.fallback?.next_line}</Note>
          {arr(seq.fallback?.homework).filter(Boolean).map((h, i) => <Note key={i} label={`숙제 ${i + 1}`}>{h.do}</Note>)}
        </More>
      )}
    </div>
  );
}

// 지시 + 대사가 한 줄로 온 것('…버티는 동작을 넣고 이렇게 말해요: "다리 힘은…"') — 말풍선 안에 따옴표가 또 들어가던 것을
//   지시(작게)와 대사(말풍선)로 나눈다(2026-10-11). 모양이 안 맞으면 예전처럼 통째로 말풍선.
function CueSay({ text }) {
  const t = plainText(text || "");
  if (!t) return null;
  const m = t.match(/^([\s\S]{4,}?)[:：]\s*["“]([\s\S]+?)["”]\s*$/);
  if (!m) return <Say>{text}</Say>;
  return (
    <>
      <p className="m-0 text-[13px] leading-[1.6] text-sub">{m[1].trim()}</p>
      <Say>{m[2].trim()}</Say>
    </>
  );
}

// 문서 안의 한 칸 — 카드가 아니라 구분선으로 나뉜 줄(리포트가 한 장의 문서로 보이게 · 2026-10-02).
function Section({ n, icon: Icon, title, preview, open, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevate text-[12px] font-semibold text-sub">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />}{title}
          </span>
          {!open && preview && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{plainText(preview)}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 pb-5 sm:pl-10">{children}</div>}
    </div>
  );
}

// 운동 이름 — 새 형식은 name(짧게)+how, 옛 캐시는 "이름: 하는 법" 한 줄이라 ':' 앞뒤로 나눈다.
function splitText(text, how) {
  const name = plainText(text || "");
  if (how) return { name, how };
  const i = name.indexOf(":");
  return i > 0 && i < 30 ? { name: name.slice(0, i).trim(), how: name.slice(i + 1).trim() } : { name, how: "" };
}
const splitName = (ex) => splitText(ex?.name, ex?.how);
// 2차 — session_plan·proof.moves는 이름이 exercise 칸(옛 캐시는 "이름: 세팅" 한 줄).
const splitEx = (x) => splitText(x?.exercise, x?.how);

// 30초 요약 — AI의 cheat(3줄). 옛 캐시엔 없으니 기존 항목에서 3줄을 뽑는다.
function cheatLines(kind, d) {
  if (Array.isArray(d.cheat) && d.cheat.filter(Boolean).length) return { lines: d.cheat.filter(Boolean).slice(0, 3), derived: false };
  const seq = d.closing_sequence || {};
  if (kind === "reregister") {
    const ask = seq.ask || d.closing_line;
    return { lines: [d.member_read, d.why_now?.proven, ask && `"${ask}"`].filter(Boolean), derived: true };
  }
  const proof = kind === "first"
    ? arr(d.exercises).find((e) => e?.proof) || arr(d.exercises)[0]
    : arr(d.proof?.moves)[0];
  const proofLine = kind === "first"
    ? proof && `${splitName(proof).name}${proof.cue ? `: "${proof.cue}"` : ""}`
    : proof && `${proof.exercise}${proof.point_it_out ? `: "${proof.point_it_out}"` : ""}`;
  const ask = seq.ask || d.closing_line;
  return { lines: [d.member_read, proofLine, ask && `"${ask}"`].filter(Boolean), derived: true };
}

export default function PrepReport({ kind = "first", data, packages = [], favorites = [], caseTier, highlightReason = "", onOpenBook = null }) {
  const d = data || {};
  const rereg = kind === "reregister";
  const [open, setOpen] = useState({});
  // 재등록은 기록된 거절 이유(reg_reason)가 있으면 그 칸부터 보여 준다.
  const [objSel, setObjSel] = useState(() => {
    const i = rereg && highlightReason ? arr(d.objection_defense).filter(Boolean).findIndex((o) => o.reason === highlightReason) : -1;
    return i > 0 ? i : 0;
  });
  const objLabel = (r) => (rereg ? labelOf(REG_REASON_OPTS, r) : OBJ_LABEL[r] || r);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  // 대본이 쓴 내 자료 — 서버가 붙여 저장한 제목 · 링크(lib)가 먼저, 옛 결과는 지금 라이브러리 순번으로.
  const libOf = (x) => x?.lib || (Number.isInteger(x?.lib_ref) ? favorites[x.lib_ref] || null : null);
  const regLibs = Array.isArray(d.libs) ? d.libs.filter(Boolean)
    : (Array.isArray(d.lib_refs) ? d.lib_refs.filter(Number.isInteger).map((i) => favorites[i]).filter(Boolean) : []);

  const { lines, derived } = cheatLines(kind, d);
  const exercises = arr(d.exercises).filter((x) => x && typeof x === "object");
  const plan = arr(d.session_plan).filter((x) => x && typeof x === "object");
  const moves = arr(d.proof?.moves).filter((x) => x && typeof x === "object");
  const obj = arr(d.objection_defense).filter((x) => x && typeof x === "object");
  const rp = d.recommended_program || {};
  const seqForHint = d.closing_sequence || {};
  // 만들 때 저장한 패키지(pick_pkg)가 먼저 — 순번만 보면 다른 트레이너·가격표 순서 변경에 엉뚱한 가격이 붙는다(lib/pkgRef).
  const pick = resolvePkg({ snap: rp.pick_pkg, ref: rp.pick_ref, packages, hint: seqForHint.plan_pitch || rp.session_logic });
  const alt = resolvePkg({ snap: rp.alt_pkg, ref: rp.alt_ref, packages, hint: rp.alt_why });
  const per = pick?.sessions ? Math.round(pick.price / pick.sessions) : null;
  const priceLine = pick ? `${pick.name} · ${won(pick.price)}${per ? ` · 회당 약 ${wonApprox(per)}` : ""}` : "";
  const gaps = arr(d.data_gaps).filter((g) => typeof g === "string" && g.trim());
  const seq = d.closing_sequence || {};
  const entry = kind === "first" ? d.opening || {} : d.recall || {};
  // 정보가 거의 없는 회원 — 대사에 ○○ 빈칸이 있다(수업 중 회원이 말한 목표를 넣어 말함).
  const fillIn = Boolean(d.fill_in) || JSON.stringify(seq).includes("○○");

  const sections = [];
  // 재등록 — 그동안의 변화 → 앞으로 · 오늘 수업 흐름(OT의 입장·운동 자리).
  const wn = d.why_now || {};
  const sf = d.session_flow || {};
  // 새 클로징(되짚기 · 다음 목표 · 왜 지금이 있는 대본 · 2026-10-11)이면 이 칸은 클로징과 같은 말이라 뺀다(대표: 겹친다).
  //   옛 대본만 이 칸을 그대로 보여 준다. 내 자료 링크는 '오늘 수업 흐름'으로 옮긴다.
  const newClose = Boolean(seq.echo || Array.isArray(seq.promise));
  if (rereg && !newClose && (wn.proven || wn.satisfaction || wn.future_change)) {
    sections.push({
      k: "change", icon: TrendingUp, title: "그동안의 변화 → 앞으로", preview: wn.proven,
      body: (
        <>
          <Say>{wn.proven}</Say>
          <Say>{wn.satisfaction}</Say>
          <More label="멈추면 · 앞으로 더 할 것 · 달라질 것">
            <Note label="멈추면">{wn.risk_if_stop}</Note>
            <Note label="앞으로 더 할 것">{wn.next_roadmap}</Note>
            <Note label="앞으로 달라질 것">{wn.future_change}</Note>
            {regLibs.map((lib, i) => <LibLink key={i} lib={lib} />)}
          </More>
        </>
      ),
    });
  }
  if (rereg && (sf.gap_awareness || sf.goal_raise || sf.timing)) {
    sections.push({
      k: "flow", icon: Route, title: "오늘 수업 흐름", preview: sf.timing || sf.gap_awareness,
      body: (
        <>
          <Note label="꺼낼 타이밍">{sf.timing}</Note>
          {sf.gap_awareness && <p className="m-0 text-[12px] font-semibold text-muted">아직 남은 부분 알려 주기</p>}
          <CueSay text={sf.gap_awareness} />
          {sf.goal_raise && <p className="m-0 text-[12px] font-semibold text-muted">목표 한 단계 올리기</p>}
          <CueSay text={sf.goal_raise} />
          {newClose && regLibs.map((lib, i) => <LibLink key={i} lib={lib} />)}
        </>
      ),
    });
  }
  if (entry.line || d.workout_intro) {
    sections.push({
      k: "entry", icon: MessageCircle, title: kind === "first" ? "입장 · 첫 마디" : "입장 · 지난번 소환", preview: entry.line,
      body: (<><Say>{entry.line}</Say><More label="왜"><Note label="왜">{entry.why}</Note></More></>),
    });
  }
  if (exercises.length || plan.length || moves.length) {
    const names = kind === "first" ? exercises.map((e) => splitName(e).name) : plan.map((p) => splitEx(p).name);
    sections.push({
      k: "work", icon: Dumbbell, title: kind === "first" ? `오늘 운동 ${exercises.length}개` : `오늘 운동 ${plan.length}개 · 증명 ${moves.length}개`,
      preview: names.filter(Boolean).join(" · "),
      body: kind === "first" ? (
        <>
          {d.workout_intro && <Say>{d.workout_intro}</Say>}
          {exercises.map((ex, i) => {
            const lib = libOf(ex);
            const alts = (Array.isArray(ex.alts) ? ex.alts : []).filter((a) => a && a.name);
            const { name, how } = splitName(ex);
            return (
              <div key={i} className="space-y-2 border-t border-line pt-3">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{i + 1}</span>
                  <span className="text-[15px] font-bold text-ink">{name}</span>
                  {ex.slot && <span className="text-[12px] text-muted">{ex.slot}</span>}
                  {ex.proof && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">증명</span>}
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
                  <LibLink lib={lib} />
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
                <li key={i} className="flex flex-wrap items-center gap-x-2 text-[14px] leading-[1.55] text-ink">
                  <span className="font-semibold">{i + 1}. {splitEx(p).name}</span>
                  <LibLink lib={libOf(p)} />
                </li>
              ))}
            </ol>
          )}
          {moves.map((mv, i) => (
            <div key={i} className="space-y-2 border-t border-line pt-3">
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">증명 {i + 1}</span>
                <span className="text-[15px] font-bold text-ink">{splitEx(mv).name}</span>
              </p>
              <Say strong>{mv.point_it_out}</Say>
              <More><Note label="하는 법">{splitEx(mv).how}</Note><Note label="노릴 반응">{mv.target_reaction}</Note><LibLink lib={libOf(mv)} /></More>
            </div>
          ))}
          <More label="운동별 하는 법 · 포인트 · 반응 약하면">
            {plan.map((p, i) => {
              const { name, how } = splitEx(p);
              return <Note key={i} label={`${i + 1}. ${name}`}>{[how, plainText(p.point)].filter(Boolean).join(" · ")}</Note>;
            })}
            <Note label="반응 약하면">{d.proof?.if_weak}</Note>
          </More>
        </>
      ),
    });
  }
  if (seq.ask || seq.trial_close || d.closing_line || d.sales_metaphor?.metaphor) {
    sections.push({
      k: "close", icon: Flag, title: d.book_lines && onOpenBook ? "클로징 · 세일즈북 넘기며" : "클로징", preview: seq.ask || d.closing_line,
      body: d.book_lines && (kind === "second" || rereg) ? (
        <BookClosing kind={rereg ? "reregister" : "second"} d={d} priceLine={priceLine} onOpenBook={onOpenBook} />
      ) : (
        <>
          <ClosingSequence compact rereg={rereg} sequence={d.closing_sequence} fallbackLine={d.closing_line || ""} metaphor={d.sales_metaphor} priceLine={priceLine} />
          {rereg && d.sweetener && <Note label="혜택(마지막에 덤으로)">{d.sweetener}</Note>}
        </>
      ),
    });
  }
  if (obj.length) {
    const cur = obj[Math.min(objSel, obj.length - 1)] || {};
    sections.push({
      k: "obj", icon: ShieldCheck, title: `거절 대응 ${obj.length}가지`, preview: obj.map((o) => objLabel(o.reason)).join(" · "),
      body: (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="거절 종류">
            {obj.map((o, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === objSel} onClick={() => setObjSel(i)}
                className={`min-h-[36px] rounded-full px-3 text-[13px] transition ${i === objSel ? "bg-ink font-semibold text-white" : "bg-elevate font-normal text-sub hover:text-ink"}`}>
                {objLabel(o.reason)}
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
                  <span className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[12px] font-semibold text-primary-strong">{i + 1}</span>
                ) : (
                  <span className="mt-[3px] w-[46px] shrink-0 text-[12px] font-semibold text-primary-strong">{["이 회원", "오늘 꼭", "요청"][i]}</span>
                )}
                <span className="min-w-0"><Emph>{t}</Emph></span>
              </li>
            ))}
          </ol>
          {derived && <p className="m-0 mt-2 text-[12px] text-sub">대본을 다시 만들면 더 짧은 요약으로 바뀌어요.</p>}
          {fillIn && <p className="m-0 mt-2.5 rounded-lg bg-card px-3 py-2 text-[12.5px] leading-relaxed text-ink"><b className="font-semibold text-primary-strong">○○</b>에는 수업 중 회원이 말한 목표를 넣어 말해요. 첫마디에서 목표를 먼저 물어보세요.</p>}
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
          <div className="divide-y divide-line border-y border-line">
            {sections.map((s, i) => (
              <Section key={s.k} n={i + 1} icon={s.icon} title={s.title} preview={s.preview} open={!!open[s.k]} onToggle={() => toggle(s.k)}>
                {s.body}
              </Section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
