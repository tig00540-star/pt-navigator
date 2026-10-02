"use client";

/* =========================================================================
   「오직 트레이너」 랜딩 (/lp) — 시안 A "앱 화면 중심" (2026-10-02)
   -------------------------------------------------------------------------
   왜 다시 만들었나: "글자가 너무 많고 한눈에 어떤 앱인지 알아보기 힘들다."
   레퍼런스 gymwork.pro의 원칙만 가져왔다 —
     ① 첫 화면은 두 줄 + 앱이 돌아가는 장면 하나
     ② 기능마다 '제목 한 줄 → 실제 앱 화면'(설명 문단 대신 화면이 증명)
     ③ 숫자는 크게, 설명은 짧게
   구 랜딩의 창업자 스토리·철학 비교·문제 카드·아이콘 기능 그리드는 걷어냈다
   (git 히스토리 참고). 창업자 이야기는 마지막 CTA 위 한 줄로만 남긴다.

   규율:
   - 실제 앱 화면 = public/lp/demos/*.html(실제 화면 모션 데모 · DemoSlot iframe). 목업 아님.
   - 색은 전역 @theme 토큰 유틸만. 레드는 누르는 곳/강조에만. 그라데이션·글로우 0.
   - 모션 없음(데모 자체가 움직임). 섹션 등장 애니메이션·스크롤 스냅 제거 —
     문서 스크롤 그대로라 #앵커가 네이티브로 동작하고 빈 화면 위험도 없다.
   - 가격은 lib/plans.js와 반드시 일치(랜딩↔결제 불일치 금지).
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
  { n: "30초", t: "말로 남기는 운동일지" },
  { n: "5분", t: "AI와 끝내는 OT 준비" },
  { n: "0건", t: "놓치는 재등록", accent: true },
];

const FEATURES = [
  {
    id: "ot",
    kicker: "신규 OT · 세일즈",
    title: ["세일즈 잘 모르겠으면,", "따라만 하세요."],
    steps: ["OT 보고서", "클로징 멘트", "거절 대응"],
    demo: "/lp/demos/ot-mockup-embed.html",
    demoTitle: "신규 OT 실제 화면",
  },
  {
    id: "rereg",
    kicker: "재등록",
    title: ["재등록 시기,", "앱이 먼저 알려줘요."],
    steps: ["만료 임박 알림", "변화 근거", "제안까지"],
    demo: "/lp/demos/ot-rereg-embed.html",
    demoTitle: "재등록 실제 화면",
  },
  {
    id: "member",
    kicker: "회원 전용 페이지",
    title: ["붙잡지 마세요.", "회원이 스스로 챙깁니다."],
    steps: ["운동일지·인바디", "출석 집계", "변화 그래프"],
    demo: "/lp/demos/ot-member-embed.html",
    demoTitle: "회원 전용 페이지 실제 화면",
  },
];

// 아이콘 타일 그리드 대신 한 줄 — 있다는 것만 알리면 된다.
const MORE = ["급여 자동계산", "스케줄·노쇼", "오운완 챌린지", "운동 라이브러리", "내 실적 리포트"];

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

/* 단계 흐름 칩 — 설명 문장 대신. 마지막 칸이 '앱이 끝내주는 지점'. */
function Steps({ steps, dark = false, center = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1 gap-y-2 ${center ? "justify-center" : ""}`}>
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
        {/* ── 첫 화면: 두 줄 + 앱이 돌아가는 장면 ── */}
        <section className={`${WRAP} grid items-center gap-10 pb-16 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pb-24 lg:pt-20`}>
          <div className="text-center lg:text-left">
            <h1 className="text-[clamp(34px,6.2vw,62px)] font-extrabold leading-[1.18] tracking-[-0.045em]">
              수업만 하세요.<br />
              <span className="text-primary">나머지는 앱이 합니다.</span>
            </h1>
            <p className="mt-5 text-[clamp(16px,1.9vw,19px)] leading-[1.6] text-sub">OT 준비 · 운동일지 · 재등록 · 정산까지</p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center lg:justify-start">
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" /></a>
              {/* InstallAppButton은 자체 클래스(레드 채움)를 갖고 있어 겹치는 속성은 !로 덮는다. */}
              <InstallAppButton
                className="!min-h-[52px] justify-center !rounded-xl !border !border-line-strong !bg-card !px-6 !py-0 !text-[16px] !text-ink hover:!bg-elevate"
                label="앱처럼 설치"
              />
            </div>
            <p className="mt-3.5 text-[14px] text-muted">설치 없이 폰에서 바로 · 7일 무료 체험</p>
          </div>

          <figure className="m-0">
            <div className="mx-auto w-full max-w-[460px] lg:max-w-[520px]">
              <DemoSlot src="/lp/demos/ot-voicelog-embed.html" title="운동일지 실제 화면 — 말로 남기면 정리됩니다" w={DEMO_W} h={DEMO_H} />
            </div>
            <figcaption className="mx-auto mt-5 max-w-[460px] text-center lg:max-w-[520px]">
              <div className="text-[19px] font-extrabold tracking-[-0.03em]">쓰지 말고, 말하세요.</div>
              <div className="mt-3"><Steps steps={["수업", "말로 복기", "회원에게 전송"]} center /></div>
            </figcaption>
          </figure>
        </section>

        {/* ── 숫자 ── */}
        <section aria-label="오직 트레이너로 줄어드는 시간" className="bg-bg">
          <div className={`${WRAP} grid grid-cols-3 gap-3 py-10 text-center sm:py-14`}>
            {PROOF.map((p) => (
              <div key={p.t}>
                <div className={`text-[clamp(30px,5vw,52px)] font-extrabold leading-none tracking-[-0.045em] tabular-nums ${p.accent ? "text-primary" : "text-ink"}`}>{p.n}</div>
                <div className="mt-2.5 text-[clamp(13px,1.5vw,16px)] font-medium leading-[1.4] text-sub">{p.t}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 기능: 제목 한 줄 → 실제 화면 ── */}
        <section id="features" className="scroll-mt-16">
          {FEATURES.map((f, i) => (
            <div key={f.id} className={`${WRAP} grid items-center gap-8 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24 ${i > 0 ? "border-t border-line" : ""}`}>
              <div className={`text-center lg:text-left ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <div className="text-[14px] font-extrabold text-primary-strong">{f.kicker}</div>
                <h2 className={`${H2} mt-2.5`}>{f.title[0]}<br />{f.title[1]}</h2>
                <div className="mt-6 flex justify-center lg:justify-start"><Steps steps={f.steps} center /></div>
              </div>
              <div className={`mx-auto w-full max-w-[460px] lg:max-w-[520px] ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                <DemoSlot src={f.demo} title={f.demoTitle} w={DEMO_W} h={DEMO_H} />
              </div>
            </div>
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
          <div className={`${WRAP} grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24`}>
            <div className="text-center lg:text-left">
              <div className="text-[14px] font-extrabold text-[#fca5a5]">센터 대표님께</div>
              <h2 className={`${H2} mt-2.5`}>센터 숫자를<br />한 화면에서.</h2>
              <div className="mt-6 flex justify-center lg:justify-start">
                <Steps steps={["매출·정산", "등록과 이탈", "트레이너별 성과"]} dark center />
              </div>
              <a href={contactHref()} className={`mt-8 inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-white px-6 text-[16px] font-extrabold text-ink no-underline transition-colors hover:bg-white/90 ${FOCUS} focus-visible:ring-offset-ink`}>
                센터 도입 문의 <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
              </a>
            </div>
            <div className="mx-auto w-full max-w-[460px] lg:max-w-[520px]">
              <DemoSlot src="/lp/demos/ot-admin-revenue-embed.html" title="대표 대시보드 실제 화면 — 이달 매출 현황" w={DEMO_W} h={DEMO_H} />
            </div>
          </div>
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

        {/* ── 마무리 ── */}
        <section className="border-t border-line">
          <div className={`${WRAP} py-16 text-center sm:py-24`}>
            <p className="text-[15px] font-semibold text-sub">트레이너 10년, 팀장까지 해본 사람이 직접 만들었습니다.</p>
            <h2 className={`${H2} mt-4`}>오늘 수업 끝나고<br />바로 써보세요.</h2>
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
