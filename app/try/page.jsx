"use client";

/* =========================================================================
   기능 체험(/try · 2026-10-06 · 로그인 없음) — 랜딩의 [직접 눌러 보기]가 여기로 온다.
   폰 두 대(트레이너 · 회원)를 나란히 두고, 한쪽에서 누르면 다른 쪽에 바로 도착하는 걸 직접 해 본다.
   ⚠️ 데이터는 이 화면 안에만(서버에 아무것도 안 씀 · AI 호출 없음). 가짜 회원 이름(오트 강남점 데모와 같음).
   장면: #qr(OT 신청서) · #event(회원 이벤트) · #booking(수업 예약 요청) · #sign(운동일지 확인 · 서명)
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { CalendarClock, FileSignature, Gift, QrCode } from "lucide-react";
import { Header, Footer, BTN_PRIMARY, BTN_OUTLINE, Arrow, LP_CSS } from "@/app/lp/parts";
import { TRY_CSS } from "@/components/try/Stage";
import SceneQr from "@/components/try/SceneQr";
import SceneEvent from "@/components/try/SceneEvent";
import SceneBooking from "@/components/try/SceneBooking";
import SceneSign from "@/components/try/SceneSign";

const SCENES = [
  { id: "qr", icon: QrCode, label: "QR로 OT 신청", lead: "등록하는 자리에서 QR 한 번. 원하는 요일 · 시간과 목표가 트레이너 폰에 바로 도착해요.", C: SceneQr },
  { id: "event", icon: Gift, label: "회원 이벤트", lead: "출석 챌린지를 열면 회원 폰에 바로 뜨고, 참여한 회원과 달성 여부가 자동으로 모여요.", C: SceneEvent },
  { id: "booking", icon: CalendarClock, label: "수업 예약 요청", lead: "회원이 비어 있는 시간을 골라 요청하고, 트레이너는 승인 한 번이면 끝나요.", C: SceneBooking },
  { id: "sign", icon: FileSignature, label: "운동일지 · 서명", lead: "트레이너가 저장한 운동일지를 회원이 확인하고 손가락으로 서명해요. 종이 수업 확인 서명을 대신해요.", C: SceneSign },
];

export default function TryPage() {
  const [cur, setCur] = useState("qr");
  const [n, setN] = useState(0);   // 처음부터 = 장면 다시 그리기
  const topRef = useRef(null);
  useEffect(() => {
    (async () => {
      const h = window.location.hash.replace("#", "");
      if (SCENES.some((s) => s.id === h)) setCur(h);
    })();
  }, []);
  const go = (id) => {
    setCur(id); setN((x) => x + 1);
    try { window.history.replaceState(null, "", `#${id}`); } catch { /* 무시 */ }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const scene = SCENES.find((s) => s.id === cur) || SCENES[0];
  const idx = SCENES.indexOf(scene);
  const next = SCENES[idx + 1];
  const C = scene.C;

  return (
    <div className="min-h-dvh bg-bg text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS + TRY_CSS}</style>
      <Header page="trainer" nav={[["/lp#features", "기능"], ["/lp#pricing", "가격"], ["/center", "센터 대표용"]]} cta={{ label: "시작하기", href: "/signup" }} />
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-8 sm:px-6">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="inline-flex min-h-[32px] items-center rounded-full bg-primary-soft px-3.5 text-[13.5px] font-bold text-primary-strong">가입 없이 직접 눌러 보기</span>
          <h1 className="m-0 mt-3 text-[clamp(28px,5.4vw,42px)] font-black leading-[1.22] tracking-[-0.04em]">한쪽에서 누르면,<br /><span className="text-primary">다른 폰에 바로 도착해요.</span></h1>
          <p className="m-0 mt-3 text-[16px] leading-relaxed text-sub">트레이너 폰과 회원 폰을 나란히 두고 실제 앱처럼 움직여 봤어요. 여기서 누른 건 아무 데도 저장되지 않아요.</p>
        </div>

        <div ref={topRef} className="scroll-mt-28 pt-6">
          <nav aria-label="체험 장면" className="mx-auto flex max-w-[760px] flex-wrap justify-center gap-2">
            {SCENES.map((s) => {
              const on = s.id === cur, I = s.icon;
              return (
                <button key={s.id} type="button" onClick={() => go(s.id)} aria-pressed={on}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-[15px] transition ${on ? "border-ink bg-ink font-bold text-white" : "border-line bg-card font-semibold text-ink hover:border-line-strong"}`}>
                  <I className="h-4 w-4" aria-hidden="true" />{s.label}
                </button>
              );
            })}
          </nav>
          <p className="mx-auto m-0 mt-4 max-w-[640px] text-center text-[15.5px] leading-relaxed text-sub">{scene.lead}</p>
          <div className="mt-5">
            <C key={`${cur}-${n}`} onReset={() => setN((x) => x + 1)} />
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            {next ? (
              <button type="button" onClick={() => go(next.id)} className={BTN_OUTLINE}>다음 체험 · {next.label} <Arrow /></button>
            ) : null}
            <a href="/signup" className={BTN_PRIMARY}>내 회원으로 해 보기 <Arrow /></a>
            <p className="m-0 text-[13.5px] text-sub">체험은 간단히 재현한 화면이에요. 실제 앱은 데이터가 저장되고 폰 알림이 와요.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
