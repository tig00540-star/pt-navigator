"use client";

/* =========================================================================
   랜딩 2종(트레이너용 /lp · 센터 대표용 /center) 공용 부품.
   -------------------------------------------------------------------------
   기준: Claude Design 시안(docs/design/landing · 기획안 v5 docs/lp-claude-design-기획안.md).
   - 본문은 760px 한 열(PC도 좌우 교차 없음 · 레퍼런스 aurafit의 리듬).
   - 두 페이지는 같은 헤더·글꼴·색·버튼을 쓰고, 헤더 전환 스위치로 서로 오간다(링크 이동).
   - 색은 전역 @theme 토큰 유틸만. 먹색 구간 위 강조만 text-red-300(기획안 §3 #fca5a5).
   - 스크롤 등장 효과는 fail-safe: 루트에 rv-on이 붙은 뒤에만 숨긴다 → JS가 안 돌아도 보인다.
     첫 화면은 효과 없음 · 동작 줄이기 설정이면 효과 없음 · 한 번만 재생.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Mic, X, ZoomIn } from "lucide-react";
import DemoSlot from "./DemoSlot";
import CompanyInfo from "@/components/CompanyInfo";
import ImageLightbox from "@/components/ui/ImageLightbox";

export const COL = "mx-auto w-full max-w-[760px] px-5";
export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const BTN_PRIMARY = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[17px] font-extrabold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-primary-strong ${FOCUS}`;
export const BTN_OUTLINE = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-6 text-[17px] font-bold tracking-[-0.01em] text-ink no-underline transition-colors hover:bg-elevate ${FOCUS}`;
export const BTN_WHITE = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-white px-6 text-[17px] font-extrabold tracking-[-0.01em] text-ink no-underline transition-colors hover:bg-elevate ${FOCUS}`;
export const BTN_GHOST_DARK = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-white/40 px-6 text-[17px] font-bold tracking-[-0.01em] text-white no-underline transition-colors hover:bg-white/10 ${FOCUS}`;
// H2는 크기 없이 — 크기·행간은 쓰는 곳에서 하나만 붙인다(같은 속성 클래스 두 개면 우선순위가 CSS 순서에 달림).
export const H2 = "m-0 font-black tracking-[-0.04em]";
export const H2_MD = "text-[clamp(26px,5vw,40px)] leading-[1.3]";
export const H2_LG = "text-[clamp(30px,6vw,46px)] leading-[1.22]";
export const H3 = "m-0 text-[clamp(28px,5vw,40px)] font-black leading-[1.24] tracking-[-0.04em]";

// 데모(실제 화면 모션 HTML) 캔버스 — 배포본과 같은 524×766 슬롯.
export const DEMO_W = 524;
export const DEMO_H = 766;

/* ───────── 브랜드 ───────── */

export function Sym({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-ink)" strokeWidth="3.4" />
      <path d="M32 7 L37.5 33 L26.5 33 Z" fill="var(--color-primary)" />
      <circle cx="32" cy="32" r="4.2" fill="var(--color-ink)" />
    </svg>
  );
}

export function Wordmark({ size = "text-[18px]" }) {
  return (
    <span className={`whitespace-nowrap ${size} font-black tracking-[-0.04em]`}>
      <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
    </span>
  );
}

/* ───────── 헤더 — 전환 스위치는 스크롤해도 보인다(기획안 §7) ───────── */

function Switch({ page, wide }) {
  const item = (on) =>
    `flex min-h-[44px] items-center justify-center rounded-full text-[15px] no-underline transition-colors ${FOCUS} ${
      wide ? "flex-1" : "px-[18px]"
    } ${on ? "bg-card font-extrabold text-ink shadow-sm" : "font-semibold text-sub hover:text-ink"}`;
  return (
    <nav aria-label="페이지 전환" className={`flex gap-0.5 rounded-full bg-elevate p-[3px] ${wide ? "w-full" : ""}`}>
      <Link href="/lp" aria-current={page === "trainer" ? "page" : undefined} className={item(page === "trainer")}>트레이너용</Link>
      <Link href="/center" aria-current={page === "center" ? "page" : undefined} className={item(page === "center")}>센터 대표용</Link>
    </nav>
  );
}

