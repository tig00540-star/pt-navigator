// 사업자정보 + 법적고지 링크 블록. 랜딩 푸터·설치안내·약관 레이아웃에서 공용.
// 전자상거래법상 사이트 하단 표기 의무(상호·대표·사업자번호·통신판매업번호·주소·연락처).
import Link from "next/link";
import { COMPANY, contactHref } from "@/lib/company";

const LEGAL = [
  ["/legal/terms", "이용약관"],
  ["/legal/privacy", "개인정보처리방침"],
  ["/legal/refund", "환불·취소 정책"],
];

export default function CompanyInfo({ className = "" }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGAL.map(([href, label]) => (
          <Link key={href} href={href} className="text-[12.5px] font-semibold text-sub no-underline transition-colors hover:text-ink">
            {label}
          </Link>
        ))}
        <a href={contactHref()} className="text-[12.5px] font-semibold text-sub no-underline transition-colors hover:text-ink">문의</a>
      </div>
      <div className="mt-3 space-y-0.5 text-[11.5px] leading-[1.7] text-muted">
        <p>상호 {COMPANY.name} · 대표 {COMPANY.ceo} · 사업자등록번호 {COMPANY.bizNo}</p>
        <p>통신판매업 신고번호 {COMPANY.mailOrderNo || "신고 예정"} · {COMPANY.address}</p>
        <p>고객센터 {COMPANY.tel} · {COMPANY.email}</p>
      </div>
    </div>
  );
}
