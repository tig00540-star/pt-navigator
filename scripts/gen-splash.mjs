/* iOS 스플래시(apple-touch-startup-image) 생성기 — 수동 1회성 실행.
   실행: node scripts/gen-splash.mjs   → public/splash/*.png 갱신

   왜 필요한가: iOS 홈화면 앱은 스플래시 이미지가 없으면 실행 시 '흰 화면'이 1~2초 뜬다("웹이네" 느낌의 최대 원인).
   기기 해상도별로 정확히 일치하는 PNG가 있어야 iOS가 써준다(하나로 못 때움) → 아래 목록만큼 생성.

   ⚠️ sharp는 next의 전이 의존이라 package.json에 직접 없다(이미지 최적화용으로 딸려옴).
      이 스크립트는 수동 실행 전용이라 무방하나, 의존 변경 후 깨지면 `npm i -D sharp`로 해결.
   ⚠️ 배경색은 app/globals.css의 --color-bg(#eef1f5)와 일치시킨다. 어긋나면 스플래시→앱 전환에서 색이 튄다. */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BG = "#eef1f5";           // = --color-bg (globals.css:17)
const INK = "#0f172a";          // = --color-ink   ("오직")
const PRIMARY = "#dc2626";      // = --color-primary ("트레이너" — 워드마크 2색 대비)
const MUTED = "#64748b";        // = --color-muted (슬로건)
const LOGO = "public/icons/icon-512.png";
const OUT = "public/splash";

/* 세로 구성: 로고 → 워드마크("오직 트레이너") → 슬로건("ONLY FOR TRAINER"). 전체 블록을 화면 중앙에.
   모든 치수는 짧은 변(S) 비율 — 아이폰SE부터 아이패드 12.9"까지 같은 비례로 나온다.
   ⚠️ 한글은 시스템 폰트 의존(Windows=Malgun Gothic). 폰트 없는 환경에서 돌리면 두부글자가 되니 결과를 눈으로 확인할 것. */
const R = {
  logo: 0.24,      // 로고 지름
  gap1: 0.07,      // 로고 ↔ 워드마크
  word: 0.085,     // 워드마크 글자
  gap2: 0.035,     // 워드마크 ↔ 슬로건
  slogan: 0.032,   // 슬로건 글자
};
/* Noto Sans KR — 앱·스플래시·홈페이지를 한 폰트로 통일하기 위한 선택.
   구글 폰트라 홈페이지에서 그대로 쓸 수 있고, Next는 next/font/google의 Noto_Sans_KR로 앱에 적용 가능.
   한글·라틴이 한 패밀리에 있어 워드마크와 슬로건 인상이 어긋나지 않는다(Black 웨이트는 라틴이 폴백되니 Bold 사용). */
const FONT_KR = "Noto Sans KR, Malgun Gothic, sans-serif";
const FONT_EN = "Noto Sans KR, Arial, sans-serif";

/* [CSS폭, CSS높이, 배율] — 세로만(manifest orientation: portrait).
   px 크기 = CSS × 배율. iOS는 media 쿼리로 기기를 특정하므로 CSS 치수가 매칭 키다. */
const DEVICES = [
  [320, 568, 2],   // SE(1세대)
  [375, 667, 2],   // 8 · SE2 · SE3
  [414, 736, 3],   // 8 Plus
  [375, 812, 3],   // X · XS · 11 Pro
  [414, 896, 2],   // XR · 11
  [414, 896, 3],   // XS Max · 11 Pro Max
  [390, 844, 3],   // 12 · 12 Pro · 13 · 13 Pro · 14
  [393, 852, 3],   // 14 Pro · 15 · 15 Pro · 16
  [402, 874, 3],   // 16 Pro
  [428, 926, 3],   // 12/13 Pro Max · 14 Plus
  [430, 932, 3],   // 14/15 Pro Max · 15 Plus · 16 Plus
  [440, 956, 3],   // 16 Pro Max
  [768, 1024, 2],  // iPad 9.7"
  [810, 1080, 2],  // iPad 10.2"
  [834, 1112, 2],  // iPad Pro 10.5"
  [834, 1194, 2],  // iPad Pro 11"
  [1024, 1366, 2], // iPad Pro 12.9"
];

await mkdir(OUT, { recursive: true });

for (const [cw, ch, ratio] of DEVICES) {
  const w = cw * ratio;
  const h = ch * ratio;
  const S = Math.min(w, h);

  const logoSize = Math.round(S * R.logo);
  const wordSize = S * R.word;
  const sloganSize = S * R.slogan;

  // 블록 전체 높이로 상단 위치를 잡아 '로고+글자'가 통째로 중앙에 오게 한다(로고만 중앙이면 글자 때문에 아래로 쏠려 보임).
  const blockH = logoSize + S * R.gap1 + wordSize + S * R.gap2 + sloganSize;
  const top = Math.round((h - blockH) / 2);
  const wordBaseline = top + logoSize + S * R.gap1 + wordSize * 0.82; // 0.82 ≈ cap height 보정
  const sloganBaseline = wordBaseline + S * R.gap2 + sloganSize;

  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <text x="${w / 2}" y="${wordBaseline}" text-anchor="middle" font-family="${FONT_KR}" font-size="${wordSize}" font-weight="700">
        <tspan fill="${INK}">오직</tspan><tspan fill="${PRIMARY}" dx="${wordSize * 0.26}">트레이너</tspan>
      </text>
      <text x="${w / 2}" y="${sloganBaseline}" text-anchor="middle" font-family="${FONT_EN}" font-size="${sloganSize}"
            font-weight="500" letter-spacing="${sloganSize * 0.22}" fill="${MUTED}">ONLY FOR TRAINER</text>
    </svg>`
  );

  const logo = await sharp(LOGO).resize(logoSize, logoSize, { fit: "contain" }).toBuffer();

  const file = path.join(OUT, `splash-${w}x${h}.png`);
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([
      { input: logo, top, left: Math.round((w - logoSize) / 2) },
      { input: text, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9, palette: true }) // 단색 배경이라 팔레트가 훨씬 작다
    .toFile(file);
  console.log(`${file}  (${cw}x${ch} @${ratio}x)`);
}

/* layout.js의 startupImage 배열에 붙일 media 쿼리도 같이 출력 — 손으로 옮겨 적을 때 오타 방지. */
console.log("\n--- layout.js appleWebApp.startupImage 용 ---");
for (const [cw, ch, ratio] of DEVICES) {
  const w = cw * ratio, h = ch * ratio;
  console.log(
    `      { url: "/splash/splash-${w}x${h}.png", media: "(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" },`
  );
}
