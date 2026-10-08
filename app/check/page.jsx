"use client";

/* =========================================================================
   1분 진단(/check · 2026-10-08 · 로그인 없음) — 트레이너 · 대표가 예/아니요로 답하면
   마지막에 한 장으로 "놓치고 있는 것 → 앱이 챙겨요 / 잘하고 있는 것 → 앱이 시간을 줄여 줘요"를 보여 준다.
   ⚠️ 답은 이 화면 안에서만(서버에 아무것도 안 씀). 돈 숫자는 본인이 넣은 숫자로만 · '예시 계산'.
   효과를 약속하지 않는다(과장 광고 금지). 직접 링크: /check?who=trainer | /check?who=owner
   ========================================================================= */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Header, Footer, BTN_PRIMARY, BTN_OUTLINE, Arrow, LP_CSS } from "@/app/lp/parts";
import { contactHref } from "@/lib/company";
import { wonApprox } from "@/lib/format";
import { PLANS } from "@/lib/plans";

// miss = 이 답이면 '놓치고 있는 것'. 다른 답은 '잘하고 있는 것'.
// why = 놓쳤을 때 결과에 뜨는 이유(트레이너 = 회원이 없는 이유 · 대표 = 매출이 새는 곳 · 2026-10-08).
const SETS = {
  trainer: {
    label: "트레이너",
    title: "트레이너 1분 무료 진단",
    missHead: (n) => <><span className="block">회원이 없는 이유,</span><span className="block text-primary">{n}개 찾았어요.</span></>,
    missLabel: "회원이 없는 이유 → 앱이 챙겨요",
    noneHead: <><span className="block">회원이 없는 이유,</span><span className="block text-primary">수업 밖에선 못 찾았어요.</span></>,
    qs: [
      { q: "신규 OT, 아직도 긴장되나요?", why: "OT가 등록으로 이어지지 않아요.", miss: "yes", missText: "들어가기 3분 전, 이 회원에게 할 말을 대본으로 받아요.", okText: "세일즈 맞춤 인바디 분석 · 세일즈북 PPT 자료로 클로징을 더 단단하게요." },
      { q: "재등록 대상 회원님을 놓친 적 있나요?", why: "재등록 타이밍을 놓쳐요.", miss: "yes", missText: "남은 수업 10회 아래면 앱이 먼저 알려요.", okText: "상담 대본 · 변화 자료 준비는 앱이 해요." },
      { q: "회원 변화가 한눈에 보기 좋게 정리돼 있나요?", why: "회원이 달라진 걸 못 느껴요.", miss: "no", missText: "인바디 · 무게 변화가 그래프로 쌓이고 회원 폰에도 보여요.", okText: "직접 정리하던 그 자료, 기록만 하면 앱이 만들어요." },
      { q: "회원님 개인운동 루틴 챙겨 주고 있나요?", why: "PT 없는 날 회원이 멀어져요.", miss: "no", missText: "운동일지와 센터 기구로 루틴 숫자까지 나와요.", okText: "확정만 하면 회원 폰에서 진도까지 이어져요." },
      { q: "회원님 수업 변경이나 수업 시간을 깜빡한 적 있나요?", why: "작은 실수가 신뢰를 깎아요.", miss: "yes", missText: "회원이 앱으로 신청 · 변경하고, 승인하면 스케줄에 바로 잡혀요.", okText: "수업 변경 카톡 대신 버튼 하나로 받아요." },
      { q: "수업하고 운동일지 작성하고 계신가요?", why: "회원에게 남는 기록이 없어요.", miss: "no", missText: "쓰기 번거로웠다면, 이제 말로 30초면 남아요.", okText: "꾸준히 쓰시는 운동일지, 회원 폰 전송까지 자동이에요." },
      { q: "운동일지 쓰는 데 3분 이상 걸리나요?", why: "일지 쓰다가 하루가 다 가요.", miss: "yes", missText: "수업 끝나기 전 30초면 충분해요. 회원님과 오늘 운동을 말로 정리하세요.", okText: "표 정리 · 회원 폰 전송 · 무게 그래프는 앱이 이어서 해요." },
      { q: "이번 달 예상 급여, 지금 바로 말할 수 있나요?", why: "내 숫자를 몰라 어디서 새는지 몰라요.", miss: "no", missText: "정해 둔 급여 방식대로 매일 자동 계산돼요.", okText: "직접 하던 계산, 회원별 내역까지 자동으로 나와요." },
    ],
  },
  owner: {
    label: "센터 대표",
    title: "센터 대표 1분 무료 진단",
    missHead: (n) => <><span className="block">매출이 새는 곳,</span><span className="block text-primary">{n}곳 찾았어요.</span></>,
    missLabel: "매출이 새는 곳 → 앱이 챙겨요",
    noneHead: <><span className="block">매출이 새는 곳,</span><span className="block text-primary">못 찾았어요.</span></>,
    qs: [
      { q: "지난달 우리 센터 OT 회원 수와 클로징률을 알고 계신가요?", why: "어디서 회원이 빠지는지 몰라요.", miss: "no", missText: "OT부터 등록까지 단계마다 숫자로 보여요.", okText: "엑셀로 모으던 숫자, 트레이너 기록만으로 자동으로 모여요." },
      { q: "트레이너별 클로징률 · 재등록률을 파악하고 계신가요?", why: "누가 잘하고 누가 막히는지 몰라요.", miss: "no", missText: "트레이너 리더보드로 한 화면에서 비교해요.", okText: "매일 자동으로, 매달 1일엔 면담 자료까지 와요." },
      { q: "등록이 안 된 이유를 구체적으로 남기고 계신가요?", why: "같은 이유로 계속 놓쳐요.", miss: "no", missText: "매일 아침 보고서에 보류 · 그만둔 이유와 회원의 말이 와요.", okText: "트레이너가 버튼 몇 번이면 남고, 아침마다 정리돼 와요." },
      { q: "이번 달 재등록 대상 회원이 몇 명인지 알고 계신가요?", why: "재등록 매출이 조용히 새요.", miss: "no", missText: "만료 임박 · 이탈 위험 회원이 명단으로 떠요.", okText: "트레이너 폰에도 먼저 알려 놓치지 않게 해요." },
      { q: "월말 트레이너 급여 계산에 10분 이상 걸리나요?", why: "대표님 시간이 계산에 묶여요.", miss: "yes", missText: "급여는 자동 계산돼요. 확인하고 확정만 누르세요.", okText: "확정하면 트레이너 폰으로 알림까지 가요." },
      { q: "잘하는 트레이너의 클로징 방식이 다른 트레이너에게 전해지나요?", why: "센터 매출이 한 사람에게 달려 있어요.", miss: "no", missText: "OT 대본이 신입도 같은 수준으로 준비하게 해요.", okText: "센터 전체가 같은 수준의 OT 대본으로 준비해요." },
      { q: "회원 대상 이벤트를 매달 열고 계신가요?", why: "회원이 센터에 올 이유가 줄어요.", miss: "no", missText: "센터 · 트레이너 이벤트로 매달 새 콘텐츠가 생겨요.", okText: "회원 폰 알림 · 참여 · 달성까지 앱이 세요." },
    ],
  },
};

