"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  ArrowLeft,
  ArrowLeftRight,
  Home,
  Receipt,
  Repeat2,
  Settings2,
  Users,
  Wallet,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { closingApproachStats, reregisterReasonStats, closingReasonStats } from "@/lib/memberStatus";
import { labelOf, CLOSING_APPROACH_OPTS, REG_REASON_OPTS, CLOSING_REASON_OPTS } from "@/lib/labels";
import AddTrainerForm from "@/components/AddTrainerForm";
import JoinInviteCard from "@/components/admin/JoinInviteCard";
import LeaveAllowCard from "@/components/admin/LeaveAllowCard";
import { ledgerAsContracts } from "@/lib/movedOut";
import { trainerSeatLimit } from "@/lib/plans";
import MemberForm from "@/components/MemberForm";
import MemberReassign from "@/components/admin/MemberReassign";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";
import OwnerHub from "@/components/admin/OwnerHub";
import SettlementPanel from "@/components/admin/SettlementPanel";
import OwnerBriefing from "@/components/admin/OwnerBriefing";
import OwnerOverview from "@/components/admin/OwnerOverview";
import AdminEmptyOnboarding from "@/components/admin/AdminEmptyOnboarding";
import TrainerScorecard from "@/components/admin/TrainerScorecard";
import RevenuePipeline from "@/components/admin/RevenuePipeline";
import MemberFlow from "@/components/admin/MemberFlow";
import OtIntakePanel from "@/components/admin/OtIntakePanel";
import OtPendingCard from "@/components/admin/OtPendingCard";
import MonthlyOwnerReport from "@/components/reports/MonthlyOwnerReport";
import MonthlyReadyCard from "@/components/reports/MonthlyReadyCard";
import EventManager from "@/components/events/EventManager";
import ScheduleAnalytics from "@/components/admin/ScheduleAnalytics";
import CenterMonthSummary from "@/components/admin/CenterMonthSummary";
import TrainerQualityReport from "@/components/admin/TrainerQualityReport";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import BrandMark from "@/components/ui/BrandMark";
import AdminSideNav from "@/components/admin/AdminSideNav";
import OwnerWideHome from "@/components/admin/OwnerWideHome";
import { useIsWide } from "@/lib/useIsWide";
import { fetchAllRows } from "@/lib/fetchAllRows";

/* =========================================================================
   가상 지표 (데모) — 실제 결제/세션 테이블이 붙기 전까지 사용
   ========================================================================= */

// admin 섹션 탭(7) — 게이팅만(섹션 내용·계산 불변). fuchsia accent(--color-admin).
const ATABS = [
  { id: "overview",  label: "한눈에" },    // ← Phase A 데스크톱 콘솔
  { id: "briefing",  label: "보고서" },
  { id: "monthly",   label: "월간 결산" },   // 매월 1일 지난달 결산(2026-10-06 · MonthlyOwnerReport)
  { id: "perf",      label: "트레이너" },  // ★id는 "perf" 그대로(atab state·모든 {atab==="perf"} 참조 무변).
  { id: "revenue",   label: "매출" },
  { id: "settle",       label: "정산 보기" },   // 기간 정산(PT+FC+기타−지출=순이익)
  { id: "settle_entry", label: "장부 적기" },   // FC·기타 매출·지출 입력(폼 1개) + 기간 내역
  { id: "flow",      label: "등록·이탈" },   // 구 OT 회원 현황 + PT 회원 현황(합침 · MemberFlow)
  { id: "schedule",  label: "스케줄" },
  { id: "payroll",   label: "급여" },
  { id: "ops",       label: "운영" },
];

/* 상단 네비 = 허브 + 5묶음. 9개 탭을 없애지 않고 묶기만 한다 —
   각 섹션의 {atab === "..."} 조건은 그대로 두고, 묶음 안에서 세그먼트로 고른다.
   대표는 하루에 여러 번 열지 않는다. 탭 9개를 가로로 훑게 하는 대신 5개로 줄인다. */
