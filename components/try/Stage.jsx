"use client";

/* 체험 페이지(/try) 공용 틀(2026-10-06) — 폰 두 대(트레이너 · 회원 · 대표) + 단계 안내.
   PC = 나란히 · 폰 = 위 전환 칩으로 한 대씩(반대쪽에 무언가 도착하면 자동으로 넘어가고 "도착했어요" 알림).
   화면 안 내용은 각 장면이 그린다. 데이터는 이 페이지 안에만(서버에 아무것도 안 씀). */

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ChevronRight, RotateCcw } from "lucide-react";

/** 폰 한 대 */
export function Phone({ label, tone = "trainer", banner, children, active = true, onClick }) {
  const ring = tone === "member" ? "ring-sky-300" : tone === "owner" ? "ring-fuchsia-300" : "ring-primary/40";
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 ${active ? "" : "hidden lg:flex"}`} onClick={onClick}>
      <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${tone === "member" ? "bg-sky-50 text-sky-800" : tone === "owner" ? "bg-fuchsia-50 text-fuchsia-800" : "bg-primary-soft text-primary-strong"}`}>{label}</span>
      <div className={`relative w-full max-w-[360px] overflow-hidden rounded-[34px] border-[6px] border-ink bg-bg shadow-[var(--shadow-pop)] ring-4 ${ring}`}>
        <div className="flex h-7 items-center justify-center bg-ink"><span className="h-1.5 w-16 rounded-full bg-white/25" /></div>
        {banner && (
          <div key={banner.id} className="try-drop absolute inset-x-2 top-9 z-10 flex items-start gap-2.5 rounded-2xl bg-white/95 px-3.5 py-3 text-left shadow-lg ring-1 ring-black/5 backdrop-blur">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">{banner.title}</span>
              <span className="block text-[12.5px] text-sub">{banner.body}</span>
            </span>
          </div>
        )}
        <div className="h-[620px] overflow-y-auto px-3.5 pb-6 pt-3 [scrollbar-width:thin]">{children}</div>
      </div>
    </div>
  );
}

/** 단계 안내 — 지금 할 것 하나를 크게, 끝난 것은 체크 */
export function Guide({ steps, at, onReset }) {
  const done = at >= steps.length;
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3.5 shadow-sm">
      <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
        {steps.map((s, i) => (
          <li key={s.t} className={`flex items-center gap-1.5 text-[13.5px] ${i < at ? "text-cyan-700" : i === at ? "font-bold text-ink" : "text-muted"}`}>
            {i < at ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11.5px] font-bold ${i === at ? "bg-primary text-white" : "bg-elevate text-muted"}`}>{i + 1}</span>}
            {s.t}
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <p className="m-0 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          {done ? <><CheckCircle2 className="h-4 w-4 text-cyan-700" aria-hidden="true" /> 끝까지 해 보셨어요. 실제 앱에서도 똑같이 움직여요.</>
            : <><ChevronRight className="h-4 w-4 text-primary-strong" aria-hidden="true" />{steps[at].hint}</>}
        </p>
        <button type="button" onClick={onReset} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-sub hover:text-ink">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> 처음부터
        </button>
      </div>
    </div>
  );
}

/** 폰 두 대 배치 + 폰 화면 전환(좁은 화면) · side = 지금 보여 줄 쪽(장면이 정함) */
export function Duo({ left, right, side, setSide }) {
  return (
    <>
      <div className="flex gap-1 rounded-full bg-elevate p-[3px] lg:hidden" role="tablist" aria-label="어느 폰을 볼까요">
        {[left, right].map((p, i) => (
          <button key={p.key} type="button" role="tab" aria-selected={side === i} onClick={() => setSide(i)}
            className={`relative min-h-[40px] flex-1 rounded-full px-3 text-[14px] ${side === i ? "bg-card font-semibold text-ink shadow-sm" : "text-sub"}`}>
            {p.label}{p.dot && side !== i ? <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-primary" aria-label="새 소식" /> : null}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Phone label={left.label} tone={left.tone} banner={left.banner} active={side === 0}>{left.screen}</Phone>
        <Phone label={right.label} tone={right.tone} banner={right.banner} active={side === 1}>{right.screen}</Phone>
      </div>
    </>
  );
}

/** 알림 배너 상태 — 3.5초 뒤 사라짐 */
export function useBanner() {
  const [b, setB] = useState(null);
  useEffect(() => {
    if (!b) return;
    const t = setTimeout(() => setB(null), 3500);
    return () => clearTimeout(t);
  }, [b]);
  return [b, (title, body) => setB({ id: Date.now(), title, body })];
}

/** 폰 안 작은 부품 */
export const Card = ({ children, className = "" }) => <div className={`rounded-2xl border border-line bg-card p-3.5 shadow-sm ${className}`}>{children}</div>;
export const Title = ({ children }) => <p className="m-0 mb-2 text-[15px] font-bold text-ink">{children}</p>;
export const Tap = ({ children, onClick, pulse = false, disabled = false, tone = "primary", className = "" }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`relative min-h-[44px] w-full rounded-xl px-4 text-[15px] font-bold transition active:scale-[0.98] disabled:opacity-40 ${tone === "primary" ? "bg-primary text-white" : tone === "ghost" ? "border border-line bg-card text-ink" : "bg-ink text-white"} ${pulse ? "try-pulse" : ""} ${className}`}>
    {children}
  </button>
);
export const AppBar = ({ title, sub }) => (
  <div className="mb-3 flex items-baseline justify-between">
    <span className="text-[17px] font-black tracking-[-0.03em] text-ink">{title}</span>
    {sub && <span className="text-[12.5px] text-muted">{sub}</span>}
  </div>
);

export const TRY_CSS = `
@keyframes tryDrop { from { opacity: 0; transform: translateY(-12px) } to { opacity: 1; transform: none } }
.try-drop { animation: tryDrop .35s ease-out both }
@keyframes tryPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.45) } 50% { box-shadow: 0 0 0 8px rgba(220,38,38,0) } }
.try-pulse { animation: tryPulse 1.6s ease-in-out infinite }
@keyframes tryIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.try-in { animation: tryIn .4s ease-out both }
@media (prefers-reduced-motion: reduce) { .try-drop, .try-pulse, .try-in { animation: none } }
`;
