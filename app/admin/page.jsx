"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { closingApproachStats, reregisterReasonStats, sessionsCount, closingReasonStats } from "@/lib/memberStatus";
import { labelOf, CLOSING_APPROACH_OPTS, REG_REASON_OPTS, CLOSING_REASON_OPTS } from "@/lib/labels";
import AddTrainerForm from "@/components/AddTrainerForm";
import MemberForm from "@/components/MemberForm";
import MemberReassign from "@/components/admin/MemberReassign";
import Button from "@/components/ui/Button";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";
import OwnerBriefing from "@/components/admin/OwnerBriefing";
import AdminEmptyOnboarding from "@/components/admin/AdminEmptyOnboarding";
import TrainerScorecard from "@/components/admin/TrainerScorecard";
import RevenuePipeline from "@/components/admin/RevenuePipeline";
import ConversionFunnel from "@/components/admin/ConversionFunnel";
import RetentionConsole from "@/components/admin/RetentionConsole";
import ScheduleAnalytics from "@/components/admin/ScheduleAnalytics";
import CenterMonthSummary from "@/components/admin/CenterMonthSummary";
import TrainerQualityReport from "@/components/admin/TrainerQualityReport";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import Card from "@/components/ui/Card";
import BrandMark from "@/components/ui/BrandMark";
import { fetchAllRows } from "@/lib/fetchAllRows";

/* =========================================================================
   가상 지표 (데모) — 실제 결제/세션 테이블이 붙기 전까지 사용
   ========================================================================= */

