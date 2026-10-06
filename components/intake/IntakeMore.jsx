"use client";

/* OT 신청서 2단계 '1분만 더'(2026-10-06) — 1단계로 신청은 이미 저장됐다. 여기서는 첫 OT 준비에 쓰는 질문을
   한 화면에 하나씩, 누르기만 하면 되게 받는다. 누를 때마다 바로 저장(/api/ot-intake PATCH · 열쇠)되어
   중간에 닫아도 거기까지는 트레이너에게 간다. 화면마다 '건너뛰기'.
   순서 = 첫 OT 준비에 중요한 것부터: 목표 → 주 몇 번 → 운동 경험 → 그만둔 이유 → 생활 · 페이스 → 건강 체크
          → 알게 된 경로 → (센터 QR) 원하는 트레이너 → 나에 대해(나이 · 성별 · 직업 · 바라는 점). */

import { useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { HEALTH_CONSENT } from "@/lib/consent";
import { MEMBER_OPTS, GENDER_OPTS, WEEKLY_OPTS, LEAD_SOURCES, HEALTH_SCREEN_ITEMS, TRAINER_GENDER_OPTS } from "@/lib/memberOptions";

const inputCls = "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[16px] text-ink placeholder-muted outline-none focus:border-primary";

function Opt({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[48px] rounded-xl border px-4 text-left text-[16px] transition ${on ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>
      {children}
    </button>
  );
}
const Sub = ({ children }) => <p className="m-0 mb-2 mt-4 text-[14px] font-semibold text-sub first:mt-0">{children}</p>;

export default function IntakeMore({ app, token, kind, healthAgreed = false, onDone }) {
  const [i, setI] = useState(-1);                 // -1 = 시작 화면
  const [a, setA] = useState({});
  const [health, setHealth] = useState(healthAgreed);
  const [hs, setHs] = useState({ none: false, items: [], note: "" });
  const [saved, setSaved] = useState(false);

  const save = (patch, healthNow = health) => {
    fetch("/api/ot-intake", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ app, token, answers: patch, health: healthNow && !healthAgreed, healthKnown: healthNow }),
    }).then((r) => { if (r.ok) setSaved(true); }).catch(() => {});
  };
  const pick = (k, v, auto = true) => {
    setA((x) => ({ ...x, [k]: v }));
    save({ [k]: v });
    if (auto) setTimeout(() => setI((n) => n + 1), 220);
  };
  const setOne = (k, v) => setA((x) => ({ ...x, [k]: x[k] === v ? "" : v }));

  const screens = [
    { t: "운동해서 제일 바뀌었으면 하는 건 뭐예요?", keys: ["goal", "goal_deadline"], body: (
      <>
        <div className="grid grid-cols-2 gap-2">{MEMBER_OPTS.goal.map((g) => <Opt key={g} on={a.goal === g} onClick={() => setOne("goal", g)}>{g}</Opt>)}</div>
        <Sub>언제까지 · 계기 (선택)</Sub>
        <input value={a.goal_deadline || ""} onChange={(e) => setA((x) => ({ ...x, goal_deadline: e.target.value }))} maxLength={60} placeholder="예: 8월 결혼식 / 여름 전에" className={inputCls} />
      </>) },
    { t: "일주일에 몇 번 운동할 수 있어요?", auto: true, body: (
      <div className="grid gap-2">{WEEKLY_OPTS.map(([v, l]) => <Opt key={v} on={a.weekly_freq === v} onClick={() => pick("weekly_freq", v)}>{l}</Opt>)}</div>) },
    { t: "운동은 얼마나 해 보셨어요?", keys: ["exercise_level", "past_exercise"], body: (
      <>
        <div className="grid grid-cols-3 gap-2">{MEMBER_OPTS.exercise_level.map((g) => <Opt key={g} on={a.exercise_level === g} onClick={() => setOne("exercise_level", g)}>{g}</Opt>)}</div>
        <Sub>돈 내고 받아 본 운동 (선택)</Sub>
        <div className="grid grid-cols-3 gap-2">{MEMBER_OPTS.past_exercise.map((g) => <Opt key={g} on={a.past_exercise === g} onClick={() => setOne("past_exercise", g)}>{g}</Opt>)}</div>
      </>) },
    { t: "예전에 운동을 그만둔 적이 있다면, 이유는요?", auto: true, body: (
      <div className="grid grid-cols-2 gap-2">
        {[...MEMBER_OPTS.quit_reason, "그만둔 적 없어요"].map((g) => <Opt key={g} on={a.quit_reason === g} onClick={() => pick("quit_reason", g)}>{g}</Opt>)}
      </div>) },
    { t: "평소 하루는 어떤가요?", keys: ["activity_level", "training_pace"], body: (
      <>
        <div className="grid grid-cols-3 gap-2">{MEMBER_OPTS.activity_level.map((g) => <Opt key={g} on={a.activity_level === g} onClick={() => setOne("activity_level", g)}>{g}</Opt>)}</div>
        <Sub>운동은 어떤 느낌으로 하고 싶어요?</Sub>
        <div className="grid grid-cols-3 gap-2">{MEMBER_OPTS.training_pace.map((g) => <Opt key={g} on={a.training_pace === g} onClick={() => setOne("training_pace", g)}>{g}</Opt>)}</div>
      </>) },
    { t: "운동 전에 알아야 할 건강 상태가 있나요?", health: true, body: !health ? (
      <div className="rounded-xl border border-line bg-elevate p-3.5">
        <p className="m-0 text-[14px] leading-relaxed text-sub">다치지 않게 운동을 고르려고 물어봐요. 건강정보라 따로 동의를 받아요. 원하지 않으면 건너뛰어도 돼요.</p>
        <dl className="mt-2 space-y-1">
          {HEALTH_CONSENT.rows.map(([k, v]) => <div key={k} className="grid grid-cols-[64px_1fr] gap-2 text-[13px] leading-relaxed"><dt className="font-semibold text-sub">{k}</dt><dd className="m-0 text-ink">{v}</dd></div>)}
        </dl>
        <button type="button" onClick={() => { setHealth(true); save({}, true); }} className="mt-3 min-h-[48px] w-full rounded-xl bg-ink text-[15px] font-bold text-white">
          건강정보 수집 · 이용에 동의하고 적기
        </button>
      </div>
    ) : (
      <>
        <Opt on={hs.none} onClick={() => setHs((x) => ({ ...x, none: !x.none, items: [] }))}>해당 없어요</Opt>
        <Sub>해당하는 걸 모두 눌러 주세요</Sub>
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_SCREEN_ITEMS.map((g) => <Opt key={g} on={hs.items.includes(g)} onClick={() => setHs((x) => ({ ...x, none: false, items: x.items.includes(g) ? x.items.filter((y) => y !== g) : [...x.items, g] }))}>{g}</Opt>)}
        </div>
        <Sub>불편한 부위 (선택)</Sub>
        <input value={a.pain || ""} onChange={(e) => setA((x) => ({ ...x, pain: e.target.value }))} maxLength={120} placeholder="예: 오른쪽 무릎" className={inputCls} />
        <Sub>부상 · 수술 이력 (선택)</Sub>
        <input value={a.injury_history || ""} onChange={(e) => setA((x) => ({ ...x, injury_history: e.target.value }))} maxLength={120} placeholder="예: 2년 전 무릎 수술" className={inputCls} />
      </>
    ) },
    { t: "저희를 어떻게 알게 되셨어요?", auto: true, body: (
      <div className="grid gap-2">{LEAD_SOURCES.map((g) => <Opt key={g} on={a.lead_source === g} onClick={() => pick("lead_source", g)}>{g}</Opt>)}</div>) },
    ...(kind === "center" ? [{ t: "원하는 트레이너가 있나요?", auto: true, body: (
      <div className="grid gap-2">{TRAINER_GENDER_OPTS.map(([v, l]) => <Opt key={v} on={a.pref_trainer_gender === v} onClick={() => pick("pref_trainer_gender", v)}>{l}</Opt>)}</div>) }] : []),
    { t: "마지막으로 회원님에 대해 알려 주세요", keys: ["age", "gender", "job", "member_note"], last: true, body: (
      <>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <input value={a.age || ""} onChange={(e) => setA((x) => ({ ...x, age: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))} inputMode="numeric" placeholder="나이" aria-label="나이" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">{GENDER_OPTS.map(([v, l]) => <Opt key={v} on={a.gender === v} onClick={() => setOne("gender", v)}>{l}</Opt>)}</div>
        </div>
        <Sub>하는 일 (선택)</Sub>
        <input value={a.job || ""} onChange={(e) => setA((x) => ({ ...x, job: e.target.value }))} maxLength={60} placeholder="예: 사무직 / 간호사" className={inputCls} />
        <Sub>트레이너에게 바라는 점 (선택)</Sub>
        <textarea value={a.member_note || ""} onChange={(e) => setA((x) => ({ ...x, member_note: e.target.value }))} maxLength={300} rows={3} placeholder="예: 허리가 자주 뻐근해요. 천천히 배우고 싶어요." className={inputCls} />
      </>) },
  ];
  const n = screens.length;
  const cur = screens[i];

  // '다음' — 이 화면의 칸들을 저장하고 넘어간다(건강 화면은 체크 결과까지).
  const next = () => {
    if (cur?.keys) { const p = {}; for (const k of cur.keys) if (a[k] != null && a[k] !== "") p[k] = a[k]; if (Object.keys(p).length) save(p); }
    if (cur?.health && health) save({ health_screen: hs.none ? { none: true } : { items: hs.items }, pain: a.pain || "", injury_history: a.injury_history || "" });
    if (i + 1 >= n) onDone?.(); else setI(i + 1);
  };

  if (i < 0) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <p className="m-0 mt-3 text-[20px] font-extrabold tracking-[-0.02em]">신청했어요</p>
        <p className="m-0 mt-2 text-[15px] leading-relaxed text-sub">곧 연락드려요. <b className="text-ink">1분만 더</b> 알려 주시면 첫 OT를 회원님께 딱 맞춰 준비할게요.</p>
        <p className="m-0 mt-1 text-[13px] text-muted">누르기만 하면 되는 질문 {n}개 · 언제든 그만둬도 돼요</p>
        <button type="button" onClick={() => setI(0)} className="mt-5 min-h-[52px] w-full rounded-xl bg-primary text-[16px] font-bold text-white">좋아요, 알려 줄게요</button>
        <button type="button" onClick={() => onDone?.()} className="mt-2 min-h-[44px] w-full text-[14px] font-semibold text-sub">다음에 할게요</button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="이전 질문" className="flex h-10 w-10 items-center justify-center rounded-full text-sub disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevate"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
        <span className="w-12 text-right text-[13px] font-semibold tabular-nums text-sub">{i + 1} / {n}</span>
      </div>
      <h2 className="m-0 mt-5 text-[21px] font-extrabold leading-snug tracking-[-0.02em] text-ink">{cur.t}</h2>
      <div className="mt-4">{cur.body}</div>
      <div className="mt-6 flex items-center gap-2">
        <button type="button" onClick={() => (i + 1 >= n ? onDone?.() : setI(i + 1))} className="min-h-[48px] px-3 text-[15px] font-semibold text-sub">건너뛰기</button>
        {!cur.auto && (!cur.health || health) && (
          <button type="button" onClick={next} className="ml-auto min-h-[52px] flex-1 rounded-xl bg-primary text-[16px] font-bold text-white">{cur.last ? "마치기" : "다음"}</button>
        )}
      </div>
      {saved && <p className="m-0 mt-3 text-center text-[13px] text-muted">답은 바로 저장돼요</p>}
    </div>
  );
}
