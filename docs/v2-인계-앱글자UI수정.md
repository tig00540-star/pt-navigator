# v2 인계 — 앱 전반 글자·UI 수정 (다음 채팅)

> 이 문서 = 새 채팅 이어가기용 인계. 이번 작업 = **기능 추가가 아니라 앱 구석구석 글자(카피)·UI 다듬기.**
> 역할·흐름: 웹Claude(수정 스펙·검토) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰 확인.
> 커밋은 트레이너 직접(파일지정 `git add` · `npm.cmd run lint` 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(`C:\Users\tig00\pt-navigator` · grep 없음→`Select-String`). 폰=Vercel 배포본(`https://pt-navigator.vercel.app`) 하드리프레시. SQL=Supabase 대시보드(이번 UI 작업은 SQL 거의 불필요).

---

## 0. 지금 상태 (완료·배포됨 · 손대는 게 아니라 다듬는 대상)

트레이너 앱(6탭: 회원·1차OT·2차OT·재등록·음성일지·관찰) + 관리자 대시보드 + **회원앱**(열람 + 자가입력 유산소·비포애프터·스케줄 + 운동 달력) + 구독 잠금(B1)·프리미엄 게이트(B2) 전부 실동작. 랜딩 페이지 별도 제작(아티팩트 `ojik-trainer-landing`). 브랜드 = **오직 트레이너 · 레드.**

---

## 1. 다음 = 앱 구석구석 글자·UI 수정

**작업 방식:** 트레이너가 **"이 화면 이 문구/버튼 이렇게"** 지목 → 웹Claude가 **어느 파일·어느 부분인지 찾아** 수정 스펙(또는 바로 지시) → 클로드코드 diff → 검토 → 커밋. 스크린샷 붙이면 위치 특정 빠름.

---

## 2. 파일 ↔ 화면 지도 (어디를 고치나)

| 화면 | 파일 |
|---|---|
| **트레이너 앱 뼈대**(6탭·하단탭바·회원목록·CRM·회원 등록폼) | `app/page.jsx` (대형 · `MemberListTab`·`CRMTab`·`MemberForm` 여기 포함) |
| 1차 OT / 음성일지 / 관찰 / 2차 OT 탭 | `components/tabs/FirstOTTab.jsx`·`VoiceLogTab.jsx`·`ObservationTab.jsx`·`SecondOTTab.jsx` |
| PT 뷰(운동일지·인바디·재등록 서브탭) | `components/views/PTView.jsx`·`PtWorkoutTab.jsx`·`PtInbodyTab.jsx` |
| 회원앱 링크 발급·PT종료 / 세트 편집 | `components/views/MemberAppLink.jsx`·`SetsEditor.jsx` |
| 트레이너용 회원 자가입력 요약(유산소·사진·스케줄) | `components/views/MemberCardioSummary.jsx`·`MemberPhotoSummary.jsx`·`MemberScheduleSummary.jsx` |
| **회원 앱**(홈·수업일지·인바디·무게그래프·유산소·비포애프터·스케줄·달력) | `app/m/[token]/page.jsx` |
| 로그인 화면·결제벽 | `components/AuthGate.jsx` |
| 관리자 대시보드 | `app/admin/page.jsx` |
| **한글 라벨·값 맵**(많은 표시 문구가 여기 모임) | `lib/labels.js` |
| UI 프리미티브(버튼·배지·칩·Eyebrow 등) | `components/ui/*` |
| **색·테마 토큰 정의** | `app/globals.css` (`@theme`) |

> 문구가 안 보이면: `Select-String -Path app,components -Pattern "찾을문구" -Recurse` 로 위치 특정.

---

## 3. UI 수정 규약 (꼭 지킬 것 — 안 지키면 스타일 깨짐)

- **색은 토큰으로만.** 쓰는 토큰: `primary`·`primary-soft`·`primary-strong`·`ink`·`sub`·`muted`·`line`·`bg`·`bg2/elevate`·`card`·`rose-600`(경고)·`amber-500`·`sky-500`(달력). 새 색은 **`globals.css @theme` 또는 `C`/토큰 맵에 추가** — **클래스 문자열 동적 조립 금지**(Tailwind purge에 날아감). 정적 삼항 분기만.
- **아이콘 = lucide-react만.**
- **새 문자열/라벨은 정적**(purge 무관). 데모 가드(`!supabase`/`!memberSupabase`) 유지.
- **표시 문구만 고치고 로직은 건드리지 말 것** — 특히 `ai_summary`(카톡·회원 타임라인·회차 계산), 저장 payload, RLS 관련. "글자·색·간격·배치"만.

---

## 4. 교훈 (주의)

- **교훈1** — `daily_workout_log`엔 UPDATE 정책 없음. 저장 경로 로직은 안 건드림(UI만).
- **`.next` stale** — "됐다 안 됐다" 하면 코드 파기 전에 `rm -rf .next && npm run dev`부터 의심.
- **폰 확인 = Vercel 배포본** — push 후에야 반영, 하드리프레시 필요.
- **`[token]` 경로 git add** — 대괄호가 glob이라 `git add ':(literal)app/m/[token]/page.jsx'`.

---

## 5. 참고 문서 (첨부 권장)

- `CLAUDE.md`(아키텍처·교훈·UI 컨벤션) · `docs/pt-navigator-총정리.md`(기능·스키마) · `docs/v2-남은작업-전체-2026-07-16.md`(전체 백로그) · `docs/v2-기능-완료미완-정리.md`.

---

## 6. 새 채팅 첫 메시지 (복붙용)

> pt-navigator(오직 트레이너) 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 수정 스펙·검토. 흐름: 너(어느 파일·부분인지 특정 + 수정안)→나→클로드코드(diff)→나(git diff)→너(검토)→폰 확인.
> 커밋은 내가 직접(파일지정 git add · `npm.cmd run lint` 통과 후 · 직후 `git show --stat HEAD`). 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). 폰=Vercel 배포본(https://pt-navigator.vercel.app) 하드리프레시.
> 이번 작업 = **앱 구석구석 글자(카피)·UI 다듬기**(기능 추가 아님). 첨부 먼저 읽어줘: 이 문서(v2-인계-앱글자UI수정.md) + CLAUDE.md + docs/pt-navigator-총정리.md.
> 나는 화면/문구를 지목(스크린샷도 줄게)할 테니, 너는 §2 파일지도로 **어느 파일·어느 부분인지 찾아** 수정안을 주고, §3 UI 규약(색은 토큰·동적클래스 금지·lucide·표시문구만·로직 불변)을 지켜줘. 첫 수정 대상 말해줄게.
