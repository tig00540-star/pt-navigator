"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  Megaphone,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { closingStats, reregisterStats, revenueInMonth, closingApproachStats, reregisterReasonStats, sessionsCount, closingReasonStats, revenueByTrainer, closingStatsByTrainer, sessionPriceSumByTrainer, payForMonth } from "@/lib/memberStatus";
import { labelOf, CLOSING_APPROACH_OPTS, REG_REASON_OPTS, CLOSING_REASON_OPTS } from "@/lib/labels";
import AddTrainerForm from "@/components/AddTrainerForm";

/* =========================================================================
   가상 지표 (데모) — 실제 결제/세션 테이블이 붙기 전까지 사용
   ========================================================================= */

const won = (n) => "₩" + n.toLocaleString("ko-KR");
// rate(0..1|null) → "NN%" · 데이터 0(null)이면 "—"(빈상태 가드).
const rateText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");

// 트레이너 QC 모니터링
const TRAINERS = [
  {
    name: "박준형",
    role: "수석 트레이너",
    views: 96, // 네비게이터 조회율
    reading: 92, // 대본 리딩률
    adherence: 94, // 수업 이행률
    grade: "A+",
    members: ["김철수", "황대수"],
    comment: "MBTI·통증 데이터 조회 후 대본 리딩 우수. 클로징 전환율 지점 최상위.",
  },
  {
    name: "이서준",
    role: "트레이너",
    views: 81,
    reading: 74,
    adherence: 78,
    grade: "B+",
    members: ["황대수"],
    comment: "루틴 매칭은 정확하나 세일즈 대본 리딩 빈도 낮음. 클로징 코칭 권장.",
  },
  {
    name: "최민지",
    role: "트레이너",
    views: 64,
    reading: 52,
    adherence: 58,
    grade: "C",
    members: ["김철수"],
    comment: "네비게이터 조회율 저조. 통증 정보 미확인 상태로 수업 진행 사례 감지.",
  },
];

const gradeColor = (g) =>
  g.startsWith("A")
    ? "text-lime-400 border-lime-500/40 bg-lime-500/10"
    : g.startsWith("B")
    ? "text-cyan-400 border-cyan-500/40 bg-cyan-500/10"
    : "text-amber-400 border-amber-500/40 bg-amber-500/10";

/* =========================================================================
   회원 빅데이터 → 마케팅 카피 조합
   ========================================================================= */

