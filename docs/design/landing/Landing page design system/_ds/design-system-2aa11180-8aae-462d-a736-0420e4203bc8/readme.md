# 오직 트레이너 (Only for Trainer) — Design System

A design system for **오직 트레이너 / Only for Trainer**, an AI-assisted coaching app for **personal trainers and gym managers**. The product turns member data into pre-class briefings, OT (orientation) support flows, and closing prep — so a trainer can grasp "what to do with this member's body today" at a glance.

## Sources
Built from brand assets provided by the user (no codebase or Figma was attached):
- `assets/logo-only-for-trainer.png` — the app logo (red rounded-square TO monogram + 오직 트레이너 / Only for Trainer wordmark).
- `assets/screen-1cha.jpg` — the **1차 지원** (first-support) screen.
- `assets/screen-2cha.jpg` — the **2차 브리핑** (second-briefing) screen.

Because the source is screenshots + logo only, component values were read visually from the screens (colors sampled from pixels) and a standard primitive set was authored to fit them. There is no upstream code source of truth; treat the screens as the visual reference.

---

## CONTENT FUNDAMENTALS
- **Language:** Korean, professional but plain-spoken. English appears only in the wordmark ("Only for Trainer") and short labels ("OT", "AI").
- **Address & register:** speaks *to the trainer* in polite imperative (존댓말, `~하세요` / `~두세요`). Directs action: "수업 전에 3갈래를 미리 훑어두세요."
- **Structure of copy:** short command + one line of reasoning. Example: "세일즈가 아니라 '몸을 어떻게 조정하나'." Feature blocks are titled as *situation · timing* — e.g. "오늘의 클로징 · 수업 전 준비", "자극 결과별 운동 대처 · 수업 전 준비".
- **Domain vocabulary:** 회원(member), 수업(class/session), 자극(stimulus/pump), 클로징(closing), OT, 브리핑, 관찰(observation). Status options are terse: "자극 잘 옴 / 약하게 옴 / 아직 없음".
- **AI framing:** AI output is labelled honestly — a red **실 AI** badge, "(가설)" (hypothesis, not observation) disclaimers, and a timestamp ("생성: 2026. 7. 12. … · 현재 관찰 기준"). The tone is *assistive*, never overclaiming.
- **Tone:** confident, field-practical, no fluff. Casing: Korean has no case; English labels are Title/UPPER for badges (OT, AI).
- **Emoji/icons:** functional glyph icons only (🔥 for "오늘의 클로징", 🔧 for "대처") — used sparingly as section markers, never decoratively. Numbers and timestamps are shown as-is.

## VISUAL FOUNDATIONS
- **Color:** a **refined warm red** is the single hero color, pulled from the logo (deep maroon `#810207` → bright red `#FD2202`). Deliberately deepened from candy-red so it reads assured, not loud (the user asked to avoid an overly primary red). Primary `--brand` = `#E23A2E`. Buttons use `--brand-gradient` (135° `#C21F2C → #ED2213`); the logo mark uses the deeper `--brand-gradient-deep`. Red is reserved for primary actions, active nav, and AI/status markers — it is the eye-magnet.
- **Neutrals:** cool grays with a faint blue cast. App background is `--gray-100` (`#EEF1F6`); cards are pure white. Text is a near-navy `#1F2430`, not pure black.
- **Accents:** warm **orange** `#F5A623` for the active-tab underline and highlights; **violet** `#9B8BF2` for the secure/shield indicator. Used narrowly.
- **Type:** **Pretendard** throughout — a clean, geometric Korean sans that matches the intuitive, no-nonsense wordmark. One family; hierarchy comes from weight (400–900) and size. Headlines are ExtraBold/Black with tight tracking (`-0.02em`).
- **Spacing:** 4px base grid. Buttons get **generous** horizontal padding (`24px`) per brand direction; cards `20px`.
- **Corner radii:** rounded and friendly — buttons/inputs `14px`, cards `18–22px`, chips/icon-buttons fully pill. Nothing is sharp-cornered.
- **Backgrounds:** flat light-gray surfaces, no photography or patterns behind content. The only gradient is the brand red (buttons, logo, subtle feature-card wash `#FFF6F4 → white`).
- **Cards:** white, generously rounded, hairline `1px` `--border-subtle` border + a soft low shadow (`--shadow-card`, cool-tinted, ~6% opacity). Feature cards ("AI 지원") add a faint red top-wash and red-100 border.
- **Shadows:** soft, low, cool-tinted. Primary red buttons get a colored `--shadow-brand` glow. Bottom nav has an upward `--shadow-nav`.
- **Borders:** hairline neutral borders separate surfaces; the top tabs sit on a 1px baseline with a 3px orange underline on the active tab.
- **Animation:** calm and quick. Ease-out entrances (`--ease-out`), 120–180ms. Press feedback is a subtle scale-down (`--press-scale: .97`) — **no bounce**, no flashy motion. Play carets rotate 90° on expand.
- **Hover/press states:** buttons keep color and scale down slightly on press; icon buttons scale to 0.92; tags/tabs shift color, not size. Secondary surfaces darken subtly.
- **Transparency/blur:** minimal — the secure icon uses a translucent violet fill (`color-mix`); otherwise surfaces are opaque. No glassmorphism.
- **Imagery vibe:** the palette is warm-neutral; imagery, where present, would be clean and bright. No grain, no duotone.
- **Layout rules:** mobile-first, single column, ~390–440px. Fixed header (logo + member selector + action icons) and fixed bottom tab bar; content scrolls between. Features are chunked into titled sections with expandable rows so a trainer scans top-to-bottom fast.

