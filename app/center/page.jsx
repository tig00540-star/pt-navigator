"use client";

/* =========================================================================
   「오직 트레이너」 센터 대표용 랜딩 (/center) — v5 (2026-10-02)
   -------------------------------------------------------------------------
   기준: Claude Design 시안(docs/design/landing) = 기획안 v5(docs/lp-claude-design-기획안.md) §6.
   - 대표는 '트레이너 감시 도구'가 아니라 '트레이너가 먼저 편해지고, 그 결과가 숫자로 보이는 센터'를 산다.
   - 먹색 구간을 넓게(첫 화면·대표 화면·마무리) — 대표 화면 느낌. 나머지는 트레이너용과 같은 브랜드.
   - 주 행동 = 도입 문의(카카오톡 채널) · 보조 = 센터로 7일 무료 시작(/signup?type=center).
   - 대표 화면 = 실제 화면 데모(public/lp/demos · 데모 계정 숫자) — 스크린샷이 생기면 교체.
   - 공개 페이지: AuthGate isPublicMarketing에 /center 포함.
   ========================================================================= */

import { useRef } from "react";
import { contactHref } from "@/lib/company";
import { PLANS } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, BTN_GHOST_DARK, Header, Footer, useReveal, stagger,
  Checks, FeatureRow, GroupLabel, BeforeAfter, Faq, Arrow, LP_CSS,
} from "../lp/parts";

const SIGNUP_CENTER = "/signup?type=center";

const WHY = [
  ["매출은 월말 정산 때야 안다", "이달 매출·다음달 예상을 실시간으로"],
  ["OT는 많은데 등록이 안 되는 이유를 모른다", "어디서 새는지 단계별로"],
  ["회원이 떠난 뒤에야 안다", "이탈 위험·만료 임박을 먼저"],
  ["트레이너 평가가 감에 의존한다", "트레이너별 등록률·재등록률·수업 수"],
];

const ROWS = [
  {
    pill: "오늘 챙길 것",
    title: ["아침에 열면,", "오늘 할 일부터."],
    checks: ["이탈 위험·재등록 대상 회원을 급한 순서로", "오늘 신규 OT 예정과 명단", "트레이너 코칭까지 담은 AI 운영 보고서"],
    note: "대표 화면을 열면 그날 보고서가 자동으로 만들어져요",
    visual: { demo: "/lp/demos/ot-admin-briefing-embed.html", alt: "대표 화면 실제 데모 — 오늘 챙길 것" },
  },
  {
    pill: "매출 · 정산",
    title: ["월말까지 기다리지", "마세요."],
    checks: ["이달 매출 현황 — 목표·현재·달성률, 트레이너별 목표", "다음달 예상 매출", "정산 — PT·FC·기타 매출과 지출, 순이익을 센터 정산일 기준으로"],
    note: "정산 기준일을 센터에 맞게 정할 수 있어요",
    visual: { demo: "/lp/demos/ot-admin-revenue-embed.html", alt: "대표 화면 실제 데모 — 이달 매출 현황" },
  },
  {
    pill: "등록 · 이탈",
    title: ["어디서 새는지,", "숫자로 보입니다."],
    checks: ["신규 OT → 1차 → 2차 → 등록, 단계별로 몇 명이 빠지는지", "달마다 등록률 — 나아지고 있는지", "이탈 위험·만료 임박 명단을 바로 펼쳐보기"],
    note: "트레이너별 등록률·재등록률은 트레이너 화면에서",
    visual: { demo: "/lp/demos/ot-admin-funnel-embed.html", alt: "대표 화면 실제 데모 — 등록 깔때기" },
  },
];

const OPS = ["트레이너 초대", "회원 등록·배정", "회원 인계(잔여 세션 이월)", "급여 자동계산·확정", "필수 공지", "스케줄·노쇼"];

const STEPS = [
  ["센터 계정 만들기", "7일 무료로 시작"],
  ["트레이너 초대", "최대 3명, 이메일로 계정 발급"],
  ["회원 등록·배정", "그날부터 숫자가 쌓입니다"],
];