export function Header({ page, nav, cta }) {
  const home = page === "center" ? "/center" : "/lp";
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-1 sm:px-8 lg:h-[72px] lg:gap-5 lg:py-0">
        <Link href={home} className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-md no-underline ${FOCUS}`} aria-label="오직 트레이너 처음으로">
          <Sym size={26} />
          <Wordmark />
        </Link>
        <div className="hidden lg:block"><Switch page={page} /></div>
        <nav className="hidden flex-1 justify-center gap-1 lg:flex" aria-label="페이지 안내">
          {nav.map(([href, label]) => (
            <a key={href} href={href} className={`inline-flex min-h-[44px] items-center rounded-lg px-3.5 text-[15px] font-semibold text-sub no-underline transition-colors hover:text-ink ${FOCUS}`}>{label}</a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <Link href="/login" className={`inline-flex min-h-[44px] items-center rounded-lg px-2.5 text-[15px] font-semibold text-sub no-underline transition-colors hover:text-ink ${FOCUS}`}>로그인</Link>
          <a href={cta.href} className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-ink px-4 text-[15px] font-bold text-white no-underline transition-colors hover:bg-ink/85 ${FOCUS}`}>{cta.label}</a>
        </div>
      </div>
      <div className="px-4 pb-1.5 lg:hidden"><Switch page={page} wide /></div>
    </header>
  );
}

/* ───────── 스크롤 등장 ───────── */

export function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const els = [...root.querySelectorAll(".rv")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    // 이미 화면 안에 있는 요소는 숨기지 않는다(깜빡임 방지).
    const vh = window.innerHeight;
    for (const el of els) {
      if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add("in");
      else io.observe(el);
    }
    root.classList.add("rv-on");
    return () => io.disconnect();
  }, [rootRef]);
}

// 같은 묶음 안에서 순서대로(설명 → 화면) — 0.11초씩.
export const stagger = (i) => ({ transitionDelay: `${i * 110}ms` });

/* ───────── 조각 ───────── */

export function Pill({ children, dark }) {
  return (
    <span className={`inline-flex min-h-[30px] items-center rounded-full px-[13px] text-[13px] font-extrabold ${dark ? "bg-white/10 text-red-300" : "bg-primary-soft text-primary-strong"}`}>
      {children}
    </span>
  );
}