const num = (v) => {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const comma = (v) => { const n = num(v); return n ? n.toLocaleString("ko-KR") : ""; };

function Start({ onPick }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="inline-flex min-h-[32px] items-center rounded-full bg-primary-soft px-4 text-[14px] font-bold text-primary-strong">1분 무료 진단</span>
      {/* 트레이너의 목소리(따옴표)로 — 앱이 회원을 데려다준다는 약속이 아니라 '그 이유를 찾는다'(2026-10-08 대표 B안) */}
      <h1 className="m-0 text-[clamp(30px,7vw,44px)] font-black leading-[1.25] tracking-[-0.04em]">
        <span className="block">“수업은 잘하는데</span>
        <span className="block">회원이 없어요.”</span>
        <span className="mt-2 block text-primary">그 이유, 1분이면 찾아요.</span>
      </h1>
      <p className="m-0 max-w-[420px] text-[16px] leading-[1.6] text-sub [text-wrap:balance]">예 / 아니요만 누르세요. 마지막에 한 장으로 정리해 드려요. 답은 어디에도 저장되지 않아요.</p>
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        <button type="button" onClick={() => onPick("trainer")} className={`w-full ${BTN_PRIMARY}`}>트레이너예요</button>
        <button type="button" onClick={() => onPick("owner")} className={`w-full ${BTN_OUTLINE}`}>센터 대표예요</button>
        <p className="m-0 text-[14px] text-sub">대표님, 지난달 OT 몇 명이 등록했는지 바로 답하실 수 있나요?</p>
      </div>
    </div>
  );
}