const AGROUPS = [
  { id: "hub",      label: "홈",         tabs: ["hub"], icon: Home },
  { id: "briefing", label: "보고서", tabs: ["briefing", "monthly"], icon: FileText },
  { id: "revenue",  label: "매출",        tabs: ["revenue"], icon: Wallet },
  // 정산은 '보는' 화면이 아니라 '하는' 화면(입력·월말 마감)이라 매출 분석 옆 세그먼트에
  // 숨으면 매달 찾아 들어가야 한다. 원장이 반복하는 실무라 상단에 제 집을 준다.
  { id: "settle",   label: "정산",        tabs: ["settle", "settle_entry"], icon: Receipt },
  { id: "team",     label: "트레이너",     tabs: ["perf", "payroll"], icon: Users },
  { id: "members",  label: "등록·이탈",    tabs: ["flow"], icon: Repeat2 },
  { id: "ops",      label: "운영",        tabs: ["schedule", "ops"], icon: Settings2 },
];
const ATAB_LABEL = { briefing: "아침 보고서", monthly: "월간 결산", settle: "정산 보기", settle_entry: "장부 적기", perf: "성과·리더보드", payroll: "급여 설정", schedule: "스케줄", ops: "센터 운영" };
// 옛 탭 id 흡수 — ownerBriefing 카드가 tab:"funnel"·"retention"을 들고 온다(lib은 안 건드린다).
const normalizeTab = (tab) => (tab === "funnel" || tab === "retention" ? "flow" : tab);
const groupOf = (tab) => AGROUPS.find((g) => g.tabs.includes(tab))?.id ?? (tab === "overview" ? "hub" : "hub");


/* =========================================================================
   재사용 UI 조각
   ========================================================================= */