## ICONOGRAPHY
- The app uses a **thin-to-medium line-icon set** (calendar, users, trophy, gear, bell, shield, add-person, refresh, play caret, wrench, sparkles). The **active bottom-nav icon** (회원) is shown in brand red, others muted gray.
- **No icon font or SVG sprite was provided in the source.** This system uses **[Lucide](https://lucide.dev)** (via CDN `unpkg.com/lucide`) as the closest match — same clean line style and ~2px stroke. **⚠️ Substitution flagged:** if the app has its own icon set, replace the Lucide references (component `icon` props take Lucide names; `lucide.createIcons()` runs after render).
- **Emoji** are used only as functional section markers (🔥 클로징, 🔧 대처) in the real app; components model these as Lucide `flame` / `wrench` for consistency. Prefer Lucide over emoji in new work.
- Components accept an `icon` prop = a Lucide name string. Include `<script src="https://unpkg.com/lucide@0.462.0/dist/umd/lucide.min.js">` and call `lucide.createIcons()` after each React render.

---

## Components
Reusable React primitives (`window.DesignSystem_2aa111.*`), grounded in the two screens:
- **core/** — `Button`, `IconButton`, `Card`, `SectionHeader`
- **display/** — `Badge`, `Tag`, `ListRow`
- **navigation/** — `Tabs`, `BottomNav`
- **forms/** — `Select`, `Input`

**Intentional additions** (not literally in the two screenshots but needed for a management app): `Input` — member/goal forms. Flagged here per convention.

## UI kits
- **ui_kits/only-for-trainer/** — interactive recreation of the trainer app (1차 지원 · 관찰 기록 · 2차 브리핑 tabs, member selector, AI generation, bottom nav) in a phone frame.

## Foundations (Design System tab cards)
- **Colors:** brand scale, brand gradients, neutrals, accents, semantic, text-on-surface.
- **Type:** family & weights, type scale.
- **Spacing:** spacing scale, radius, elevation.
- **Brand:** logo & wordmark, voice & tone.

## Root manifest
- `styles.css` — global entry (import this one file); `@import`s all tokens + fonts.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `shadows.css`, `motion.css`, `fonts.css`.
- `components/` — primitives (`.jsx` + `.d.ts` + `.prompt.md` + one `*.card.html` per group).
- `foundations/` — specimen cards.
- `ui_kits/only-for-trainer/` — app recreation.
- `assets/` — logo + reference screenshots.
- `SKILL.md` — Agent-Skills wrapper.

## Notes / caveats
- **Fonts (Pretendard) load from jsDelivr CDN**, not vendored. For offline use, download `PretendardVariable.woff2` into `assets/fonts/` and repoint `tokens/fonts.css`.
- **Icons are Lucide (CDN)** standing in for the app's own set — see ICONOGRAPHY.
- Color/spacing values were sampled from the provided JPEGs; if you have the real design source, verify exact hex/px against it.