// admin 섹션 탭(7) — 게이팅만(섹션 내용·계산 불변). fuchsia accent(--color-admin).
const ATABS = [
  { id: "briefing",  label: "브리핑" },    // ← 추가(#6) · 기본 랜딩
  { id: "perf",      label: "트레이너" },  // ← 개명(구 '실적'). ★id는 "perf" 그대로(atab state·모든 {atab==="perf"} 참조 무변).
  { id: "revenue",   label: "매출" },      // ← 추가(#3)
  { id: "funnel",    label: "OT회원 현황" },   // ← 개명(구 '전환'). id는 그대로.
  { id: "retention", label: "PT회원 현황" },   // ← 개명(구 '리텐션'). id는 그대로.
  { id: "schedule",  label: "스케줄" },   // ← 추가(#5)
  { id: "payroll",   label: "급여" },
  { id: "ops",       label: "운영" },
];

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
  const [otRows, setOtRows] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [logs, setLogs] = useState([]);
  const router = useRouter(); // solo면 /admin 접근 시 통합 화면(/)으로 바운스
  const [role, setRole] = useState(null); // null=조회중 · "owner" · "denied"
  const [centerName, setCenterName] = useState(""); // 소속 account 이름(헤더 표기)
  const [trainers, setTrainers] = useState([]);
  const [schemes, setSchemes] = useState([]); // pay_scheme(계정 기본 + override)
  const [runs, setRuns] = useState([]);        // payroll_run(확정 기록)
  const [goals, setGoals] = useState([]);      // trainer_goal(목표매출 · 매출 탭 게이지 · 비차단 fetch)
  const [appts, setAppts] = useState([]);      // appointment(최근 90일 · 스케줄 탭 · 비차단 fetch)
  const [atab, setAtab] = useState("briefing"); // admin 섹션 탭(기본=브리핑 · #6 오늘 챙길 것)
  const [perfDetailOpen, setPerfDetailOpen] = useState(false); // 트레이너 탭 '클로징·재등록 분석' 접기(기본 닫힘 · 표시만)
  const [showMemberCreate, setShowMemberCreate] = useState(false); // 운영 탭 회원 등록·배정 모달
  const [showReassign, setShowReassign] = useState(false); // 운영 탭 회원 재배정(인계) 모달

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
        const apptCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(); // 스케줄 분석 최근 90일 창
        const [u, o, c, l, tr, ps, pr, tg, ap] = await Promise.all([
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
          supabase.from("trainer_goal").select("*"),   // 매출 탭 게이지용 목표. 원장 RLS가 계정 전체 SELECT 허용.
          // 스케줄 분석: 최근 90일 예약(canceled 포함=취소율). 창은 좁지만 다트레이너면 1000행 넘을 수 있어 페이지네이션.
          fetchAllRows(() => supabase.from("appointment").select("*").gte("start_at", apptCutoff)),
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
        setGoals(tg.data || []);   // 비차단 — trainer_goal 없거나 실패해도 []로 폴백(게이지만 "미설정")
        setAppts(ap.data || []);   // 비차단 — appointment 없거나 실패해도 []로 폴백(스케줄 탭만 빈상태)
      } catch {
        setDbNote("불러오기 실패 — 새로고침해 주세요.");
        setRole((r) => r ?? "denied"); // role 고착 방지(에러=잠금, 안전측)
      }
    })();
    // router는 next/navigation에서 안정 참조 — 마운트 1회 게이트만. deps 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 회원 등록·배정 후 — 모달 닫고 회원목록(rows)만 재조회(기존 로드 쿼리 재사용 · 다른 배열 무변).
  const handleMemberCreated = async () => {
    setShowMemberCreate(false);
    if (!supabase) return;
    const { data } = await supabase.from("user_table").select("*");
    setRows(data || []);
  };

  // 재배정(인계) 후 — 담당·계약·예약 세 곳이 바뀌므로 rows·contracts·appts 재조회(원본 로더와 동일 방식).
  const handleReassigned = async () => {
    setShowReassign(false);
    if (!supabase) return;
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const [u, c, ap] = await Promise.all([
      supabase.from("user_table").select("*"),
      fetchAllRows(() => supabase.from("session_log").select("*")),
      fetchAllRows(() => supabase.from("appointment").select("*").gte("start_at", cutoff)),
    ]);
    setRows(u.data || []);
    setContracts(c.data || []);
    setAppts(ap.data || []);
  };

  // ④ 실데이터 파생 — 기준월(KST 'YYYY-MM'). 클로징/재등록률=누적, 매출=이달.
  // KST(UTC+9) 이달 — memberStatus.kstYm과 경계 통일. Date.now()는 react 룰상 impure라 new Date().getTime() 사용.
  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const approachDist = useMemo(() => closingApproachStats(otRows), [otRows]);
  const reasonDist = useMemo(() => reregisterReasonStats(contracts), [contracts]);
  const closingReasonDist = useMemo(() => closingReasonStats(otRows), [otRows]);
  const totalSessions = useMemo(() => sessionsCount(logs), [logs]);
  // 트레이너별 파생은 TrainerScorecard(컴포넌트)가 자체 계산 — admin은 원배열만 prop으로 내려준다.

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
        {/* 빈상태 온보딩 — 회원 0명일 때만 · 모든 탭 위 · 탭별 안내 + 현재 트레이너/회원 수 */}
        <AdminEmptyOnboarding members={rows} trainers={trainers} atab={atab} />

        {/* ===== 브리핑 — 오늘 챙길 것 (#6 · 기본 랜딩) ===== */}
        {atab === "briefing" && (
        <section className="mb-8">
          <OwnerBriefing
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            appts={appts} goals={goals} trainers={trainers} ym={ym}
            onGoTab={(id) => setAtab(id)} />
        </section>
        )}

        {/* ===== 회원 등록·배정 — 대표가 트레이너 지정해 신규 회원 생성 ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <Eyebrow icon={UserPlus}>회원 등록·배정</Eyebrow>
          <p className="mb-3 text-[12px] leading-relaxed text-muted">상담으로 받은 회원 정보를 입력하고 담당 트레이너를 지정해 등록해요.</p>
          {trainers.length === 0 ? (
            <p className="rounded-xl border border-line bg-elevate px-4 py-3 text-[12px] text-muted">
              먼저 트레이너를 초대하세요 — 배정할 트레이너가 있어야 회원을 등록할 수 있어요.
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setShowMemberCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" /> 새 회원 등록·배정
            </Button>
          )}
          {showMemberCreate && (
            <MemberForm assignTrainers={trainers} onClose={() => setShowMemberCreate(false)} onSaved={handleMemberCreated} />
          )}
        </section>
        )}

        {/* ===== 회원 재배정(트레이너 인계) — PT 전용 · 잔여 이월계약 ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <Eyebrow icon={ArrowLeftRight}>회원 재배정 (트레이너 인계)</Eyebrow>
          <p className="mb-3 text-[12px] leading-relaxed text-muted">PT 회원을 다른 트레이너에게 넘겨요. 잔여 세션은 이어지고, 그 잔여분 급여는 새 담당이 받습니다(과거 수업·매출은 그대로).</p>
          {trainers.length < 2 ? (
            <p className="rounded-xl border border-line bg-elevate px-4 py-3 text-[12px] text-muted">
              인계하려면 트레이너가 2명 이상 필요해요.
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setShowReassign(true)}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> 회원 재배정
            </Button>
          )}
          {showReassign && (
            <MemberReassign members={rows} trainers={trainers} contracts={contracts} logs={logs} onDone={handleReassigned} />
          )}
        </section>
        )}

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

        {/* ===== 이번 달 센터 요약 (구 '실데이터 요약' 교체 · 클로징/재등록률은 OT/PT 현황 탭 소유) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>이번 달 센터 요약</Eyebrow>
          <CenterMonthSummary members={rows} otRows={otRows} logs={logs} contracts={contracts} trainers={trainers} ym={ym} />
        </section>
        )}

        {/* ===== 트레이너 리더보드 / KPI 스코어카드 (#1) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={Award}>트레이너 리더보드 · {ym}</Eyebrow>
          <TrainerScorecard
            members={rows}
            otRows={otRows}
            contracts={contracts}
            logs={logs}
            trainers={trainers}
            schemes={schemes}
            runs={runs}
            ym={ym}
            onSaveRun={(row) => setRuns((p) => [...p.filter((r) => r.id !== row.id), row])}
            onGoPayroll={() => setAtab("payroll")}
          />
        </section>
        )}

        {/* ===== 급여 정책 설정 (페이롤 C1) — 계정 기본 스킴 편집. pay_policy 표시는 D에서 전환. ===== */}
        {atab === "payroll" && (
        <section className="mb-8">
          {/* 브릿지 — 이달 급여 계산·확정은 트레이너 탭. 여긴 급여 규칙(스킴) 설정만(발견성). */}
          <button
            type="button"
            onClick={() => setAtab("perf")}
            className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-elevate px-4 py-3 text-left transition hover:bg-card"
          >
            <span className="text-[13px] leading-relaxed text-sub">
              이달 <b className="text-ink">트레이너별 급여 계산·확정</b>은 <b className="text-ink">트레이너 탭</b>에서 해요.
              여기선 급여 규칙(스킴)만 설정합니다.
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-primary-strong">
              트레이너 탭 <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
          <AdminPayrollSettings trainers={trainers} />
        </section>
        )}

        {/* ===== KPI · 방향/사유 분포 (④) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setPerfDetailOpen((v) => !v)}
            aria-expanded={perfDetailOpen}
            className="mb-4 flex w-full items-center gap-2 text-left"
          >
            <TrendingUp className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold tracking-label-ko text-muted">클로징 · 재등록 상세 분석</span>
            <span className="ml-1 text-[11px] font-normal text-muted">{perfDetailOpen ? "접기" : "펼치기"}</span>
            {perfDetailOpen
              ? <ChevronDown className="ml-auto h-4 w-4 text-muted" />
              : <ChevronRight className="ml-auto h-4 w-4 text-muted" />}
          </button>
          {perfDetailOpen && (
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
              <div className="mt-1 text-xs text-muted">OT 클로징 약점 진단 — 센터가 주로 놓치는 이유</div>
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
          )}
        </section>
        )}

        {/* ===== 오늘의 리포트 (트레이너 탭 하단 · 원장 코칭용·읽기전용) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <TrainerQualityReport members={rows} otRows={otRows} contracts={contracts} logs={logs} trainers={trainers} ym={ym} />
        </section>
        )}

        {/* ===== 매출 파이프라인·예측 (매출 탭 · #3) ===== */}
        {atab === "revenue" && (
        <section className="mb-8">
          <RevenuePipeline members={rows} contracts={contracts} logs={logs} otRows={otRows} trainers={trainers} goals={goals} ym={ym} />
        </section>
        )}

        {/* ===== OT→PT 전환 퍼널 (전환 탭 · #2) ===== */}
        {atab === "funnel" && (
        <section className="mb-8">
          <ConversionFunnel members={rows} otRows={otRows} trainers={trainers} />
        </section>
        )}

        {/* ===== 재등록·이탈 관제 (리텐션 탭 · #4) ===== */}
        {atab === "retention" && (
        <section className="mb-8">
          <RetentionConsole members={rows} contracts={contracts} logs={logs} trainers={trainers} ym={ym} />
        </section>
        )}

        {/* ===== 가동률·스케줄 (스케줄 탭 · #5) ===== */}
        {atab === "schedule" && (
        <section className="mb-8">
          <ScheduleAnalytics appts={appts} logs={logs} members={rows} trainers={trainers} otRows={otRows} ym={ym} />
        </section>
        )}

      </main>
    </div>
  );
}
