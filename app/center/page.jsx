"use client";

/* =========================================================================
   「오직 트레이너」 센터 대표용 랜딩 (/center) — v5 (2026-10-02)
   -------------------------------------------------------------------------
   기준: Claude Design 시안(docs/design/landing) = 기획안 v5(docs/lp-claude-design-기획안.md) §6.
   - 대표는 '트레이너 감시 도구'가 아니라 '트레이너가 먼저 편해지고, 그 결과가 숫자로 보이는 센터'를 산다.
   - 먹색 구간을 넓게(첫 화면·대표 화면·마무리) — 대표 화면 느낌. 나머지는 트레이너용과 같은 브랜드.
   - 주 행동 = 도입 문의(카카오톡 채널) · 보조 = 센터로 7일 무료 시작(/signup?type=center).
   - 대표 화면 = 데모 계정(가짜 회원)에서 찍은 실제 앱 캡처(public/lp/shots · 4:5).
   - 공개 페이지: AuthGate isPublicMarketing에 /center 포함.
   ========================================================================= */

import { useRef } from "react";
import { contactHref } from "@/lib/company";
import { PLANS, PACKS, SEAT_PRICE } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, BTN_GHOST_DARK, Header, Footer, useReveal, stagger,
  Checks, GroupLabel, BeforeAfter, Faq, Arrow, LP_CSS, Visual, TryLink, Pill, StepShots, Bundle, H3, FeatureGallery,
} from "../lp/parts";

const SIGNUP_CENTER = "/signup?type=center";

const WHY = [
  ["매출은 월말 정산 때야 안다", "이달 매출·다음달 예상을 실시간으로"],
  ["OT는 많은데 등록이 안 되는 이유를 모른다", "어디서 새는지 단계별로"],
  ["회원이 떠난 뒤에야 안다", "이탈 위험·만료 임박을 먼저"],
  ["배정한 OT 회원이 연락 없이 사라진다", "센터 QR 신청 → 배정 → 첫 OT까지 한눈에"],
  ["트레이너 평가가 감에 의존한다", "트레이너별 등록률·재등록률·수업 수"],
];

// 자동 보고 — 실제로 도는 것만(아침 보고서 cron · 월간 결산 cron · 폰 알림)
const AUTO_REPORTS = [
  ["매일 아침 8시대", "아침 보고서 · 어제 결과와 오늘 할 일"],
  ["매월 1일", "월간 결산 · 트레이너 면담 자료까지"],
  ["그때그때", "OT 신청 · 배정 대기를 폰 알림으로"],
];

// 다른 점 4가지(2026-10-06 · 트레이너 랜딩과 같은 틀) — '결과 장면'. 아래 묶음은 '과정 장면'.
const SPECIAL = [
  {
    n: "01", pill: "아침 보고서",
    title: ["아침에 열면,", "오늘 할 일부터."],
    desc: "AI 한 줄 총평 → 어제 결과(등록 · 보류 · 그만 · 이유 · 회원의 말) → 오늘 오는 OT · 재등록 회원. 결과 줄마다 트레이너에게 피드백을 남겨요.",
    visual: { img: "/lp/shots/2026-10/C01.webp", alt: "대표 아침 보고서: AI 한 줄 총평과 어제 결과(매출 · 신규 · 재등록 · 보류 · 그만)" },
  },
  {
    n: "02", pill: "월간 결산",
    title: ["매달 1일,", "트레이너 면담 자료까지."],
    desc: "지난달 숫자를 전달과 비교하고, 트레이너별 잘한 점 · 보완할 점 · 이번 달 해 볼 것 · 추천 목표까지. 보완할 점은 대표만 봐요.",
    steps: [
      { step: "센터 숫자", img: "/lp/shots/2026-10/C04.webp", alt: "대표 월간 결산: AI 한 줄 총평과 9월 센터 숫자(매출 · 목표 달성 · OT · 등록률)" },
      { step: "트레이너별", img: "/lp/shots/2026-10/C05.webp", alt: "월간 결산의 트레이너별 카드: 잘한 점 · 보완할 점(대표만) · 이번 달 해 볼 것" },
    ],
  },
  {
    n: "03", pill: "OT 신청 · 배정",
    title: ["OT 회원이", "새지 않게."],
    desc: "회원권 등록하는 자리에서 센터 QR로 신청하고, 대표가 트레이너를 고르면 그 트레이너 폰으로 바로 가요. 신청부터 등록까지 어디서 멈췄는지 보여요.",
    visual: { img: "/lp/shots/2026-10/C08.webp", alt: "대표 등록 · 이탈 탭의 OT 신청 · 배정: 배정 대기 신청과 원하는 시간 · 원하는 트레이너, 트레이너 고르기" },
    href: "/try#qr",
  },
  {
    n: "04", pill: "수업 증빙",
    title: ["종이 서명 대신,", "기록으로 남겨요."],
    desc: "회원이 운동일지를 확인하고 손가락으로 서명해요. 한 달 수업은 서명과 함께 수업 확인서 한 장으로, 인쇄 · PDF로 저장돼요.",
    visual: { img: "/lp/shots/2026-10/T19.webp", alt: "한 달 수업을 회원 서명과 함께 모은 수업 확인서" },
    href: "/try#sign",
  },
];

