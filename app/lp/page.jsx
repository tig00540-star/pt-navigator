"use client";

/* =========================================================================
   「오직 트레이너」 랜딩 (/lp) — 「오직 트레이너 Design System」 랜딩 정본 이식
   -------------------------------------------------------------------------
   원본: Design System 프로젝트 `오직 트레이너 랜딩.html`(= templates/landing/Landing.dc.html).
   스크롤형 공개 홈: 창업자 스토리(먹색) · 철학(도구 vs 앱) · 핵심기능(폰 목업 4)
   · 그 외 기능 · 관리자님께(먹색) · 가격 3단 · FAQ · CTA · 푸터.

   이식 규율(프로젝트 컨벤션 준수):
   - 아이콘은 lucide-react만(원본의 unpkg lucide-static 마스크 URL 금지).
   - 색은 전역 @theme 토큰의 Tailwind 유틸(bg/card/ink/sub/muted/line/primary…).
     먹색 섹션은 bg-ink + 흰 글자 + red-300(#fca5a5) 액센트로 명시.
   - ⚠️ scroll-snap은 이 /lp 컨테이너(.lp-root)에만 스코프. 전역 html(layout.js가
     /·/admin·/m와 공유)에 걸면 앱 전체가 스냅되므로 절대 금지.
   - 실제 앱 화면 = public/lp/demos/*.html (DemoSlot iframe · 목업 아님).
   - 등장 애니메이션은 IntersectionObserver로 .in 토글 → 스코프 CSS가 재생
     (prefers-reduced-motion·above-the-fold 즉시표시로 빈 화면 방지).
   ========================================================================= */

import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight, ChevronDown, X, Check, PencilLine, Presentation, Bell,
  Users, Calculator, BookOpen, Wallet, Library, Network, Trophy,
  CalendarDays, ChartColumn, MessageSquare, Filter, Megaphone, ShieldCheck,
} from "lucide-react";
import DemoSlot from "./DemoSlot";
import CompanyInfo from "@/components/CompanyInfo";
import { contactHref } from "@/lib/company";

/* ───────── 데이터 ───────── */

const PHILO_OLD = [
  "앱·노션·스프레드시트를 오가며 관리",
  "수업마다 똑같은 수기 타이핑",
  "세일즈·교육은 각자 알아서",
  "회원이 늘수록 관리 부담도 증가",
  "재등록·재접근은 놓치기 일쑤",
];
const PHILO_NEW = [
  "등록·재등록·관리·컨텐츠를 한 앱에서",
  "말로 30초, 일지·리포트 자동 작성",
  "AI가 대사·근거까지 미리 준비",
  "부담은 앱이 — 트레이너는 수업만",
  "재등록 타이밍을 앱이 먼저 알림",
];

const PAINS_1 = [
  { icon: PencilLine, t: "일지·기록에 매일 40분", d: "수업 끝나고 회원별로 종목·중량·세트를 다시 타이핑. 미루면 뭉개지고, 뭉개지면 재등록 근거가 사라집니다.", fix: "말로 30초 → 하루 40분을 되찾습니다" },
  { icon: Presentation, t: "OT 준비는 매번 백지에서", d: "회원 성향·통증·목표를 놓고 무슨 말을 할지 매번 고민. 준비 없이 들어간 OT는 클로징이 감에 맡겨집니다.", fix: "AI가 대사·근거까지 → 준비 5분" },
  { icon: Bell, t: "재등록은 기억력에 의존", d: "잔여 세션을 머리로 세다 놓칩니다. 회원은 조용히 사라지고, 매출은 매달 0에서 다시 시작합니다.", fix: "앱이 먼저 알림 → 놓치는 재등록 0" },
  { icon: MessageSquare, t: "회원 피드백·소통에 저녁이 녹는다", d: "수업 끝나고 회원마다 카톡으로 피드백·다음 숙제를 정리해 보내다 보면, 정작 쉬어야 할 시간이 사라집니다.", fix: "회원앱이 기록·성과를 자동 전달 → 소통도 앱이" },
];
const PAINS_2 = [
  { icon: Users, t: "회원이 늘면 관리도 늘어난다", d: "10명이 20명 되면 카톡·기록·피드백도 두 배. 결국 관리 품질이 먼저 무너집니다.", fix: "회원 셀프 관리 → 인원 늘어도 부담 동일" },
  { icon: Calculator, t: "정산·급여는 매달 수기 대조", d: "수업 수를 세고, 맞춰보고, 틀리면 다시. 즐거워야 할 정산날이 스트레스가 됩니다.", fix: "자동 집계 → 확정만 누르면 끝" },
  { icon: BookOpen, t: "교육은 저장만 하고 안 씀", d: "인스타·유튜브에 좋은 자료는 넘치는데, 실전에서 꺼내 쓰지 못하면 자산이 아닙니다.", fix: "AI가 학습 → 현장 스크립트로 전환" },
  { icon: Trophy, t: "동기부여를 일일이 챙긴다", d: "출석·오운완을 수기로 독려하다 지칩니다. 회원이 스스로 오지 않으면 결국 이탈로 이어집니다.", fix: "오운완·랭킹·뱃지로 회원이 스스로 오게" },
];