// 섹션 제목 — 2026-10-05 트레이너 화면과 같은 SectionTitle(15px 굵게)로. 옛 12px 회색 라벨 자리.
function Eyebrow({ icon, children }) {
  return <SectionTitle icon={icon}>{children}</SectionTitle>;
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


// 장부(지출 · FC매출)를 가져올 시작일 — 13개월 전 1일(KST). 정산 화면에서 지난 기간으로 넘겨도 비지 않게(2026-10-06).
//   예전엔 '지난달 1일'부터만 가져와 두 달 전 기간은 지출 0 → 순이익이 부풀었다.
function ledgerStart() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const t = k.getUTCFullYear() * 12 + k.getUTCMonth() - 13;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/* =========================================================================
   ADMIN PAGE
   ========================================================================= */

export default function AdminDashboard() {
  const [rows, setRows] = useState([]);
  const [dbNote, setDbNote] = useState("");
  const [otRows, setOtRows] = useState([]);
  const [contracts, setContracts] = useState([]);
  // 독립한 트레이너를 따라 옮겨 간 회원의 계약 사본(2026-10-07 · 금액 · 날짜만 · 이름 없음) — 매출 · 정산 숫자가 줄지 않게
  const [movedOut, setMovedOut] = useState([]);
  const [logs, setLogs] = useState([]);
  const router = useRouter(); // solo면 /admin 접근 시 통합 화면(/)으로 바운스
  const [role, setRole] = useState(null); // null=조회중 · "owner" · "denied"
  const [centerName, setCenterName] = useState(""); // 소속 account 이름(헤더 표기)
  const [planKey, setPlanKey] = useState("center");   // 좌석 등급(billing_plan || type) — 트레이너 추가 안내용
  const [trainers, setTrainers] = useState([]);
  const [schemes, setSchemes] = useState([]); // pay_scheme(계정 기본 + override)
  const [runs, setRuns] = useState([]);        // payroll_run(확정 기록)
  const [goals, setGoals] = useState([]);      // trainer_goal(목표매출 · 매출 탭 게이지 · 비차단 fetch)
  const [appts, setAppts] = useState([]);      // appointment(최근 90일 · 스케줄 탭 · 비차단 fetch)
  const [expenses, setExpenses] = useState([]); // expense(이번달 · 지출/순이익 · 비차단 fetch)
  const [incomes, setIncomes] = useState([]);   // income(FC·기타 매출 수기 · 정산 전용 · 트레이너 지표 미반영)
  const [startDay, setStartDay] = useState(1);  // account.settlement_start_day — 센터별 정산 주기(1일/15일 등)
  const [dataReady, setDataReady] = useState(false); // 첫 데이터 로드 끝(2026-10-06)
  const [atab, setAtab] = useState("hub"); // admin 섹션(기본=허브 홈 · 9탭을 5묶음으로 고른다)
  const wide = useIsWide(); // 태블릿 가로·PC = 홈을 한 화면 대시보드로(OwnerWideHome)
  // 탭 이동 공통 — 옛 id(funnel·retention)를 새 화면(flow)으로 흘린다.
  const goTab = (id) => setAtab(normalizeTab(id));
  // 알림에서 바로 열기(?tab=monthly 등 · 2026-10-06 월간 결산)
  useEffect(() => {
    (async () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && ATABS.some((x) => x.id === normalizeTab(t))) setAtab(normalizeTab(t));
    })();
  }, []);
  const [perfDetailOpen, setPerfDetailOpen] = useState(false); // 트레이너 탭 '클로징·재등록 분석' 접기(기본 닫힘 · 표시만)
  const [showMemberCreate, setShowMemberCreate] = useState(false); // 운영 탭 회원 등록·배정 모달
  const [showReassign, setShowReassign] = useState(false); // 운영 탭 회원 재배정(인계) 모달

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) {
          setDbNote("데모 모드예요. Supabase 키를 설정하면 실제 회원 데이터로 지표가 바뀌어요.");
          setRole("owner"); // 데모 모드 = 게이트 스킵(AuthGate 정책과 동일)
          return;
        }
        const { data: au } = await supabase.auth.getUser();
        const uid = au?.user?.id;
        let myRole = "denied";
        if (uid) {
          const { data: t } = await supabase
            .from("trainer").select("role, account:account_id(type, name, billing_plan)").eq("id", uid).maybeSingle();
          if (t?.account?.type === "solo") { router.replace("/"); return; } // solo는 통합 화면만(admin 누수 차단)
          setCenterName(t?.account?.name || "");
          setPlanKey(t?.account?.billing_plan || t?.account?.type || "solo"); // 좌석 등급(결제 전엔 type)
          if (t?.role === "owner") myRole = "owner";
        }
        setRole(myRole);
        if (myRole !== "owner") return; // 비owner는 데이터 조회 스킵
        // ⑦ trainer_id seam: 로그인 붙으면 각 select에 .eq("trainer_id", me) 추가(지금은 단일 트레이너 우회 = 전체=본인).
        const apptCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(); // 스케줄 분석 최근 90일 창
        // ⚠️ 정산 시작일이 15일이면 기간이 전달에 걸친다 → 지난달 1일부터 가져온다(월초만 가져오면 앞이 빈다).
        const exStart = ledgerStart(); // 장부 창(13개월)
        const [u, o, c, l, tr, ps, pr, tg, ap, ex, inc, acc] = await Promise.all([
          fetchAllRows(() => supabase.from("user_table").select("*")),
          fetchAllRows(() => supabase.from("ot_log").select("*")),
          // ⚠️ session_log·daily_workout_log는 센터 전체를 부른다 → 1000행 잘림 위험(P0-6).
          //    페이지 페처로 끝까지 훑는다(급여·매출·QC 집계의 입력이라 잘리면 숫자가 틀림).
          //    나머지(user_table·ot_log·trainer·pay_scheme·payroll_run)는 증가가 느려 당장 무관.
          fetchAllRows(() => supabase.from("session_log").select("*")),
          fetchAllRows(() => supabase.from("daily_workout_log").select("*")),
          supabase.from("trainer").select("id, name, role, active"), // role·active = 좌석 표시용
          supabase.from("pay_scheme").select("*"),
          supabase.from("payroll_run").select("*"),
          supabase.from("trainer_goal").select("*"),   // 매출 탭 게이지용 목표. 원장 RLS가 계정 전체 SELECT 허용.
          // 스케줄 분석: 최근 90일 예약(canceled 포함=취소율). 창은 좁지만 다트레이너면 1000행 넘을 수 있어 페이지네이션.
          fetchAllRows(() => supabase.from("appointment").select("*").gte("start_at", apptCutoff)),
          // 지출: 비차단 · 테이블 없거나 실패해도 []로 폴백(지출/순이익만 빈값).
          fetchAllRows(() => supabase.from("expense").select("*").gte("spent_on", exStart)),
          // FC·기타 매출(수기) + 정산 시작일: 비차단 · 마이그레이션 전이면 []/1로 폴백(정산 카드만 빈값).
          fetchAllRows(() => supabase.from("income").select("*").gte("earned_on", exStart)),
          supabase.from("account").select("settlement_start_day").maybeSingle(),
        ]);
        const firstErr = u.error || o.error || c.error || l.error;
        if (firstErr) {
          setDbNote("불러오지 못했어요: " + firstErr.message);
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
        setExpenses(ex.data || []); // 비차단 — expense 테이블 없거나 실패해도 []로 폴백(지출/순이익만 빈값)
        setIncomes(inc.data || []);  // 비차단 — income 테이블 없으면 []로 폴백(FC·기타 매출만 빈값)
        setStartDay(acc.data?.settlement_start_day ?? 1); // 컬럼 없으면 1(달력 월)
        setDataReady(true); // 보고서는 이게 켜진 뒤에만 만든다(빈 숫자로 만든 보고서가 하루 종일 남던 문제)
        // 비차단 — 표가 없으면(SQL 전) 빈 배열
        fetchAllRows(() => supabase.from("moved_out_ledger").select("*"))
          .then(({ data }) => setMovedOut(data || [])).catch(() => {});
      } catch {
        setDbNote("불러오지 못했어요. 새로고침해 주세요.");
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
    const { data, error } = await supabase.from("user_table").select("*");
    if (error) { console.error("회원 다시 읽기 실패", error); setDbNote("목록을 새로 불러오지 못했어요. 새로고침해 주세요."); return; } // 실패로 화면이 0이 되지 않게
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
    if (u.error || c.error || ap.error) { console.error("재배정 후 다시 읽기 실패", u.error || c.error || ap.error); setDbNote("목록을 새로 불러오지 못했어요. 새로고침해 주세요."); return; }
    setRows(u.data || []);
    setContracts(c.data || []);
    setAppts(ap.data || []);
  };

  // 지출 입력/삭제 후 재조회(이번달 · 원본 로더와 동일).
  const reloadExpenses = async () => {
    if (!supabase) return;
    // ⚠️ 정산 시작일이 15일이면 기간이 전달에 걸친다 → 지난달 1일부터 가져온다(월초만 가져오면 앞부분이 빈다).
    const { data, error } = await fetchAllRows(() => supabase.from("expense").select("*").gte("spent_on", ledgerStart()));
    if (error) { console.error("지출 다시 읽기 실패", error); return; }
    setExpenses(data || []);
  };

  // FC·기타 매출(수기) — 지출과 같은 창으로 가져온다. 실패해도 비차단(그 탭만 빈 상태).
  const reloadIncomes = async () => {
    if (!supabase) return;
    const { data, error } = await fetchAllRows(() => supabase.from("income").select("*").gte("earned_on", ledgerStart()));
    if (error) { console.error("FC매출 다시 읽기 실패", error); return; }
    setIncomes(data || []);
  };

  // 정산 시작일 저장 — account는 select 정책만 있어 직접 update가 막힌다(RLS).
  // update 정책을 열면 트레이너가 subscription_status·billing_key까지 고칠 수 있으므로,
  // '이 컬럼만·원장만' 고치는 security definer 함수로 좁혀서 호출한다.
  const saveStartDay = async (d) => {
    const prev = startDay;
    setStartDay(d); // 낙관적 반영 — 실패하면 아래에서 되돌린다
    if (!supabase) return;
    const { error } = await supabase.rpc("set_settlement_start_day", { d });
    if (error) {
      setStartDay(prev);
      setDbNote("정산 기준일을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  };

  // ④ 실데이터 파생 — 기준월(KST 'YYYY-MM'). 클로징/재등록률=누적, 매출=이달.
  // KST(UTC+9) 이달 — memberStatus.kstYm과 경계 통일. Date.now()는 react 룰상 impure라 new Date().getTime() 사용.
  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  // 매출 · 정산용 계약 = 지금 계약 + 옮겨 간 회원의 사본(회원 없음 · 인계 표시 → 남은 수업 계산엔 안 들어감)
  const revenueContracts = useMemo(() => movedOut.length ? [...contracts, ...ledgerAsContracts(movedOut)] : contracts, [contracts, movedOut]);
  const approachDist = useMemo(() => closingApproachStats(otRows), [otRows]);
  const reasonDist = useMemo(() => reregisterReasonStats(contracts), [contracts]);
  const closingReasonDist = useMemo(() => closingReasonStats(otRows), [otRows]);
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
          <div className="mt-1 text-sm text-muted">대표 화면은 센터 대표만 볼 수 있어요.</div>
        </div>
        <Link href="/" className="rounded-lg border border-line bg-elevate px-3 py-2 text-xs font-medium text-ink hover:border-primary hover:text-primary-strong">
          트레이너 화면으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink antialiased selection:bg-primary/20 md:pl-[84px] xl:pl-56">
      {/* 태블릿·PC(md~): 왼쪽 세로 메뉴. 폰은 아래 상단 가로 탭 그대로. */}
      <AdminSideNav groups={AGROUPS} activeGroup={groupOf(atab)} onPick={setAtab} centerName={centerName} />
      {/* ===== HEADER ===== (넓은 화면에선 로고·묶음 탭이 왼쪽 메뉴로 가고, 세부 탭 칩만 남는다 — 없으면 헤더도 없음) */}
      <header className={`sticky top-0 z-30 border-b border-line/80 bg-card/80 backdrop-blur-xl ${(AGROUPS.find((x) => x.id === groupOf(atab))?.tabs.length ?? 1) < 2 ? "md:hidden" : ""}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 md:hidden">
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
            <BrandMark accent="admin" title="오직 트레이너 대표 화면" className="h-9 w-9 shrink-0 rounded-lg shadow-sm" />
            <div className="min-w-0">
              {/* 센터명은 길 수 있다(폰 폭) — truncate로 로크업이 밀리지 않게. */}
              <div className="max-w-[150px] truncate text-[17px] font-extrabold leading-none tracking-[-0.04em] text-ink sm:max-w-none">
                {centerName || "내 센터"}
              </div>
              <div className="mt-1 text-[12px] font-medium leading-none text-fuchsia-700">
                대표 · 총괄 경영
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:max-w-[1440px] lg:px-8">
          <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" aria-label="대표 화면 메뉴">
            {AGROUPS.map((g) => {
              const active = groupOf(atab) === g.id;
              return (
                <button key={g.id} onClick={() => setAtab(g.tabs[0])}
                  aria-current={active ? "page" : undefined}
                  className={`relative min-h-[44px] px-3.5 text-[14px] transition ${active ? "font-bold text-admin-text" : "font-medium text-sub hover:text-ink"}`}>
                  {g.label}
                  {active && <span className="absolute inset-x-2.5 bottom-0 h-[3px] rounded-full bg-admin" />}
                </button>
              );
            })}
          </nav>
          {(() => {
            const g = AGROUPS.find((x) => x.id === groupOf(atab));
            if (!g || g.tabs.length < 2) return null;
            return (
              <div className="flex overflow-x-auto py-2.5">
                <nav className="flex gap-1 rounded-full bg-elevate p-[3px]" aria-label={g.label}>
                  {g.tabs.map((t) => (
                    <button key={t} onClick={() => setAtab(t)} aria-current={atab === t ? "page" : undefined}
                      className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full px-4 text-[14px] transition ${
                        atab === t ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"
                      }`}>
                      {ATAB_LABEL[t] || t}
                    </button>
                  ))}
                </nav>
              </div>
            );
          })()}
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 lg:max-w-[1440px] lg:px-8">
          <div className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-sub">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:max-w-[1440px] lg:px-8">
        {/* 빈상태 온보딩 — 회원 0명일 때만 · 모든 탭 위 · 탭별 안내 + 현재 트레이너/회원 수 */}
        <AdminEmptyOnboarding members={rows} trainers={trainers} atab={atab} />

        {/* OT 신청 배정 대기(센터 QR · 2026-10-06) — 홈 맨 위 · 있을 때만 */}
        {atab === "hub" && <OtPendingCard onGo={() => goTab("flow")} />}
        {atab === "hub" && <MonthlyReadyCard kind="owner" onGo={() => goTab("monthly")} />}

        {/* ===== 홈(허브) — 9개 탭을 5묶음으로 고르는 첫 화면 ===== */}
        {atab === "hub" && wide && (
        <section className="mb-8">
          <OwnerWideHome
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            appts={appts} goals={goals} expenses={expenses} incomes={incomes} trainers={trainers} ym={ym}
            centerName={centerName} onGoTab={goTab} />
        </section>
        )}
        {atab === "hub" && !wide && (
        <section className="mb-8">
          <OwnerHub
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            appts={appts} goals={goals} trainers={trainers} ym={ym}
            centerName={centerName} onGoTab={goTab} />
        </section>
        )}

        {/* ===== 한눈에 — 대표 데스크톱 콘솔 (Phase A) ===== */}
        {atab === "overview" && (
        <section className="mb-8">
          <OwnerOverview
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            trainers={trainers} appts={appts} expenses={expenses} incomes={incomes} ym={ym}
            onGoTab={goTab} />
        </section>
        )}

        {/* ===== 브리핑 — 오늘 챙길 것 (#6) ===== */}
        {atab === "briefing" && (
        <section className="mb-8">
          <OwnerBriefing
            ready={dataReady}
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            appts={appts} goals={goals} trainers={trainers} ym={ym}
            onGoTab={goTab} />
        </section>
        )}

        {/* ===== 월간 결산 — 매월 1일 지난달(2026-10-06) ===== */}
        {atab === "monthly" && (
        <section className="mb-8">
          <MonthlyOwnerReport goals={goals} onGoTab={goTab} />
        </section>
        )}

        {/* ===== 회원 등록·배정 — 대표가 트레이너 지정해 신규 회원 생성 ===== */}
        {atab === "ops" && (
        <Card as="section" className="mb-6">
          <Eyebrow icon={UserPlus}>회원 등록·배정</Eyebrow>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">상담으로 받은 회원 정보를 입력하고 담당 트레이너를 지정해 등록해요.</p>
          {trainers.length === 0 ? (
            <p className="rounded-xl bg-elevate px-4 py-3 text-[13px] text-muted">
              먼저 트레이너를 초대해 주세요. 배정할 트레이너가 있어야 회원을 등록할 수 있어요.
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setShowMemberCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" /> 새 회원 등록·배정
            </Button>
          )}
          {showMemberCreate && (
            <MemberForm assignTrainers={trainers} onClose={() => setShowMemberCreate(false)} onSaved={handleMemberCreated} />
          )}
        </Card>
        )}

        {/* ===== 회원 재배정(트레이너 인계) — PT 전용 · 잔여 이월계약 ===== */}
        {atab === "ops" && (
        <Card as="section" className="mb-6">
          <Eyebrow icon={ArrowLeftRight}>회원 재배정 (트레이너 인계)</Eyebrow>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">PT 회원을 다른 트레이너에게 넘겨요. 잔여 세션은 이어지고, 그 잔여분 급여는 새 담당이 받아요(지난 수업·매출은 그대로).</p>
          {trainers.length < 2 ? (
            <p className="rounded-xl bg-elevate px-4 py-3 text-[13px] text-muted">
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
        </Card>
        )}

        {/* ===== 트레이너 초대 온보딩 (A) ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <AddTrainerForm
            seatLimit={trainerSeatLimit(planKey)}
            seatUsed={trainers.filter((t) => t.role === "trainer" && t.active !== false).length}
            onCreated={(row) => setTrainers((p) => [...p, row])} />
          {planKey === "center" && (
            <div className="mt-4">
              <JoinInviteCard seatFull={trainers.filter((t) => t.role === "trainer" && t.active !== false).length >= trainerSeatLimit(planKey)} />
            </div>
          )}
          {planKey === "center" && (
            <div className="mt-4"><LeaveAllowCard trainers={trainers} /></div>
          )}
        </section>
        )}

        {/* ===== 공지 (기능1) — 원장 작성·목록 ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <AdminAnnouncements trainers={trainers} />
        </section>
        )}

        {/* ===== 회원 이벤트(2026-10-06) — 센터 전체 · 트레이너별 회원 대상 ===== */}
        {atab === "ops" && (
        <section className="mb-8">
          <EventManager trainers={trainers.filter((t) => t.active !== false)} />
        </section>
        )}

        {/* ===== 이번 달 센터 요약 (구 '실데이터 요약' 교체 · 클로징/재등록률은 OT/PT 현황 탭 소유) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <Eyebrow icon={TrendingUp}>센터 요약</Eyebrow>
          <CenterMonthSummary members={rows} otRows={otRows} logs={logs} trainers={trainers} ym={ym} />
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
              여기선 급여 방식만 정해요.
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-primary-strong">
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
            <TrendingUp className="h-4 w-4 text-primary-strong" />
            <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">클로징 · 재등록 상세 분석</span>
            <span className="ml-1 text-[13px] font-normal text-muted">{perfDetailOpen ? "접기" : "펼치기"}</span>
            {perfDetailOpen
              ? <ChevronDown className="ml-auto h-4 w-4 text-muted" />
              : <ChevronRight className="ml-auto h-4 w-4 text-muted" />}
          </button>
          {perfDetailOpen && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* 방향별 강점 */}
            <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
              <div className="text-[15px] font-bold tracking-[-0.02em] text-ink">클로징 방향별 강점</div>
              <div className="mt-0.5 text-[13px] text-muted">성공 클로징의 접근 방향 분포</div>
              <div className="mt-4 space-y-3">
                {approachDist.length === 0 ? (
                  <div className="text-[13px] text-muted">아직 성공 클로징 데이터가 없어요.</div>
                ) : (
                  approachDist.map((d) => {
                    const max = approachDist[0].count || 1;
                    return (
                      <div key={d.approach}>
                        <div className="mb-1 flex justify-between text-[13px] text-sub">
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
            <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
              <div className="text-[15px] font-bold tracking-[-0.02em] text-ink">클로징 실패·보류 사유</div>
              <div className="mt-0.5 text-[13px] text-muted">OT 클로징 약점 진단: 센터가 주로 놓치는 이유</div>
              <div className="mt-4 space-y-3">
                {closingReasonDist.length === 0 ? (
                  <div className="text-[13px] text-muted">아직 클로징 실패·보류 사유 데이터가 없어요.</div>
                ) : (
                  closingReasonDist.map((d) => {
                    const max = closingReasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[13px] text-sub">
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
            <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
              <div className="text-[15px] font-bold tracking-[-0.02em] text-ink">재등록 실패·보류 사유</div>
              <div className="mt-0.5 text-[13px] text-muted">거절을 데이터로 보는 약점 진단</div>
              <div className="mt-4 space-y-3">
                {reasonDist.length === 0 ? (
                  <div className="text-[13px] text-muted">아직 재등록 사유 데이터가 없어요.</div>
                ) : (
                  reasonDist.map((d) => {
                    const max = reasonDist[0].count || 1;
                    return (
                      <div key={d.reason}>
                        <div className="mb-1 flex justify-between text-[13px] text-sub">
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
          </div>
          )}
        </section>
        )}

        {/* ===== 오늘 코칭할 것 (트레이너 탭 하단 · 원장 코칭용·읽기전용) ===== */}
        {atab === "perf" && (
        <section className="mb-8">
          <TrainerQualityReport members={rows} otRows={otRows} contracts={contracts} logs={logs} trainers={trainers} ym={ym} />
        </section>
        )}

        {/* ===== 정산 탭 — 기간 정산 + FC·기타 매출 + 지출 장부 =====
             원래 정산은 '매출' 탭 맨 위, 지출은 '운영' 탭에 있었다. 순이익을 보려면
             두 탭을 오가야 했고, 정산표의 지출 줄만 다른 화면에서 채워야 했다.
             들어온 돈·나간 돈·남은 돈은 한 화면에 있어야 장부로 쓰인다.
             매출 탭은 분석(구성·예측·추이)만 남긴다. */}
        {(atab === "settle" || atab === "settle_entry") && (
        <section className="mb-8">
          {/* 보기/적기는 상단 세그먼트가 고른다(하위탭은 헤더 한 곳에서만).
              기간은 패널 안에서 startDay로부터 파생 — 늦게 도착해도 자동으로 맞는다. */}
          <SettlementPanel
            view={atab === "settle_entry" ? "entry" : "view"}
            contracts={revenueContracts} incomes={incomes} expenses={expenses} ym={ym}
            startDay={startDay} onChangeStartDay={saveStartDay}
            onIncomeChanged={reloadIncomes} onExpenseChanged={reloadExpenses} />
        </section>
        )}

        {/* ===== 매출 파이프라인·예측 (매출 탭 · #3) ===== */}
        {atab === "revenue" && (
        <section className="mb-8">
          <RevenuePipeline members={rows} contracts={revenueContracts} logs={logs} otRows={otRows} trainers={trainers} goals={goals} ym={ym} />
        </section>
        )}

        {/* ===== 등록·이탈 (구 OT 전환 + PT 유지 · MemberFlow) ===== */}
        {atab === "flow" && (
        <section className="mb-8">
          <OtIntakePanel members={rows} otRows={otRows} appts={appts} trainers={trainers} onChanged={handleMemberCreated} />
          <MemberFlow
            members={rows} otRows={otRows} contracts={contracts} logs={logs}
            trainers={trainers} ym={ym} onGoTab={goTab} />
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
