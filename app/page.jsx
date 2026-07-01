"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  Flame,
  Gauge,
  Handshake,
  Heart,
  MapPin,
  MessageSquareQuote,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";

/* =========================================================================
   HARDCODED DATA  —  1차 OT 세일즈 네비게이터
   ========================================================================= */

const MEMBER = {
  name: "김철수",
  age: 34,
  job: "IT 개발자",
  residence: "센터 인근 오피스텔",
  mbti: "ISTJ",
  pain: "우측 무릎 통증",
  goal: "바디프로필",
  session: "1차 OT",
  summary: [
    "논리와 근거로 움직이는 실용주의자 — '왜'가 해결되면 즉시 실행에 옮기는 결과지향형.",
    "장시간 좌식 근무로 고관절 굴곡근 단축 추정 → 우측 무릎에 누적 부하가 걸릴 구조.",
    "목표(바디프로필)가 명확 → 감성 어필보다 수치·마일스톤·역산 계획에 강하게 반응.",
  ],
};

const SALES_SCRIPT = [
  {
    tag: "오프닝",
    icon: Sparkles,
    line: "오늘은 감으로 운동하는 시간 없이, 철수님 무릎 부하 원인부터 수치로 찍고 시작할게요.",
  },
  {
    tag: "신뢰 구축",
    icon: ShieldCheck,
    line: "개발하실 때 로그 안 보고 디버깅 안 하시죠? 몸도 똑같아요. 인바디랑 가동성 측정값이 저희 로그예요.",
  },
  {
    tag: "니즈 확인",
    icon: Target,
    line: "바디프로필까지 몇 주 남으셨어요? 역산해서 주차별 목표 체지방·근육량 딱 잡아드릴게요.",
  },
  {
    tag: "통증 안심",
    icon: Activity,
    line: "무릎은 '피하는' 게 아니라 '우회'가 정답이에요. 오늘 통증 0으로 하체 자극 넣는 세팅 보여드릴게요.",
  },
  {
    tag: "클로징",
    icon: Handshake,
    line: "오늘 결과 기준으로, 이 세팅 12주 유지 시 예상 수치 정리해 드릴게요. 판단은 데이터 보고 하세요.",
  },
];

const PHASES = [
  {
    id: "assess",
    n: "01",
    title: "체형 평가 & 인바디 리뷰",
    range: "0 – 10분",
    duration: 10,
    color: "sky",
    icon: User,
    goals: ["정적 정렬·좌우 비대칭 체크", "인바디 수치 → 목표 역산", "우측 무릎 부하 가설 공유"],
  },
  {
    id: "mobility",
    n: "02",
    title: "가동성 테스트 (무릎·고관절)",
    range: "10 – 20분",
    duration: 10,
    color: "lime",
    icon: Gauge,
    goals: ["무릎 굴곡 통증 각도 측정", "고관절 내·외전 ROM 확인", "안전 운동 각도 확정"],
  },
  {
    id: "main",
    n: "03",
    title: "메인 운동 (통증 우회 하체)",
    range: "20 – 45분",
    duration: 25,
    color: "orange",
    icon: Dumbbell,
    goals: ["센터 기구 매칭 루틴 실행", "통증 0 유지하며 자극 확인", "'되네?' 순간 만들기"],
  },
  {
    id: "closing",
    n: "04",
    title: "세일즈 클로징 (데이터 브리핑)",
    range: "45 – 60분",
    duration: 15,
    color: "emerald",
    icon: Handshake,
    goals: ["오늘 측정값 요약 브리핑", "12주 예상 수치 제시", "등록 제안 → 데이터로 결정 유도"],
  },
];

