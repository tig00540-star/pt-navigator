"use client";
/* =========================================================================
   ClosingSequence — 클로징 흐름(이유·근거→확인 질문→플랜(횟수·가격 이유)→요청→침묵→망설이면 + OT는 '오늘 안 되면') 단일 렌더.
   1차(FirstOTAssist)·2차(SecondOTTab)·재등록(RegBriefView) 공유. DS 톤(primary-soft 카드).

   ★백워드 호환(필수): closing_sequence(object)가 있으면 시퀀스로, 없고 옛 closing_line(string)만
     있으면(옛 캐시 2차 브리핑 등) 그 한 줄만 종전대로 표시한다. 스키마 breaking change 방어.
   ★hold(침묵)는 '회원 대사'가 아니라 '트레이너 행동 지시' — 대사처럼 안 보이게 회색 이탤릭 지시로 구분.
   ========================================================================= */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Emph, { plainText } from "@/components/ui/Emph";

// 회원에게 그대로 말하는 대사(떠보기·요청·플러시) — 칩 라벨 + 인용. strong=요청(가장 크게).
function SpeechBit({ label, text, strong = false }) {
  return (
    <div>
      <span className="inline-block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">{label}</span>
      <p className={`mt-1 leading-relaxed text-ink ${strong ? "text-base font-semibold" : "text-[13px]"}`}>&ldquo;<Emph>{text}</Emph>&rdquo;</p>
    </div>
  );
}

// compact(OT 사전 준비 리포트 · 2026-10-02): 상자 없이 줄 목록. 기본 = 이유·확인·플랜(가격 한 줄)·요청·망설이면,
//   비유·침묵·오늘 안 되면·숙제는 자세히. 빨강 강조는 요청에만(나머지 대사는 굵게만).
function Line({ label, text, ask = false }) {
  if (!text) return null;
  return (
    <div>
      <p className="m-0 text-[12px] font-semibold text-primary-strong">{label}</p>
      <p className={`m-0 mt-0.5 leading-[1.6] text-ink ${ask ? "text-[17px] font-bold" : "text-[15px]"}`}>&ldquo;<Emph tone={ask ? "primary" : "quiet"}>{text}</Emph>&rdquo;</p>
    </div>
  );
}
function CompactMore({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 text-[12px] font-semibold text-muted transition hover:text-ink">
        비유 · 오늘 안 되면 · 숙제
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="mt-1 space-y-2 border-l-2 border-line pl-3">{children}</div>}
    </div>
  );
}