function aggregate(rows) {
  const tally = (arr) => {
    const m = {};
    arr.forEach((v) => {
      if (v) m[v] = (m[v] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const res = tally(rows.map((r) => r.residence));
  const pain = tally(rows.map((r) => r.pain));
  const job = tally(rows.map((r) => r.job));
  return {
    total: rows.length,
    topResidence: res[0]?.[0] || "센터 인근 오피스텔",
    topPain: pain[0]?.[0] || "무릎 통증",
    topJob: job[0]?.[0] || "IT 개발자",
    residenceTop: res.slice(0, 3),
    painTop: pain.slice(0, 3),
  };
}

function buildCopies(a) {
  return [
    {
      platform: "Instagram 피드",
      icon: Camera,
      tag: "오피스텔 직장인 타겟",
      headline: `퇴근길 5분, ${a.topResidence} 사시는 분만 보세요`,
      body: `하루 종일 앉아있는 몸, 그대로 두면 ${a.topPain}으로 돌아옵니다. 통증 우회 세팅으로 무리 없이 시작하는 1:1 OT — 이번 주 3명 한정 무료 체험.`,
    },
    {
      platform: "전단지 / 엘리베이터 광고",
      icon: Megaphone,
      tag: `${a.topPain} 소구`,
      headline: `${a.topPain}, 피하지 말고 '우회'하세요`,
      body: `아파서 운동을 미뤄온 분들을 위한 통증 우회 프로그램. 첫 OT에서 통증 0으로 자극 들어가는 걸 직접 느껴보세요. 데이터 기반 맞춤 세팅.`,
    },
    {
      platform: "Instagram 릴스",
      icon: Sparkles,
      tag: `${a.topJob} 타겟`,
      headline: `하루 10시간 앉아있는 ${a.topJob}님께`,
      body: `거북목·${a.topPain} 방치하면 3년 뒤 병원비가 PT비보다 비쌉니다. 오늘 몸 상태 무료 인바디 + 가동성 측정부터.`,
    },
    {
      platform: "Instagram 스토리",
      icon: Flame,
      tag: "바디프로필 시즌",
      headline: "예식·프로필 D-84, 지금 시작해야 맞습니다",
      body: `결혼·바디프로필 데드라인 있는 분? 주 2회 × 12주 역산 스케줄로 예식날 컨디션 피크. 부담 낮춘 분납도 가능.`,
    },
    {
      platform: "네이버 플레이스 소식",
      icon: Target,
      tag: "지역 상권 공략",
      headline: `${a.topResidence} 1인 가구, 저녁 루틴 만들어드립니다`,
      body: `혼자 살수록 흐트러지는 저녁 시간. 센터에서 40분, 통증 없이 몸 만드는 루틴으로 하루를 마무리하세요. 첫 방문 인바디 무료.`,
    },
  ];
}

/* =========================================================================
   재사용 UI 조각
   ========================================================================= */

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

function Bar({ pct, tone = "lime" }) {
  const c = {
    lime: "from-lime-400 to-emerald-400",
    cyan: "from-cyan-400 to-sky-400",
    amber: "from-amber-400 to-orange-400",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full bg-gradient-to-r ${c}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* =========================================================================
   ADMIN PAGE
   ========================================================================= */

export default function AdminDashboard() {
  const [rows, setRows] = useState([]);
  const [dbNote, setDbNote] = useState("");
  const [copyOffset, setCopyOffset] = useState(0);
  const [otRows, setOtRows] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [role, setRole] = useState(null); // null=조회중 · "owner" · "denied"
  const [trainers, setTrainers] = useState([]);
  const [policy, setPolicy] = useState([]);

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setDbNote("데모 모드 — Supabase 키를 설정하면 실제 회원 데이터로 지표가 갱신됩니다.");
        setRole("owner"); // 데모 모드 = 게이트 스킵(AuthGate 정책과 동일)
        return;
      }
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      let myRole = "denied";
      if (uid) {
        const { data: t } = await supabase
          .from("trainer").select("role").eq("id", uid).maybeSingle();
        if (t?.role === "owner") myRole = "owner";
      }
      setRole(myRole);
      if (myRole !== "owner") return; // 비owner는 데이터 조회 스킵
      // ⑦ trainer_id seam: 로그인 붙으면 각 select에 .eq("trainer_id", me) 추가(지금은 단일 트레이너 우회 = 전체=본인).
      const [u, o, c, l, tr, pp] = await Promise.all([
        supabase.from("user_table").select("*"),
        supabase.from("ot_log").select("*"),
        supabase.from("session_log").select("*"),
        supabase.from("daily_workout_log").select("*"),
        supabase.from("trainer").select("id, name"),
        supabase.from("pay_policy").select("*"),
      ]);
      const firstErr = u.error || o.error || c.error || l.error;
      if (firstErr) {
        setDbNote("불러오기 실패: " + firstErr.message);
        return;
      }
      setRows(u.data || []);
      setOtRows(o.data || []);
      setContracts(c.data || []);
      setLogs(l.data || []);
      setTrainers(tr.data || []);
      setPolicy(pp.data || []);
    })();
  }, []);

  const agg = useMemo(() => aggregate(rows), [rows]);
  const copies = useMemo(() => buildCopies(agg), [agg]);
  const shown = [0, 1, 2].map((i) => copies[(copyOffset + i) % copies.length]);

  // ④ 실데이터 파생 — 기준월(KST 'YYYY-MM'). 클로징/재등록률=누적, 매출=이달.
  // KST(UTC+9) 이달 — memberStatus.kstYm과 경계 통일. Date.now()는 react 룰상 impure라 new Date().getTime() 사용.
  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const closing = useMemo(() => closingStats(otRows), [otRows]);
  const rereg = useMemo(() => reregisterStats(contracts), [contracts]);
  const monthRevenue = useMemo(() => revenueInMonth(contracts, ym), [contracts, ym]);
  const approachDist = useMemo(() => closingApproachStats(otRows), [otRows]);
  const reasonDist = useMemo(() => reregisterReasonStats(contracts), [contracts]);
  const closingReasonDist = useMemo(() => closingReasonStats(otRows), [otRows]);
  const totalSessions = useMemo(() => sessionsCount(logs), [logs]);
  const memberTrainer = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r?.id) m.set(r.id, r.trainer_id ?? "unknown");
    return m;
  }, [rows]);
  const revByTrainer = useMemo(() => revenueByTrainer(contracts, ym), [contracts, ym]);
  const closingByTrainer = useMemo(() => closingStatsByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
  const trainerName = (id) => trainers.find((t) => t.id === id)?.name ?? (id === "unknown" ? "미배정" : String(id).slice(0, 8));
  const trainerPerf = useMemo(() => {
    const revMap = new Map(revByTrainer.map((r) => [r.trainer_id, r]));
    const closeMap = new Map(closingByTrainer.map((c) => [c.trainer_id, c]));
    const ids = trainers.length ? trainers.map((t) => t.id) : [...new Set([...revMap.keys(), ...closeMap.keys()])];
    return ids.map((id) => ({
      id,
      name: trainerName(id),
      rev: revMap.get(id) || { newRev: 0, reRev: 0, total: 0, cntNew: 0, cntRe: 0 },
      close: closeMap.get(id) || { attempted: 0, success: 0, rate: null },
    })).sort((a, b) => b.rev.total - a.rev.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainers, revByTrainer, closingByTrainer]);
  const sessPriceSum = useMemo(() => sessionPriceSumByTrainer(logs, contracts, ym), [logs, contracts, ym]);

  if (role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm bg-zinc-950">
        불러오는 중…
      </div>
    );
  }
  if (role === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-zinc-950">
        <ShieldCheck className="h-10 w-10 text-zinc-600" />
        <div>
          <div className="text-lg font-semibold text-zinc-100">접근 권한이 없습니다</div>
          <div className="mt-1 text-sm text-zinc-500">경영 대시보드는 원장(owner) 전용입니다.</div>
        </div>
        <Link href="/" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-400">
          트레이너 화면으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-lime-400/30">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-lg shadow-fuchsia-500/30">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400">
                Admin · 총괄 경영
              </div>
              <div className="text-sm font-semibold text-zinc-100">
                강남 1호점 <span className="font-normal text-zinc-500">경영 대시보드</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-lime-400">
                LIVE
              </span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-lime-500/50 hover:text-lime-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">트레이너 화면</span>
            </Link>
          </div>
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* ===== 트레이너 초대 온보딩 (A) ===== */}
        <section className="mb-8">
          <AddTrainerForm />
        </section>

        {/* ===== 실데이터 요약 (④) ===== */}
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>실데이터 요약</Eyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-5 shadow-lg shadow-lime-500/20">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                <Wallet className="h-3.5 w-3.5" /> 이달 매출
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-lime-400">
                {won(monthRevenue)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{ym} · 인계·외부 제외</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                <Target className="h-3.5 w-3.5" /> 클로징률
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-zinc-50">
                {rateText(closing.rate)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">누적 · 시도 {closing.attempted}명 중 {closing.success}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                <Percent className="h-3.5 w-3.5" /> 재등록률
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-cyan-400">
                {rateText(rereg.rate)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">누적 · 시도 {rereg.attempted}건 중 {rereg.success}</div>
            </div>
          </div>
        </section>

        {/* ===== 트레이너별 실적 (④) ===== */}
        <section className="mb-8">
          <Eyebrow icon={Award}>트레이너별 실적 · {ym}</Eyebrow>
          <div className="space-y-3">
            {trainerPerf.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-xs text-zinc-600">트레이너 데이터가 없습니다.</div>
            ) : trainerPerf.map((t) => { const pay = payForMonth(t.rev.total, sessPriceSum.get(t.id) || 0, policy); return (
              <div key={t.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-bold text-zinc-200">{(t.name || "?").slice(0, 1)}</div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{t.name}</div>
                      <div className="text-[11px] text-zinc-500">클로징 {rateText(t.close.rate)} · 시도 {t.close.attempted}명 중 {t.close.success}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">이달 매출</div>
                    <div className="font-mono text-2xl font-bold text-lime-400">{won(t.rev.total)}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                      <span>신규</span>
                      <span>{t.rev.total > 0 ? Math.round((t.rev.newRev / t.rev.total) * 100) + "%" : "—"}</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-zinc-100">{won(t.rev.newRev)}</div>
                    <div className="text-[11px] text-zinc-500">{t.rev.cntNew}건</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                      <span>재등록</span>
                      <span>{t.rev.total > 0 ? Math.round((t.rev.reRev / t.rev.total) * 100) + "%" : "—"}</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-cyan-400">{won(t.rev.reRev)}</div>
                    <div className="text-[11px] text-zinc-500">{t.rev.cntRe}건</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-lime-500/25 bg-lime-500/5 p-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">예상 급여</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      구간 {pay.band ? pay.band.base_pct + "%" : "—"} · 이달 수업료 {won(pay.base)}
                      {pay.incentive > 0 ? ` + 인센 ${won(pay.incentive)}` : ""}
                    </div>
                  </div>
                  <div className="font-mono text-xl font-bold text-lime-300">{won(pay.total)}</div>
                </div>
              </div>
            ); })}
          </div>
        </section>

        {/* ===== KPI · 방향/사유 분포 (④) ===== */}
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>클로징 · 재등록 분석</Eyebrow>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* 방향별 강점 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">클로징 방향별 강점</div>
              <div className="mt-1 text-xs text-zinc-500">성공 클로징의 접근 방향 분포</div>
              <div className="mt-4 space-y-3">
                {approachDist.length === 0 ? (
                  <div className="text-xs text-zinc-600">아직 성공 클로징 데이터가 없습니다.</div>
                ) : (
                  approachDist.map((d) => {
                    const max = approachDist[0].count || 1;
                    return (
                      <div key={d.approach}>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                          <span>{labelOf(CLOSING_APPROACH_OPTS, d.approach)}</span>
                          <span className="font-mono text-zinc-300">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="lime" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 클로징 실패·보류 사유 분포 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">클로징 실패·보류 사유</div>
              <div className="mt-1 text-xs text-zinc-500">OT 클로징 약점 진단 — 내가 주로 놓치는 이유</div>
              <div className="mt-4 space-y-3">
                {closingReasonDist.length === 0 ? (
                  <div className="text-xs text-zinc-600">아직 클로징 실패·보류 사유 데이터가 없습니다.</div>
                ) : (
                  closingReasonDist.map((d) => {
                    const max = closingReasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                          <span>{labelOf(CLOSING_REASON_OPTS, d.reason)}</span>
                          <span className="font-mono text-zinc-300">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="amber" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 재등록 사유 분포 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">재등록 실패·보류 사유</div>
              <div className="mt-1 text-xs text-zinc-500">거절을 데이터로 — 약점 진단</div>
              <div className="mt-4 space-y-3">
                {reasonDist.length === 0 ? (
                  <div className="text-xs text-zinc-600">아직 재등록 사유 데이터가 없습니다.</div>
                ) : (
                  reasonDist.map((d) => {
                    const max = reasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                          <span>{labelOf(REG_REASON_OPTS, d.reason)}</span>
                          <span className="font-mono text-zinc-300">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="amber" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 총 수업수 */}
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">총 수업수</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-5xl font-extrabold tracking-tight text-zinc-50">{totalSessions}</span>
                <span className="text-xl font-bold text-zinc-500">회</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">노쇼 취소분(voided) 제외 · 누적</div>
            </div>
          </div>
        </section>

        {/* ===== Trainer Activity & QC ===== */}
        <section className="mb-8">
          <Eyebrow icon={Users}>트레이너 세일즈 QC 모니터링</Eyebrow>
          <div className="space-y-3">
            {TRAINERS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-bold text-zinc-200">
                      {t.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{t.name}</span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(
                            t.grade
                          )}`}
                        >
                          {t.grade}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">{t.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      수업 이행률
                    </div>
                    <div className="font-mono text-2xl font-bold text-lime-400">
                      {t.adherence}%
                    </div>
                  </div>
                </div>

                {/* 세부 지표 */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                      <span>네비게이터 조회율</span>
                      <span className="font-mono text-zinc-300">{t.views}%</span>
                    </div>
                    <Bar pct={t.views} tone="cyan" />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                      <span>AI 대본 리딩률</span>
                      <span className="font-mono text-zinc-300">{t.reading}%</span>
                    </div>
                    <Bar pct={t.reading} tone={t.reading >= 70 ? "lime" : "amber"} />
                  </div>
                </div>

                {/* 코멘트 */}
                <div className="mt-3 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-zinc-300">
                    {t.comment}
                    <span className="ml-1 text-zinc-500">
                      (담당: {t.members.join(", ")})
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== AI Marketing 카피봇 ===== */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow icon={Megaphone}>AI 상권 공략 카피봇 · 이번 주 광고</Eyebrow>
            <button
              onClick={() => setCopyOffset((o) => o + 1)}
              className="mb-4 flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-lime-500/50 hover:text-lime-400"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 새로 뽑기
            </button>
          </div>

          {/* 빅데이터 요약 */}
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400">
              회원 <span className="font-semibold text-zinc-200">{agg.total}명</span> 분석
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400">
              주 거주 <span className="font-semibold text-lime-400">{agg.topResidence}</span>
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400">
              주 통증 <span className="font-semibold text-fuchsia-400">{agg.topPain}</span>
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400">
              주 직군 <span className="font-semibold text-cyan-400">{agg.topJob}</span>
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {shown.map((c, i) => {
              const Icon = c.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20">
                      <Icon className="h-4 w-4 text-fuchsia-400" />
                    </div>
                    <div className="text-[11px] font-semibold text-zinc-400">{c.platform}</div>
                  </div>

                  <div className="mt-3">
                    <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                      {c.tag}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold leading-snug text-zinc-50">
                    “{c.headline}”
                  </h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{c.body}</p>

                  <div className="mt-4 flex items-center gap-1 text-[11px] text-zinc-600">
                    <Sparkles className="h-3 w-3" /> DB 빅데이터 기반 자동 생성
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
            ※ 카피는 현재 회원 데이터 분포를 바탕으로 조합한 초안입니다. 광고 집행 전 과장·의료
            표현(치료·완치 등) 여부를 검토하세요.
          </p>
        </section>
      </main>
    </div>
  );
}