export function Checks({ items, dark }) {
  return (
    <ul className={`m-0 flex list-none flex-col gap-2.5 p-0 text-left text-[clamp(16px,2.4vw,18px)] leading-[1.5] ${dark ? "text-white/85" : "text-ink"}`}>
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <Check size={18} strokeWidth={3.2} className={`mt-[3px] flex-none ${dark ? "text-red-300" : "text-primary"}`} aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// 흐름 칩 — 마지막 칩만 먹색 채움 · 폰 폭에서 한 줄.
export function Flow({ steps }) {
  return (
    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-bold">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`rounded-full border px-[11px] py-[7px] ${last ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink"}`}>{s}</span>
            {!last && <span className="text-muted" aria-hidden="true">›</span>}
          </span>
        );
      })}
    </div>
  );
}

// 묶음 머리말 — 레퍼런스의 '회원님 화면 / 선생님 화면' 구획.
export function GroupLabel({ children, dark }) {
  return (
    <div className={`rv mx-auto flex w-full max-w-[480px] items-center gap-3 text-[14px] font-bold ${dark ? "text-white/60" : "text-sub"}`}>
      <span className={`h-px flex-1 ${dark ? "bg-white/15" : "bg-line"}`} />
      {children}
      <span className={`h-px flex-1 ${dark ? "bg-white/15" : "bg-line"}`} />
    </div>
  );
}

export function Shot({ src, alt, zoom = true }) {
  const [open, setOpen] = useState(false);
  // 이미 1080×1350 WebP ~100KB로 최적화한 정적 캡처 — next/image 변환 없이 그대로 내보낸다.
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt={alt} width={1080} height={1350} loading="lazy" decoding="async"
    className="block h-auto w-full rounded-2xl border border-line bg-card" />;
  if (!zoom) return img;
  // 탭하면 크게 — 폰에서 글자를 읽을 수 있게.
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${alt} 크게 보기`}
        className={`group relative block w-full cursor-zoom-in rounded-2xl p-0 ${FOCUS}`}>
        {img}
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-[12px] font-bold text-white">
          <ZoomIn size={13} strokeWidth={2.6} aria-hidden="true" /> 크게 보기
        </span>
      </button>
      {/* body로 포털 — 조상 transform(스크롤 등장 효과) 안에서 fixed가 어긋나지 않게. */}
      {open && createPortal(<ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

// 앱 화면 자리 — 스크린샷(img) 또는 실제 화면 데모(demo). 4:5 틀 안에 담는다.
export function Visual({ img, demo, alt, dark }) {
  return (
    <div className={`mx-auto w-full max-w-[480px] rounded-[24px] border p-1.5 sm:p-3 ${dark ? "border-white/10 bg-white/5" : "border-line bg-bg"}`}>
      {img ? <Shot src={img} alt={alt} /> : <DemoSlot src={demo} title={alt} w={DEMO_W} h={DEMO_H} />}
    </div>
  );
}

/* 단계 화면 — 신규 OT·운동일지. 3장을 나란히 두면 한 장이 230px로 작아져 글자가 안 읽힌다 →
   한 장씩 크게(최대 480px) 보여주고, 위 단계 칩으로 넘긴다(폰은 옆으로 밀어도 넘어감).
   step: { step, img, alt } 또는 { step, quote } (quote = 트레이너가 실제로 말한 문장 · 지어내지 않음). */
export function StepShots({ steps }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const go = (i) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  };
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-elevate p-[3px]" role="tablist" aria-label="단계">
        {steps.map((s, i) => (
          <button key={s.step} type="button" role="tab" aria-selected={i === active} onClick={() => go(i)}
            className={`min-h-[44px] rounded-full px-1 text-[13px] font-extrabold transition-colors sm:text-[14px] ${FOCUS} ${
              i === active ? "bg-card text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
            <span className={i === active ? "text-primary" : "text-muted"}>{i + 1}</span> {s.step}
          </button>
        ))}
      </div>
      <div className="rounded-[24px] border border-line bg-bg p-1.5 sm:p-3">
        <ol ref={trackRef} onScroll={onScroll} className="lp-steps m-0 flex list-none snap-x snap-mandatory overflow-x-auto p-0">
          {steps.map((s) => (
            <li key={s.step} className="w-full flex-none snap-center" aria-label={s.step}>
              {s.quote ? (
                <figure className="m-0 flex aspect-[4/5] flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-card p-[clamp(16px,5vw,28px)] text-left">
                  <figcaption className="flex items-center gap-1.5 text-[13px] font-bold text-primary-strong">
                    <Mic size={15} strokeWidth={2.6} aria-hidden="true" /> 수업 끝나고 말한 그대로
                  </figcaption>
                  <blockquote className="m-0 rounded-[18px_18px_18px_4px] bg-elevate px-4 py-3.5 text-[clamp(14px,3.9vw,17px)] leading-[1.6] text-ink">
                    {s.quote}
                  </blockquote>
                </figure>
              ) : (
                <Shot src={s.img} alt={s.alt} />
              )}
            </li>
          ))}
        </ol>
      </div>
      <p className="m-0 text-[13px] text-muted">옆으로 넘기거나 단계를 누르세요 · 화면을 누르면 크게 보여요</p>
    </div>
  );
}

/* 사진 아래 '직접 눌러 보기' 한 줄 — 사진이 있는 칸은 TryCard 대신 이것만(2026-10-06). */
export function TryLink({ href, dark }) {
  return (
    <a href={href} className={`mx-auto mt-3.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-bold no-underline transition-colors ${FOCUS} ${
      dark ? "border border-white/25 text-white hover:bg-white/10" : "border border-line-strong bg-card text-ink hover:bg-elevate"}`}>
      가입 없이 직접 눌러 보기 <ArrowRight size={16} aria-hidden="true" />
    </a>
  );
}

/* 그 밖의 기능 — 기능 이름 + 실제 화면을 옆으로 넘겨 보고, 누르면 크게(2026-10-06 · 대표 요청).
   items: { name, desc, img, alt } · 사진은 데모 센터(지어낸 회원)에서 찍은 실제 앱 화면 1080×1350.
   폰: 손가락으로 넘김(다음 카드가 살짝 보여 넘길 수 있다는 걸 앎) · PC: 양옆 화살표.
   크게 보기: 화면 전체 · 좌우 넘김(화살표 · 키보드 ← → · 손가락 밀기) · ESC/바깥 눌러 닫기. */
export function FeatureGallery({ items, dark }) {
  const trackRef = useRef(null);
  const [open, setOpen] = useState(-1);
  const [edge, setEdge] = useState({ start: true, end: false });
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const start = el.scrollLeft < 8, end = el.scrollLeft + el.clientWidth > el.scrollWidth - 8;
    if (start !== edge.start || end !== edge.end) setEdge({ start, end });
  };
  const page = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 14 : el.clientWidth;
    el.scrollBy({ left: dir * Math.max(step, Math.floor(el.clientWidth / step) * step), behavior: "smooth" });
  };
  const arrow = `flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${FOCUS} ${
    dark ? "border-white/25 text-white hover:bg-white/10" : "border-line-strong bg-card text-ink hover:bg-elevate"}`;
  return (
    <div className="w-full">
      {/* 본문 열(760px)보다 넓게 — 폰은 화면 끝까지, PC는 열 밖으로 조금 더(끝은 흐리게) · 여백은 트랙 안쪽 */}
      <ul ref={trackRef} onScroll={onScroll} aria-label="그 밖의 기능 화면"
        className="lp-steps lp-gallery -mx-5 m-0 flex list-none snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-px-5 px-5 pb-2 pt-1 lg:-mx-[100px] lg:scroll-px-[100px] lg:px-[100px] xl:-mx-[170px] xl:scroll-px-[170px] xl:px-[170px]">
        {items.map((it, i) => (
          <li key={it.img} className="w-[min(70vw,236px)] flex-none snap-start">
            <button type="button" onClick={() => setOpen(i)} aria-label={`${it.name} 화면 크게 보기`}
              className={`group block w-full cursor-zoom-in rounded-2xl p-0 text-left ${FOCUS}`}>
              <span className={`relative block overflow-hidden rounded-2xl border ${dark ? "border-white/10 bg-white/5" : "border-line bg-card shadow-sm"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.img} alt={it.alt} width={1080} height={1350} loading="lazy" decoding="async"
                  className="block aspect-[4/5] h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2 py-1 text-[12px] font-bold text-white">
                  <ZoomIn size={12} strokeWidth={2.6} aria-hidden="true" /> 크게
                </span>
              </span>
              <span className={`mt-3 block text-[16px] font-extrabold tracking-[-0.01em] ${dark ? "text-white" : "text-ink"}`}>{it.name}</span>
              <span className={`mt-1 block text-[14px] leading-[1.5] ${dark ? "text-white/65" : "text-sub"}`}>{it.desc}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className={`m-0 text-left text-[13px] ${dark ? "text-white/55" : "text-muted"}`}>옆으로 넘겨 보세요 · 누르면 크게 보여요</p>
        <div className="flex flex-none gap-2">
          <button type="button" onClick={() => page(-1)} disabled={edge.start} aria-label="이전 기능" className={arrow}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" onClick={() => page(1)} disabled={edge.end} aria-label="다음 기능" className={arrow}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      {open >= 0 && createPortal(<GalleryViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />, document.body)}
    </div>
  );
}

function GalleryViewer({ items, index, onIndex, onClose }) {
  const n = items.length, it = items[index];
  const closeRef = useRef(null);
  const swipe = useRef(null);
  const swiped = useRef(false);   // 밀어서 넘긴 직후의 click은 '바깥 눌러 닫기'로 치지 않는다
  const go = (d) => onIndex((i) => (i + d + n) % n);
  useEffect(() => {
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; prevFocus?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndex((i) => (i + 1) % n);
      else if (e.key === "ArrowLeft") onIndex((i) => (i - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    // 옆 사진 미리 받아 두기 — 넘길 때 빈 화면 없이
    [items[(index + 1) % n], items[(index - 1 + n) % n]].forEach((x) => { const im = new Image(); im.src = x.img; });
    return () => window.removeEventListener("keydown", onKey);
  }, [index, n, items, onIndex, onClose]);
  const down = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { swiped.current = true; go(dx < 0 ? 1 : -1); }
  };
  const nav = `absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 sm:flex ${FOCUS}`;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${it.name} 화면`}
      onClick={() => { if (swiped.current) { swiped.current = false; return; } onClose(); }}
      onPointerDown={down} onPointerUp={up}
      className="fixed inset-0 z-[100] flex flex-col bg-[rgb(10_11_15/0.94)] text-white">
      <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <span className="text-[14px] font-bold text-white/70">{index + 1} / {n}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기"
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white ${FOCUS}`}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2 sm:px-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={it.img} src={it.img} alt={it.alt} onClick={(e) => { e.stopPropagation(); swiped.current = false; }} draggable={false}
          className="max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl" />
        <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="이전 화면" className={`${nav} left-5`}><ChevronLeft size={26} aria-hidden="true" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="다음 화면" className={`${nav} right-5`}><ChevronRight size={26} aria-hidden="true" /></button>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <button type="button" onClick={() => go(-1)} aria-label="이전 화면" className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/12 sm:hidden ${FOCUS}`}><ChevronLeft size={22} aria-hidden="true" /></button>
        <div className="min-w-0 flex-1 text-center">
          <p className="m-0 text-[17px] font-extrabold">{it.name}</p>
          <p className="m-0 mt-0.5 text-[14px] leading-[1.5] text-white/70">{it.desc}</p>
        </div>
        <button type="button" onClick={() => go(1)} aria-label="다음 화면" className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/12 sm:hidden ${FOCUS}`}><ChevronRight size={22} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

/* 기능 한 행 — 라벨 알약 · 제목 두 줄 · (흐름 칩) · 효과 3줄 · 보충 한 줄 · 앱 화면(한 열). */
export function FeatureRow({ pill, title, flow, checks, note, visual, dark, children }) {
  return (
    <div className="flex w-full flex-col items-center gap-[18px] text-center">
      <div className="rv flex flex-col items-center gap-3.5" style={stagger(0)}>
        <Pill dark={dark}>{pill}</Pill>
        <h3 className={H3}>{title[0]}<br />{title[1]}</h3>
      </div>
      {flow && <div className="rv" style={stagger(1)}><Flow steps={flow} /></div>}
      <div className="rv flex flex-col items-center gap-3" style={stagger(flow ? 2 : 1)}>
        <Checks items={checks} dark={dark} />
        <p className={`m-0 text-[14px] ${dark ? "text-white/60" : "text-sub"}`}>· {note}</p>
      </div>
      <div className="rv mt-1.5 w-full" style={stagger(flow ? 3 : 2)}>
        {children || <Visual {...visual} dark={dark} />}
      </div>
    </div>
  );
}

// 사진이 아직 없는 기능 칸 — 실제 동작 순서 + 체험 페이지로(2026-10-06 · 사진이 오면 Visual로 바꾼다).
//   예시 문구(quote)는 데모 센터에서 실제로 만든 결과만 넣는다(지어내지 않음).
export function TryCard({ href, steps, quote, quoteBy, dark }) {
  return (
    <div className={`mx-auto w-full max-w-[460px] rounded-2xl border px-5 py-5 text-left ${dark ? "border-white/15 bg-white/5" : "border-line bg-card shadow-sm"}`}>
      <ol className="m-0 list-none space-y-2.5 p-0">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12.5px] font-black ${dark ? "bg-white/15 text-white" : "bg-primary text-white"}`}>{i + 1}</span>
            <span className={`text-[15.5px] font-semibold leading-[1.5] ${dark ? "text-white/90" : "text-ink"}`}>{s}</span>
          </li>
        ))}
      </ol>
      {quote && (
        <figure className={`m-0 mt-4 rounded-xl px-4 py-3 ${dark ? "bg-white/10" : "bg-primary-soft"}`}>
          <blockquote className={`m-0 text-[15px] font-bold leading-[1.55] ${dark ? "text-white" : "text-primary-strong"}`}>{quote}</blockquote>
          {quoteBy && <figcaption className={`mt-1.5 text-[12.5px] ${dark ? "text-white/55" : "text-sub"}`}>{quoteBy}</figcaption>}
        </figure>
      )}
      {href && (
        <a href={href} className={`mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl text-[15.5px] font-extrabold no-underline transition-colors ${FOCUS} ${dark ? "bg-white text-ink hover:bg-elevate" : "bg-ink text-white hover:bg-ink/85"}`}>
          가입 없이 직접 눌러 보기 <ArrowRight size={17} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

// 전 → 후 줄(취소선 → 굵게).
export function BeforeAfter({ rows }) {
  return (
    <div className="w-full max-w-[600px] rounded-2xl border border-line bg-card px-[22px] py-2 shadow-sm">
      {rows.map(([before, after], i) => (
        <div key={before} className={`rv grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-2.5 py-4 text-left ${i ? "border-t border-line" : ""}`} style={stagger(i)}>
          <span className="text-[15px] text-sub line-through decoration-line-strong">{before}</span>
          <span className="text-center font-extrabold text-primary" aria-hidden="true">→</span>
          <strong className="text-[16px] font-extrabold sm:text-[17px]">{after}</strong>
        </div>
      ))}
    </div>
  );
}

export function Faq({ items }) {
  return (
    <div className="rv w-full max-w-[640px] rounded-2xl border border-line bg-card px-5 shadow-sm">
      {items.map(({ q, a }, i) => (
        <details key={q} className={`lp-faq ${i ? "border-t border-line" : ""}`}>
          <summary className={`flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-3 text-left text-[16px] font-bold ${FOCUS}`}>
            {q}
            <ChevronDown size={20} className="lp-faq-chev flex-none text-muted transition-transform" aria-hidden="true" />
          </summary>
          <p className="m-0 pb-[18px] text-[15px] leading-[1.6] text-sub">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function Arrow() {
  return <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />;
}

/* ───────── 푸터(기획안 §8) ───────── */

export function Footer() {
  const link = `inline-flex min-h-[44px] items-center rounded-md px-2.5 text-[14px] font-semibold text-sub no-underline transition-colors hover:text-ink ${FOCUS}`;
  return (
    <footer className="border-t border-line bg-card">
      <div className={`${COL} flex flex-col gap-5 pb-14 pt-12`}>
        <div className="flex items-center gap-2">
          <Sym size={24} />
          <Wordmark size="text-[17px]" />
        </div>
        <p className="m-0 text-[14px] leading-[1.6] text-sub">
          오직 트레이너는 운동 지도·세일즈·회원관리 도구입니다. 의료기관이 아니며 치료·진단을 제공하지 않습니다.
        </p>
        <nav className="-ml-2.5 flex flex-wrap gap-x-1.5" aria-label="바닥글">
          <Link href="/lp" className={link}>트레이너용</Link>
          <Link href="/center" className={link}>센터 대표용</Link>
          <a href="#pricing" className={link}>가격</a>
          <a href="#faq" className={link}>자주 묻는 질문</a>
          <Link href="/download" className={link}>설치 안내</Link>
        </nav>
        <div className="border-t border-line pt-5">
          <CompanyInfo />
          <p className="mt-4 text-[12px] text-muted">© 2026 오직 트레이너</p>
        </div>
      </div>
    </footer>
  );
}

/* ───────── 스코프 CSS ───────── */
export const LP_CSS = `
.lp-faq summary::-webkit-details-marker{display:none}
.lp-faq[open] .lp-faq-chev{transform:rotate(180deg)}
.lp-steps{scrollbar-width:none}
.lp-steps::-webkit-scrollbar{display:none}
@media(min-width:640px){.lp-gallery{-webkit-mask-image:linear-gradient(to right,transparent,#000 16px,#000 calc(100% - 56px),transparent);mask-image:linear-gradient(to right,transparent,#000 16px,#000 calc(100% - 56px),transparent)}}
.rv-on .rv{opacity:0;transform:translateY(24px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
.rv-on .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.lp-faq-chev{transition:none!important}.rv-on .rv{opacity:1!important;transform:none!important;transition:none!important}}
`;