const ROUTINE = [
  {
    id: "r1",
    name: "글루트 브리지",
    machine: "맨몸",
    sets: "15회 × 3",
    safe: "무릎 부하 0. 둔근 점화로 세션 시작.",
    muscles: ["둔근", "코어"],
  },
  {
    id: "r2",
    name: "레그프레스 (하이·와이드 스탠스)",
    machine: "이카리안",
    sets: "15회 × 3",
    safe: "ROM 90° 이내 제한 → 대퇴사두 과부하 없이 하체 볼륨.",
    muscles: ["둔근", "햄스트링"],
  },
  {
    id: "r3",
    name: "힙 어브덕션 (아웃싸이)",
    machine: "Gym80",
    sets: "20회 × 3",
    safe: "중둔근 강화 → 무릎 밸구스 억제, 정렬 안정화.",
    muscles: ["중둔근"],
  },
  {
    id: "r4",
    name: "레그프레스 카프레이즈",
    machine: "이카리안",
    sets: "20회 × 3",
    safe: "무릎 잠금 없이 종아리 마무리 자극.",
    muscles: ["비복근"],
  },
];

/* ---- 재정 추정 (직업·나이 기반) ---- */
const FINANCE = {
  estIncome: "6,000 – 8,500만원",
  bracket: "중상위 · 여유 있음",
  reasons: [
    "34세 IT 개발자 → 미들~시니어 구간, 국내 개발직 평균 상회 추정.",
    "1인 오피스텔 단독 거주 → 부양 부담 낮고 자기투자 지출 성향 높음.",
    "목표(바디프로필)가 명확 → 결과에 대한 지불 의향(WTP)이 높은 유형.",
  ],
};

/* ---- PT 패키지 제안 (금액은 상담용 추정치) ---- */
const PACKAGES = [
  {
    id: "starter",
    name: "스타터",
    sessions: 12,
    weeks: "주 2회 · 6주",
    perSession: 65000,
    total: 780000,
    note: "감 잡기용. 목표엔 다소 부족.",
    recommended: false,
  },
  {
    id: "core",
    name: "바디프로필 코어",
    sessions: 24,
    weeks: "주 2~3회 · 12주",
    perSession: 60000,
    total: 1440000,
    note: "12주 역산 시 목표 데드라인에 정확히 도달.",
    recommended: true,
  },
  {
    id: "premium",
    name: "프리미엄",
    sessions: 36,
    weeks: "주 3회 · 12주",
    perSession: 55000,
    total: 1980000,
    note: "최단기간 완성 · 회당 단가 최저.",
    recommended: false,
  },
];

const won = (n) => "₩" + n.toLocaleString("ko-KR");

/* ---- 운동 직후 상태 → 클로징 빌더 옵션 ---- */
const STIMULUS = ["둔근", "햄스트링", "중둔근", "종아리"];
const KNEE = [
  { id: "down", label: "통증 감소" },
  { id: "same", label: "변화 없음" },
  { id: "tight", label: "약간 뻐근" },
];
const MOOD = [
  { id: "fresh", label: "개운 · 상쾌" },
  { id: "good", label: "뻐근하지만 만족" },
  { id: "hard", label: "많이 힘들었음" },
];

/* 상태 조합 → 클로징 대본 조립 (ISTJ · 데이터 프레이밍) */
function buildClosing(state, pkg) {
  const kneeLine = {
    down: "방금 무릎 통증 없이 하체 자극이 들어갔죠? 오늘 세팅이 철수님 무릎에 안전하다는 걸 몸이 직접 증명했어요.",
    same: "무릎이 운동 내내 편안했죠? 통증 0으로 자극이 들어간다는 게 오늘 데이터로 확인됐어요.",
    tight: "지금 뻐근한 건 근육이지 관절이 아니에요 — 이게 우리가 노린 '안전한 자극'의 신호예요.",
  }[state.knee];

  const moodLine = {
    fresh: "이 개운한 기분은 혈류가 돌면서 나오는 정상 반응이에요. 주 2회면 이 컨디션이 일상이 됩니다.",
    good: "내일 오는 가벼운 근육통은 오늘 자극이 제대로 들어갔다는 증거예요. 바디프로필로 가는 첫 번째 로그입니다.",
    hard: "오늘 힘드셨던 만큼 몸이 바뀝니다. 강도는 매 주차 데이터 보고 조정하니 무리 없이 갑니다.",
  }[state.mood];

  const musc = state.stimulus.length
    ? state.stimulus.join(" · ")
    : "하체 전반";

  return [
    {
      tag: "몸의 증거",
      icon: Flame,
      line: `오늘 ${musc}에 자극이 정확히 들어갔어요. ${kneeLine}`,
    },
    {
      tag: "논리 연결",
      icon: TrendingUp,
      line: `${moodLine} 감이 아니라, 오늘 측정한 인바디·가동성 수치가 근거예요.`,
    },
    {
      tag: "등록 제안",
      icon: Handshake,
      line: `오늘 측정값 + 방금 몸으로 느낀 자극 = 검증 끝. 남은 건 12주 역산뿐이에요. '${pkg.name}' ${pkg.sessions}회면 바디프로필 데드라인에 정확히 도착합니다. 판단은 데이터 보고 하세요.`,
    },
  ];
}

