"use client";

/* =========================================================================
   「오직 트레이너」 트레이너용 랜딩 (/lp · 로그인 안 한 방문자의 "/") — v5 (2026-10-02)
   -------------------------------------------------------------------------
   기준: Claude Design 시안(docs/design/landing) = 기획안 v5(docs/lp-claude-design-기획안.md) §5.
   - 레퍼런스 aurafit.co.kr의 구성만(좁은 한 열·배지·화면 주인별 묶음·라벨 알약·하루 금액).
     경쟁사라 색·문장·숫자는 가져오지 않는다.
   - 신규 OT를 맨 앞에 — 우리만 있는 것(클로징·등록률).
   - 화면 = 데모 계정(가짜 회원)에서 찍은 실제 앱 캡처(public/lp/shots · 4:5) 또는
     실제 화면 데모(public/lp/demos · DemoSlot). 목업 그리지 않음.
   - 후기 구간은 실제 후기(허락받은 것) 3개가 모이기 전까지 렌더하지 않는다(REVIEWS 비어 있음).
   - 가격은 lib/plans.js에서 직접 읽는다(랜딩↔결제 불일치 금지).
   - 효과 문구는 실제 동작하는 기능만.
   ========================================================================= */

import { useRef } from "react";
import InstallAppButton from "@/components/InstallAppButton";
import { contactHref } from "@/lib/company";
import { PLANS } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, BTN_WHITE, Header, Footer, useReveal, stagger,
  Pill, Checks, FeatureRow, GroupLabel, Shot, BeforeAfter, Faq, Arrow, LP_CSS,
} from "./parts";

/* ───────── 데이터 ───────── */

// 기능 사실만(실적 숫자 아님). "0건"은 약속처럼 읽혀 뺐다.
const FACTS = [
  { n: "30초", t: "말로 남기는\n운동일지" },
  { n: "3분", t: "수업 직전\nOT 준비" },
  { n: "5가지", t: "미리 준비하는\n거절 대응" },
];

// 실제 후기(이름·지역/센터·한 줄) — 허락받은 것만. 3개 모이기 전까지 구간 자체를 숨긴다.
const REVIEWS = [];

const WHY = [
  ["일지·기록에 매일 40분", "말로 30초"],
  ["OT 준비는 매번 백지에서", "AI가 대사·근거까지"],
  ["재등록은 기억력에 의존", "앱이 먼저 알림"],
  ["회원이 늘수록 관리도 두 배", "회원이 셀프로 관리"],
];

const OT_STEPS = [
  { step: "OT 보고서", img: "/lp/shots/ot-brief.webp", alt: "1차 OT 준비 화면 — 3분 각인과 오늘 시킬 운동" },
  { step: "클로징 멘트", img: "/lp/shots/ot-closing.webp", alt: "OT 화면 — 떠보기·근거·플랜 제시·요청 클로징 흐름" },
  { step: "거절 대응", img: "/lp/shots/ot-objection.webp", alt: "OT 화면 — 가격 부담·생각해볼게요 거절 대응 멘트" },
];

const RENEW = {
  pill: "재등록",
  title: ["재등록 시기,", "앱이 먼저 알려줘요."],
  flow: ["만료 임박 알림", "변화 근거", "제안까지"],
  checks: ["잔여가 줄어든 회원을 '오늘 할일'에 먼저", "인바디·운동일지로 그동안의 변화 정리", "재등록 제안 멘트까지 준비"],
  note: "잔여 10회 미만부터 알려줘요",
  visual: { demo: "/lp/demos/ot-rereg-embed.html", alt: "재등록 흐름 실제 화면 — 만료 임박 알림부터 제안까지" },
};

const LOG = {
  pill: "운동일지",
  title: ["쓰지 말고,", "말하세요."],
  flow: ["수업", "말로 복기", "회원에게 전송"],
  checks: ["운동별 무게·횟수·세트를 알아서 정리", "회원에게 보낼 일지까지 한 번에", "세션 차감·출석 기록도 자동"],
  note: "회원이 확인하면 종이 수업 확인 서명을 대신해요",
  visual: { demo: "/lp/demos/ot-voicelog-embed.html", alt: "운동일지 실제 화면 — 말로 남기면 정리됩니다" },
};

