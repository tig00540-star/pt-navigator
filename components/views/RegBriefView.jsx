"use client";
/* 재등록 브리핑 렌더(순수) — 4블록: 왜 지금 → 오늘 수업 흐름 → 비유 → 클로징 → 거절.
   highlightReason = 기록된 reg_reason(있으면 그 거절 강조). 구 스키마 캐시는 legacy 안내. */
import { labelOf, REG_REASON_OPTS } from "@/lib/labels";

export default function RegBriefView({ brief, highlightReason }) {
  if (!brief) return null;
  const b = brief;
  const wn = b.why_now || {};
  const sf = b.session_flow || {};
  const sm = b.sales_metaphor || {};
  const cline = b.closing_line || "";
  const sw = b.sweetener || "";
  const obj = Array.isArray(b.objection_defense) ? b.objection_defense : [];
  const gaps = Array.isArray(b.data_gaps) ? b.data_gaps : [];
  const legacy = !wn.proven && !sf.gap_awareness && obj.length === 0;

  return (
    <div className="mt-3 space-y-3 text-sm">
      {legacy && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          이전 형식 브리핑이에요 — 위 &lsquo;재생성&rsquo;을 누르면 새 형식으로 바뀝니다.
        </div>
      )}
      {b.member_read && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">3분 각인</div>
          <p className="mt-1 leading-relaxed text-ink">{b.member_read}</p>
        </div>
      )}
      {(wn.proven || wn.risk_if_stop || wn.next_roadmap) && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">왜 지금 재등록 · 그동안의 근거</div>
          <dl className="mt-1.5 space-y-1.5">
            {wn.proven && <div><dt className="text-[11px] font-medium text-muted">그동안 확인</dt><dd className="text-sub">{wn.proven}</dd></div>}
            {wn.risk_if_stop && <div><dt className="text-[11px] font-medium text-muted">멈추면</dt><dd className="text-sub">{wn.risk_if_stop}</dd></div>}
            {wn.next_roadmap && <div><dt className="text-[11px] font-medium text-muted">다음 단계</dt><dd className="text-sub">{wn.next_roadmap}</dd></div>}
          </dl>
        </div>
      )}
      {(sf.gap_awareness || sf.goal_raise || sf.timing) && (
        <div className="rounded-xl border border-primary/30 bg-primary-soft p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-strong">🔑 오늘 수업 흐름 · 재등록으로 잇기</div>
          <div className="mt-2 space-y-2">
            {sf.gap_awareness && <p className="text-[13px] leading-relaxed text-ink"><span className="font-semibold text-primary-strong">부족분 인지 · </span>{sf.gap_awareness}</p>}
            {sf.goal_raise && <p className="text-[13px] leading-relaxed text-ink"><span className="font-semibold text-primary-strong">목표 상향 · </span>{sf.goal_raise}</p>}
            {sf.timing && <p className="text-[12px] leading-relaxed text-muted"><span className="font-semibold text-sub">꺼낼 타이밍 · </span>{sf.timing}</p>}
          </div>
        </div>
      )}
      {sm.metaphor && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">세일즈 비유</div>
          <p className="mt-1 leading-relaxed text-ink">&ldquo;{sm.metaphor}&rdquo;</p>
          {sm.bridge && <p className="mt-1 text-[12px] leading-relaxed text-muted">{sm.bridge}</p>}
        </div>
      )}
      {cline && (
        <div className="rounded-xl border border-primary/40 bg-primary-soft p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-strong">클로징 한마디</div>
          <p className="mt-1 font-semibold leading-relaxed text-ink">&ldquo;{cline}&rdquo;</p>
          {sw && <p className="mt-2 rounded-md bg-card px-2 py-1 text-[12px] leading-relaxed text-sub"><span className="font-semibold text-primary-strong">혜택(덤) · </span>{sw}</p>}
        </div>
      )}
      {obj.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sub">거절 선제 방어 ({obj.length})</div>
          <div className="space-y-1.5">
            {obj.map((o, i) => {
              const on = highlightReason && o.reason === highlightReason;
              return (
                <div key={i} className={`rounded-lg border p-2.5 ${on ? "border-primary bg-primary-soft" : "border-line bg-elevate"}`}>
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${on ? "bg-primary-soft text-primary-strong" : "bg-card text-sub"}`}>{labelOf(REG_REASON_OPTS, o.reason)}</span>
                    {o.trigger && <span className="text-[12px] italic text-muted">&ldquo;{o.trigger}&rdquo;</span>}
                  </div>
                  {o.defense && <div className="text-sub"><span className="font-semibold text-sub">대응 · </span>{o.defense}</div>}
                  {o.line && <div className="mt-1 rounded-md bg-primary-soft px-2 py-1 text-[12px] leading-relaxed text-ink"><span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>&ldquo;{o.line}&rdquo;</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {gaps.length > 0 && (
        <div className="rounded-xl border border-line bg-elevate p-3">
          <div className="text-[11px] font-medium text-muted">더 기록하면 브리핑이 좋아지는 점</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-muted">{gaps.map((gp, i) => <li key={i}>{gp}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
