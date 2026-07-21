"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { closingStats, reregisterStats, revenueInMonth, closingApproachStats, reregisterReasonStats, sessionsCount, closingReasonStats, revenueByTrainer, closingStatsByTrainer, sessionPriceSumByTrainer, resolveScheme, payForScheme, sessionCountByTrainer } from "@/lib/memberStatus";
import { labelOf, CLOSING_APPROACH_OPTS, REG_REASON_OPTS, CLOSING_REASON_OPTS } from "@/lib/labels";
import { won, personName } from "@/lib/format";
import AddTrainerForm from "@/components/AddTrainerForm";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";
import PayrollConfirm from "@/components/PayrollConfirm";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import Card from "@/components/ui/Card";
import BrandMark from "@/components/ui/BrandMark";
import { fetchAllRows } from "@/lib/fetchAllRows";

/* =========================================================================
   가상 지표 (데모) — 실제 결제/세션 테이블이 붙기 전까지 사용
   ========================================================================= */

// rate(0..1|null) → "NN%" · 데이터 0(null)이면 "—"(빈상태 가드).
const rateText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");

// admin 섹션 탭(4) — 게이팅만(섹션 내용·계산 불변). fuchsia accent(--color-admin).
const ATABS = [
  { id: "perf",    label: "실적" },
  { id: "qc",      label: "QC" },
  { id: "payroll", label: "급여" },
  { id: "ops",     label: "운영" },
];

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
    ? "text-primary-strong border-primary/30 bg-primary-soft"
    : g.startsWith("B")
    ? "text-cyan-700 border-cyan-500/40 bg-cyan-500/10"
    : "text-amber-700 border-amber-500/40 bg-amber-500/10";

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
      <Icon className="h-4 w-4 text-muted" />
      <span className="text-xs font-semibold tracking-label-ko text-muted">
        {children}
      </span>
    </div>
  );
}

