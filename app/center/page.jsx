"use client";

/* =========================================================================
   「오직 트레이너」 센터 대표용 랜딩 (/center) — v6 (2026-10-07)
   -------------------------------------------------------------------------
   - 트레이너 랜딩(/lp)과 같은 틀: 첫 화면 한 줄 → '대표님이 하는 것 | 앱이 하는 것' 표 → 한 기능 한 장(묶음 6개) → 태블릿 · PC → 가격 → 자주 묻는 질문.
   - 배경은 페이지 전체 짙은 색 하나(2026-10-07 대표 · 트레이너 랜딩은 흰색 하나). 색 값은 LP_CSS의 .lp-dark가 토큰째 바꾼다.
   - 대표는 '트레이너 감시 도구'가 아니라 '트레이너가 먼저 편해지고, 그 결과가 숫자로 보이는 센터'를 산다.
   - 주 행동 = 도입 문의(카카오톡 채널) · 보조 = 센터로 시작하기(/signup?type=center · 첫 결제 7일 안 전액 환불).
   - 화면 = 데모 센터(가짜 회원)에서 찍은 실제 앱 캡처(public/lp/shots · 4:5). 공개 페이지: AuthGate isPublicMarketing에 /center 포함.
   ========================================================================= */

import { useRef } from "react";
import { contactHref } from "@/lib/company";
import { PLANS, PACKS, SEAT_PRICE, MAX_EXTRA_SEATS } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, Header, Footer, useReveal, stagger,
  Checks, GroupLabel, WhoDoes, Faq, Arrow, LP_CSS, Pill, Bundle, FeatureGallery,
} from "../lp/parts";

const SIGNUP_CENTER = "/signup?type=center";

// 대표님이 하는 것 | 앱이 하는 것(2026-10-07) — 실제 동작만. 장부(FC 매출 · 지출) · 배정 · 급여 확정은 대표가 한다(정직하게).
const WHO = [
  { task: "아침 보고서", me: "없음", app: "매일 아침 어제 결과 · 오늘 예정 · 챙길 회원 · AI 총평" },
  { task: "월간 결산", me: "없음", app: "매달 1일 센터 숫자 · 트레이너별 잘한 점과 보완할 점 · 면담 자료" },
  { task: "매출 · 정산", me: "FC 매출 · 지출만 **한 줄씩**", app: "PT 매출 · 목표 달성률 · 다음 달 예상 · 순이익" },
  { task: "등록 · 이탈", me: "없음", app: "OT에서 등록까지 어디서 빠지는지 · 이탈 위험 · 만료 임박 명단" },
  { task: "OT 배정", me: "담당 트레이너 **고르기**", app: "센터 QR 신청 받기 · 트레이너 폰으로 알림 · 첫 OT까지 추적" },
  { task: "트레이너 · 급여", me: "급여 방식 **한 번 정하고 확정**", app: "리더보드 · 예상 급여 · 오늘 코칭할 것" },
];

