"use client";

/* =========================================================================
   「오직 트레이너」 랜딩 (/lp) — 시안 A "앱 화면 중심" (2026-10-02)
   -------------------------------------------------------------------------
   왜 다시 만들었나: "글자가 너무 많고 한눈에 어떤 앱인지 알아보기 힘들다."
   레퍼런스 gymwork.pro의 원칙 —
     ① 첫 화면은 두 줄 + 행동 버튼
     ② 기능마다 '제목 → 흐름 → 구체 효과 3줄 → 실제 앱 화면'
     ③ 숫자는 크게, 설명은 짧게(문단 대신 한 줄짜리 체크)
   ⚠️ 1차 재구성(236952d)은 너무 깎아서 "아무 내용이 없다"는 피드백 — 제목+칩만 남아
   '왜 필요한지'와 '무엇을 해주는지'가 사라졌었다. 이번 판은 왜(전→후 4줄)와 기능별 효과
   3줄을 되살리되 문단은 쓰지 않는다. 밀도 기준 = 짐워크(기능마다 제목 + 짧은 줄 2~3개 + 화면).

   규율:
   - 실제 앱 화면 = public/lp/demos/*.html(실제 화면 모션 데모 · DemoSlot iframe). 목업 아님.
     데모는 각 1번만 쓴다(같은 화면 반복 금지).
   - 색은 전역 @theme 토큰 유틸만. 레드는 누르는 곳/강조에만. 그라데이션·글로우 0.
   - 섹션 등장 애니메이션·스크롤 스냅 없음(데모 자체가 움직임 · 문서 스크롤이라 #앵커 네이티브).
   - 가격은 lib/plans.js에서 직접 읽는다(랜딩↔결제 불일치 금지).
   - 효과 문구는 실제 동작하는 기능만(CLAUDE.md·PRODUCT.md 실동작 목록 기준).
   ========================================================================= */

import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Check } from "lucide-react";
import DemoSlot from "./DemoSlot";
import CompanyInfo from "@/components/CompanyInfo";
import InstallAppButton from "@/components/InstallAppButton";
import { contactHref } from "@/lib/company";
import { PLANS } from "@/lib/plans";

/* ───────── 데이터 ───────── */

// 데모 캔버스 폭 — 신규등록·재등록 데모는 폰이 가로로 돌아(세일즈북) 폭이 커서 524로 통일.
const DEMO_W = 524;
const DEMO_H = 766;

const PROOF = [
  { n: "30초", t: "말로 남기는\n운동일지" },
  { n: "5분", t: "AI와 끝내는\nOT 준비" },
  { n: "0건", t: "놓치는\n재등록", accent: true },
];

// 왜 — 수업 밖 업무가 시간을 먹는다. 전 → 후 한 줄씩.
const WHY = [
  { before: "일지·기록에 매일 40분", after: "말로 30초" },
  { before: "OT 준비는 매번 백지에서", after: "AI가 대사·근거까지" },
  { before: "재등록은 기억력에 의존", after: "앱이 먼저 알림" },
  { before: "회원이 늘수록 관리도 두 배", after: "회원이 셀프로 관리" },
];

const FEATURES = [
  {
    id: "log",
    kicker: "운동일지",
    title: ["쓰지 말고,", "말하세요."],
    steps: ["수업", "말로 복기", "회원에게 전송"],
    points: ["운동별 무게·횟수·세트를 알아서 정리", "회원에게 보낼 일지까지 한 번에", "세션 차감·출석 기록도 자동"],
    demo: "/lp/demos/ot-voicelog-embed.html",
    demoTitle: "운동일지 실제 화면 — 말로 남기면 정리됩니다",
  },
  {
    id: "ot",
    kicker: "신규 OT · 세일즈",
    title: ["세일즈 잘 모르겠으면,", "따라만 하세요."],
    steps: ["OT 보고서", "클로징 멘트", "거절 대응"],
    points: ["회원 정보로 만드는 맞춤 OT 진행 순서", "수업 직전 3분, 바로 말할 클로징 멘트", "가격·'생각해볼게요' 등 거절 5가지 대응"],
    demo: "/lp/demos/ot-mockup-embed.html",
    demoTitle: "신규 OT 실제 화면",
  },
  {
    id: "rereg",
    kicker: "재등록",
    title: ["재등록 시기,", "앱이 먼저 알려줘요."],
    steps: ["만료 임박 알림", "변화 근거", "제안까지"],
    points: ["잔여가 줄어든 회원을 '오늘 챙길 것'에 먼저", "인바디·운동일지로 그동안의 변화 정리", "재등록 제안 멘트까지 준비"],
    demo: "/lp/demos/ot-rereg-embed.html",
    demoTitle: "재등록 실제 화면",
  },
  {
    id: "member",
    kicker: "회원 전용 페이지",
    title: ["붙잡지 마세요.", "회원이 스스로 챙깁니다."],
    steps: ["링크 하나", "기록 열람", "출석 챌린지"],
    points: ["설치 없이 링크로 여는 회원 전용 페이지", "운동일지·인바디·변화 그래프를 회원이 직접", "출석이 쌓이는 오운완 챌린지와 포상"],
    demo: "/lp/demos/ot-member-embed.html",
    demoTitle: "회원 전용 페이지 실제 화면",
  },
];

