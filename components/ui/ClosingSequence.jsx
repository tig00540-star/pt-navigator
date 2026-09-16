"use client";
/* =========================================================================
   ClosingSequence — 클로징 4비트(떠보기→근거→요청→플러시)+침묵 지시 단일 렌더.
   1차(FirstOTAssist)·2차(SecondOTTab)·재등록(RegBriefView) 공유. DS 톤(primary-soft 카드).

   ★백워드 호환(필수): closing_sequence(object)가 있으면 시퀀스로, 없고 옛 closing_line(string)만
     있으면(옛 캐시 2차 브리핑 등) 그 한 줄만 종전대로 표시한다. 스키마 breaking change 방어.
   ★hold(침묵)는 '회원 대사'가 아니라 '트레이너 행동 지시' — 대사처럼 안 보이게 회색 이탤릭 지시로 구분.
   ========================================================================= */

// 회원에게 그대로 말하는 대사(떠보기·요청·플러시) — 칩 라벨 + 인용. strong=요청(가장 크게).
function SpeechBit({ label, text, strong = false }) {
  return (
    <div>
      <span className="inline-block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">{label}</span>
      <p className={`mt-1 leading-relaxed text-ink ${strong ? "text-base font-semibold" : "text-[13px]"}`}>&ldquo;{text}&rdquo;</p>
    </div>
  );
}

export default function ClosingSequence({ sequence, fallbackLine = "", sweetener = "", metaphor = null, icon = null }) {
  const seq = sequence && typeof sequence === "object" && !Array.isArray(sequence) ? sequence : null;
  const has = Boolean(seq && (seq.trial_close || seq.stakes || seq.plan_pitch || seq.ask || seq.hold || seq.flush));
  const line = typeof fallbackLine === "string" ? fallbackLine : "";
  const mp = metaphor && typeof metaphor === "object" ? metaphor : null;
  const hasMetaphor = Boolean(mp?.metaphor);
  if (!has && !line && !hasMetaphor) return null; // 아무것도 없으면 렌더 안 함

  return (
    <div className="rounded-xl border border-primary/40 bg-primary-soft p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold tracking-label-ko text-primary-strong">
          {has || hasMetaphor ? "세일즈 비유 → 클로징 흐름" : "클로징 한마디"}
        </span>
      </div>

      {/* 세일즈 비유 — 클로징의 자연스러운 문 여는 리드인(비유하고 바로 클로징으로 이어짐). */}
      {hasMetaphor && (
        <div className="mt-2">
          <span className="inline-block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">비유로 열기</span>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">&ldquo;{mp.metaphor}&rdquo;</p>
          {mp.bridge && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{mp.bridge}</p>}
        </div>
      )}

      {has ? (
        <div className="mt-2.5 space-y-2.5">
          {seq.trial_close && <SpeechBit label="① 떠보기" text={seq.trial_close} />}
          {seq.stakes && (
            <div>
              <span className="inline-block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">② 근거</span>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{seq.stakes}</p>
            </div>
          )}
          {seq.plan_pitch && <SpeechBit label="③ 플랜 제시(주 N회·기간·총 회차)" text={seq.plan_pitch} />}
          {seq.ask && <SpeechBit label="④ 요청" text={seq.ask} strong />}
          {seq.hold && (
            /* 트레이너 행동 지시 — 대사 아님(회색 이탤릭 + 🔇로 명확히 구분). */
            <p className="rounded-md border border-line bg-elevate px-2.5 py-1.5 text-[12px] italic leading-relaxed text-muted">
              🔇 {seq.hold}
            </p>
          )}
          {seq.flush && <SpeechBit label="⑤ 물러서면" text={seq.flush} />}
        </div>
      ) : line ? (
        <p className="mt-1.5 text-base font-semibold leading-relaxed text-ink">&ldquo;{line}&rdquo;</p>
      ) : null}

      {sweetener && (
        <p className="mt-2 rounded-md bg-card px-2 py-1 text-[12px] leading-relaxed text-sub">
          <span className="font-semibold text-primary-strong">혜택(덤) · </span>{sweetener}
        </p>
      )}
    </div>
  );
}