// 대표 화면 묶음 — 크게 1장 + 넘겨 보기(폰 화면 · PC 화면은 맨 끝 '태블릿 · PC 버전'에 모음)
const BUNDLES = [
  {
    id: "b-money", nav: "매출 · 정산",
    pill: "매출 · 정산",
    title: ["월말까지 기다리지", "마세요."],
    checks: ["이달 매출 현황: 목표 · 현재 · 달성률, 트레이너별 목표", "다음 달 예상 매출과 이번 주 들어올 매출 후보", "정산: PT · FC · 기타 매출과 지출, 순이익을 센터 정산일 기준으로"],
    note: "정산 기준일을 센터에 맞게 정할 수 있어요",
    hero: { img: "/lp/shots/2026-10/C06.webp", alt: "대표 화면의 이달 매출 현황(목표 · 현재 · 달성률, 트레이너별 목표)" },
    items: [
      { name: "다음 달 예상 매출", desc: "등록률 · 재등록률 · 평균 금액으로 계산", img: "/lp/shots/2026-10/C06b.webp", alt: "다음 달 예상 매출: 신규 유입 · 재등록에서 들어올 금액 추정" },
      { name: "들어올 매출", desc: "이번 주 등록 · 재등록 후보를 트레이너별로", img: "/lp/shots/2026-10/C03.webp", alt: "아침 보고서의 이달 · 앞으로 들어올 매출: 트레이너별 등록 · 재등록 후보(추정)" },
      { name: "정산", desc: "PT · FC · 기타 매출에서 지출 빼고 순이익", img: "/lp/shots/2026-10/C09.webp", alt: "정산 합계표: PT 매출 · FC 매출 · 기타 매출 · 지출 · 순이익" },
    ],
  },
  {
    id: "b-flow", nav: "등록 · 이탈",
    pill: "등록 · 이탈",
    title: ["어디서 새는지,", "숫자로 보입니다."],
    checks: ["신규 OT → 1차 → 2차 → 등록, 단계별로 몇 명이 빠지는지", "달마다 등록률이 나아지고 있는지", "만료 임박 · 이탈 위험 명단을 바로 펼쳐 보기"],
    note: "트레이너별 등록률 · 재등록률은 트레이너 화면에서",
    hero: { img: "/lp/shots/2026-10/C08b.webp", alt: "대표 화면의 신규 OT에서 PT 등록까지 깔때기" },
    items: [
      { name: "달마다 등록률", desc: "그 달에 들어온 회원 중 몇 %가 등록했는지", img: "/lp/shots/2026-10/C10.webp", alt: "달마다 등록률 막대 그래프" },
      { name: "오늘 예정", desc: "오늘 오는 OT · 재등록 기회 회원", img: "/lp/shots/2026-10/C02.webp", alt: "아침 보고서의 오늘 예정: 오늘 오는 OT 회원 · 만료 임박 회원 · 보류 회원" },
    ],
  },
  {
    id: "b-team", nav: "트레이너 관리",
    pill: "트레이너 관리",
    title: ["트레이너 평가,", "감이 아니라 숫자로."],
    checks: ["매출 · 1차/2차 등록률 · 재등록률 · 출석 · 이탈 위험으로 줄 세우기", "급여 방식대로 예상 급여를 계산하고 대표가 확정", "오늘 진행된 OT · 수업에서 놓친 것만 '오늘 코칭할 것'으로"],
    note: "트레이너 3인 + 대표 1인 · 트레이너는 자기 숫자만 봐요",
    hero: { img: "/lp/shots/2026-10/C07.webp", alt: "트레이너 리더보드: 이달 매출 · 담당 회원 · 등록률 · 재등록률" },
    items: [
      { name: "급여 확정", desc: "예상 급여 → 최종 금액 확정", img: "/lp/shots/2026-10/C14.webp", alt: "트레이너별 예상 급여와 최종 금액 확정" },
      { name: "'내용이 달라요'", desc: "회원이 일지를 고쳐 달라고 하면 기록으로", img: "/lp/shots/2026-10/T25.webp", alt: "회원이 '내용이 달라요'를 누른 운동일지와 회원 메모" },
    ],
  },
  {
    id: "b-ops", nav: "운영",
    pill: "운영",
    title: ["운영도", "손이 덜 가게."],
    checks: ["요일 · 시간대 예약 밀도와 완료 · 노쇼", "센터 전체 회원 이벤트 · 필수 공지", "회원 등록 · 배정 · 트레이너 인계(남은 수업 이월)"],
    note: "트레이너 초대 · 급여 방식 설정도 여기서",
    hero: { img: "/lp/shots/2026-10/C13.webp", alt: "대표 운영 탭의 회원 이벤트: 이벤트 만들기와 진행 중 이벤트" },
    items: [],
  },
];