function Question({ set, i, onAnswer, onBack }) {
  const q = set.qs[i];
  const total = set.qs.length;
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-1 text-[15px] font-semibold text-sub hover:text-ink">
          <ArrowLeft size={18} aria-hidden="true" /> 이전
        </button>
        <span className="text-[14px] font-bold text-sub tabular-nums">{i + 1} / {total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevate" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>
      <p className="m-0 text-[14px] font-bold text-primary-strong">{set.title}</p>
      <h2 key={i} className="m-0 min-h-[3.2em] text-[clamp(24px,6vw,32px)] font-black leading-[1.35] tracking-[-0.03em] [text-wrap:balance]">{q.q}</h2>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onAnswer("yes")} className="min-h-[64px] rounded-2xl border border-line-strong bg-card text-[19px] font-extrabold text-ink transition-colors hover:border-primary hover:bg-primary-soft">예</button>
        <button type="button" onClick={() => onAnswer("no")} className="min-h-[64px] rounded-2xl border border-line-strong bg-card text-[19px] font-extrabold text-ink transition-colors hover:border-primary hover:bg-primary-soft">아니요</button>
      </div>
    </div>
  );
}

function Result({ who, set, answers, onRestart }) {
  const items = set.qs.map((q, i) => ({ ...q, missed: answers[i] === q.miss }));
  const missed = items.filter((x) => x.missed);
  const good = items.filter((x) => !x.missed);
  const [ot, setOt] = useState("");
  const [amt, setAmt] = useState("");
  const n = num(ot), a = num(amt);
  const owner = who === "owner";
  const gain = owner ? Math.round(n * 0.1) * a : a;   // 대표: 클로징률 10%p · 트레이너: OT 1명 더
  const inputCls = "min-h-[48px] w-full rounded-xl border border-line-strong bg-elevate px-4 text-[17px] font-bold text-ink tabular-nums outline-none focus:border-primary";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-primary-soft px-4 text-[14px] font-bold text-primary-strong"><Sparkles size={15} aria-hidden="true" /> {set.label} 진단 결과</span>
        <h2 className="m-0 text-[clamp(26px,6.4vw,36px)] font-black leading-[1.25] tracking-[-0.04em]">
          {missed.length > 0 ? set.missHead(missed.length) : set.noneHead}
        </h2>
      </div>

      {missed.length > 0 && (
        <section className="rounded-2xl border border-line bg-card px-5 py-2 shadow-sm">
          <p className="m-0 pb-1 pt-3 text-[15px] font-black text-primary-strong">{set.missLabel}</p>
          {missed.map((x, k) => (
            <div key={x.q} className="flex gap-3 border-t border-line py-3.5 first-of-type:border-t-0">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-[13px] font-black text-white">{k + 1}</span>
              <div className="min-w-0">
                <p className="m-0 text-[17px] font-black leading-[1.45] text-ink [text-wrap:pretty]">{x.why}</p>
                <p className="m-0 mt-1 text-[15px] leading-[1.55] text-sub [text-wrap:pretty]">{x.missText}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {good.length > 0 && (
        <section className="rounded-2xl bg-elevate px-5 py-2">
          <p className="m-0 pb-1 pt-3 text-[15px] font-black text-ink">잘하고 계신 것 {good.length}개 → 앱이 시간을 줄여 줘요</p>
          {good.map((x) => (
            <div key={x.q} className="flex gap-2.5 border-t border-line py-3.5 first-of-type:border-t-0">
              <Check size={18} strokeWidth={3} className="mt-[3px] flex-none text-primary" aria-hidden="true" />
              <p className="m-0 text-[15px] leading-[1.55] text-sub [text-wrap:pretty]">{x.okText}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-card px-5 py-5 shadow-sm">
        <p className="m-0 text-[16px] font-black">내 숫자로 계산해 보기 <span className="text-[14px] font-semibold text-muted">· 선택</span></p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-sub">
            한 달 OT 회원 수
            <input inputMode="numeric" value={comma(ot)} onChange={(e) => setOt(e.target.value)} placeholder="예: 10" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-sub">
            평균 PT 계약 금액(원)
            <input inputMode="numeric" value={comma(amt)} onChange={(e) => setAmt(e.target.value)} placeholder="예: 1,200,000" className={inputCls} />
          </label>
        </div>
        {a > 0 && (owner ? n > 0 : true) ? (
          <p className="m-0 mt-4 text-[17px] font-extrabold leading-[1.5]">
            {owner ? <>클로징률이 10%p만 올라도 한 달 <span className="text-primary">+{wonApprox(gain)}</span></> : <>OT 1명만 더 등록해도 한 달 <span className="text-primary">+{wonApprox(gain)}</span></>}
            <span className="block text-[13px] font-semibold text-muted">{owner ? `OT ${n}명 × 10% × 평균 계약 금액 · 예시 계산이에요.` : n > 0 ? `OT ${n}명 중 1명이면 클로징률 +${Math.round(1000 / n) / 10}%p · 1년이면 +${wonApprox(a * 12)} · 예시 계산이에요.` : "평균 계약 금액 1건 · 예시 계산이에요."}</span>
          </p>
        ) : (
          <p className="m-0 mt-3 text-[14px] text-muted">숫자를 넣으면 바로 계산돼요. 저장되지 않아요.</p>
        )}
      </section>

      <div className="flex flex-col gap-2.5">
        {owner ? (
          <>
            <a href={contactHref()} className={`w-full ${BTN_PRIMARY}`}>15분 시연 요청하기(카톡) <Arrow /></a>
            <a href="/signup?type=center" className={`w-full ${BTN_OUTLINE}`}>센터로 시작하기</a>
          </>
        ) : (
          <>
            <a href="/signup" className={`w-full ${BTN_PRIMARY}`}>PT 한 회 값으로 시작하기 <Arrow /></a>
            <a href="/try" className={`w-full ${BTN_OUTLINE}`}>가입 없이 먼저 눌러 보기</a>
          </>
        )}
        <p className="m-0 text-center text-[13px] text-muted">
          {owner ? `센터 월 ${PLANS.center.amount.toLocaleString("ko-KR")}원(부가세 포함)` : `프로 월 ${PLANS.solo.amount.toLocaleString("ko-KR")}원 · 베이직 월 ${PLANS.basic.amount.toLocaleString("ko-KR")}원(부가세 포함)`} · 첫 결제 7일 안에는 전액 환불
        </p>
        <button type="button" onClick={onRestart} className="mx-auto mt-2 min-h-[44px] px-3 text-[15px] font-semibold text-sub hover:text-ink">처음부터 다시 하기</button>
      </div>
      <p className="m-0 text-center text-[12px] text-muted">간단한 자가 점검이에요. 결과는 효과를 약속하지 않아요.</p>
    </div>
  );
}

export default function CheckPage() {
  return <Suspense fallback={null}><CheckFlow /></Suspense>;
}

function CheckFlow() {
  const w = useSearchParams().get("who");   // 첫 연락 문구의 직접 링크(/check?who=owner)
  const [who, setWho] = useState(w === "trainer" || w === "owner" ? w : null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState([]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [who, i]);
  const set = who ? SETS[who] : null;
  const done = set && i >= set.qs.length;
  const answer = (v) => { const next = answers.slice(0, i); next[i] = v; setAnswers(next); setI(i + 1); };
  const back = () => { if (i === 0) { setWho(null); setAnswers([]); } else setI(i - 1); };
  const restart = () => { setWho(null); setI(0); setAnswers([]); };
  return (
    <div className="min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header page={who === "owner" ? "center" : "trainer"} nav={[["/lp#features", "기능"], ["/lp#pricing", "가격"]]} cta={{ label: "시작하기", href: who === "owner" ? "/signup?type=center" : "/signup" }} />
      <main className="mx-auto w-full max-w-[560px] px-5 pb-20 pt-10">
        {!set ? <Start onPick={(w) => { setWho(w); setI(0); setAnswers([]); }} />
          : done ? <Result who={who} set={set} answers={answers} onRestart={restart} />
          : <Question set={set} i={i} onAnswer={answer} onBack={back} />}
      </main>
      <Footer />
    </div>
  );
}