function Bar({ pct, tone = "lime" }) {
  const c = {
    lime: "from-red-500 to-red-600",
    cyan: "from-cyan-400 to-sky-400",
    amber: "from-amber-400 to-orange-400",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
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
  const router = useRouter(); // solo면 /admin 접근 시 통합 화면(/)으로 바운스
  const [role, setRole] = useState(null); // null=조회중 · "owner" · "denied"
  const [centerName, setCenterName] = useState(""); // 소속 account 이름(헤더 표기)
  const [trainers, setTrainers] = useState([]);
  const [schemes, setSchemes] = useState([]); // pay_scheme(계정 기본 + override)
  const [runs, setRuns] = useState([]);        // payroll_run(확정 기록)
  const [atab, setAtab] = useState("perf");    // admin 섹션 탭(기본=실적)

  useEffect(() => {
    (async () => {
      try {
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
            .from("trainer").select("role, account:account_id(type, name)").eq("id", uid).maybeSingle();
          if (t?.account?.type === "solo") { router.replace("/"); return; } // solo는 통합 화면만(admin 누수 차단)
          setCenterName(t?.account?.name || "");
          if (t?.role === "owner") myRole = "owner";
        }
        setRole(myRole);
        if (myRole !== "owner") return; // 비owner는 데이터 조회 스킵
        // ⑦ trainer_id seam: 로그인 붙으면 각 select에 .eq("trainer_id", me) 추가(지금은 단일 트레이너 우회 = 전체=본인).
        const [u, o, c, l, tr, ps, pr] = await Promise.all([
          supabase.from("user_table").select("*"),
          supabase.from("ot_log").select("*"),
          // ⚠️ session_log·daily_workout_log는 센터 전체를 부른다 → 1000행 잘림 위험(P0-6).
          //    페이지 페처로 끝까지 훑는다(급여·매출·QC 집계의 입력이라 잘리면 숫자가 틀림).
          //    나머지(user_table·ot_log·trainer·pay_scheme·payroll_run)는 증가가 느려 당장 무관.
          fetchAllRows(() => supabase.from("session_log").select("*")),
          fetchAllRows(() => supabase.from("daily_workout_log").select("*")),
          supabase.from("trainer").select("id, name"),
          supabase.from("pay_scheme").select("*"),
          supabase.from("payroll_run").select("*"),
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
        setSchemes(ps.data || []);
        setRuns(pr.data || []);
      } catch {
        setDbNote("불러오기 실패 — 새로고침해 주세요.");
        setRole((r) => r ?? "denied"); // role 고착 방지(에러=잠금, 안전측)
      }
    })();
    // router는 next/navigation에서 안정 참조 — 마운트 1회 게이트만. deps 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const trainerName = (id) => personName(trainers.find((t) => t.id === id)?.name) || (id === "unknown" ? "미배정" : String(id).slice(0, 8));
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
  const sessCount = useMemo(() => sessionCountByTrainer(logs, contracts, ym), [logs, contracts, ym]);
  const runMap = useMemo(() => { const m = new Map(); for (const r of runs) if (r.ym === ym) m.set(r.trainer_id, r); return m; }, [runs, ym]);

  if (role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm bg-bg">
        불러오는 중…
      </div>
    );
  }
  if (role === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-bg">
        <ShieldCheck className="h-10 w-10 text-muted" />
        <div>
          <div className="text-lg font-semibold text-ink">접근 권한이 없습니다</div>
          <div className="mt-1 text-sm text-muted">경영 대시보드는 원장(owner) 전용입니다.</div>
        </div>
        <Link href="/" className="rounded-lg border border-line bg-elevate px-3 py-2 text-xs font-medium text-ink hover:border-primary hover:text-primary-strong">
          트레이너 화면으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink antialiased selection:bg-primary/20">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* 헤더 로크업은 트레이너 화면(app/page.jsx)이 정본 — 치수를 그대로 따른다.
              아이콘 36px · gap-2.5 · 1행 17px extrabold · 2행 12px medium(mt-1).
              두 화면을 오가는 사람이 같은 앱이라고 느끼려면 여기가 흔들리면 안 된다.

              위아래를 바꿨다 — 원래는 10px 'Admin · 총괄 경영'이 위, 14px 센터명이 아래였다.
              트레이너 화면은 '누구인지'가 크게 위(오직 트레이너), '무슨 역할인지'가 작게 아래다.
              같은 규칙이면 센터명이 위다. 역할 줄만 fuchsia로 관리자 화면임을 표시한다.
              (트레이너 쪽은 이 자리가 text-muted)

              마크는 방패 아이콘에서 브랜드 심볼로 바꿨다 — 방패는 앱 어디에도 없는 도형이라
              같은 제품으로 안 읽혔다. 링·중심점은 그대로 두고 침만 관리자 색으로 칠한다.
              같은 마크·다른 침색 = 같은 제품·다른 역할. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark accent="admin" title="오직 트레이너 관리자" className="h-9 w-9 shrink-0 rounded-lg shadow-sm" />
            <div className="min-w-0">
              {/* 센터명은 길 수 있다(폰 폭) — truncate로 로크업이 밀리지 않게. */}
              <div className="max-w-[150px] truncate text-[17px] font-extrabold leading-none tracking-[-0.04em] text-ink sm:max-w-none">
                {centerName || "내 센터"}
              </div>
              <div className="mt-1 text-[12px] font-medium leading-none text-fuchsia-700">
                Admin · 총괄 경영
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-primary-strong">
                LIVE
              </span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-primary hover:text-primary-strong"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">트레이너 화면</span>
            </Link>
          </div>
        </div>
        {/* 섹션 탭 네비 (admin fuchsia) */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
            {ATABS.map((t) => {
              const active = atab === t.id;
              return (
                <button key={t.id} onClick={() => setAtab(t.id)}
                  className={`relative px-4 py-2.5 text-xs font-semibold transition ${active ? "text-fuchsia-700" : "text-muted hover:text-ink"}`}>
                  {t.label}
                  {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-fuchsia-500" />}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
          <div className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-sub">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* ===== 트레이너 초대 온보딩 (A) ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <AddTrainerForm />
        </section>
        )}

        {/* ===== 공지 (기능1) — 원장 작성·목록 ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <AdminAnnouncements trainers={trainers} />
        </section>
        )}

        {/* ===== 실데이터 요약 (④) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>실데이터 요약</Eyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted">
                <Wallet className="h-3.5 w-3.5" /> 이달 매출
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-primary-strong">
                {won(monthRevenue)}
              </div>
              <div className="mt-1 text-xs text-muted">{ym} · 인계·외부 제외</div>
            </div>
            <Card>
              <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted">
                <Target className="h-3.5 w-3.5" /> 클로징률
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-ink">
                {rateText(closing.rate)}
              </div>
              <div className="mt-1 text-xs text-muted">누적 · 시도 {closing.attempted}명 중 {closing.success}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-[11px] tracking-label-ko text-muted">
                <Percent className="h-3.5 w-3.5" /> 재등록률
              </div>
              <div className="mt-2 font-mono text-4xl font-extrabold text-cyan-700">
                {rateText(rereg.rate)}
              </div>
              <div className="mt-1 text-xs text-muted">누적 · 시도 {rereg.attempted}건 중 {rereg.success}</div>
            </Card>
          </div>
        </section>
        )}

        {/* ===== 트레이너별 실적 (④) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={Award}>트레이너별 실적 · {ym}</Eyebrow>
          <div className="space-y-3">
            {trainerPerf.length === 0 ? (
              <div className="rounded-2xl border border-line bg-card p-5 text-xs text-muted">트레이너 데이터가 없습니다.</div>
            ) : trainerPerf.map((t) => { const pay = payForScheme(resolveScheme(schemes, t.id), { monthRevenue: t.rev.total, sessionCount: sessCount.get(t.id) || 0, sessionPriceSum: sessPriceSum.get(t.id) || 0 }); const run = runMap.get(t.id) || null; return (
              <div key={t.id} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elevate text-sm font-bold text-ink">{(t.name || "?").slice(0, 1)}</div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{t.name}</div>
                      <div className="text-[11px] text-muted">클로징 {rateText(t.close.rate)} · 시도 {t.close.attempted}명 중 {t.close.success}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] tracking-label-ko text-muted">이달 매출</div>
                    <div className="font-mono text-2xl font-bold text-primary-strong">{won(t.rev.total)}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-elevate p-3">
                    <div className="flex items-center justify-between text-[10px] tracking-label-ko text-muted">
                      <span>신규</span>
                      <span>{t.rev.total > 0 ? Math.round((t.rev.newRev / t.rev.total) * 100) + "%" : "—"}</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-ink">{won(t.rev.newRev)}</div>
                    <div className="text-[11px] text-muted">{t.rev.cntNew}건</div>
                  </div>
                  <div className="rounded-xl border border-line bg-elevate p-3">
                    <div className="flex items-center justify-between text-[10px] tracking-label-ko text-muted">
                      <span>재등록</span>
                      <span>{t.rev.total > 0 ? Math.round((t.rev.reRev / t.rev.total) * 100) + "%" : "—"}</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-cyan-700">{won(t.rev.reRev)}</div>
                    <div className="text-[11px] text-muted">{t.rev.cntRe}건</div>
                  </div>
                </div>
                <PayrollConfirm trainerId={t.id} ym={ym} pay={pay} run={run} onSaved={(row) => setRuns((p) => [...p.filter((r) => r.id !== row.id), row])} />
              </div>
            ); })}
          </div>
        </section>
        )}

        {/* ===== 급여 정책 설정 (페이롤 C1) — 계정 기본 스킴 편집. pay_policy 표시는 D에서 전환. ===== */}
        {atab === "payroll" && (
        <section className="mb-8">
          <AdminPayrollSettings trainers={trainers} />
        </section>
        )}

        {/* ===== KPI · 방향/사유 분포 (④) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>클로징 · 재등록 분석</Eyebrow>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* 방향별 강점 */}
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-semibold tracking-label-ko text-muted">클로징 방향별 강점</div>
              <div className="mt-1 text-xs text-muted">성공 클로징의 접근 방향 분포</div>
              <div className="mt-4 space-y-3">
                {approachDist.length === 0 ? (
                  <div className="text-xs text-muted">아직 성공 클로징 데이터가 없습니다.</div>
                ) : (
                  approachDist.map((d) => {
                    const max = approachDist[0].count || 1;
                    return (
                      <div key={d.approach}>
                        <div className="mb-1 flex justify-between text-[11px] text-sub">
                          <span>{labelOf(CLOSING_APPROACH_OPTS, d.approach)}</span>
                          <span className="font-mono text-sub">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="lime" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 클로징 실패·보류 사유 분포 */}
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-semibold tracking-label-ko text-muted">클로징 실패·보류 사유</div>
              <div className="mt-1 text-xs text-muted">OT 클로징 약점 진단 — 내가 주로 놓치는 이유</div>
              <div className="mt-4 space-y-3">
                {closingReasonDist.length === 0 ? (
                  <div className="text-xs text-muted">아직 클로징 실패·보류 사유 데이터가 없습니다.</div>
                ) : (
                  closingReasonDist.map((d) => {
                    const max = closingReasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[11px] text-sub">
                          <span>{labelOf(CLOSING_REASON_OPTS, d.reason)}</span>
                          <span className="font-mono text-sub">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="amber" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 재등록 사유 분포 */}
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-semibold tracking-label-ko text-muted">재등록 실패·보류 사유</div>
              <div className="mt-1 text-xs text-muted">거절을 데이터로 — 약점 진단</div>
              <div className="mt-4 space-y-3">
                {reasonDist.length === 0 ? (
                  <div className="text-xs text-muted">아직 재등록 사유 데이터가 없습니다.</div>
                ) : (
                  reasonDist.map((d) => {
                    const max = reasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[11px] text-sub">
                          <span>{labelOf(REG_REASON_OPTS, d.reason)}</span>
                          <span className="font-mono text-sub">{d.count}</span>
                        </div>
                        <Bar pct={(d.count / max) * 100} tone="amber" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 총 수업수 */}
            <Card>
              <div className="text-[11px] font-semibold tracking-label-ko text-muted">총 수업수</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-5xl font-extrabold tracking-tight text-ink">{totalSessions}</span>
                <span className="text-xl font-bold text-muted">회</span>
              </div>
              <div className="mt-1 text-xs text-muted">노쇼 취소분(voided) 제외 · 누적</div>
            </Card>
          </div>
        </section>
        )}

        {/* ===== Trainer Activity & QC ===== */}
        {atab === "qc" && (
        <section className="mb-8">
          <Eyebrow icon={Users}>트레이너 세일즈 QC 모니터링</Eyebrow>

          {/* ⚠️ 데모 고지 — 이 섹션의 숫자는 전부 하드코딩(TRAINERS 상수)이다.
              소스 주석에만 "데모"라고 적혀 있고 화면에는 표시가 없어서, 원장에게
              시연할 때 실측으로 오인될 수 있었다. 가짜 숫자가 실측처럼 읽히는 건
              기능 결함이 아니라 신뢰 사고다(PRD §7.2).
              실데이터화는 조회율·리딩률 같은 '행동 계측' 수집이 선행돼야 해서
              단기간에 안 된다 — 그때까지 이 배너를 지우지 말 것. */}
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-ot-soft px-3.5 py-2.5">
            <Badge tone="ot" className="mt-px shrink-0">예시</Badge>
            <p className="text-[12px] leading-relaxed text-ot-text">
              아래 지표는 <b>실제 데이터가 아닙니다.</b> 화면 형태를 보기 위한 예시 숫자예요 —
              조회율·대본 리딩률 같은 행동 기록을 모으기 시작하면 실측으로 바뀝니다.
            </p>
          </div>

          <div className="space-y-3">
            {TRAINERS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-line bg-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elevate text-sm font-bold text-ink">
                      {t.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{t.name}</span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(
                            t.grade
                          )}`}
                        >
                          {t.grade}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">{t.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] tracking-label-ko text-muted">
                      수업 이행률
                    </div>
                    <div className="font-mono text-2xl font-bold text-primary-strong">
                      {t.adherence}%
                    </div>
                  </div>
                </div>

                {/* 세부 지표 */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted">
                      <span>네비게이터 조회율</span>
                      <span className="font-mono text-sub">{t.views}%</span>
                    </div>
                    <Bar pct={t.views} tone="cyan" />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted">
                      <span>AI 대본 리딩률</span>
                      <span className="font-mono text-sub">{t.reading}%</span>
                    </div>
                    <Bar pct={t.reading} tone={t.reading >= 70 ? "lime" : "amber"} />
                  </div>
                </div>

                {/* 코멘트 */}
                <div className="mt-3 flex gap-2 rounded-xl border border-line bg-elevate p-3">
                  <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <p className="text-xs leading-relaxed text-sub">
                    {t.comment}
                    <span className="ml-1 text-muted">
                      (담당: {t.members.join(", ")})
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* ===== AI Marketing 카피봇 ===== */}
        {atab === "ops" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow icon={Megaphone}>AI 상권 공략 카피봇 · 이번 주 광고</Eyebrow>
            <Button variant="ghost" accent="owner" size="sm" onClick={() => setCopyOffset((o) => o + 1)} className="mb-4">
              <RefreshCw className="h-3.5 w-3.5" /> 새로 뽑기
            </Button>
          </div>

          {/* 빅데이터 요약 */}
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              회원 <span className="font-semibold text-ink">{agg.total}명</span> 분석
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 거주 <span className="font-semibold text-primary-strong">{agg.topResidence}</span>
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 통증 <span className="font-semibold text-fuchsia-700">{agg.topPain}</span>
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 직군 <span className="font-semibold text-cyan-700">{agg.topJob}</span>
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {shown.map((c, i) => {
              const Icon = c.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col rounded-2xl border border-line bg-card shadow-sm p-5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-600/20">
                      <Icon className="h-4 w-4 text-fuchsia-700" />
                    </div>
                    <div className="text-[11px] font-semibold text-sub">{c.platform}</div>
                  </div>

                  <div className="mt-3">
                    <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
                      {c.tag}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold leading-snug text-ink">
                    “{c.headline}”
                  </h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-sub">{c.body}</p>

                  <div className="mt-4 flex items-center gap-1 text-[11px] text-muted">
                    <Sparkles className="h-3 w-3" /> DB 빅데이터 기반 자동 생성
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-muted">
            ※ 카피는 현재 회원 데이터 분포를 바탕으로 조합한 초안입니다. 광고 집행 전 과장·의료
            표현(치료·완치 등) 여부를 검토하세요.
          </p>
        </section>
        )}
      </main>
    </div>
  );
}