const MEMBER = {
  pill: "회원 전용 페이지",
  title: ["붙잡지 마세요.", "회원이 스스로 챙깁니다."],
  flow: ["링크 하나", "기록 열람", "출석 챌린지"],
  checks: ["설치 없이 링크로 여는 회원 전용 페이지", "운동일지·인바디·변화 그래프를 회원이 직접", "출석이 쌓이는 오운완 챌린지와 포상"],
  note: "링크와 휴대폰 뒤 4자리로 열려요",
  visual: { demo: "/lp/demos/ot-member-embed.html", alt: "회원 전용 페이지 실제 화면" },
};

// 회원 전용 페이지에 실제로 뜨는 문구 — 후기가 아니라 제품 화면이다.
const MEMBER_NOTICES = ["오늘 운동일지가 도착했어요", "이번 달 출석 8회 — 오운완 챌린지 진행 중"];

const MORE = ["급여 자동계산", "스케줄·노쇼", "운동 라이브러리", "내 실적 리포트", "센터 공지"];

const TIERS = [
  {
    key: "solo",
    tagline: "개인 트레이너 1인",
    feats: ["1·2차 OT · 재등록 서포트", "음성 운동일지 · AI 리포트", "회원 전용 페이지 (성과 그래프·비포애프터)", "실적 · 급여 자동계산"],
    highlight: true,
    cta: { label: "7일 무료 체험", href: "/signup" },
  },
  {
    key: "center",
    tagline: "트레이너 3인 + 대표 1인",
    feats: ["솔로 전체 포함", "대표 대시보드 (매출·정산·등록·이탈)", "트레이너 3인 좌석 + 대표 1인", "트레이너 코칭 · 팀 관리"],
    highlight: false,
    cta: { label: "센터 자세히 보기", href: "/center" },
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

const perDay = (amount) => `하루 약 ${wonApprox(amount / 30)}`;

/* ───────── 페이지 ───────── */

export default function LandingPage() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  const solo = PLANS.solo;

  return (
    <div ref={rootRef} className="min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header
        page="trainer"
        nav={[["#features", "기능"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
        cta={{ label: "무료로 시작", href: "/signup" }}
      />

      <main>
        {/* ② 첫 화면 — 효과 없음 */}
        <section className="bg-card px-5 pb-[clamp(56px,10vw,112px)] pt-[clamp(48px,9vw,112px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <span className="inline-flex min-h-[34px] items-center rounded-full border border-primary/15 bg-primary-soft px-4 text-[14px] font-bold text-primary-strong">
              트레이너가 직접 만든 PT 세일즈·회원관리 앱
            </span>
            <h1 className="m-0 text-[clamp(36px,8vw,60px)] font-black leading-[1.16] tracking-[-0.045em]">
              <span className="block">OT는 등록으로,</span>
              <span className="block text-primary">수업 밖 일은 앱으로.</span>
            </h1>
            <p className="m-0 max-w-[540px] text-[clamp(17px,2.6vw,20px)] leading-[1.6] text-sub">
              1차 OT 준비부터 클로징 멘트·운동일지·재등록까지, 트레이너의 수업 밖 업무를 앱이 맡습니다.
            </p>
            <div className="mt-1.5 flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
              {/* InstallAppButton은 자체 클래스(레드 채움)를 갖고 있어 겹치는 속성은 !로 덮는다. */}
              <InstallAppButton
                className="!min-h-[52px] justify-center !rounded-xl !border !border-line-strong !bg-card !px-6 !py-0 !text-[17px] !text-ink hover:!bg-elevate"
                label="앱처럼 설치"
              />
            </div>
            <p className="m-0 text-[14px] text-sub">설치 없이 폰에서 바로 · 7일 무료 체험</p>
          </div>
        </section>

        {/* ③ 숫자 띠 */}
        <section aria-label="오직 트레이너 한눈에" className="bg-bg px-5 py-[clamp(40px,7vw,72px)]">
          <dl className="mx-auto m-0 grid max-w-[760px] grid-cols-3 gap-3 text-center">
            {FACTS.map((f, i) => (
              <div key={f.n} className="rv flex flex-col items-center gap-2" style={stagger(i)}>
                <dt className="sr-only">{f.t.replace("\n", " ")}</dt>
                <dd className="m-0 text-[clamp(32px,7vw,56px)] font-black leading-none tracking-[-0.04em] tabular-nums">{f.n}</dd>
                <dd className="m-0 whitespace-pre-line text-[clamp(14px,2.2vw,17px)] leading-[1.45] text-sub" aria-hidden="true">{f.t}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ③-1 후기 — 실제 후기 3개 이상일 때만 */}
        {REVIEWS.length >= 3 && (
          <section className="bg-card px-5 py-[clamp(56px,9vw,96px)]">
            <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
              <h2 className={`rv ${H2} ${H2_MD}`}>먼저 써본 트레이너들</h2>
              <ul className="m-0 grid w-full list-none gap-3 p-0 sm:grid-cols-3">
                {REVIEWS.map((r, i) => (
                  <li key={r.name} className="rv rounded-2xl border border-line bg-card p-5 text-left" style={stagger(i)}>
                    <p className="m-0 text-[15.5px] font-semibold leading-[1.55]">{r.quote}</p>
                    <p className="m-0 mt-3 text-[13px] text-sub">{r.name} · {r.where}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ④ 왜 */}
        <section className="border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">수업은 2시간,</span>
              <span className="block text-primary">수업 밖 업무는 4시간.</span>
            </h2>
            <p className="rv m-0 max-w-[480px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              일지·상담 준비·재등록 챙기기. 실력이 아니라 시간을 먹는 일들을 앱에 넘기세요.
            </p>
            <div className="mt-2 flex w-full justify-center"><BeforeAfter rows={WHY} /></div>
          </div>
        </section>

        {/* ⑤ 기능 — 트레이너 화면 */}
        <section id="features" className="scroll-mt-28 border-t border-line bg-card px-5 pb-[clamp(56px,10vw,104px)] pt-[clamp(48px,8vw,88px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-16 text-center">
            <GroupLabel>트레이너 화면</GroupLabel>

            <FeatureRow
              pill="신규 OT · 세일즈"
              title={["세일즈 잘 모르겠으면,", "따라만 하세요."]}
              flow={["OT 보고서", "클로징 멘트", "거절 대응"]}
              checks={["회원 정보로 만드는 맞춤 OT 진행 순서", "수업 직전 3분, 바로 말할 클로징 멘트", "가격·'생각해볼게요' 등 거절 5가지 대응"]}
              note="1차 OT 기록이 2차 OT 준비로 그대로 이어져요"
            >
              {/* 단계가 핵심이라 화면 3장을 나란히(폰은 가로로 넘겨보기). */}
              <ol className="lp-steps -mx-5 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {OT_STEPS.map((s, i) => (
                  <li key={s.step} className="w-[74%] flex-none snap-center sm:w-auto">
                    <div className="mb-2.5 text-left text-[14px] font-extrabold">
                      <span className="text-muted">{i + 1}</span>{" "}
                      <span className={i === OT_STEPS.length - 1 ? "text-primary-strong" : "text-ink"}>{s.step}</span>
                    </div>
                    <div className="rounded-[20px] border border-line bg-bg p-2.5">
                      <Shot src={s.img} alt={s.alt} />
                    </div>
                  </li>
                ))}
              </ol>
            </FeatureRow>

            <FeatureRow {...RENEW} />
            <FeatureRow {...LOG} />

            <GroupLabel>회원 전용 페이지</GroupLabel>

            <FeatureRow {...MEMBER} />

            {/* 회원 전용 페이지 알림 — 제품 화면(후기 아님) */}
            <div className="-mt-6 flex w-full max-w-[400px] flex-col items-start gap-2.5 text-left">
              <span className="rv text-[13px] font-bold text-sub">회원 전용 페이지 알림</span>
              {MEMBER_NOTICES.map((t, i) => (
                <div key={t} className="rv rounded-[20px_20px_20px_6px] bg-elevate px-[18px] py-3.5 text-[16px] font-semibold leading-[1.45]" style={stagger(i + 1)}>
                  {t}
                </div>
              ))}
            </div>

            <div className="rv flex flex-col items-center gap-3.5">
              <p className="m-0 text-[17px] font-extrabold">그리고 수업 밖 나머지도</p>
              <div className="flex max-w-[520px] flex-wrap justify-center gap-2">
                {MORE.map((m) => (
                  <span key={m} className="rounded-full bg-bg px-3.5 py-2 text-[14px] font-semibold">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 중간 행동 띠 */}
        <section className="border-y border-line bg-primary-soft px-5 py-[clamp(48px,8vw,80px)]">
          <div className="rv mx-auto flex max-w-[760px] flex-col items-center gap-7 text-center">
            <p className="m-0 text-[clamp(22px,4.2vw,32px)] font-black leading-[1.4] tracking-[-0.035em]">
              신규·재등록 1건만 더 나와도,<br />
              <span className="text-primary-strong">이용료가 회수됩니다.</span>
            </p>
            <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
          </div>
        </section>

        {/* ⑥ 가격 + ⑦ 센터 상자 */}
        <section id="pricing" className="scroll-mt-28 bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-7 text-center">
            <h2 className={`rv ${H2} ${H2_MD}`}>7일 무료로 먼저 써보세요.</h2>
            <div className="grid w-full gap-3.5 text-left sm:grid-cols-2">
              {TIERS.map((tier, i) => {
                const plan = PLANS[tier.key];
                return (
                  <div key={tier.key} className={`rv relative flex flex-col gap-4 rounded-2xl bg-card px-6 py-7 shadow-sm ${tier.highlight ? "border-2 border-primary" : "border border-line"}`} style={stagger(i)}>
                    <div className="flex items-center justify-between">
                      <span className="text-[20px] font-black">{plan.name}</span>
                      {tier.highlight && <span className="rounded-full bg-primary px-[11px] py-[5px] text-[12px] font-extrabold text-white">추천</span>}
                    </div>
                    <span className="-mt-2 text-[15px] text-sub">{tier.tagline}</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[15px] text-sub">월</span>
                        <span className="text-[38px] font-black tracking-[-0.04em] tabular-nums">{plan.amount.toLocaleString("ko-KR")}원</span>
                      </div>
                      <div className="text-[14px] text-sub"><s>{plan.regular.toLocaleString("ko-KR")}원</s> · 얼리버드</div>
                      <div className="text-[16px] font-extrabold text-primary-strong">{perDay(plan.amount)}</div>
                    </div>
                    <div className="flex-1 border-t border-line pt-4">
                      <Checks items={tier.feats} />
                    </div>
                    <a href={tier.cta.href} className={`w-full ${tier.highlight ? BTN_PRIMARY : BTN_OUTLINE}`}>{tier.cta.label}</a>
                  </div>
                );
              })}
            </div>
            <p className="m-0 text-[13px] text-sub">부가세 별도 · 7일 무료 후 자동결제 · 언제든 해지</p>

            <div className="rv mt-3 flex w-full flex-col items-center gap-3.5 rounded-3xl bg-ink px-6 py-[clamp(28px,6vw,44px)] text-white">
              <Pill dark>센터 대표님께</Pill>
              <h3 className="m-0 text-[clamp(26px,5vw,36px)] font-black tracking-[-0.04em]">센터 숫자를 한 화면에서.</h3>
              <p className="m-0 mb-1.5 max-w-[420px] text-[16px] leading-[1.55] text-white/75">매출·정산·등록과 이탈·트레이너별 성과를 대표 화면에서.</p>
              <a href="/center" className={BTN_WHITE}>센터 대표용 페이지 보기 <Arrow /></a>
            </div>
          </div>
        </section>

        {/* ⑧ 자주 묻는 질문 */}
        <section id="faq" className="scroll-mt-28 bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <h2 className={`rv ${H2} ${H2_MD}`}>자주 묻는 질문</h2>
            <Faq items={FAQ} />
            <p className="m-0 text-[14px] text-sub">
              더 궁금한 점은 <a href={contactHref()} className="font-bold text-primary-strong underline-offset-2 hover:underline">카카오톡으로 물어보세요</a>.
            </p>
          </div>
        </section>

        {/* ⑨ 만든 사람 + 마무리 */}
        <section className="bg-bg px-5 py-[clamp(64px,11vw,112px)]">
          <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-[18px] text-center">
            <h2 className={`rv ${H2} text-[clamp(24px,4.6vw,36px)] leading-[1.35] [text-wrap:balance]`}>
              <span className="block">트레이너 경력 10년. 팀장·관리자까지 다 해본 사람이</span>
              <span className="block text-primary">답답해서 직접 만들었습니다.</span>
            </h2>
            <p className="rv m-0 max-w-[500px] text-[16px] leading-[1.6] text-sub" style={stagger(1)}>
              어플·노션·스프레드시트를 다 써봤지만 타이핑은 그대로였습니다. 수업 밖 업무를 전부 여기에 녹였습니다.
            </p>
            <h2 className={`rv ${H2} ${H2_LG} mt-10`}>
              <span className="block">오늘 수업 끝나고</span>
              <span className="block">바로 써보세요.</span>
            </h2>
            <div className="rv flex flex-col items-center gap-2.5" style={stagger(1)}>
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
              <span className="text-[14px] text-sub">월 {solo.amount.toLocaleString("ko-KR")}원부터</span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
