"use client";
/* =========================================================================
   Modal — 다이얼로그 셸. 규격 출처: DS components/feedback/Modal.prompt.md.
   화면정의서에 적어둔 부채("모달 구현이 통일 안 됨 — 공용과 손수 구성이 섞임")를 여기로 수렴.

   ── 그림자는 --shadow-pop ──
   "그림자는 카드에만 한 종류"의 유일한 예외다. 카드용 shadow-sm을 모달에 쓰면
   오버레이 위에서 떠 보이지 않는다. 둘은 별개 규격이다.

   ── 포털로 옮긴 이유 (과거 버그의 구조적 해결) ──
   `position: fixed`는 조상에 transform이 있으면 뷰포트가 아니라 그 조상 기준으로 앵커된다.
   실제로 tab-anim의 `fill-mode: both`가 남긴 transform이 모달을 가둬 화면 밖으로 밀어낸 적이 있다
   (그때는 fill-mode를 backwards로 고쳐 해결). 포털로 body에 붙이면 조상이 아예 없어져
   같은 종류의 버그가 재발할 수 없다. 애니메이션 규칙을 나중에 누가 바꿔도 안전하다.

   ── 하위호환 ──
   title 없이 쓰면 기존 레이아웃(children이 곧 카드 내용, p-5) 그대로다.
   기존 4곳(회원 등록·수정·공지)이 자기 헤더를 children으로 갖고 있어 깨지면 안 된다.
   title을 주면 DS 구조(헤더/본문/푸터)로 렌더한다.
   ========================================================================= */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const BACKDROP =
  "fixed inset-0 z-[100] flex justify-center bg-[rgb(19_21_27/0.44)] backdrop-blur-[2px]";
const POSITION = {
  center: "items-center p-4",
  sheet: "items-end sm:items-center sm:p-4",
};
const SHEET =
  "max-h-[92vh] w-full overflow-y-auto border border-line bg-card " +
  "shadow-[0_4px_12px_rgb(19_21_27/0.08),0_24px_48px_-20px_rgb(19_21_27/0.4)] " +
  "animate-[ot-sheet_220ms_cubic-bezier(.22,.9,.28,1)] motion-reduce:animate-none";
const SHAPE = {
  center: "rounded-2xl",
  sheet: "rounded-t-2xl sm:rounded-2xl",
};
/* 폭은 별도 축 — className으로 max-w를 덮으면 Tailwind 소스 순서에 따라
   기본값이 이기는 수가 있어(둘 다 특이도 0,1,0) 예측이 안 된다. */
const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };

export default function Modal({
  variant = "center",
  size, // sm | md | lg — 생략 시 variant 기본값(center=md, sheet=lg)
  dismissable = true,
  blocking = false, // 필수 공지 — 닫기 없음·배경 클릭 무시·ESC 무시
  title,
  subtitle,
  footer,
  onClose,
  className = "",
  children,
}) {
  const canClose = dismissable && !blocking;
  const ref = useRef(null);
  /* SSR 가드 — mounted 상태를 두는 대신 document 유무로 판단한다.
     모달은 언제나 사용자 조작 뒤 조건부로 마운트되므로 서버에서 렌더될 일이 없고,
     상태를 두면 불필요한 리렌더 한 번과 lint 규칙 위반(set-state-in-effect)이 따라온다. */
  const canPortal = typeof document !== "undefined";

  /* 배경 스크롤 잠금 — 모달 뒤 화면이 같이 스크롤되면 어디를 보는지 알 수 없다. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* 열릴 때 포커스를 시트로, 닫을 때 트리거로 복원. ESC로 닫기(blocking 제외). */
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && canClose) { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      // 포커스 트랩 — Tab이 시트 밖으로 나가지 않게 한다.
      const f = ref.current.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [canClose, onClose]);

  if (!canPortal) return null;

  const structured = Boolean(title || footer);
  const titleId = title ? "modal-title" : undefined;

  return createPortal(
    <div
      className={`${BACKDROP} ${POSITION[variant] || POSITION.center}`}
      onClick={canClose ? onClose : undefined}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${SHEET} ${SHAPE[variant] || SHAPE.center} ${
          WIDTH[size] || (variant === "sheet" ? WIDTH.lg : WIDTH.md)
        } ${structured ? "" : "p-5"} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {structured ? (
          <>
            <header className="flex items-start justify-between gap-3 px-5 pb-3.5 pt-5">
              <div className="min-w-0">
                {title && (
                  <div id={titleId} className="text-[18px] font-extrabold tracking-[-0.035em] text-ink">
                    {title}
                  </div>
                )}
                {subtitle && <div className="mt-0.5 text-[13px] text-sub">{subtitle}</div>}
              </div>
              {canClose && onClose && (
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-elevate hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </header>
            <div className="px-5 pb-5">{children}</div>
            {footer && (
              <div className="sticky bottom-0 flex gap-2.5 border-t border-line bg-card px-5 py-3.5">
                {footer}
              </div>
            )}
          </>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body
  );
}