const PILLARS = [
  { num: "01", kicker: "신규등록 · 세일즈", title: "세일즈, 잘 모르겠으면", accent: "따라만 하세요.", body: <>회원 맞춤 OT부터 세일즈·클로징, 세일즈북 PPT 제작까지 한 큐에. <br />OT 전 5분 앱 켜고, 알려주는 대로 말하고 운동하고 보여주세요.</>, demo: "/lp/demos/ot-mockup-embed.html", demoTitle: "신규등록 실제 화면 데모", w: 524 },
  { num: "02", kicker: "재등록", title: "때 되면 하는 재등록?", accent: "그런 건 없습니다.", body: "운동일지·인바디 변화·운동 빈도를 전부 반영해, 회원이 재등록할 수밖에 없게. 알람에 맞춰 준비하고 세일즈북 PPT를 보여주세요.", demo: "/lp/demos/ot-rereg-embed.html", demoTitle: "재등록 실제 화면 데모", w: 524 },
  { num: "03", kicker: "운동일지 자동작성", title: "쓰지 말고,", accent: "말하세요.", body: <>노션·스프레드시트·관리앱 다 써봐도 결국 하나하나 타이핑. <br />수업 끝 5분 전, 회원과 복기만 하세요.<br />운동 설명은 앱이 합니다.</>, demo: "/lp/demos/ot-voicelog-embed.html", demoTitle: "운동일지 실제 화면 데모", w: 524 },
  { num: "04", kicker: "회원관리", title: "붙잡지 마세요.", accent: "회원이 셀프로 관리합니다.", body: <>회원 10·20·30명… 늘어나는 부담. 카톡 기록 하나하나 찾고 계신가요? 이제 회원이 스스로 남깁니다. <br />트레이너는 소통만 하세요.</>, demo: "/lp/demos/ot-member-embed.html", demoTitle: "회원관리 실제 화면 데모", w: 524 },
];

const ETC = [
  { icon: Wallet, t: "급여·정산 자동", d: <>수업·실적을 실시간 집계해 자동 계산. <br />트레이너는 확인후 확정만 누르세요.</> },
  { icon: Library, t: "라이브러리 · AI 학습", d: <>인스타·유튜브 링크만 저장하면 AI가 알아서 학습해 <br />실전 스크립트로 녹여줍니다.</> },
  { icon: Network, t: "집단 학습", d: <>트레이너들의 성공 클로징을 학습·업데이트. <br />실패 패턴은 스스로 지웁니다.</> },
  { icon: Trophy, t: "이벤트 · 컨텐츠", d: <>트레이너가 여는 챌린지와 랭킹 경쟁. <br />주기적 목표로 회원이 떠나지 않게.</> },
  { icon: CalendarDays, t: "스케줄링", d: <>예약·수업 일정을 한 곳에서 관리합니다.<br />수업확인, 세션지 모두 한 곳에서 알아서 계산합니다.</> },
  { icon: ChartColumn, t: "KPI 리포트", d: "클로징률 등 트레이너 지표를 리포트로 제공합니다." },
];

const DIRECTOR_PILLARS = [
  { num: "01", kicker: "매출 · KPI", title: "감으로 보던 지점 매출을,", accent: "한 화면에서 숫자로.", body: "이달 순매출과 목표 달성률, 다음달 예상 매출(신규 유입 + 재등록)까지. 신규 vs 재등록 구성비와 최근 6개월 추이를 함께 봅니다.", demo: "/lp/demos/ot-admin-revenue-embed.html", demoTitle: "지점 매출 대시보드 데모", w: 524 },
  { num: "02", kicker: "퍼널 · 이탈 관리", title: "어디서 새는지,", accent: "앱이 짚어줍니다.", body: "OT 회원 → 1차 OT → 2차 OT → PT 등록, 단계별로 어디서 새는지 한눈에. 이번 주 챙길 임박 등록도 따로 띄웁니다.", demo: "/lp/demos/ot-admin-funnel-embed.html", demoTitle: "회원 퍼널 관리 데모", w: 524 },
  { num: "03", kicker: "QC · 브리핑", title: "잔소리 대신,", accent: "데이터로 코칭.", body: "오늘 챙길 것 3건과 AI 운영 보고서로 시작해, 매출 파이프라인·주의할 회원·트레이너별 코칭까지 한 흐름에서.", demo: "/lp/demos/ot-admin-briefing-embed.html", demoTitle: "트레이너 브리핑 데모", w: 524 },
];

// 관리자(원장) 섹션 — 왜 필요한가 · 다크 카드
const ADMIN_PAINS = [
  { icon: Wallet, t: "매출을 월말에야 안다", d: "이달이 어떻게 끝날지 마지막 날 정산하며 처음 압니다. 다음 달 예상은 늘 감입니다.", fix: "순매출·목표 달성·다음달 예측을 실시간으로" },
  { icon: Filter, t: "어디서 새는지 모른다", d: "OT는 많은데 등록이 안 되는 원인이 트레이너별로 안 잡혀, 코칭이 감에 의존합니다.", fix: "OT→PT 퍼널을 트레이너별로 → 약점이 숫자로" },
  { icon: Users, t: "코칭이 잔소리가 된다", d: "근거 데이터 없이 지적하면 트레이너는 감시로 느낍니다. 결국 코칭이 안 먹힙니다.", fix: "실적·클로징률 데이터로 → 잔소리 대신 코칭" },
  { icon: Bell, t: "재등록 시즌을 놓친다", d: "만료가 몰리는 걸 뒤늦게 알고, 회원이 이미 빠진 뒤에야 챙기게 됩니다.", fix: "만료 임박·이탈 위험을 앱이 먼저 알림" },
];
const ADMIN_ETC = [
  { icon: Calculator, t: "급여 자동정산", d: "수업·실적을 실시간 집계해 자동 계산. 확인 후 확정만 누르면 끝." },
  { icon: ShieldCheck, t: "트레이너 초대·권한", d: "초대 한 번으로 팀이 붙고, 매출은 원장만 · 트레이너는 담당 회원만." },
  { icon: Megaphone, t: "필수 공지", d: "센터 공지를 앱이 트레이너에게 확실히 띄워 전달합니다." },
  { icon: CalendarDays, t: "스케줄 · 노쇼", d: "요일×시간 밀도와 완료·노쇼를 한눈에. 빈 시간이 보입니다." },
];