// 아이콘 타일 그리드 대신 한 줄 — 있다는 것만 알리면 된다.
const MORE = ["급여 자동계산", "스케줄·노쇼", "운동 라이브러리", "내 실적 리포트", "센터 공지"];

const OWNER = [
  {
    id: "numbers",
    title: ["센터 숫자를", "한 화면에서."],
    points: ["이달 매출과 목표 달성률, 다음달 예상", "정산 — 매출·지출·순이익을 기간별로", "트레이너별 등록률·재등록률·성과"],
    demo: "/lp/demos/ot-admin-revenue-embed.html",
    demoTitle: "대표 화면 실제 화면 — 이달 매출 현황",
  },
  {
    id: "briefing",
    title: ["오늘 챙길 것,", "아침에 바로."],
    points: ["이탈 위험·재등록 대상 회원을 급한 순서로", "오늘 신규 OT 예정과 명단", "트레이너 코칭까지 담은 AI 운영 보고서"],
    demo: "/lp/demos/ot-admin-briefing-embed.html",
    demoTitle: "대표 화면 실제 화면 — 오늘 챙길 것",
  },
];

const TIERS = [
  {
    key: "solo",
    tagline: "개인 트레이너 1인",
    feats: [
      ["1·2차 OT · 재등록 서포트", false],
      ["음성 운동일지 · AI 리포트", false],
      ["회원 전용 페이지 (성과 그래프·비포애프터)", true],
      ["실적 · 급여 자동계산", false],
    ],
    highlight: true,
  },
  {
    key: "center",
    tagline: "트레이너 3인 + 대표 1인",
    feats: [
      ["솔로 전체 포함", false],
      ["대표 대시보드 (매출·정산·등록·이탈)", true],
      ["트레이너 3인 좌석 + 대표 1인", false],
      ["트레이너 코칭 · 팀 관리", false],
    ],
    highlight: false,
  },
];

const FAQ = [
  { q: "설치해야 하나요?", a: "아니요. 브라우저로 바로 쓰고, 홈 화면에 추가하면 앱처럼 열립니다." },
  { q: "어떤 기기에서 되나요?", a: "폰에 맞춰 만들었고, 태블릿·PC에서도 그대로 열립니다." },
  { q: "AI가 대신 팔아주나요?", a: "아니요. 관찰은 트레이너가, 근거 정리는 AI가 맡습니다." },
  { q: "회원 정보는 안전한가요?", a: "계정별로 데이터가 분리되고, 회원은 본인 것만 봅니다." },
  { q: "혼자 하는데도 되나요?", a: "네. 솔로 플랜으로 쓰고 급여·실적도 본인 기준으로 계산됩니다." },
  { q: "의료·재활 목적인가요?", a: "아니요. 운동 지도·세일즈·회원관리 도구입니다." },
];

/* ───────── 공용 스타일 ───────── */

const WRAP = "mx-auto w-full max-w-[1120px] px-5 sm:px-8";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
const BTN_PRIMARY = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[16px] font-extrabold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-primary-strong ${FOCUS}`;
const BTN_GHOST = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-6 text-[16px] font-bold tracking-[-0.01em] text-ink no-underline transition-colors hover:bg-elevate ${FOCUS}`;
const H2 = "text-[clamp(28px,4.2vw,44px)] font-extrabold leading-[1.22] tracking-[-0.04em]";
const DEMO_BOX = "mx-auto w-full max-w-[460px] lg:max-w-[520px]";

/* ───────── 조각 ───────── */

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

