/* =========================================================================
   설치·시작 안내 (/download) — 공개 페이지.
   PWA(웹앱)라 앱스토어 다운로드가 없으므로, "설치 없이 웹으로 시작 + 홈 화면에 추가"
   안내가 토스 심사가 요구하는 '다운로드/이용 경로' 페이지 역할을 한다.
   ⚠️ AuthGate에서 /download 는 게이트 우회(공개) — 로그인 없이 열림.
   ========================================================================= */
import Link from "next/link";
import { Share, MoreVertical, MonitorSmartphone, ArrowRight, Check } from "lucide-react";
import CompanyInfo from "@/components/CompanyInfo";

export const metadata = {
  title: "설치·시작 안내 · 오직 트레이너",
  description: "설치 없이 웹으로 바로 시작하고, 홈 화면에 추가하면 앱처럼 씁니다.",
};

function Sym({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-ink)" strokeWidth="3.4" />
      <path d="M32 7 L37.5 33 L26.5 33 Z" fill="#dc2626" />
      <circle cx="32" cy="32" r="4.2" fill="var(--color-ink)" />
    </svg>
  );
}

const STEPS = [
  {
    icon: Share,
    device: "아이폰 · 아이패드 (Safari)",
    steps: ["Safari로 이 사이트를 엽니다", "하단 공유 버튼(⬆︎)을 누릅니다", "‘홈 화면에 추가’를 선택합니다"],
  },
  {
    icon: MoreVertical,
    device: "안드로이드 (Chrome)",
    steps: ["Chrome으로 이 사이트를 엽니다", "우측 상단 메뉴(⋮)를 누릅니다", "‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택합니다"],
  },
  {
    icon: MonitorSmartphone,
    device: "PC · 태블릿 (브라우저)",
    steps: ["Chrome·Edge로 이 사이트를 엽니다", "주소창 오른쪽 설치 아이콘(⤓)을 누릅니다", "설치 없이 웹으로 바로 써도 됩니다"],
  },
];

export default function DownloadPage() {
  const cta = "inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-bold no-underline transition-colors";
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-[860px] px-6 py-14">
        {/* 헤더 */}
        <Link href="/lp" className="inline-flex items-center gap-2.5 no-underline">
          <Sym size={28} />
          <span className="text-[17px] font-extrabold tracking-[-0.03em]">
            <span className="text-ink">오직</span> <span className="text-primary">트레이너</span>
          </span>
        </Link>

        {/* 히어로 */}
        <div className="mt-10 text-center">
          <h1 className="text-[clamp(26px,4vw,40px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-balance">
            설치 없이 웹으로 바로 시작하세요
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.65] text-sub text-pretty">
            오직 트레이너는 웹앱(PWA)입니다. 브라우저로 바로 쓰고, 홈 화면에 추가하면 일반 앱처럼 아이콘으로 열립니다.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className={`${cta} bg-primary text-white hover:bg-[#c11f1f]`}>
              7일 무료로 시작 <ArrowRight size={17} strokeWidth={2.4} />
            </Link>
            <Link href="/" className={`${cta} border border-line-strong bg-card text-ink hover:bg-elevate`}>
              로그인
            </Link>
          </div>
          <p className="mt-3 text-[13px] text-muted">아이폰 · 안드로이드 · 태블릿 · PC 어디서나 · 카드 등록 후 7일 무료</p>
        </div>

        {/* 홈 화면에 추가 안내 */}
        <div className="mt-14">
          <h2 className="text-center text-[13px] font-bold uppercase tracking-[0.14em] text-primary-strong">홈 화면에 추가 (앱처럼 쓰기)</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, device, steps }) => (
              <div key={device} className="rounded-2xl border border-line bg-card p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft">
                  <Icon size={22} strokeWidth={2} className="text-primary-strong" />
                </div>
                <h3 className="mt-4 text-[15.5px] font-bold tracking-[-0.02em]">{device}</h3>
                <ol className="mt-3 flex flex-col gap-2.5">
                  {steps.map((s, i) => (
                    <li key={s} className="flex gap-2.5 text-[14px] leading-[1.5] text-sub">
                      <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-elevate font-mono text-[11px] font-bold text-muted">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        {/* 무엇을 하는 앱인지(심사·안내용) */}
        <div className="mt-14 rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-[18px] font-extrabold tracking-[-0.03em]">오직 트레이너는 이런 서비스예요</h2>
          <p className="mt-2 text-[14.5px] leading-[1.7] text-sub">
            트레이너·센터를 위한 AI 운영 파트너입니다. 수업을 뺀 대부분의 업무 — 신규등록·재등록 세일즈, 음성 운동일지 자동작성, 회원 셀프관리, 급여·정산, 관리자 대시보드 — 를 한 앱에서 처리합니다.
          </p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {["말로 30초, 운동일지 자동 작성", "OT·재등록 세일즈 서포트", "회원앱(성과 그래프·비포애프터)", "매출·전환·리텐션 대시보드"].map((x) => (
              <li key={x} className="flex gap-2 text-[14px] text-ink">
                <Check size={17} strokeWidth={3} className="mt-0.5 flex-none text-primary" />{x}
              </li>
            ))}
          </ul>
        </div>

        {/* 하단 링크 */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-medium text-sub">
          <Link href="/lp" className="no-underline hover:text-ink">서비스 소개</Link>
          <Link href="/lp#pricing" className="no-underline hover:text-ink">가격</Link>
          <Link href="/lp#faq" className="no-underline hover:text-ink">FAQ</Link>
          <Link href="/signup" className="no-underline hover:text-ink">시작하기</Link>
        </div>
        <p className="mt-8 text-center text-[12px] leading-[1.7] text-muted">
          오직 트레이너는 운동 지도·세일즈·회원관리 도구입니다. 의료기관이 아니며 치료·진단을 제공하지 않습니다.
        </p>

        <div className="mt-10 border-t border-line pt-8">
          <CompanyInfo />
        </div>
      </div>
    </div>
  );
}