const OPS = ["트레이너 초대", "회원 등록 · 배정", "회원 인계(남은 수업 이월)", "급여 자동계산 · 확정", "필수 공지", "스케줄 · 노쇼"];

// 태블릿 · PC 버전 — 대표 화면은 넓은 화면에서 더 많이 쓴다(2026-10-06 · 데모 센터 실제 화면)
const WIDE = [
  { device: "pc", name: "아침 보고서", desc: "총평 · 어제 결과 · 오늘 예정", img: "/lp/shots/2026-10/P03.webp", alt: "PC 아침 보고서: AI 총평과 어제 결과(건별)" },
  { device: "pc", name: "월간 결산", desc: "센터 숫자 · 트레이너별 면담 자료", img: "/lp/shots/2026-10/P09.webp", alt: "PC 월간 결산: 9월 센터 숫자와 트레이너별 잘한 점 · 보완할 점" },
  { device: "pc", name: "매출", desc: "이달 매출 · 다음 달 예상 · 6개월 추이", img: "/lp/shots/2026-10/P04.webp", alt: "PC 매출: 이달 매출 현황 · 다음 달 예상 매출 · 매출 구성 · 6개월 추이" },
  { device: "pc", name: "정산", desc: "PT · FC · 기타 매출 − 지출 = 순이익", img: "/lp/shots/2026-10/P10.webp", alt: "PC 정산: 기간별 PT 매출 · FC 매출 · 기타 매출 · 지출 · 순이익" },
  { device: "pc", name: "트레이너", desc: "센터 요약 · 리더보드 한 표", img: "/lp/shots/2026-10/P05.webp", alt: "PC 트레이너: 센터 요약과 트레이너 리더보드 표" },
  { device: "pc", name: "등록 · 이탈", desc: "깔때기 · 달마다 등록률 · 재등록과 이탈", img: "/lp/shots/2026-10/P06.webp", alt: "PC 등록 · 이탈: 깔때기 · 달마다 등록률 · 재등록률 · 만료 임박 · 이탈 위험" },
  { device: "pc", name: "스케줄", desc: "완료율 · 노쇼율 · 요일 · 시간대 밀도", img: "/lp/shots/2026-10/P07.webp", alt: "PC 스케줄: 최근 90일 예약 · 완료율 · 노쇼율 · 트레이너별 진행 수업 · 예약 밀도" },
  { device: "tablet", name: "대표 홈", desc: "오늘 챙길 것 · 이달 매출 · 등록과 이탈", img: "/lp/shots/2026-10/P08.webp", alt: "태블릿 대표 홈: 배정 대기 · 오늘 챙길 것 · 이달 매출 · 등록 · 이탈 · 순이익" },
];