/* =========================================================================
   PURGE-SAFE COLOR TOKENS
   ========================================================================= */

const C = {
  sky: {
    text: "text-sky-400",
    soft: "bg-sky-500/10",
    border: "border-sky-500/30",
    ring: "ring-sky-500/50",
    dot: "bg-sky-400",
    bar: "bg-sky-400",
    glow: "shadow-sky-500/20",
  },
  lime: {
    text: "text-lime-400",
    soft: "bg-lime-500/10",
    border: "border-lime-500/30",
    ring: "ring-lime-500/50",
    dot: "bg-lime-400",
    bar: "bg-lime-400",
    glow: "shadow-lime-500/20",
  },
  orange: {
    text: "text-orange-400",
    soft: "bg-orange-500/10",
    border: "border-orange-500/30",
    ring: "ring-orange-500/50",
    dot: "bg-orange-400",
    bar: "bg-orange-400",
    glow: "shadow-orange-500/20",
  },
  emerald: {
    text: "text-emerald-400",
    soft: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/50",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    glow: "shadow-emerald-500/20",
  },
};

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* =========================================================================
   SMALL PIECES
   ========================================================================= */

function Chip({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-sm font-medium text-zinc-100">{value}</div>
      </div>
    </div>
  );
}

function Eyebrow({ icon: Icon, children }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-zinc-500" />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {children}
      </span>
    </div>
  );
}

/* =========================================================================
   MAIN
   ========================================================================= */

