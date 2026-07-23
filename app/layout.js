import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import AuthGate from "@/components/AuthGate";

/* 본문 서체 — Pretendard Variable 한 벌(가변, 45~920).
   ⚠️ Geist를 걷어낸 이유: Geist에는 한글 글리프가 없다. 스택이
   `Geist, ui-sans-serif, system-ui`였기 때문에 라틴·숫자만 Geist로 그려지고
   한글은 전부 기기 기본 폰트로 폴백됐다(캔버스 실측: 같은 한글 문장이
   Geist 지정 154.22px vs 존재하지 않는 폰트 155.62px = 사실상 동일).
   즉 한국어 앱인데 한글 조판이 기기마다 달랐다. Pretendard는 한글·라틴을
   한 벌로 덮으므로 여기서 통제권을 되찾는다.
   정적 9종(OTF 10~30MB) 대신 가변 woff2 1파일(2.0MB) — 헬스장 회선 고려. */
const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  style: "normal",
  display: "swap",
  preload: true,
  fallback: ["-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
}); /* font-mono 유틸 47곳 유지 — 숫자·코드용이라 라틴 전용으로 충분 */

/* 손글씨 — 세일즈북 다짐·서명 전용(SalesbookView `.sb-handwriting`이 --font-handwriting 사용).
   self-host woff2(CDN 아님 · Pretendard와 동일 패턴). 정성/사람 손길이 핵심이라 시스템 cursive로 떨어지면 안 됨. */
const handwriting = localFont({
  src: "../public/fonts/NanumPenScript.woff2",
  variable: "--font-handwriting",
  display: "swap",
});

export const metadata = {
  applicationName: "오직 트레이너",
  title: "오직 트레이너",
  description: "트레이너용 OT 세일즈·PT 관리 내비게이터",
  appleWebApp: {
    capable: true,
    title: "오직 트레이너",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // ⚠️ Next 16은 appleWebApp.capable에 대해 `mobile-web-app-capable`(크롬 표준)만 내보내고
  //    `apple-mobile-web-app-capable`은 더 이상 넣지 않는다. 그런데 Safari는 apple 접두 태그를 읽고,
  //    애플이 apple-touch-startup-image(스플래시)의 조건으로 문서화한 것도 이쪽이다.
  //    → 빠지면 iOS에서 스플래시가 무시되고 흰 화면이 뜬다. 수동으로 되살린다.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${geistMono.variable} ${handwriting.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