export default function ClosingSequence({ sequence, fallbackLine = "", sweetener = "", metaphor = null, icon = null, compact = false, priceLine = "" }) {
  const seq = sequence && typeof sequence === "object" && !Array.isArray(sequence) ? sequence : null;
  const has = Boolean(seq && (seq.trial_close || seq.stakes || seq.plan_pitch || seq.ask || seq.hold || seq.flush));
  const line = typeof fallbackLine === "string" ? fallbackLine : "";
  const mp = metaphor && typeof metaphor === "object" ? metaphor : null;
  const hasMetaphor = Boolean(mp?.metaphor);
  const fb = seq?.fallback && typeof seq.fallback === "object" ? seq.fallback : null;
  const hw = Array.isArray(fb?.homework) ? fb.homework.filter((h) => h && h.do) : [];
  if (!has && !line && !hasMetaphor) return null; // 아무것도 없으면 렌더 안 함

  if (compact && has) {
    const note = (label, t) => t ? <p className="m-0 text-[13px] leading-[1.6] text-sub"><span className="font-semibold text-ink">{label}</span> {plainText(t)}</p> : null;
    return (
      <div className="space-y-4 break-keep text-pretty">
        <Line label="① 왜 PT가 필요한지" text={seq.stakes} />
        <Line label="② 확인 질문" text={seq.trial_close} />
        <div>
          <Line label="③ 추천 플랜" text={seq.plan_pitch} />
          {priceLine && <p className="m-0 mt-1.5 inline-block rounded-lg bg-elevate px-2.5 py-1 text-[13px] font-semibold text-ink">{priceLine}</p>}
        </div>
        <Line label="④ 요청" text={seq.ask} ask />
        {seq.hold && <p className="m-0 text-[12.5px] text-muted">요청한 뒤엔 먼저 말하지 말고 기다려요.</p>}
        <Line label="⑤ 망설이면" text={seq.flush} />
        {(hasMetaphor || fb) && (
          <CompactMore>
            {hasMetaphor && note("비유", mp.metaphor)}
            {fb?.next_line && note("오늘 결정이 어려우면", fb.next_line)}
            {hw.length > 0 && (
              <div className="space-y-1">
                <p className="m-0 text-[12px] font-semibold text-muted">다음 수업 전까지 부탁할 것</p>
                {hw.map((h, i) => <p key={i} className="m-0 text-[13px] leading-[1.6] text-sub">{i + 1}. {plainText(h.do)}</p>)}
              </div>
            )}
          </CompactMore>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary-soft p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold tracking-label-ko text-primary-strong">
          {has || hasMetaphor ? "이유 → 플랜 → 요청" : "클로징 한마디"}
        </span>
      </div>

      {/* 2026-10-02 순서 개편(대표): 왜 PT가 필요한지(이유·근거)부터 → 확인 질문 → 플랜(횟수·가격 이유) → 요청.
          비유는 이유를 쉽게 풀어주는 보조라 이유 바로 뒤. 옛 캐시(stakes가 짧은 근거 문장)도 같은 자리에 그대로 보인다. */}
      {has ? (
        <div className="mt-2.5 space-y-2.5">
          {seq.stakes && <SpeechBit label="① 왜 PT가 필요한지" text={seq.stakes} />}
          {hasMetaphor && (
            <div>
              <span className="inline-block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">쉽게 비유하면</span>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">&ldquo;<Emph>{mp.metaphor}</Emph>&rdquo;</p>
              {mp.bridge && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{plainText(mp.bridge)}</p>}
            </div>
          )}
          {seq.trial_close && <SpeechBit label="② 확인 질문" text={seq.trial_close} />}
          {seq.plan_pitch && <SpeechBit label="③ 추천 플랜 · 횟수와 가격의 이유" text={seq.plan_pitch} />}
          {seq.ask && <SpeechBit label="④ 요청" text={seq.ask} strong />}
          {seq.hold && (
            /* 트레이너 행동 지시 — 대사 아님(회색 이탤릭 + 🔇로 명확히 구분). */
            <p className="rounded-md border border-line bg-elevate px-2.5 py-1.5 text-[12px] italic leading-relaxed text-muted">
              🔇 {plainText(seq.hold)}
            </p>
          )}
          {seq.flush && <SpeechBit label="⑤ 망설이면" text={seq.flush} />}
          {fb && (fb.next_line || hw.length > 0) && (
            /* OT 전용 — 오늘 결정이 안 될 때: 붙잡지 않고 다음 OT를 잡고, 다음 수업 전까지 부탁할 것. */
            <div className="rounded-lg border border-line bg-card p-3">
              <span className="inline-block rounded-md bg-elevate px-1.5 py-0.5 text-[10px] font-semibold text-sub">⑥ 오늘 결정이 어려우면</span>
              {fb.next_line && <p className="mt-1 text-[13px] leading-relaxed text-ink">&ldquo;<Emph>{fb.next_line}</Emph>&rdquo;</p>}
              {hw.length > 0 && (
                <>
                  <p className="mt-2 text-[11px] font-medium text-sub">다음 수업 전까지 회원에게 부탁할 것</p>
                  <ul className="mt-1 space-y-1.5">
                    {hw.map((h, i) => (
                      <li key={i} className="text-[13px] leading-relaxed text-ink">
                        <span className="mr-1 text-primary-strong">{i + 1}.</span>&ldquo;<Emph>{h.do}</Emph>&rdquo;
                        {h.why && <span className="block text-[11px] text-muted">{plainText(h.why)}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      ) : line ? (
        <p className="mt-1.5 text-base font-semibold leading-relaxed text-ink">&ldquo;<Emph>{line}</Emph>&rdquo;</p>
      ) : null}

      {sweetener && (
        <p className="mt-2 rounded-md bg-card px-2 py-1 text-[12px] leading-relaxed text-sub">
          <span className="font-semibold text-primary-strong">혜택(덤) · </span>{plainText(sweetener)}
        </p>
      )}
    </div>
  );
}