// ⚠️ 가격은 lib/plans.js(실제 결제 금액)와 반드시 일치시킬 것 — 랜딩↔결제 불일치 금지.
const TIERS = [
  { t: "solo", name: "솔로", tagline: "개인 트레이너 1인", price: 59000, regular: 79000, feats: [["1·2차 OT · 재등록 서포트", false], ["음성일지 · AI 리포트", false], ["회원앱 (성과 그래프·비포애프터)", true], ["실적 · 급여 자동계산", false]], cta: "7일 무료 체험", href: "/signup", highlight: true },
  { t: "center", name: "센터", tagline: "트레이너 3인 + 관리자 1인", price: 149000, regular: 199000, feats: [["솔로 전체 포함", false], ["관리자 대시보드 (매출·전환·리텐션)", true], ["트레이너 3인 좌석 + 관리자 1인", false], ["QC · 팀 관리", false]], cta: "7일 무료 체험", href: "/signup", highlight: false },
];

const FAQ = [
  { q: "설치해야 하나요?", a: "아니요. 웹앱(PWA)이라 앱스토어 없이 브라우저로 바로 쓰고, 홈 화면에 추가하면 앱처럼 열립니다.", open: true },
  { q: "어떤 기기에서 되나요?", a: "폰 현장 사용에 최적화됐고, 웹이라 태블릿·PC에서도 그대로 열립니다." },
  { q: "AI가 대신 팔아주나요?", a: "아니요. AI는 정답을 주는 게 아니라 당신의 판단을 돕는 스파링 파트너입니다. 관찰은 트레이너가, 근거·방향 정리는 AI가 맡습니다." },
  { q: "회원 정보는 안전한가요?", a: "계정별로 데이터가 격리되고(멀티테넌트), 회원 앱은 별도 인증으로 본인 것만 봅니다. 실제 AI는 서버에서만 키를 다뤄 노출되지 않습니다." },
  { q: "회원은 앱을 어떻게 받나요?", a: "트레이너가 발급한 링크로 접속하면 됩니다(설치 불필요). 자기 성과·운동 기록을 봅니다. (Premium)" },
  { q: "혼자(솔로) 하는데도 되나요?", a: "네. 관리자 없이 1인 트레이너 모드로 쓸 수 있고, 급여·실적도 본인 기준으로 자동계산됩니다." },
  { q: "가격이 어떻게 되나요?", a: "Basic/Premium/맞춤 3단계, 7일 무료 체험. 구체 금액은 문의·체험 신청 시 안내드립니다(베타 확정 중)." },
  { q: "의료·재활 목적인가요?", a: "아니요. 운동 지도·세일즈·회원관리 도구이며, 통증은 “불편 부위 고려·움직임 개선” 관점으로 다룹니다(치료·진단 아님)." },
];

/* ───────── 심볼 ───────── */

function Sym({ size = 26, dark = false }) {
  const c = dark ? "#fff" : "var(--color-ink)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <circle cx="32" cy="32" r="27" fill="none" stroke={c} strokeWidth="3.4" />
      <path d="M32 7 L37.5 33 L26.5 33 Z" fill="#dc2626" />
      <circle cx="32" cy="32" r="4.2" fill={c} />
    </svg>
  );
}

/* ───────── 페이지 ───────── */