export default function OTNavigatorDashboard() {
  const [activeId, setActiveId] = useState("assess");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(() => new Set());
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([]);

  // 클로징 빌더 — 운동 직후 상태
  const [stimulus, setStimulus] = useState(["둔근", "중둔근"]);
  const [knee, setKnee] = useState("down");
  const [mood, setMood] = useState("good");

  const recommended = PACKAGES.find((p) => p.recommended);
  const closing = buildClosing({ stimulus, knee, mood }, recommended);

  const toggleStimulus = (m) =>
    setStimulus((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );

  const active = PHASES.find((p) => p.id === activeId);
  const cap = active.duration * 60;
  const progress = Math.min(elapsed / cap, 1);
  const overtime = elapsed > cap;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const selectPhase = (id) => {
    setActiveId(id);
    setElapsed(0);
    setRunning(true);
  };

  const toggleRoutine = (id) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addNote = () => {
    const v = note.trim();
    if (!v) return;
    setNotes((n) => [{ id: Date.now(), text: v }, ...n].slice(0, 12));
    setNote("");
  };

  return (
    <div className="min-h-screen bg-zinc-950 pb-28 text-zinc-100 antialiased selection:bg-lime-400/30">
      {/* ================= TOP BAR ================= */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 shadow-lg shadow-lime-500/30">
              <Activity className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-400">
                OT Navigator
              </div>
              <div className="text-sm font-semibold text-zinc-100">세일즈 네비게이터</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                {active.n} · {active.title.split(" ")[0]}
              </div>
              <div
                className={`font-mono text-sm font-semibold ${
                  overtime ? "text-red-400" : C[active.color].text
                }`}
              >
                {fmt(elapsed)}{" "}
                <span className="text-zinc-600">/ {active.duration}:00</span>
              </div>
            </div>
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-lime-500/50 hover:text-lime-400 active:scale-95"
              aria-label={running ? "타이머 일시정지" : "타이머 시작"}
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* ================= HERO ================= */}
        <section className="mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-lime-400">
                    {MEMBER.session} · LIVE
                  </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
                  {MEMBER.name}
                  <span className="ml-2 font-mono text-lg font-normal text-zinc-500">
                    {MEMBER.age}세
                  </span>
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {MEMBER.job} · 목표{" "}
                  <span className="font-semibold text-lime-400">{MEMBER.goal}</span>
                </p>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                <Chip icon={MapPin} label="거주" value={MEMBER.residence} />
                <Chip icon={Brain} label="MBTI" value={MEMBER.mbti} />
                <Chip icon={Briefcase} label="직업" value={MEMBER.job} />
                <Chip icon={Activity} label="불편 부위" value={MEMBER.pain} />
              </div>
            </div>

            {/* 성향 3줄 요약 */}
            <div className="relative mt-5 border-t border-zinc-800 pt-5">
              <Eyebrow icon={Brain}>개발자 맞춤 성향 분석</Eyebrow>
              <ul className="space-y-2.5">
                {MEMBER.summary.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-lime-400">
                      0{i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-zinc-300">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ================= GRID ================= */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ---- TIMELINE (signature) ---- */}
          <section className="lg:col-span-3">
            <Eyebrow icon={Clock}>60분 OT 타임라인 — 탭하면 타이머 시작</Eyebrow>

            <div className="relative">
              {/* rail */}
              <div className="absolute bottom-2 left-[22px] top-2 w-px bg-zinc-800" />

              <div className="space-y-3">
                {PHASES.map((p) => {
                  const isActive = p.id === activeId;
                  const c = C[p.color];
                  const Icon = p.icon;
                  const pct = isActive ? Math.round(progress * 100) : 0;

                  return (
                    <button
                      key={p.id}
                      onClick={() => selectPhase(p.id)}
                      className={`group relative flex w-full gap-4 rounded-xl border p-4 text-left transition ${
                        isActive
                          ? `${c.border} ${c.soft} shadow-lg ${c.glow}`
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      {/* node */}
                      <div className="relative z-10 shrink-0">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                            isActive
                              ? `${c.border} ${c.soft} ring-4 ${c.ring}`
                              : "border-zinc-700 bg-zinc-950"
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 ${isActive ? c.text : "text-zinc-500"}`}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isActive ? c.text : "text-zinc-600"
                              }`}
                            >
                              {p.n}
                            </span>
                            <h3 className="truncate text-sm font-semibold text-zinc-100">
                              {p.title}
                            </h3>
                          </div>
                          <span className="shrink-0 font-mono text-xs text-zinc-500">
                            {p.range}
                          </span>
                        </div>

                        {/* goals */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.goals.map((g) => (
                            <span
                              key={g}
                              className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-400"
                            >
                              {g}
                            </span>
                          ))}
                        </div>

                        {/* live progress */}
                        {isActive && (
                          <div className="mt-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  overtime ? "bg-red-400" : c.bar
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  overtime ? "text-red-400" : c.text
                                }`}
                              >
                                {fmt(elapsed)}
                                {overtime && " · 초과"}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                                {running ? "진행 중" : "일시정지"}
                                <ChevronRight className="h-3 w-3" />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- RIGHT COLUMN ---- */}
          <div className="space-y-6 lg:col-span-2">
            {/* SALES SCRIPT */}
            <section>
              <Eyebrow icon={MessageSquareQuote}>ISTJ 공략 · 데이터 기반 대본</Eyebrow>
              <div className="space-y-2.5">
                {SALES_SCRIPT.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.tag}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 transition hover:border-zinc-700"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-lime-400" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                          {s.tag}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-300">
                        “{s.line}”
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ROUTINE */}
            <section>
              <Eyebrow icon={Dumbbell}>무릎 우회 하체 루틴 · 기구 매칭</Eyebrow>
              <div className="space-y-2.5">
                {ROUTINE.map((r) => {
                  const isDone = done.has(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRoutine(r.id)}
                      className={`flex w-full gap-3 rounded-xl border p-3.5 text-left transition ${
                        isDone
                          ? "border-lime-500/30 bg-lime-500/5"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-lime-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4
                            className={`truncate text-sm font-semibold ${
                              isDone ? "text-zinc-500 line-through" : "text-zinc-100"
                            }`}
                          >
                            {r.name}
                          </h4>
                          <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                            {r.machine}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                          <span className="text-orange-400">◆</span> {r.safe}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-lime-400">
                            {r.sets}
                          </span>
                          <span className="text-zinc-700">·</span>
                          <div className="flex flex-wrap gap-1">
                            {r.muscles.map((m) => (
                              <span
                                key={m}
                                className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400"
                              >
                                #{m}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* ================= 재정 추정 & 가격 제안 ================= */}
        <section className="mt-8">
          <Eyebrow icon={Wallet}>재정 추정 · PT 패키지 제안</Eyebrow>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* 추정 카드 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  추정 연 소득
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  {FINANCE.bracket}
                </span>
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-zinc-50">
                {FINANCE.estIncome}
              </div>
              <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
                {FINANCE.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
                ※ 직업·나이 기반 통계적 추정치이며 실제 상담 시 조정됩니다. 개인 금융정보가
                아닌 세일즈 참고용 지표입니다.
              </p>
            </div>

            {/* 패키지 3종 */}
            <div className="grid gap-3 sm:grid-cols-3 lg:col-span-3">
              {PACKAGES.map((p) => (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border p-4 ${
                    p.recommended
                      ? "border-lime-500/50 bg-lime-500/5 shadow-lg shadow-lime-500/10"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  {p.recommended && (
                    <span className="absolute -top-2.5 left-4 rounded-full bg-gradient-to-r from-lime-400 to-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-zinc-950">
                      추천
                    </span>
                  )}
                  <div className="text-sm font-semibold text-zinc-100">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{p.weeks}</div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-mono text-xl font-bold text-zinc-50">
                      {p.sessions}
                    </span>
                    <span className="text-xs text-zinc-500">회</span>
                  </div>
                  <div
                    className={`mt-1 font-mono text-sm font-semibold ${
                      p.recommended ? "text-lime-400" : "text-zinc-300"
                    }`}
                  >
                    {won(p.total)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    회당 {won(p.perSession)}
                  </div>

                  <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-400">
                    {p.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 라이브 클로징 빌더 ================= */}
        <section className="mt-8">
          <Eyebrow icon={Sparkles}>라이브 클로징 빌더 · 운동 직후 상태 기반</Eyebrow>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* 상태 입력 */}
            <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Flame className="h-3.5 w-3.5 text-orange-400" /> 느낀 자극 부위
                </div>
                <div className="flex flex-wrap gap-2">
                  {STIMULUS.map((m) => {
                    const on = stimulus.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleStimulus(m)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          on
                            ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                            : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Heart className="h-3.5 w-3.5 text-sky-400" /> 무릎 상태
                </div>
                <div className="flex flex-wrap gap-2">
                  {KNEE.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKnee(k.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        knee === k.id
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Smile className="h-3.5 w-3.5 text-lime-400" /> 컨디션 · 기분
                </div>
                <div className="flex flex-wrap gap-2">
                  {MOOD.map((mo) => (
                    <button
                      key={mo.id}
                      onClick={() => setMood(mo.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        mood === mo.id
                          ? "border-lime-500/40 bg-lime-500/10 text-lime-400"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      {mo.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 생성된 클로징 대본 */}
            <div className="space-y-2.5 lg:col-span-3">
              {closing.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.tag}
                    className="rounded-xl border border-lime-500/20 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-4"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-lime-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                        {c.tag}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-200">“{c.line}”</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* logged notes */}
        {notes.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {notes.map((n) => (
              <span
                key={n.id}
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300"
              >
                {n.text}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* ================= MINIMAL QUICK-LOG BAR ================= */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="현장 메모 빠르게 남기기…"
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-lime-500/50"
          />
          <button
            onClick={addNote}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95"
            aria-label="메모 저장"
          >
            <Send className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