const STEPS = [
  ["센터 계정 만들기", "7일 무료로 시작"],
  ["트레이너 초대", "최대 3명, 이메일로 계정 발급"],
  ["회원 등록·배정", "그날부터 숫자가 쌓입니다"],
];

const FAQ = [
  { q: "트레이너가 4명 이상이면요?", a: `트레이너 1명당 월 ${SEAT_PRICE.toLocaleString("ko-KR")}원으로 자리를 더할 수 있어요. 구독 관리에서 결제하면 바로 열려요.` },
  { q: "AI를 다 쓰면 어떻게 되나요?", a: `센터 전체가 함께 쓰는 한도예요(음성일지 월 ${PLANS.center.ai.voice}건 · OT · 재등록 대본 월 ${PLANS.center.ai.prep}번 · 자리 1개 추가마다 +100건 · +20번). 다 쓰면 그달만 추가 팩(대본 10번 ${PACKS.prep10.price.toLocaleString("ko-KR")}원 · 음성일지 50건 ${PACKS.voice50.price.toLocaleString("ko-KR")}원)을 살 수 있고, 7일 안에 안 썼으면 전액 환불돼요.` },
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
        nav={[["#special", "다른 점"], ["#features", "대표 화면"], ["#devices", "태블릿 · PC"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
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

        {/* ③-1 입력 없음 — 전부 자동으로 보고(2026-10-06 대표 문구) · 장부(FC 매출 · 지출)만 예외라 정직하게 한 줄 */}
        <section className="border-t border-line bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">대표님이 직접</span>
              <span className="block">입력하는 건 없습니다.</span>
            </h2>
            <p className="rv m-0 max-w-[520px] text-[clamp(17px,2.6vw,20px)] font-bold leading-[1.6] text-primary-strong" style={stagger(1)}>
              전부 자동으로 만들어지고, 보고드립니다.
            </p>
            <p className="rv m-0 max-w-[520px] text-[clamp(16px,2.4vw,18px)] leading-[1.6] text-sub" style={stagger(2)}>
              트레이너가 수업하며 남긴 운동일지 · OT 결과 · 계약 기록이 그대로 매출 · 등록률 · 이탈 숫자가 돼요. 대표님은 열어 보기만 하시면 돼요.
            </p>
            <ul className="m-0 grid w-full max-w-[600px] list-none gap-2.5 p-0 text-left sm:grid-cols-3">
              {AUTO_REPORTS.map(([when, what], i) => (
                <li key={when} className="rv rounded-2xl border border-line bg-card px-4 py-4 shadow-sm" style={stagger(i)}>
                  <div className="text-[14px] font-bold text-primary-strong">{when}</div>
                  <div className="mt-1 text-[16px] font-extrabold leading-[1.45]">{what}</div>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[13.5px] text-sub">센터 FC 매출 · 지출만 정산 장부에 한 줄씩 적어요.</p>
          </div>
        </section>

        {/* ③-2 다른 점 4가지 — 기능 설명 전에 먼저(2026-10-06 · 트레이너 랜딩과 같은 틀) */}
        <section id="special" className="scroll-mt-28 border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[clamp(56px,9vw,88px)] text-center">
            <div className="rv flex flex-col items-center gap-4">
              <Pill>핵심 4가지</Pill>
              <h2 className={`m-0 ${H2} ${H2_LG}`}>
                <span className="block">대표 화면은</span>
                <span className="block text-primary">이게 다릅니다.</span>
              </h2>
            </div>
            {SPECIAL.map((sp) => (
              <div key={sp.n} className="flex w-full flex-col items-center gap-5">
                <div className="rv flex flex-col items-center gap-3">
                  <span className="flex items-center gap-2 text-[15px] font-black text-primary">
                    <span className="tabular-nums tracking-[0.06em]">{sp.n}</span>
                    <span className="h-px w-5 bg-primary/40" aria-hidden="true" />
                    <span>{sp.pill}</span>
                  </span>
                  <h3 className={H3}>{sp.title[0]}<br />{sp.title[1]}</h3>
                  <p className="m-0 max-w-[520px] text-[clamp(16px,2.4vw,18px)] leading-[1.6] text-sub">{sp.desc}</p>
                </div>
                <div className="rv flex w-full flex-col items-center gap-4" style={stagger(1)}>
                  {sp.visual && <Visual {...sp.visual} />}
                  {sp.steps && <StepShots steps={sp.steps} />}
                  {sp.href && <TryLink href={sp.href} />}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ④ 대표 화면 묶음(먹색) — 크게 PC 화면 1장 + 폰 화면 넘겨 보기 */}
        <section id="features" className="scroll-mt-28 bg-ink px-5 py-[clamp(56px,10vw,104px)] text-white">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-16 text-center">
            <div className="rv flex flex-col items-center gap-4">
              <GroupLabel dark>대표 화면</GroupLabel>
              <nav aria-label="대표 화면 묶음" className="flex max-w-[600px] flex-wrap justify-center gap-2">
                {BUNDLES.map((b, i) => (
                  <a key={b.id} href={`#${b.id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-white/10">
                    <span className="tabular-nums text-red-300">{i + 1}</span> {b.nav}
                  </a>
                ))}
              </nav>
            </div>
            {BUNDLES.map((b) => (
              <Bundle key={b.id} {...b} dark>
                {b.id === "b-ops" && (
                  <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
                    {OPS.map((m) => (
                      <span key={m} className="rounded-full bg-white/10 px-3.5 py-2 text-[14px] font-semibold text-white/85">{m}</span>
                    ))}
                  </div>
                )}
              </Bundle>
            ))}
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
              <Checks items={["말로 30초면 운동일지 끝", "OT 들어가기 전 3분, 바로 말할 클로징 멘트", "재등록 시기를 앱이 먼저 알림", "수업 시간 맞추는 카톡 대신 예약 요청 · 승인"]} />
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

        {/* 태블릿 · PC 버전 제공 — 넓은 화면 모음(2026-10-06 대표) */}
        <section id="devices" className="scroll-mt-28 border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <Pill>태블릿 · PC 버전 제공</Pill>
            <h2 className={`rv m-0 ${H2} ${H2_LG}`}>
              <span className="block">대표 화면은</span>
              <span className="block text-primary">PC에서 더 크게.</span>
            </h2>
            <p className="rv m-0 max-w-[540px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              폰과 같은 계정으로 태블릿 · PC에서도 열려요. 화면이 넓어지면 보고서 · 매출 · 정산을 넓은 배치로 한눈에 봐요. 설치 없이 브라우저로.
            </p>
            <div className="rv w-full" style={stagger(2)}><FeatureGallery items={WIDE} label="태블릿 · PC 대표 화면" /></div>
          </div>
        </section>

        {/* ⑦ 가격 */}
        <section id="pricing" className="scroll-mt-28 bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px]">
            <div className="rv flex w-full max-w-[520px] flex-col gap-[18px] rounded-2xl border border-line bg-card px-[clamp(22px,5vw,36px)] py-[clamp(28px,6vw,40px)] shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[22px] font-black">센터 플랜</span>
                <span className="text-[15px] text-sub">트레이너 3인 + 대표 1인 · 부가세 포함</span>
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
                <Checks items={["트레이너 앱 전체(OT · 운동일지 · 재등록 · 회원 전용 페이지)", "대표 대시보드(아침 보고서 · 매출 · 정산 · 등록 · 이탈)", "센터 QR OT 신청 · 배정 · 월간 결산", `센터 공용 AI 음성일지 월 ${PLANS.center.ai.voice}건 · 대본 월 ${PLANS.center.ai.prep}번`, `트레이너 3인 + 대표 1인 · 추가 1인 월 ${SEAT_PRICE.toLocaleString("ko-KR")}원`]} />
              </div>
              <div className="flex flex-col gap-2">
                <a href={contact} className={`w-full ${BTN_PRIMARY}`}>센터 도입 문의</a>
                <a href={SIGNUP_CENTER} className={`w-full ${BTN_OUTLINE}`}>센터로 7일 무료 시작</a>
              </div>
            </div>
            <p className="m-0 text-center text-[13px] leading-[1.6] text-sub">
              부가세 포함 · 7일 무료 후 자동결제 · 언제든 해지<br />트레이너가 더 필요하면 1명당 월 {SEAT_PRICE.toLocaleString("ko-KR")}원으로 자리를 더해요.
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