export default function LandingPage() {
  /* 등장 애니메이션 — .reveal/.slam/.builtline에 .in 토글.
     ⚠️ 스크롤은 이 /lp 전용 중첩 스크롤러(.lp-root)에서 일어나므로 IntersectionObserver의
     root를 .lp-root로 명시한다(뷰포트 기본값은 중첩 스크롤을 못 잡음). 스크롤 리스너를
     백업으로 둬 IO 지연/미발화 환경까지 커버. 숨김 상태는 JS가 붙이는 .reveal-ready
     뒤에만 적용 → JS 실패·no-JS·구형 브라우저면 그냥 보인다(빈 화면 방지). */
  useEffect(() => {
    const root = document.querySelector(".lp-root");
    if (!root) return;
    const els = Array.from(root.querySelectorAll(".reveal, .slam, .builtline"));
    const reveal = (el) => el.classList.add("in");
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      els.forEach(reveal);
      return;
    }
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { root, rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));

    // 백업 — 스크롤 리스너로도 판정(IO가 늦거나 미발화하는 환경 대비) + 첫 화면 즉시.
    let pending = false;
    const check = () => {
      pending = false;
      const vh = root.clientHeight;
      for (const el of els) {
        if (el.classList.contains("in")) continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) reveal(el);
      }
    };
    const onScroll = () => {
      if (!pending) {
        pending = true;
        requestAnimationFrame(check);
      }
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      io.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* 인페이지 이동 — ⚠️ 네이티브 `href="#id"`는 이 중첩 스크롤러(.lp-root)를 스크롤하지 못해
     (문서 스크롤러로 위임되어 무동작) JS로 컨테이너를 직접 스크롤한다. 헤더(64px)만큼 오프셋. */
  const scrollToId = (id) => {
    const root = document.querySelector(".lp-root");
    const el = document.getElementById(id);
    if (!root || !el) return;
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 64;
    root.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };
  const onNav = (id) => (e) => {
    e.preventDefault();
    scrollToId(id);
  };

  return (
    <div className="lp-root h-dvh overflow-y-auto bg-bg text-ink">
      <style>{LP_CSS}</style>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-[14px]">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <a href="#founder" onClick={onNav("founder")} className="flex shrink-0 items-center gap-2 no-underline">
            <Sym size={26} />
            <span className="hidden whitespace-nowrap text-[18px] font-extrabold tracking-[-0.03em] sm:inline">
              <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
            </span>
          </a>

          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <nav className="hidden items-center gap-[26px] lg:flex">
              {[["#philosophy", "철학"], ["#pricing", "가격"], ["#faq", "FAQ"]].map(([href, label]) => (
                <a key={href} href={href} onClick={onNav(href.slice(1))} className="text-[14.5px] font-semibold tracking-[-0.01em] text-sub no-underline transition-colors hover:text-ink">{label}</a>
              ))}
            </nav>

            {/* 상시 역할 바로가기 — 스크롤해도 헤더에 계속 노출 (트레이너=기능 · 관리자=센터관리) */}
            <div role="group" aria-label="역할별 바로가기" className="flex items-center gap-1 whitespace-nowrap rounded-full border border-line-strong bg-elevate p-1">
              <span aria-hidden="true" className="hidden pl-2 pr-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted sm:inline">바로가기</span>
              <button type="button" onClick={() => scrollToId("features")} className="rounded-full px-2.5 py-1.5 text-[13px] font-bold text-ink transition-colors hover:bg-primary hover:text-white sm:px-3.5">트레이너</button>
              <button type="button" onClick={() => scrollToId("directors")} className="rounded-full px-2.5 py-1.5 text-[13px] font-bold text-ink transition-colors hover:bg-primary hover:text-white sm:px-3.5">관리자</button>
            </div>

            <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-primary px-3.5 py-2.5 text-[14px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-[#c11f1f] sm:px-[18px] sm:text-[14.5px]">앱 열기</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── 창업자(먹색) ── */}
        <section id="founder" className="relative bg-ink text-white">
          <div className="mx-auto max-w-[860px] px-6">
            <div className="snappage snap flex flex-col justify-center text-center">
              <h2 className="slam mx-auto text-[clamp(30px,5.2vw,56px)] font-extrabold leading-[1.1] tracking-[-0.045em] text-balance">
                지금 트레이너 생활이 너무 만족스럽다면,<br /><span className="kill">쓰실 필요 없습니다.</span>
              </h2>
              <p className="reveal mx-auto mt-[30px] max-w-[660px] text-[clamp(16px,1.9vw,21px)] leading-[1.7] tracking-[-0.015em] text-white/[0.88]">
                매달 초기화되는 매출, 늘어나는 회원만큼 늘어나는 회원 관리, 누적되는 업무.<br />세일즈 교육, 재활 교육… 난 언제 듣지...
              </p>
              <p className="reveal mt-[22px] text-[clamp(20px,2.6vw,30px)] font-extrabold tracking-[-0.03em]">그럼 잘 오셨습니다.</p>
              <div className="reveal mt-[30px] flex flex-wrap justify-center gap-3">
                <a href="/signup" className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-7 py-[15px] text-[16px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-[#c11f1f]">7일 무료 시작 <ArrowRight size={18} strokeWidth={2.4} /></a>
                <Link href="/" className="inline-flex items-center gap-2 rounded-[10px] border border-white/[0.28] px-7 py-[15px] text-[16px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-white/[0.08]">앱 열기</Link>
              </div>

              <a href="#founder-story" onClick={onNav("founder-story")} className="scroll-cue mx-auto mt-[clamp(36px,6vw,64px)] inline-flex flex-col items-center gap-1.5 text-white/50 no-underline">
                <span className="text-[11px] uppercase tracking-[0.1em]">계속</span>
                <ChevronDown size={22} />
              </a>
            </div>

            <div id="founder-story" className="snappage snap flex flex-col justify-center border-t border-white/10 text-center">
              <p className="reveal m-0 text-[clamp(20px,2.8vw,30px)] font-bold leading-[1.4] tracking-[-0.03em] text-balance">
                트레이너 경력 10년. 팀장·관리자까지 다 해본 사람이,<br />
                <span className="builtline"><span className="built font-extrabold text-primary">답답해서 직접 개발했습니다.</span></span>
              </p>
              <p className="reveal mt-7 text-[clamp(15px,1.6vw,17px)] leading-[1.75] tracking-[-0.011em] text-white/[0.88]">
                어플·노션·스프레드시트 다 써봤지만<br />현실은 똑같은 타이핑과 시간 소모.<br />그래서 직접 만들었습니다.
              </p>
              <p className="reveal mt-[18px] text-[clamp(15px,1.6vw,17px)] leading-[1.75] tracking-[-0.011em] text-white/[0.88]">
                AI 활용부터 세일즈·자기계발·급여정산까지, 수업 외 모든 업무.<br /><b className="font-bold text-white">회원 스스로 셀프 관리하게 만드는 PT 시스템</b> 여기 싹 다 녹여냈습니다.
              </p>
              <div className="reveal mt-[clamp(28px,4vh,48px)]">
                <span className="mx-auto block w-fit"><Sym size={48} dark /></span>
                <p className="mt-5 text-[clamp(24px,3.6vw,40px)] font-extrabold leading-[1.25] tracking-[-0.04em]">
                  오직 트레이너만을 위한 앱<br />
                  <span className="whitespace-nowrap"><span className="text-white">오직</span> <span className="text-primary">트레이너</span></span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 철학 ── */}
        <section id="philosophy" className="py-[clamp(60px,8vw,116px)]">
          <div className="mx-auto max-w-[1160px] px-6">
            <div className="snappage flex flex-col justify-center">
              <div className="reveal">
                <span className="mb-[22px] inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-primary-strong">트레이너를 위한</span>
                <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-primary-strong">왜 또 다른 앱이냐고요?</div>
                <h2 className="mt-3.5 max-w-[820px] text-[clamp(28px,4.2vw,50px)] font-extrabold leading-[1.12] tracking-[-0.045em] text-balance">
                  다 써봤지만,<br /><span className="text-primary-strong">달라진 게 없었으니까.</span>
                </h2>
                <p className="mt-4 max-w-[600px] text-[clamp(15px,1.6vw,18px)] leading-[1.6] tracking-[-0.011em] text-sub">
                  도구만 늘어났을 뿐, 타이핑도 업무량도 그대로였습니다.<br /><b className="font-bold text-ink">오직 트레이너는 그 방식을 바꿉니다.</b>
                </p>
              </div>

              <div className="mt-10 grid items-stretch gap-[18px] md:grid-cols-2">
                {/* 지금까지 */}
                <div className="reveal flex flex-col gap-[18px] rounded-[20px] border border-line bg-card p-[clamp(26px,3vw,34px)] shadow-sm">
                  <div>
                    <div className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">지금까지</div>
                    <h3 className="mt-2 text-[clamp(19px,2.2vw,25px)] font-extrabold tracking-[-0.03em] text-sub">도구만 늘고, 일은 그대로.</h3>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-[13px] p-0">
                    {PHILO_OLD.map((x) => (
                      <li key={x} className="flex items-start gap-[11px]">
                        <X size={18} strokeWidth={2.4} className="mt-0.5 flex-none text-muted" />
                        <span className="text-[14.5px] leading-[1.5] tracking-[-0.011em] text-muted">{x}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* 오직 트레이너 */}
                <div className="reveal flex flex-col gap-[18px] rounded-[20px] border-2 border-primary bg-card p-[clamp(26px,3vw,34px)] shadow-[0_22px_48px_-22px_rgba(220,38,38,0.28)]">
                  <div className="flex items-center gap-2">
                    <Sym size={20} />
                    <div className="text-[12px] font-extrabold tracking-[0.06em] text-primary-strong">오직 트레이너</div>
                  </div>
                  <h3 className="m-0 text-[clamp(19px,2.2vw,25px)] font-extrabold tracking-[-0.03em]">이제, 앱이 다 합니다.</h3>
                  <ul className="m-0 flex list-none flex-col gap-[13px] p-0">
                    {PHILO_NEW.map((x) => (
                      <li key={x} className="flex items-start gap-[11px]">
                        <Check size={18} strokeWidth={3} className="mt-0.5 flex-none text-primary" />
                        <span className="text-[14.5px] leading-[1.5] tracking-[-0.011em] text-ink">{x}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* 철학 마무리 — 비교 블록의 펀치라인. 풀스크린 해제(자연 흐름). */}
            <div className="py-[clamp(40px,6vw,72px)] text-center">
              <div className="reveal">
                <h2 className="text-[clamp(26px,3.8vw,46px)] font-extrabold leading-[1.2] tracking-[-0.045em] text-balance">
                  <span className="text-primary-strong">오직 트레이너</span>가 해결하겠습니다.
                </h2>
                <p className="mt-5 text-[clamp(16px,1.9vw,21px)] leading-[1.6] tracking-[-0.011em] text-sub">
                  더 이상 시간 쓰지 마세요. 그 시간을,<br />내가 트레이너가 된 이유&nbsp;
                  <b className="mt-2.5 inline-block text-[clamp(24px,3.4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.035em] text-ink">회원을 위한 본질에 투자하세요.</b>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 핵심 기능 ── */}
        <section id="features" className="py-[clamp(60px,8vw,116px)]">
          <div className="mx-auto max-w-[1160px] px-6">
            {/* 왜 앱이 해야 하나 — 1 */}
            <PainBlock
              kicker="왜 앱이 해야 하나"
              title={<>수업은 2시간, <span className="text-primary-strong">수업 밖 업무는 4시간.</span></>}
              lead={<>트레이너의 하루는 수업으로 끝나지 않습니다. 일지·상담 준비·재등록 관리·정산이 뒤에 붙습니다. 이 업무들은 실력이 아니라 <b className="text-ink">시간</b>을 먹습니다.</>}
              cards={PAINS_1}
            />
            {/* 왜 앱이 해야 하나 — 2 (eyebrow 차별화: 반복 방지) */}
            <PainBlock
              kicker="게다가, 늘어날수록"
              title={<>회원이 늘어도 <span className="text-primary-strong">부담은 그대로.</span></>}
              cards={PAINS_2}
              footer={<>수업 밖 업무를 앱에 넘기면, <span className="text-primary-strong">하루 2~3시간이 돌아옵니다.</span> 그 시간을 수업과 회원에게 쓰세요.</>}
            />

            {/* 폰 목업 필러 4 */}
            {PILLARS.map((p) => <EmbedPillar key={p.num} {...p} />)}

            {/* 그 외 기능 — 풀스크린 해제(자연 흐름). */}
            <div className="border-t border-line py-[clamp(48px,7vw,88px)]">
              <div className="reveal">
                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary-strong">그 외 기능</div>
                <h3 className="mt-3 max-w-[640px] text-[clamp(22px,3vw,32px)] font-extrabold tracking-[-0.04em] text-balance">수업 밖 모든 업무까지, 앱이 대신합니다.</h3>
              </div>
              <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
                {ETC.map(({ icon: Icon, t, d }, i) => (
                  <div key={t} className="reveal rounded-[16px] border border-line bg-card p-[26px_24px] shadow-sm transition-transform hover:-translate-y-0.5" style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-primary-soft">
                      <Icon size={22} strokeWidth={2} className="text-primary-strong" />
                    </div>
                    <h4 className="mt-4 text-[16.5px] font-extrabold tracking-[-0.025em]">{t}</h4>
                    <p className="mt-2 text-[13.5px] leading-[1.58] tracking-[-0.011em] text-sub">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 관리자님께(먹색) ── */}
        <section id="directors" className="bg-ink text-white">
          <div className="mx-auto max-w-[1160px] px-6">
            <div className="fintro py-[clamp(56px,8vw,96px)]">
              <div className="reveal">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-[#fca5a5]">관리자님을 위한</span>
                <h2 className="mt-[18px] max-w-[800px] text-[clamp(28px,4vw,46px)] font-extrabold leading-[1.14] tracking-[-0.045em] text-balance">
                  무엇을 잘하고 어떤 걸 놓치는지,<br /><span className="text-[#fca5a5]">숫자로 보여드립니다.</span>
                </h2>
                <p className="mt-4 max-w-[620px] text-[clamp(15px,1.6vw,18px)] leading-[1.6] tracking-[-0.011em] text-white/[0.88]">순매출·목표 달성률부터 다음달 예상 매출까지. 등록 퍼널에서 어디가 새는지 짚고, 오늘 챙길 것을 AI가 먼저 정리해 드립니다.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["순매출 · 예상 매출", "등록 퍼널 · 임박 등록", "AI 운영 보고서"].map((x) => (
                    <span key={x} className="rounded-full bg-white/10 px-3.5 py-[7px] text-[13px] font-bold text-[#fca5a5]">{x}</span>
                  ))}
                </div>
                <a href={contactHref()} className="mt-7 inline-flex items-center gap-2 rounded-[10px] bg-primary px-[22px] py-[13px] text-[15px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-[#c11f1f]">센터 도입 문의 <ArrowRight size={16} strokeWidth={2.4} /></a>
              </div>
            </div>

            {/* 왜 관리자에게 필요한가 — 문제 카드(다크) */}
            <div className="py-[clamp(44px,6vw,76px)]">
              <div className="reveal">
                <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#fca5a5]">왜 관리자에게 필요한가</div>
                <h3 className="mt-3.5 max-w-[760px] text-[clamp(24px,3.4vw,40px)] font-extrabold leading-[1.16] tracking-[-0.045em] text-balance">감으로 굴리면, 문제는 늘 뒤늦게 드러납니다.</h3>
              </div>
              <div className="mt-[26px] grid gap-3.5 sm:grid-cols-2">
                {ADMIN_PAINS.map(({ icon: Icon, t, d, fix }) => (
                  <div key={t} className="reveal flex flex-col gap-2.5 rounded-[16px] border border-white/10 bg-white/[0.04] p-[22px_20px]">
                    <div className="flex items-center gap-2.5">
                      <Icon size={18} strokeWidth={2.2} className="flex-none text-[#fca5a5]" />
                      <b className="text-[15px] tracking-[-0.025em]">{t}</b>
                    </div>
                    <p className="text-[13.5px] leading-[1.55] tracking-[-0.011em] text-white/70">{d}</p>
                    <div className="mt-auto flex items-start gap-2 rounded-[10px] bg-white/[0.06] p-[10px_12px]">
                      <ArrowRight size={15} strokeWidth={2.4} className="mt-0.5 flex-none text-[#fca5a5]" />
                      <span className="text-[13px] font-bold leading-[1.5] tracking-[-0.012em] text-[#fca5a5]">{fix}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {DIRECTOR_PILLARS.map((p) => <EmbedPillar key={p.num} {...p} dark />)}

            {/* 그 외 관리자 기능(다크) */}
            <div className="py-[clamp(40px,6vw,72px)]">
              <div className="reveal">
                <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#fca5a5]">그 외 관리자 기능</div>
                <h3 className="mt-3 max-w-[640px] text-[clamp(22px,3vw,32px)] font-extrabold tracking-[-0.04em] text-balance">운영도 숫자로, 손이 덜 가게.</h3>
              </div>
              <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
                {ADMIN_ETC.map(({ icon: Icon, t, d }) => (
                  <div key={t} className="reveal rounded-[16px] border border-white/10 bg-white/[0.04] p-[24px_22px]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/[0.06]">
                      <Icon size={22} strokeWidth={2} className="text-[#fca5a5]" />
                    </div>
                    <h4 className="mt-4 text-[16px] font-extrabold tracking-[-0.025em]">{t}</h4>
                    <p className="mt-2 text-[13px] leading-[1.55] tracking-[-0.011em] text-white/70">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 가격 ── */}
        <section id="pricing" className="py-[clamp(56px,7vw,104px)]">
          <div className="mx-auto max-w-[1160px] px-6">
            <div className="py-[clamp(44px,6vw,76px)]">
              <div className="reveal mb-4 text-center">
                <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-primary-strong">가격</div>
                <h2 className="mt-3.5 text-[clamp(24px,3.2vw,36px)] font-extrabold leading-[1.22] tracking-[-0.04em] text-balance">7일 무료로 먼저 써보세요.</h2>
                <p className="mt-3 text-[16px] tracking-[-0.011em] text-sub">신규·재등록 <b className="text-ink">1건만 더</b> 나와도 회수됩니다.</p>
              </div>
              <div className="mx-auto mt-7 grid max-w-[720px] items-stretch gap-[18px] sm:grid-cols-2">
                {TIERS.map((tier) => (
                  <div
                    key={tier.t}
                    className={`reveal relative flex flex-col rounded-[18px] bg-card p-[28px_24px] ${
                      tier.highlight
                        ? "border-2 border-primary shadow-[0_0_0_2px_var(--color-primary)_inset,0_14px_34px_-14px_rgba(220,38,38,0.28)]"
                        : "border border-line shadow-sm"
                    }`}
                  >
                    {tier.highlight && (
                      <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full bg-primary px-3 py-1 text-[11px] font-bold tracking-[0.06em] text-white shadow-sm">추천</span>
                    )}
                    <h3 className="m-0 text-[20px] font-extrabold tracking-[-0.03em]">{tier.name}</h3>
                    <p className="mt-1.5 text-[13.5px] text-muted">{tier.tagline}</p>
                    <div className="my-4">
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-[28px] font-extrabold tracking-[-0.03em] text-ink">{tier.price.toLocaleString("ko-KR")}</span>
                        <span className="text-[14px] font-bold text-ink">원</span>
                        <span className="text-[13px] text-muted">/ 월</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[12.5px] text-muted line-through">정가 {tier.regular.toLocaleString("ko-KR")}원</span>
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-strong">얼리버드</span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-[9px]">
                      {tier.feats.map(([tx, strong]) => (
                        <div key={tx} className={`flex gap-2 text-[14px] tracking-[-0.011em] ${strong ? "font-semibold text-ink" : "text-sub"}`}>
                          <Check size={16} strokeWidth={3} className="mt-0.5 flex-none text-primary" />{tx}
                        </div>
                      ))}
                    </div>
                    <a
                      href={tier.href}
                      className={`mt-[22px] rounded-[10px] p-3 text-center text-[15px] font-bold no-underline transition-colors ${
                        tier.highlight
                          ? "bg-primary text-white hover:bg-[#c11f1f]"
                          : "border border-line-strong bg-card text-ink hover:bg-elevate"
                      }`}
                    >
                      {tier.cta}
                    </a>
                  </div>
                ))}
              </div>
              <p className="reveal mt-8 text-center text-[14px] leading-[1.7] tracking-[-0.008em] text-muted">얼리버드 한정가 · 부가세 별도 · 7일 무료 체험 후 자동결제 · 언제든 해지<br />센터에 트레이너 4인 이상이면 추가 좌석 문의</p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="py-[clamp(56px,7vw,104px)]">
          <div className="mx-auto max-w-[780px] px-6">
            <div className="reveal mb-[34px] text-center">
              <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-primary-strong">FAQ</div>
              <h2 className="mt-3.5 text-[clamp(24px,3.2vw,36px)] font-extrabold leading-[1.22] tracking-[-0.04em]">먼저 궁금한 것들.</h2>
            </div>
            <div className="reveal">
              {FAQ.map(({ q, a, open }) => (
                <details key={q} open={open} className="faq border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[16.5px] font-bold tracking-[-0.02em]">
                    {q}
                    <ChevronDown size={20} className="faq-chev flex-none text-muted transition-transform" />
                  </summary>
                  <p className="mb-[18px] mt-0 text-[15px] leading-[1.7] tracking-[-0.011em] text-sub">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 마무리 CTA ── */}
        <section className="py-[clamp(64px,9vw,120px)] text-center">
          <div className="mx-auto max-w-[1160px] px-6">
            <div className="reveal">
              <span className="mx-auto block w-fit"><Sym size={52} /></span>
              <h2 className="mt-[22px] text-[clamp(28px,4.2vw,48px)] font-extrabold leading-[1.15] tracking-[-0.045em] text-balance">오늘 수업부터 달라집니다.</h2>
              <div className="mt-[30px] flex flex-wrap justify-center gap-3">
                <a href="/signup" className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-7 py-[15px] text-[16px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-[#c11f1f]">7일 무료 시작 <ArrowRight size={18} strokeWidth={2.4} /></a>
                <Link href="/" className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-card px-7 py-[15px] text-[16px] font-bold tracking-[-0.01em] text-ink no-underline transition-colors hover:bg-elevate">앱 열기</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── 푸터 ── */}
        <footer className="border-t border-line py-10">
          <div className="mx-auto flex max-w-[1160px] flex-wrap items-start justify-between gap-5 px-6">
            <div>
              <div className="flex items-center gap-2.5">
                <Sym size={22} />
                <span className="whitespace-nowrap text-[16px] font-extrabold tracking-[-0.03em]">
                  <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
                </span>
              </div>
              <p className="mt-2.5 text-[11.5px] uppercase tracking-[0.14em] text-muted">ONLY FOR TRAINER</p>
              <p className="mt-3.5 max-w-[420px] text-[12.5px] leading-[1.6] tracking-[-0.008em] text-muted">오직 트레이너는 운동 지도·세일즈·회원관리 도구입니다. <br />의료기관이 아니며 치료·진단을 제공하지 않습니다.</p>
            </div>
            <div className="flex flex-wrap gap-7">
              {[["#features", "기능"], ["#pricing", "가격"], ["#faq", "FAQ"], ["/download", "설치 안내"]].map(([href, label]) => (
                <a key={label} href={href} onClick={href.startsWith("#") ? onNav(href.slice(1)) : undefined} className="text-[13.5px] text-sub no-underline transition-colors hover:text-ink">{label}</a>
              ))}
            </div>
          </div>
          <div className="mx-auto mt-[26px] max-w-[1160px] border-t border-line px-6 pt-6">
            <CompanyInfo />
            <p className="mt-4 text-[12px] text-[rgba(19,21,27,0.22)]">© 2026 오직 트레이너</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ───────── 서브 컴포넌트 ───────── */

/* "왜 앱이 해야 하나" — 3카드 + (선택)리드/푸터 */
function PainBlock({ kicker, title, lead, cards, footer }) {
  return (
    <div className="py-[clamp(44px,6vw,76px)]">
      <div className="reveal">
        <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-primary-strong">{kicker}</div>
        <h2 className="mt-3.5 max-w-[760px] text-[clamp(24px,3.4vw,40px)] font-extrabold leading-[1.16] tracking-[-0.045em] text-balance">{title}</h2>
        {lead && <p className="mt-3.5 max-w-[640px] text-[clamp(15px,1.6vw,17px)] leading-[1.62] tracking-[-0.011em] text-sub">{lead}</p>}
      </div>
      <div className={`mt-[26px] grid gap-3.5 sm:grid-cols-2 ${cards.length >= 4 ? "" : "lg:grid-cols-3"}`}>
        {cards.map(({ icon: Icon, t, d, fix }, i) => (
          <div key={t} className="reveal flex flex-col gap-2.5 rounded-[16px] border border-line bg-card p-[22px_20px] shadow-sm" style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
            <div className="flex items-center gap-2.5">
              <Icon size={18} strokeWidth={2.2} className="flex-none text-primary" />
              <b className="text-[15px] tracking-[-0.025em]">{t}</b>
            </div>
            <p className="m-0 text-[13.5px] leading-[1.55] tracking-[-0.011em] text-sub">{d}</p>
            <div className="mt-auto flex items-start gap-2 rounded-[10px] bg-primary-soft p-[10px_12px]">
              <ArrowRight size={15} strokeWidth={2.4} className="mt-0.5 flex-none text-primary-strong" />
              <span className="text-[13px] font-bold leading-[1.5] tracking-[-0.012em] text-primary-strong">{fix}</span>
            </div>
          </div>
        ))}
      </div>
      {footer && <p className="reveal mt-6 text-[clamp(15px,1.8vw,19px)] font-bold leading-[1.55] tracking-[-0.02em] text-ink text-balance">{footer}</p>}
    </div>
  );
}

/* 폰 목업 필러 — 텍스트 + 실제 화면(DemoSlot iframe). dark면 먹색 섹션용.
   ⚠️ w는 7개 모두 524로 통일: 임베드 폰은 전부 344px(동일)지만, 신규등록·재등록 임베드는
   폰이 90° 가로 회전(세일즈북 PPT)해 폭이 커져 524px `.phonezone`이 있어야 안 잘린다.
   같은 캔버스(524)에 같은 배율로 그려야 모든 폰이 같은 크기로 보인다(400짜리는 폰이 가운데 정렬). */
function EmbedPillar({ num, kicker, title, accent, body, demo, demoTitle, w, dark }) {
  const accentText = dark ? "text-[#fca5a5]" : "text-primary-strong";
  const kickerText = dark ? "text-white/80" : "text-muted";
  const bodyText = dark ? "text-white/[0.88]" : "text-sub";
  const headText = dark ? "text-white" : "text-ink";
  return (
    <div className="snappage snap mx-auto flex min-h-[100svh] w-full max-w-[760px] flex-col items-center justify-center py-[clamp(24px,4vh,48px)] text-center">
      <div className="reveal w-full max-w-[640px]">
        <div className="flex items-center justify-center gap-3">
          <span className={`font-mono text-[clamp(30px,3.4vw,40px)] font-extrabold leading-none tracking-[-0.04em] ${accentText}`}>{num}</span>
          <span className={`text-[12px] font-extrabold uppercase tracking-[0.08em] ${kickerText}`}>{kicker}</span>
        </div>
        <h3 className={`mt-4 text-[clamp(23px,2.8vw,33px)] font-extrabold leading-[1.2] tracking-[-0.038em] text-balance ${headText}`}>
          {title}<br /><span className={accentText}>{accent}</span>
        </h3>
        <p className={`mx-auto mt-3.5 max-w-[44ch] text-[15px] leading-[1.62] tracking-[-0.011em] ${bodyText}`}>{body}</p>
      </div>
      <div className="reveal mt-8 w-full max-w-[520px] overflow-hidden">
        <DemoSlot src={demo} title={demoTitle} w={w} h={766} />
      </div>
    </div>
  );
}

/* ───────── 스코프 CSS (.lp-root 한정) ─────────
   ⚠️ scroll-snap·keyframe 전부 .lp-root 아래로만. 전역 html/앱에 누수 금지. */
const LP_CSS = `
.lp-root{scroll-snap-type:y proximity;scroll-behavior:smooth;-webkit-overflow-scrolling:touch}
.lp-root .snap,.lp-root .snappage{scroll-snap-align:start;scroll-snap-stop:normal}
.lp-root .snappage{min-height:100svh}
.lp-root a{color:inherit}
/* 줄맞춤 — 헤딩은 줄 길이 균형(balance), 본문은 마지막 줄 외톨이 단어 방지(pretty).
   수동 <br>은 그대로 존중되고, 자동 줄바꿈만 개선된다(미지원 브라우저는 무시). */
.lp-root h1,.lp-root h2,.lp-root h3,.lp-root h4{text-wrap:balance}
.lp-root p,.lp-root li span,.lp-root summary{text-wrap:pretty}
.lp-root details summary::-webkit-details-marker{display:none}
.lp-root details[open] .faq-chev{transform:rotate(180deg)}
.lp-root .reveal{transition:opacity .5s ease,transform .56s cubic-bezier(.22,.9,.28,1);will-change:opacity,transform}
.lp-root.reveal-ready .reveal:not(.in){opacity:0;transform:translateY(24px)}
.lp-root .reveal.in{opacity:1;transform:none}
.lp-root .slam.in{animation:lp-slamin .56s cubic-bezier(.22,.9,.28,1) both}
@keyframes lp-slamin{0%{opacity:0;transform:scale(1.16)}55%{opacity:1}100%{opacity:1;transform:scale(1)}}
.lp-root .kill{position:relative;color:rgba(255,255,255,.5);white-space:nowrap}
.lp-root .kill::after{content:"";position:absolute;left:-3%;top:54%;width:0;height:6px;background:#dc2626;border-radius:4px;box-shadow:0 0 20px rgba(220,38,38,.75);transform:rotate(-1.2deg)}
.lp-root .slam.in .kill::after{animation:lp-strike .5s .45s cubic-bezier(.22,.9,.28,1) forwards}
@keyframes lp-strike{from{width:0}to{width:106%}}
.lp-root .built{display:inline-block}
.lp-root .builtline.in .built{animation:lp-builtpop .6s .22s cubic-bezier(.22,.9,.28,1) both}
@keyframes lp-builtpop{0%{opacity:0;transform:scale(.86) translateY(12px)}55%{opacity:1}100%{opacity:1;transform:none}}
.lp-root .scroll-cue{animation:lp-bob 1.8s ease-in-out infinite}
@keyframes lp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
@media(max-width:900px){.lp-root{scroll-snap-type:none}.lp-root .snappage{min-height:0}}
@media(prefers-reduced-motion:reduce){.lp-root *{animation:none!important;scroll-behavior:auto}.lp-root .reveal{opacity:1!important;transform:none!important;transition:none!important}}
`;
