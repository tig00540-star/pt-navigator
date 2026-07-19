import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