/* 단계 흐름 칩 — 마지막 칸이 '앱이 끝내주는 지점'. 폰 폭에서 한 줄에 들어가게 라벨은 짧게. */
function Steps({ steps, dark = false }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 lg:justify-start">
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <span key={st} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} strokeWidth={2.6} className={dark ? "text-white/40" : "text-line-strong"} aria-hidden="true" />}
            <span
              className={`whitespace-nowrap rounded-full px-3 py-2 text-[13.5px] font-bold tracking-[-0.015em] sm:px-3.5 sm:text-[14px] ${
                last
                  ? dark ? "bg-primary text-white" : "bg-ink text-white"
                  : dark ? "bg-white/10 text-white" : "bg-bg text-ink"
              }`}
            >
              {st}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* 효과 3줄 — 문단 대신 한 줄짜리 체크. 폰에선 가운데 정렬 제목 아래 왼쪽 정렬 목록(읽기 쉬움). */
function Points({ points, dark = false }) {
  return (
    <ul className="mx-auto mt-6 flex max-w-[420px] list-none flex-col gap-3 p-0 text-left lg:mx-0">
      {points.map((p) => (
        <li key={p} className={`flex gap-2.5 text-[16px] leading-[1.5] ${dark ? "text-white/90" : "text-ink"}`}>
          <Check size={18} strokeWidth={3} className={`mt-[3px] flex-none ${dark ? "text-[#fca5a5]" : "text-primary"}`} aria-hidden="true" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

/* 기능 한 행 — 텍스트 | 실제 화면. PC는 홀짝으로 좌우 교차. */
function FeatureRow({ kicker, title, steps, points, demo, demoTitle, flip, dark, first }) {
  return (
    <div className={`${WRAP} grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24 ${first ? "" : dark ? "border-t border-white/10" : "border-t border-line"}`}>
      <div className={`text-center lg:text-left ${flip ? "lg:order-2" : ""}`}>
        {kicker && <div className={`text-[14px] font-extrabold ${dark ? "text-[#fca5a5]" : "text-primary-strong"}`}>{kicker}</div>}
        <h3 className={`${H2} ${kicker ? "mt-2.5" : ""}`}>{title[0]}<br />{title[1]}</h3>
        {steps && <div className="mt-6"><Steps steps={steps} dark={dark} /></div>}
        <Points points={points} dark={dark} />
      </div>
      <div className={`${DEMO_BOX} ${flip ? "lg:order-1" : ""}`}>
        <DemoSlot src={demo} title={demoTitle} w={DEMO_W} h={DEMO_H} />
      </div>
    </div>
  );
}

/* ───────── 페이지 ───────── */

export default function LandingPage() {
  const solo = PLANS.solo;

  return (
    <div className="min-h-dvh bg-card text-ink [word-break:keep-all]">
      <style>{LP_CSS}</style>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 border-b border-line bg-card/90 backdrop-blur-md">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-3`}>
          <a href="#top" className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-md no-underline ${FOCUS}`} aria-label="오직 트레이너 처음으로">
            <Sym size={26} />
            <span className="whitespace-nowrap text-[18px] font-extrabold tracking-[-0.035em]">
              <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="페이지 안내">
            {[["#features", "기능"], ["#owner", "대표님께"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]].map(([href, label]) => (
              <a key={href} href={href} className={`inline-flex min-h-[44px] items-center rounded-lg px-3.5 text-[15px] font-semibold text-sub no-underline transition-colors hover:text-ink ${FOCUS}`}>{label}</a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/login" className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-bold text-sub no-underline transition-colors hover:text-ink ${FOCUS}`}>로그인</Link>
            <a href="/signup" className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-ink px-4 text-[14px] font-bold text-white no-underline transition-colors hover:bg-[#2a2d35] ${FOCUS}`}>무료로 시작</a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ── 첫 화면: 두 줄 + 행동 ── */}
        <section className={`${WRAP} pb-14 pt-14 text-center sm:pt-20 lg:pb-20 lg:pt-24`}>
          <h1 className="text-[clamp(34px,6.4vw,68px)] font-extrabold leading-[1.16] tracking-[-0.045em]">
            수업만 하세요.<br />
            <span className="text-primary">나머지는 앱이 합니다.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[clamp(16px,1.9vw,20px)] leading-[1.6] text-sub">
            OT 준비부터 운동일지·재등록·정산까지,<br className="sm:hidden" /> 트레이너의 수업 밖 업무를 앱이 맡습니다.
          </p>
          <div className="mx-auto mt-8 flex max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
            <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" /></a>
            {/* InstallAppButton은 자체 클래스(레드 채움)를 갖고 있어 겹치는 속성은 !로 덮는다. */}
            <InstallAppButton
              className="!min-h-[52px] justify-center !rounded-xl !border !border-line-strong !bg-card !px-6 !py-0 !text-[16px] !text-ink hover:!bg-elevate"
              label="앱처럼 설치"
            />
          </div>
          <p className="mt-3.5 text-[14px] text-muted">설치 없이 폰에서 바로 · 7일 무료 체험</p>
        </section>

        {/* ── 숫자 ── */}
        <section aria-label="오직 트레이너로 줄어드는 시간" className="bg-bg">
          <div className={`${WRAP} grid grid-cols-3 gap-3 py-10 text-center sm:py-14`}>
            {PROOF.map((p) => (
              <div key={p.t}>
                <div className={`text-[clamp(30px,5vw,52px)] font-extrabold leading-none tracking-[-0.045em] tabular-nums ${p.accent ? "text-primary" : "text-ink"}`}>{p.n}</div>
                <div className="mt-2.5 whitespace-pre-line text-[clamp(13px,1.5vw,16px)] font-medium leading-[1.4] text-sub">{p.t}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 왜: 수업 밖 업무 ── */}
        <section className={`${WRAP} py-16 sm:py-20 lg:py-24`}>
          <h2 className={`${H2} text-center`}>수업은 2시간,<br /><span className="text-primary-strong">수업 밖 업무는 4시간.</span></h2>
          <p className="mx-auto mt-4 max-w-[520px] text-center text-[16px] leading-[1.6] text-sub">일지·상담 준비·재등록 챙기기. 실력이 아니라 시간을 먹는 일들을 앱에 넘기세요.</p>
          <ul className="mx-auto mt-10 grid max-w-[880px] list-none gap-3 p-0 sm:grid-cols-2">
            {WHY.map((w) => (
              <li key={w.before} className="flex flex-col items-start gap-1.5 rounded-2xl border border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-[15px] text-muted line-through decoration-line-strong">{w.before}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[15.5px] font-extrabold text-ink">
                  <ArrowRight size={16} strokeWidth={2.6} className="text-primary" aria-hidden="true" />{w.after}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 기능: 제목 → 흐름 → 효과 3줄 → 실제 화면 ── */}
        <section id="features" className="scroll-mt-16 border-t border-line">
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.id} {...f} flip={i % 2 === 1} first={i === 0} />
          ))}

          <div className={`${WRAP} border-t border-line py-12 text-center sm:py-14`}>
            <p className="text-[17px] font-bold tracking-[-0.02em]">그리고 수업 밖 나머지도</p>
            <div className="mx-auto mt-4 flex max-w-[640px] flex-wrap justify-center gap-2">
              {MORE.map((m) => (
                <span key={m} className="rounded-full bg-bg px-3.5 py-2 text-[14px] font-semibold text-ink">{m}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 대표님께 ── */}
        <section id="owner" className="scroll-mt-16 bg-ink text-white">
          <div className={`${WRAP} pt-16 text-center sm:pt-20 lg:pt-24`}>
            <div className="text-[14px] font-extrabold text-[#fca5a5]">센터 대표님께</div>
            <h2 className={`${H2} mt-2.5`}>감으로 보던 센터를,<br />숫자로 봅니다.</h2>
            <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.6] text-white/80">매출은 월말에야, 이탈은 회원이 떠난 뒤에야 알던 일을 먼저 보여드려요.</p>
            <a href={contactHref()} className={`mt-7 inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-white px-6 text-[16px] font-extrabold text-ink no-underline transition-colors hover:bg-white/90 ${FOCUS} focus-visible:ring-offset-ink`}>
              센터 도입 문의 <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </a>
          </div>
          {OWNER.map((o, i) => (
            <FeatureRow key={o.id} {...o} flip={i % 2 === 1} dark first={false} />
          ))}
        </section>

        {/* ── 가격 ── */}
        <section id="pricing" className="scroll-mt-16 bg-bg">
          <div className={`${WRAP} py-16 sm:py-20 lg:py-24`}>
            <div className="text-center">
              <h2 className={H2}>7일 무료로 먼저 써보세요.</h2>
              <p className="mt-3.5 text-[16px] text-sub">신규·재등록 <b className="font-bold text-ink">1건만 더</b> 나와도 회수됩니다.</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-[760px] gap-4 sm:grid-cols-2">
              {TIERS.map((tier) => {
                const plan = PLANS[tier.key];
                return (
                  <div key={tier.key} className={`relative flex flex-col rounded-2xl bg-card p-6 ${tier.highlight ? "border-2 border-primary" : "border border-line"}`}>
                    {tier.highlight && (
                      <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[12px] font-bold text-white">추천</span>
                    )}
                    <h3 className="text-[20px] font-extrabold tracking-[-0.03em]">{plan.name}</h3>
                    <p className="mt-1 text-[14px] text-muted">{tier.tagline}</p>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-[32px] font-extrabold tracking-[-0.035em] tabular-nums">{plan.amount.toLocaleString("ko-KR")}</span>
                      <span className="text-[15px] font-bold">원</span>
                      <span className="text-[14px] text-muted">/ 월</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[13px] text-muted line-through">정가 {plan.regular.toLocaleString("ko-KR")}원</span>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-bold text-primary-strong">얼리버드</span>
                    </div>
                    <ul className="mt-5 flex flex-1 list-none flex-col gap-2.5 p-0">
                      {tier.feats.map(([tx, strong]) => (
                        <li key={tx} className={`flex gap-2 text-[15px] leading-[1.45] ${strong ? "font-semibold text-ink" : "text-sub"}`}>
                          <Check size={16} strokeWidth={3} className="mt-[3px] flex-none text-primary" aria-hidden="true" />{tx}
                        </li>
                      ))}
                    </ul>
                    <a href="/signup" className={`mt-6 ${tier.highlight ? BTN_PRIMARY : BTN_GHOST}`}>7일 무료 체험</a>
                  </div>
                );
              })}
            </div>
            <p className="mt-7 text-center text-[14px] leading-[1.7] text-muted">부가세 별도 · 7일 무료 후 자동결제 · 언제든 해지</p>
          </div>
        </section>

        {/* ── 자주 묻는 질문 ── */}
        <section id="faq" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-[760px] px-5 py-16 sm:px-8 sm:py-20">
            <h2 className={`${H2} text-center`}>자주 묻는 질문</h2>
            <div className="mt-8">
              {FAQ.map(({ q, a }, i) => (
                <details key={q} open={i === 0} className="lp-faq border-b border-line">
                  <summary className={`flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16.5px] font-bold tracking-[-0.02em] ${FOCUS}`}>
                    {q}
                    <ChevronDown size={20} className="lp-faq-chev flex-none text-muted transition-transform" aria-hidden="true" />
                  </summary>
                  <p className="mb-5 text-[15px] leading-[1.7] text-sub">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 만든 사람 · 마무리 ── */}
        <section className="border-t border-line">
          <div className={`${WRAP} py-16 text-center sm:py-24`}>
            <p className="mx-auto max-w-[560px] text-[clamp(18px,2.2vw,22px)] font-bold leading-[1.5] tracking-[-0.03em]">
              트레이너 경력 10년. 팀장·관리자까지 다 해본 사람이<br />
              <span className="text-primary-strong">답답해서 직접 만들었습니다.</span>
            </p>
            <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-sub">어플·노션·스프레드시트를 다 써봤지만 타이핑은 그대로였습니다. 수업 밖 업무를 전부 여기에 녹였습니다.</p>
            <h2 className={`${H2} mt-14`}>오늘 수업 끝나고<br />바로 써보세요.</h2>
            <div className="mt-8 flex justify-center">
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" /></a>
            </div>
            <p className="mt-3.5 text-[14px] text-muted">월 {solo.amount.toLocaleString("ko-KR")}원부터</p>
          </div>
        </section>

        {/* ── 푸터 ── */}
        <footer className="border-t border-line bg-bg">
          <div className={`${WRAP} flex flex-wrap items-start justify-between gap-6 py-10`}>
            <div>
              <div className="flex items-center gap-2.5">
                <Sym size={22} />
                <span className="whitespace-nowrap text-[16.5px] font-extrabold tracking-[-0.03em]">
                  <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
                </span>
              </div>
              <p className="mt-3 max-w-[420px] text-[13px] leading-[1.6] text-muted">
                오직 트레이너는 운동 지도·세일즈·회원관리 도구입니다.<br />의료기관이 아니며 치료·진단을 제공하지 않습니다.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-5" aria-label="바닥글">
              {[["#features", "기능"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"], ["/download", "설치 안내"]].map(([href, label]) => (
                <a key={label} href={href} className={`inline-flex min-h-[44px] items-center rounded-md text-[14px] text-sub no-underline transition-colors hover:text-ink ${FOCUS}`}>{label}</a>
              ))}
            </nav>
          </div>
          <div className={`${WRAP} border-t border-line pb-10 pt-6`}>
            <CompanyInfo />
            <p className="mt-4 text-[12px] text-muted">© 2026 오직 트레이너</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ───────── 스코프 CSS ───────── */
const LP_CSS = `
.lp-faq summary::-webkit-details-marker{display:none}
.lp-faq[open] .lp-faq-chev{transform:rotate(180deg)}
@media(prefers-reduced-motion:reduce){.lp-faq-chev{transition:none!important}}
`;