const FAQ = [
  { q: "트레이너가 4명 이상이면요?", a: "문의해 주세요. 센터 규모에 맞춰 안내드립니다." },
  { q: "트레이너들이 싫어하지 않을까요?", a: "트레이너의 일지·OT 준비·재등록 챙기기를 덜어주는 앱이라, 트레이너가 먼저 편해집니다." },
  { q: "다른 센터와 데이터가 섞이지 않나요?", a: "센터별로 완전히 분리되고, 매출·정산 화면은 대표만 봅니다." },
  { q: "기존 PT 회원은 어떻게 옮기나요?", a: "회원을 등록할 때 '인계받은 PT'로 남은 세션을 이어서 등록할 수 있습니다." },
  { q: "결제는 어떻게 되나요?", a: "7일 무료 후 월 자동결제이고, 언제든 해지할 수 있습니다." },
];

export default function CenterLandingPage() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  const plan = PLANS.center;
  const contact = contactHref();

  return (
    <div ref={rootRef} className="min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header
        page="center"
        nav={[["#features", "대표 화면"], ["#process", "도입 방법"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
        cta={{ label: "도입 문의", href: contact }}
      />

      <main>
        {/* ② 첫 화면(먹색) — 효과 없음 */}
        <section className="bg-ink px-5 py-[clamp(56px,11vw,120px)] text-white">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <span className="inline-flex min-h-[34px] items-center rounded-full border border-white/15 bg-white/10 px-4 text-[14px] font-bold text-red-300">
              트레이너 3인 + 대표 1인 · 센터용
            </span>
            <h1 className="m-0 text-[clamp(36px,8vw,60px)] font-black leading-[1.16] tracking-[-0.045em]">
              <span className="block">감으로 보던 센터를,</span>
              <span className="block text-red-300">숫자로 봅니다.</span>
            </h1>
            <p className="m-0 max-w-[520px] text-[clamp(17px,2.6vw,20px)] leading-[1.6] text-white/75">
              트레이너는 수업에만, 대표는 숫자로. 매출·정산·등록과 이탈을 한 화면에서.
            </p>
            <div className="mt-1.5 flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
              <a href={contact} className={BTN_PRIMARY}>센터 도입 문의 <Arrow /></a>
              <a href={SIGNUP_CENTER} className={BTN_GHOST_DARK}>센터로 7일 무료 시작</a>
            </div>
            <p className="m-0 text-[14px] text-white/60">트레이너 3인 + 대표 1인 · 7일 무료 체험</p>
          </div>
        </section>

        {/* ③ 왜 */}
        <section className="bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">문제는 늘,</span>
              <span className="block text-primary">뒤늦게 보입니다.</span>
            </h2>
            <div className="flex w-full justify-center"><BeforeAfter rows={WHY} /></div>
          </div>
        </section>

        {/* ④ 대표 화면(먹색) */}
        <section id="features" className="scroll-mt-28 bg-ink px-5 py-[clamp(56px,10vw,104px)] text-white">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-16 text-center">
            <GroupLabel dark>대표 화면</GroupLabel>
            {ROWS.map((r) => <FeatureRow key={r.pill} {...r} dark />)}
            <div className="rv flex flex-col items-center gap-3.5">
              <p className="m-0 text-[17px] font-extrabold">운영도 손이 덜 가게</p>
              <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
                {OPS.map((m) => (
                  <span key={m} className="rounded-full bg-white/10 px-3.5 py-2 text-[14px] font-semibold text-white/85">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ⑤ 트레이너가 먼저 좋아하는 앱 → 트레이너용 페이지 */}
        <section className="bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px] text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">트레이너가 편해야,</span>
              <span className="block text-primary">센터 숫자가 오릅니다.</span>
            </h2>
            <p className="rv m-0 max-w-[500px] text-[16px] leading-[1.6] text-sub" style={stagger(1)}>
              감시 도구가 아닙니다. 트레이너의 수업 밖 업무를 덜어주는 앱이고, 대표 화면의 숫자는 그 결과로 쌓입니다.
            </p>
            <div className="rv my-1.5" style={stagger(2)}>
              <Checks items={["말로 30초면 운동일지 끝", "OT 들어가기 전 3분, 바로 말할 클로징 멘트", "재등록 시기를 앱이 먼저 알림"]} />
            </div>
            <a href="/lp" className={`rv ${BTN_OUTLINE}`} style={stagger(3)}>트레이너용 페이지 보기 <Arrow /></a>
          </div>
        </section>

        {/* ⑥ 도입은 이렇게 — 순서 자체가 정보라 여기서만 번호 */}
        <section id="process" className="scroll-mt-28 bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <h2 className={`rv ${H2} ${H2_MD}`}>도입은 이렇게</h2>
            <ol className="m-0 w-full max-w-[560px] list-none rounded-2xl border border-line bg-card px-[22px] py-1.5 shadow-sm">
              {STEPS.map(([t, d], i) => (
                <li key={t} className={`rv flex items-center gap-4 py-[18px] text-left ${i ? "border-t border-line" : ""}`} style={stagger(i)}>
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-[16px] font-black text-white">{i + 1}</span>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-[17px] font-extrabold">{t}</strong>
                    <span className="text-[15px] text-sub">{d}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ⑦ 가격 */}
        <section id="pricing" className="scroll-mt-28 bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px]">
            <div className="rv flex w-full max-w-[520px] flex-col gap-[18px] rounded-2xl border border-line bg-card px-[clamp(22px,5vw,36px)] py-[clamp(28px,6vw,40px)] shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[22px] font-black">센터 플랜</span>
                <span className="text-[15px] text-sub">트레이너 3인 + 대표 1인</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-[clamp(40px,8vw,52px)] font-black tracking-[-0.04em] tabular-nums">{plan.amount.toLocaleString("ko-KR")}원</span>
                  <span className="text-[16px] text-sub">/월</span>
                </div>
                <div className="text-[14px] text-sub"><s>{plan.regular.toLocaleString("ko-KR")}원</s> · 얼리버드</div>
                <div className="text-[17px] font-extrabold text-primary-strong">하루 약 {wonApprox(plan.amount / 30)}</div>
              </div>
              <div className="border-t border-line pt-[18px]">
                <Checks items={["트레이너 앱 전체(OT·운동일지·재등록·회원 전용 페이지)", "대표 대시보드 (매출·정산·등록·이탈)", "트레이너 3인 좌석 + 대표 1인", "트레이너 코칭 · 팀 관리"]} />
              </div>
              <div className="flex flex-col gap-2">
                <a href={contact} className={`w-full ${BTN_PRIMARY}`}>센터 도입 문의</a>
                <a href={SIGNUP_CENTER} className={`w-full ${BTN_OUTLINE}`}>센터로 7일 무료 시작</a>
              </div>
            </div>
            <p className="m-0 text-center text-[13px] leading-[1.6] text-sub">
              부가세 별도 · 7일 무료 후 자동결제 · 언제든 해지<br />트레이너가 더 필요하면 문의해 주세요.
            </p>
          </div>
        </section>

        {/* ⑧ 자주 묻는 질문 */}
        <section id="faq" className="scroll-mt-28 bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <h2 className={`rv ${H2} ${H2_MD}`}>자주 묻는 질문</h2>
            <Faq items={FAQ} />
          </div>
        </section>

        {/* ⑨ 마무리(먹색) */}
        <section className="bg-ink px-5 py-[clamp(64px,12vw,120px)] text-white">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">이번 달 숫자부터,</span>
              <span className="block text-red-300">같이 보시죠.</span>
            </h2>
            <div className="rv flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center" style={stagger(1)}>
              <a href={contact} className={BTN_PRIMARY}>센터 도입 문의 <Arrow /></a>
              <a href={SIGNUP_CENTER} className={BTN_GHOST_DARK}>센터로 7일 무료 시작</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
