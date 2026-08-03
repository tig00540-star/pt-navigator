// 법적 문서 공용 레이아웃(약관·개인정보·환불). 공개 라우트(AuthGate에서 /legal 우회).
import Link from "next/link";
import CompanyInfo from "@/components/CompanyInfo";

const DOCS = [
  ["/legal/terms", "이용약관"],
  ["/legal/privacy", "개인정보처리방침"],
  ["/legal/refund", "환불·취소 정책"],
];

export default function LegalLayout({ children }) {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-[760px] px-6 py-12">
        <Link href="/lp" className="inline-flex items-center gap-2.5 no-underline">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-ink)" strokeWidth="3.4" />
            <path d="M32 7 L37.5 33 L26.5 33 Z" fill="#dc2626" />
            <circle cx="32" cy="32" r="4.2" fill="var(--color-ink)" />
          </svg>
          <span className="text-[16px] font-extrabold tracking-[-0.03em]">
            <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
          </span>
        </Link>

        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-line pb-5">
          {DOCS.map(([href, label]) => (
            <Link key={href} href={href} className="text-[13.5px] font-semibold text-sub no-underline transition-colors hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>

        <main className="mt-8">{children}</main>

        <div className="mt-14 border-t border-line pt-8">
          <CompanyInfo />
          <p className="mt-4 text-[12px] text-muted">© 2026 오직 트레이너</p>
        </div>
      </div>
    </div>
  );
}