// 대표 화면 — 한 기능 한 장(2026-10-07 · 옛 '핵심 4가지'와 묶음을 합침). 사진 = 데모 센터 실제 화면.
const BUNDLES = [
  {
    id: "b-report", nav: "아침 보고서",
    pill: "아침 보고서",
    title: ["아침에 열면,", "오늘 할 일부터."],
    desc: "어제 등록 · 보류 · 그만둔 이유와 회원의 말, 오늘 오는 OT · 재등록 회원을 앱이 매일 아침 정리해 보고해요.",
    point: "결과 줄마다 트레이너에게 바로 피드백",
    core: { img: "/lp/shots/2026-10/C01.webp", alt: "대표 아침 보고서: AI 한 줄 총평과 어제 결과(매출 · 신규 · 재등록 · 보류 · 그만)",
      who: "앱이 만든 화면", caption: "대표님이 아무것도 적지 않아도, 트레이너가 남긴 OT 결과 · 계약 기록으로 매일 아침 8시대에 만들어져요." },
    items: [
      { name: "오늘 예정", desc: "오늘 오는 OT · 재등록 기회 회원", img: "/lp/shots/2026-10/C02.webp", alt: "아침 보고서의 오늘 예정: 오늘 오는 OT 회원 · 만료 임박 회원 · 보류 회원" },
      { name: "들어올 매출", desc: "이번 주 등록 · 재등록 후보를 트레이너별로", img: "/lp/shots/2026-10/C03.webp", alt: "아침 보고서의 이달 · 앞으로 들어올 매출: 트레이너별 등록 · 재등록 후보(추정)" },
    ],
  },
  {
    id: "b-monthly", nav: "월간 결산",
    pill: "월간 결산",
    title: ["매달 1일,", "트레이너 면담 자료까지."],
    desc: "지난달 숫자를 전달과 비교하고, 트레이너별 잘한 점 · 보완할 점 · 이번 달 해 볼 것까지 앱이 써 줘요.",
    point: "보완할 점은 대표님만 봐요",
    core: { img: "/lp/shots/2026-10/C04.webp", alt: "대표 월간 결산: AI 한 줄 총평과 9월 센터 숫자(매출 · 목표 달성 · OT · 클로징률)",
      who: "앱이 만든 화면", caption: "매달 1일 아침 폰 알림과 함께 도착해요. 센터 숫자 한 장 뒤에 트레이너별 면담 카드가 이어져요." },
    items: [
      { name: "트레이너별 면담 카드", desc: "잘한 점 · 보완할 점 · 이번 달 해 볼 것", img: "/lp/shots/2026-10/C05.webp", alt: "월간 결산의 트레이너별 카드: 잘한 점 · 보완할 점(대표만) · 이번 달 해 볼 것" },
    ],
  },
  {
    id: "b-money", nav: "매출 · 정산",
    pill: "매출 · 정산",
    title: ["월말까지", "기다리지 마세요."],
    desc: "이달 매출 · 목표 달성률 · 다음 달 예상 매출이 트레이너가 등록한 계약으로 바로 계산돼요.",
    point: "FC 매출 · 지출만 한 줄씩 적으면 순이익까지",
    checks: ["이달 매출 현황: 목표 · 현재 · 달성률, 트레이너별 목표", "다음 달 예상 매출과 이번 주 들어올 매출 후보", "정산: PT · FC · 기타 매출과 지출, 순이익을 센터 정산일 기준으로"],
    core: { img: "/lp/shots/2026-10/C06.webp", alt: "대표 화면의 이달 매출 현황(목표 · 현재 · 달성률, 트레이너별 목표)",
      who: "앱이 만든 화면", caption: "트레이너가 계약을 등록하면 바로 반영돼요. 대표님이 엑셀로 합칠 필요가 없어요." },
    items: [
      { name: "다음 달 예상 매출", desc: "클로징률 · 재등록률 · 평균 금액으로 계산", img: "/lp/shots/2026-10/C06b.webp", alt: "다음 달 예상 매출: 신규 유입 · 재등록에서 들어올 금액 추정" },
      { name: "정산", desc: "PT · FC · 기타 매출에서 지출 빼고 순이익", img: "/lp/shots/2026-10/C09.webp", alt: "정산 합계표: PT 매출 · FC 매출 · 기타 매출 · 지출 · 순이익" },
    ],
  },
  {
    id: "b-flow", nav: "OT · 등록",
    pill: "OT 신청 · 등록",
    title: ["OT 회원이", "새지 않게."],
    desc: "센터 QR로 신청을 받고, 대표님이 트레이너만 고르면 그 트레이너 폰으로 바로 가요. 신청부터 등록까지 어디서 멈췄는지 보여요.",
    point: "단계별로 몇 명이 빠지는지 · 달마다 클로징률",
    checks: ["신규 OT → 1차 → 2차 → 등록, 단계별로 몇 명이 빠지는지", "달마다 클로징률이 나아지고 있는지", "만료 임박 · 이탈 위험 명단을 바로 펼쳐 보기"],
    core: { img: "/lp/shots/2026-10/C08.webp", alt: "대표 등록 · 이탈 탭의 OT 신청 · 배정: 배정 대기 신청과 원하는 시간 · 원하는 트레이너, 트레이너 고르기",
      who: "앱이 만든 화면", caption: "회원이 QR로 쓴 신청서가 여기 모여요. 원하는 시간 · 원하는 트레이너를 보고 버튼 한 번으로 배정해요." },
    items: [
      { name: "OT에서 등록까지", desc: "단계마다 몇 명이 남는지", img: "/lp/shots/2026-10/C08b.webp", alt: "대표 화면의 신규 OT에서 PT 등록까지 깔때기" },
      { name: "달마다 클로징률", desc: "그 달에 들어온 회원 중 몇 %가 등록했는지", img: "/lp/shots/2026-10/C10.webp", alt: "달마다 클로징률 막대 그래프" },
    ],
    href: "/try#qr",
  },
  {
    id: "b-team", nav: "트레이너 관리",
    pill: "트레이너 관리",
    title: ["트레이너 평가,", "감이 아니라 숫자로."],
    desc: "매출 · 클로징률 · 재등록률 · 출석 · 이탈 위험으로 줄 세우고, 급여 방식대로 예상 급여까지 계산해요.",
    point: "오늘 놓친 것만 골라 '오늘 코칭할 것'으로",
    checks: ["매출 · 1차/2차 클로징률 · 재등록률 · 출석 · 이탈 위험으로 줄 세우기", "급여 방식대로 예상 급여를 계산하고 대표가 확정", "오늘 진행된 OT · 수업에서 놓친 것만 '오늘 코칭할 것'으로"],
    core: { img: "/lp/shots/2026-10/C07.webp", alt: "트레이너 리더보드: 이달 매출 · 담당 회원 · 클로징률 · 재등록률",
      who: "앱이 만든 화면", caption: "트레이너가 남긴 수업 · OT · 계약 기록으로 자동 집계돼요. 트레이너는 자기 숫자만 봐요." },
    items: [
      { name: "급여 확정", desc: "예상 급여 → 최종 금액 확정", img: "/lp/shots/2026-10/C14.webp", alt: "트레이너별 예상 급여와 최종 금액 확정" },
      { name: "운동일지 고쳐 달라는 요청", desc: "회원이 '내용이 달라요'를 누르면 기록으로", img: "/lp/shots/2026-10/T25.webp", alt: "회원이 '내용이 달라요'를 누른 운동일지와 회원 메모" },
    ],
  },
  {
    id: "b-ops", nav: "수업 증빙 · 운영",
    pill: "수업 증빙 · 운영",
    title: ["종이 서명 대신,", "기록으로 남겨요."],
    desc: "회원이 폰에서 운동일지를 확인하고 손가락으로 서명해요. 한 달 수업이 서명과 함께 확인서 한 장으로 남아요.",
    point: "회원 이벤트 · 공지 · 트레이너 인계도 운영 탭에서",
    checks: ["요일 · 시간대 예약 밀도와 완료 · 노쇼", "센터 전체 회원 이벤트 · 필수 공지", "회원 등록 · 배정 · 트레이너 인계(남은 수업 이월)"],
    core: { img: "/lp/shots/2026-10/T19.webp", alt: "한 달 수업을 회원 서명과 함께 모은 수업 확인서",
      who: "앱이 만든 화면", caption: "트레이너가 운동일지를 남기면 회원 서명이 붙고, 한 달치가 자동으로 모여요. 인쇄 · PDF로 저장돼요." },
    items: [
      { name: "회원 이벤트", desc: "센터 전체 출석 챌린지 · 참여 명단 · 상품", img: "/lp/shots/2026-10/C13.webp", alt: "대표 운영 탭의 회원 이벤트: 이벤트 만들기와 진행 중 이벤트" },
    ],
    href: "/try#sign",
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
  { device: "pc", name: "등록 · 이탈", desc: "깔때기 · 달마다 클로징률 · 재등록과 이탈", img: "/lp/shots/2026-10/P06.webp", alt: "PC 등록 · 이탈: 깔때기 · 달마다 클로징률 · 재등록률 · 만료 임박 · 이탈 위험" },
  { device: "pc", name: "스케줄", desc: "완료율 · 노쇼율 · 요일 · 시간대 밀도", img: "/lp/shots/2026-10/P07.webp", alt: "PC 스케줄: 최근 90일 예약 · 완료율 · 노쇼율 · 트레이너별 진행 수업 · 예약 밀도" },
  { device: "tablet", name: "대표 홈", desc: "오늘 챙길 것 · 이달 매출 · 등록과 이탈", img: "/lp/shots/2026-10/P08.webp", alt: "태블릿 대표 홈: 배정 대기 · 오늘 챙길 것 · 이달 매출 · 등록 · 이탈 · 순이익" },
];

const STEPS = [
  ["센터 계정 만들기", "카드 등록하고 바로 시작 · 7일 안 전액 환불"],
  ["트레이너 초대", "최대 3명, 이메일로 계정 발급"],
  ["회원 등록·배정", "그날부터 숫자가 쌓입니다"],
];

const FAQ = [
  { q: "트레이너가 4명 이상이면요?", a: `트레이너 1명당 월 ${SEAT_PRICE.toLocaleString("ko-KR")}원으로 자리를 더할 수 있어요(최대 ${3 + MAX_EXTRA_SEATS}명). 구독 관리에서 결제하면 바로 열려요.` },
  { q: "AI를 다 쓰면 어떻게 되나요?", a: `센터 전체가 함께 쓰는 한도예요(음성일지 월 ${PLANS.center.ai.voice}건 · OT · 재등록 대본 월 ${PLANS.center.ai.prep}번 · 자리 1개 추가마다 +100건 · +20번). 다 쓰면 그달만 추가 팩(대본 10번 ${PACKS.prep10.price.toLocaleString("ko-KR")}원 · 음성일지 50건 ${PACKS.voice50.price.toLocaleString("ko-KR")}원)을 살 수 있어요. 산 팩은 7일 안에 한 번도 안 썼을 때만 전액 환불돼요.` },
  { q: "트레이너들이 싫어하지 않을까요?", a: "트레이너의 일지·OT 준비·재등록 챙기기를 덜어주는 앱이라, 트레이너가 먼저 편해집니다." },
  { q: "다른 센터와 데이터가 섞이지 않나요?", a: "센터별로 완전히 분리되고, 매출·정산 화면은 대표만 봅니다." },
  { q: "기존 PT 회원은 어떻게 옮기나요?", a: "회원을 등록할 때 '인계받은 PT'로 남은 세션을 이어서 등록할 수 있습니다." },
  { q: "결제는 어떻게 되나요?", a: "카드를 등록하면 바로 첫 달이 결제되고, 이후 매달 같은 날 자동 결제예요. 첫 결제 7일 안에는 써 봤어도 전액 환불해 드리고(계정당 한 번), 언제든 해지할 수 있어요." },
];

export default function CenterLandingPage() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  const plan = PLANS.center;
  const contact = contactHref();

  return (
    <div ref={rootRef} className="lp-dark min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header
        page="center"
        nav={[["#features", "대표 화면"], ["#devices", "태블릿 · PC"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
        cta={{ label: "도입 문의", href: contact }}
      />

      <main>
        {/* ① 첫 화면 */}
        <section className="px-5 pb-[clamp(56px,10vw,112px)] pt-[clamp(48px,9vw,112px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <span className="inline-flex min-h-[34px] items-center rounded-full border border-line bg-primary-soft px-4 text-[14px] font-bold text-primary-strong">
              트레이너 3인 + 대표 1인 · 센터용
            </span>
            <h1 className="m-0 text-[clamp(34px,7.6vw,58px)] font-black leading-[1.18] tracking-[-0.045em]">
              <span className="block"><span className="inline-block">대표님은</span> <span className="inline-block">열어 보기만 하세요.</span></span>
              <span className="block text-primary-strong"><span className="inline-block">숫자는 앱이 모아</span> <span className="inline-block">보고드려요.</span></span>
            </h1>
            <p className="m-0 max-w-[540px] text-[clamp(17px,2.6vw,20px)] leading-[1.6] text-sub">
              매출 · 정산 · 등록과 이탈 · 트레이너 성과까지, 트레이너가 수업하며 남긴 기록으로 앱이 정리해요.
            </p>
            <div className="mt-1.5 flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
              <a href={contact} className={BTN_PRIMARY}>센터 도입 문의 <Arrow /></a>
              <a href={SIGNUP_CENTER} className={BTN_OUTLINE}>센터로 시작하기</a>
            </div>
            <p className="m-0 text-[14px] text-sub">트레이너 3인 + 대표 1인 · 7일 안 전액 환불</p>
          </div>
        </section>

        {/* ② 대표님이 하는 것 | 앱이 하는 것 — 대표 문구(2026-10-06) */}
        <section className="border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">대표님이 직접</span>
              <span className="block">입력하는 건 없습니다.</span>
            </h2>
            <p className="rv m-0 max-w-[520px] text-[clamp(17px,2.6vw,20px)] font-bold leading-[1.6] text-primary-strong" style={stagger(1)}>
              전부 자동으로 만들어지고, 보고드립니다.
            </p>
            <div className="mt-2 flex w-full justify-center"><WhoDoes rows={WHO} meLabel="대표님이 하는 것" meShort="대표" /></div>
          </div>
        </section>

        {/* ③ 대표 화면 — 한 기능 한 장 */}
        <section id="features" className="scroll-mt-28 border-t border-line px-5 pb-[clamp(56px,10vw,104px)] pt-[clamp(48px,8vw,88px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-16 text-center">
            <div className="rv flex flex-col items-center gap-4">
              <GroupLabel>대표 화면</GroupLabel>
              <nav aria-label="대표 화면 묶음" className="flex max-w-[600px] flex-wrap justify-center gap-2">
                {BUNDLES.map((b, i) => (
                  <a key={b.id} href={`#${b.id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[14px] font-bold text-ink no-underline transition-colors hover:bg-elevate">
                    <span className="tabular-nums text-primary-strong">{i + 1}</span> {b.nav}
                  </a>
                ))}
              </nav>
            </div>
            {BUNDLES.map((b) => (
              <Bundle key={b.id} {...b}>
                {b.id === "b-ops" && (
                  <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
                    {OPS.map((m) => (
                      <span key={m} className="rounded-full bg-elevate px-3.5 py-2 text-[14px] font-semibold text-ink">{m}</span>
                    ))}
                  </div>
                )}
              </Bundle>
            ))}
          </div>
        </section>

        {/* ④ 트레이너가 먼저 좋아하는 앱 → 트레이너용 페이지 */}
        <section className="border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px] text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">트레이너가 편해야,</span>
              <span className="block text-primary-strong">센터 숫자가 오릅니다.</span>
            </h2>
            <p className="rv m-0 max-w-[500px] text-[16px] leading-[1.6] text-sub" style={stagger(1)}>
              감시 도구가 아닙니다. 트레이너의 수업 밖 업무를 덜어주는 앱이고, 대표 화면의 숫자는 그 결과로 쌓입니다.
            </p>
            <div className="rv my-1.5" style={stagger(2)}>
              <Checks items={["말 한 마디면 운동일지 끝", "OT 들어가기 전, 할 말을 대본으로", "재등록할 회원을 앱이 먼저 알림", "수업 시간 맞추는 카톡 대신 예약 요청 · 승인"]} />
            </div>
            <a href="/lp" className={`rv ${BTN_OUTLINE}`} style={stagger(3)}>트레이너용 페이지 보기 <Arrow /></a>
          </div>
        </section>

        {/* ⑤ 도입은 이렇게 — 순서 자체가 정보라 여기서만 번호 */}
        <section id="process" className="scroll-mt-28 border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <h2 className={`rv ${H2} ${H2_MD}`}>도입은 이렇게</h2>
            <ol className="m-0 w-full max-w-[560px] list-none rounded-2xl border border-line bg-elevate px-[22px] py-1.5">
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

        {/* ⑥ 태블릿 · PC 버전 제공 */}
        <section id="devices" className="scroll-mt-28 border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <Pill>태블릿 · PC 버전 제공</Pill>
            <h2 className={`rv m-0 ${H2} ${H2_LG}`}>
              <span className="block">대표 화면은</span>
              <span className="block text-primary-strong">PC에서 더 크게.</span>
            </h2>
            <p className="rv m-0 max-w-[540px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              폰과 같은 계정으로 태블릿 · PC에서도 열려요. 화면이 넓어지면 보고서 · 매출 · 정산을 넓은 배치로 한눈에 봐요. 설치 없이 브라우저로.
            </p>
            <div className="rv w-full" style={stagger(2)}><FeatureGallery items={WIDE} label="태블릿 · PC 대표 화면" /></div>
          </div>
        </section>

        {/* ⑦ 가격 */}
        <section id="pricing" className="scroll-mt-28 border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px]">
            <div className="rv flex w-full max-w-[520px] flex-col gap-[18px] rounded-2xl border border-line bg-elevate px-[clamp(22px,5vw,36px)] py-[clamp(28px,6vw,40px)]">
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
                <Checks items={["트레이너 앱 전체(OT 대본 · 말로 쓰는 운동일지 · 재등록 · 회원 전용 페이지)", "대표 화면(아침 보고서 · 월간 결산 · 매출 · 정산 · 등록 · 이탈)", "센터 QR OT 신청 · 배정", `센터 공용 AI 운동일지 월 ${PLANS.center.ai.voice}건 · 대본 월 ${PLANS.center.ai.prep}번`, `트레이너 3인 + 대표 1인 · 추가 1인 월 ${SEAT_PRICE.toLocaleString("ko-KR")}원`]} />
              </div>
              <div className="flex flex-col gap-2">
                <a href={contact} className={`w-full ${BTN_PRIMARY}`}>센터 도입 문의</a>
                <a href={SIGNUP_CENTER} className={`w-full ${BTN_OUTLINE}`}>센터로 시작하기</a>
              </div>
            </div>
            <p className="m-0 max-w-[520px] text-center text-[13px] leading-[1.6] text-sub">부가세 포함 · <strong className="font-bold text-ink">1개월 단위 정기결제(이용 기간 1개월)</strong> · 카드를 등록하면 바로 첫 결제, 이후 매달 같은 날 자동 결제 · <strong className="font-bold text-ink">첫 결제 7일 안에는 써 봤어도 전액 환불</strong>(계정당 한 번) · 언제든 해지(남은 기간까지 이용) · <a href="/legal/refund" className="font-bold text-ink underline underline-offset-2">환불 정책</a></p>
          </div>
        </section>

        {/* ⑧ 자주 묻는 질문 */}
        <section id="faq" className="scroll-mt-28 border-t border-line px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <h2 className={`rv ${H2} ${H2_MD}`}>자주 묻는 질문</h2>
            <Faq items={FAQ} />
          </div>
        </section>

        {/* ⑨ 마무리 */}
        <section className="border-t border-line px-5 py-[clamp(64px,12vw,120px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">이번 달 숫자부터,</span>
              <span className="block text-primary-strong">같이 보시죠.</span>
            </h2>
            <div className="rv flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center" style={stagger(1)}>
              <a href={contact} className={BTN_PRIMARY}>센터 도입 문의 <Arrow /></a>
              <a href={SIGNUP_CENTER} className={BTN_OUTLINE}>센터로 시작하기</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
