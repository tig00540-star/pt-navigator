"use client";

export default function PrintButton({ children = "인쇄하기" }) {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex min-h-[40px] items-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-strong print:hidden">
      {children}
    </button>
  );
}
