# v2 스펙 — 앱 느낌 (0단계 PWA 폴리시 + 1단계 화면 전환)

> 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · `git show --stat HEAD`). 폰=Vercel 하드리프레시(+ 홈화면 설치본은 재설치/캐시).

## 목표
"누가봐도 앱" = ①스탠드얼론 실행(주소창 없음) ②부드러운 화면 전환 ③네이티브 크롬(관성/노치). 스탠드얼론은 이미 `manifest.js`에 `display:"standalone"`으로 **설정돼 있음** → 폰에서 **"홈 화면에 추가"로 설치**하면 전체화면 앱으로 뜸. 이 스펙은 그 위에 **색 정렬 + 크롬 + 전환**을 얹는다.

---

## 0단계 — PWA 폴리시 (색·상태바·크롬)

### 0-1. `app/manifest.js` — 다크 잔재 색 → 밝은 테마
현재 `theme_color`·`background_color`가 `#09090b`(옛 다크). 앱은 밝은 테마(bg `#eef1f5`)라 설치 시 **스플래시·상태바가 검게** 뜸. 밝은 값으로:

```js
background_color: "#ffffff",   // 스플래시 배경
theme_color: "#ffffff",        // 상태바 틴트(스티키 헤더가 흰색 카드라 매칭)
```
(취향: 페이지 캔버스와 맞추려면 둘 다 `#eef1f5`도 가능. 흰색이 가장 깔끔.)

### 0-2. `app/layout.js` — viewport·상태바 스타일
```js
export const viewport = {
  themeColor: "#ffffff",       // manifest와 동일
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",        // ★ 노치까지 화면 사용 → safe-area-inset 변수 활성화
};
```
그리고 `metadata.appleWebApp.statusBarStyle`를 `"black"` → **`"default"`**(밝은 앱은 default가 맞음. black은 상태바가 검게 떠 밝은 헤더와 충돌).

### 0-3. `app/globals.css` — 모바일 크롬 (웹 티 제거)
아래 추가:

```css
/* 앱 느낌 — 탭 하이라이트 제거 + 관성/당겨서새로고침 차단 */
html { -webkit-tap-highlight-color: transparent; }
body { overscroll-behavior-y: none; }   /* 웹 특유의 고무줄·pull-to-refresh 제거 = 앱 시그널 큼 */
```
> ⚠️ `user-select:none`은 **전역 금지** — AI 브리핑·회원 노트를 복사할 수 있어야 함. 크롬(헤더·탭)만 필요하면 개별 요소에.

### 0-4. `app/page.jsx` 헤더 — 노치 안전영역
스티키 헤더가 `top-0`이라 스탠드얼론 노치폰에서 상태바 밑에 물릴 수 있음. 헤더 최상단 컨테이너(현재 `<header className="sticky top-0 z-30 ...">`)에 safe-area 상단 패딩:

```jsx
<header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
```
(선택) admin 헤더도 동일 적용 가능 — 이번엔 트레이너 앱만.

---

## 1단계 — 화면 전환 (Framer Motion)

### 1-1. 설치
```
npm i motion
```
(motion.dev · 옛 framer-motion 후속. React 19·Next 16 호환. `app/page.jsx`는 이미 `"use client"`라 바로 됨.)

### 1-2. `app/page.jsx` — `<main>` 콘텐츠를 AnimatePresence로 감싸기
탭은 라우팅이 아니라 `tab` 상태라, **탭 전체 스위치를 `key={tab}`인 motion.div 하나로** 감싸면 나갈 때/들어올 때가 이어진다. 헤더·탭바는 **안 건드림**(정적 유지 = 앱 패턴).

import 추가:
```jsx
import { motion, AnimatePresence } from "motion/react";
```

현재 구조:
```jsx
<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
  {tab === 9 ? ( ... ) : tab === 7 ? ( ... ) : tab === 8 ? ( ... ) : ( <> ... </> )}
</main>
```

이렇게 감싼다(안쪽 스위치 내용은 그대로):
```jsx
<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={tab}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
    >
      {tab === 9 ? ( ... 기존 그대로 ... ) : tab === 7 ? ( ... ) : tab === 8 ? ( ... ) : ( <> ... </> )}
    </motion.div>
  </AnimatePresence>
</main>
```
- `mode="wait"` = 나가는 화면이 다 사라진 뒤 새 화면이 들어옴(겹침 없이 깔끔).
- `initial={false}` = 첫 로드 때는 애니메이션 안 침(새로고침마다 튀는 것 방지).
- 스프링 값(stiffness 420 / damping 34)은 "빠르고 탄력 있게". 더 부드럽게: stiffness↓(320)·damping↑(38). 톤 조절은 이 두 숫자만.

### 1-3. 기존 `.tab-anim` 중복 제거
지금 각 탭 내용이 `<div className="tab-anim">`로 감싸져 CSS fade+rise를 재생함. motion이 대체하므로 **`tab-anim` 클래스를 그 div들에서 제거**(안 그러면 이중 애니메이션). div 자체는 유지, `className="tab-anim"`만 빼면 됨. `Select-String -Path app -Pattern "tab-anim"`로 전부 찾아 제거.
(선택) `globals.css`의 `@keyframes tabIn`·`.tab-anim` 정의도 미사용이면 삭제.

---

## 검토 체크리스트
- [ ] manifest·layout·viewport 색이 밝은 테마로 정렬(스플래시·상태바). statusBarStyle=default.
- [ ] globals: tap-highlight 투명 + overscroll none. user-select 전역 금지(콘텐츠 복사 보존).
- [ ] 헤더 safe-area 상단 패딩(스탠드얼론 노치 안 물림).
- [ ] motion: `<main>` 스위치가 `AnimatePresence`+`motion.div key={tab}` 한 겹으로 감싸짐. 헤더/탭바는 정적.
- [ ] `tab-anim` 클래스 전부 제거(이중 애니메이션 없음). lint green.
- [ ] 회귀: 탭 전환·회원 선택·PtConfirmBanner·모달 정상. 데스크톱에서도 전환 어색하지 않음.

## 커밋 순서 (제안)
1. **0단계 한 커밋**:
```
git add app/manifest.js app/layout.js app/globals.css app/page.jsx
git commit -m "feat(pwa): 밝은테마 색 정렬 + 노치 safe-area + 모바일 크롬"
```
   (page.jsx 헤더 safe-area만 이 커밋. 전환은 다음.)
2. **1단계 한 커밋**(package.json·lock + page.jsx 전환):
```
git add package.json package-lock.json app/page.jsx
git commit -m "feat(motion): 화면 전환 애니메이션(Framer Motion) + tab-anim 대체"
git show --stat HEAD
```
> 0·1을 page.jsx에서 같이 건드리니, 편하면 **한 커밋으로 묶어도** 무방(파일지정 add만 지키면).

## 검증 (폰)
- **설치본 재확인**: 홈화면 앱 삭제 후 재설치(또는 하드리프레시) → 스플래시·상태바가 **밝게**, 노치에 헤더 안 물림.
- 탭 전환 시 **부드럽게 페이드+상승**(스프링). 당겨도 고무줄/새로고침 안 됨.
- 데스크톱 브라우저에서도 정상.

---

## 다음 (원하면)
- **2단계**: 하단 탭바(모바일 표준 네비) + 스와이프 제스처(motion drag) → 구조 변경이라 별도.
- 로딩을 스피너 → **스켈레톤**으로(앱 느낌 보강, 선택).
