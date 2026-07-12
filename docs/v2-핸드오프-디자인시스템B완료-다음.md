# v2 인계 — 디자인시스템 B 완료 → 다음 (새 채팅 시작점)

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): CLAUDE.md · MASTERPLAN.md · pt-navigator-총정리.md · v2-디자인-감사-폴리시.md · 이 문서.
> 역할·흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 docs/migrations 기록본.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본 하드리프레시.

---

## 0. 이번 세션 성과 — 디자인시스템 B (부품 추출 · 전부 배포)

**원칙: 픽셀 동일**(겉모습 불변, 구조만 `components/ui`로 추출). 각 부품 diff·폰으로 검증 후 서브커밋.

- **B-1:** `Card` · `SectionHeader` · `ListRow` + 톤맵 `tone.js`(amber/zinc/rose/emerald). 할일 위젯 5개(ReapproachToday·RegisterDueToday·RegisterReapproachToday·UnclosedClosingToday·PastDueAppointments) 이관.
- **B-2a:** `StatTile` · `EmptyState`. MyStats(매출·클로징률 타일) · TodoManual 이관.
- **B-2b-①:** `Badge`(primary/sky/rose/fuchsia) · `Chip`(중립·muted). 회원카드(page.jsx)·MyStats·MonthlyReport·공지 배지 이관.
- **B-2b-②:** `Modal`(variant center/sheet · dismissable). 공지 게이트(강제)·재열람·회원폼(MemberForm) 이관.

→ 현재 `components/ui`: Eyebrow · MemberBadge · Toast · ReapproachDateField(기존) + **tone.js · Card · SectionHeader · ListRow · StatTile · EmptyState · Badge · Chip · Modal**(신규).

## 1. 진행중/파스 상태

- **기능4 월간 리포트 = 4-a만 완료(파스).** `components/views/MonthlyReport.jsx` — 원장 보고용, 월 셀렉터로 과거월 조회, MyStats 데이터 props로 재집계(추가 fetch 0), B 부품 상속. 내 실적에 "월간 리포트" 버튼으로 진입.
  - **파스 이유:** 원장 보기엔 내용이 얇음. **다시 올 때 알맹이 확장**: 전월대비(MoM ↑↓%)·클로징 상세(성공/보류/실패 + `closingApproachStats`/`closingReasonStats`)·재등록 파이프라인·목표 달성률. (데이터·함수 이미 있음 — prev ym 재집계.)
  - **4-b 내보내기 미착수(백로그):** PDF=window.print+@media print(격리는 body.printing-report 클래스로) · 이미지=`html2canvas-pro`(oklch 대응·lazy import). 무게·충돌 안전(잎사귀).
  - **트레이너 실명:** 리포트 헤더가 email→personName("tig00540")이라 원장 문서엔 약함. `trainer.name`(P0-1에서 '황대수' 실명 넣어둠) 조회로 교체 = 원장에 보이기 전 우선.

## 2. 백로그 (착수 대기)

- **Button 표준화(B 마지막 프리미티브).** 픽셀 동일 불가 — 이미 제각각(초록 lime↔emerald 2종·모서리 lg↔xl·크기 십수종). 감사 §2-7 "버튼 역할 정리"로 **표준화(작은 시각 변화 감수)** 해야 값이 남음. 제안 카탈로그: primary(lime→emerald)·admin(fuchsia→purple)·ghost(border-line)·danger(rose) × sm/md. **트레이너 판단으로 일단 킵.**
- **①b 잔여 배지:** AdminAnnouncements(필수확인 fuchsia·핀 primary) → `Badge`로(트리비얼, 그 파일 만질 때).
- **미세 통일 후보(B-1 §6):** 제목 색 규칙·카운트 배지 배경식·PastDue 테두리 zinc-400 등 — 파일 만질 때 하나씩.
- **감사 2라운드:** OT/PT AI 탭 + 폰 실기기 모바일 정밀(스크린샷 주면 진행).

## 3. 다음 순서 (권장)

1. **월간 리포트 알맹이 확장**(MoM·클로징 상세·재등록 파이프라인) — B 부품 값이 눈에 보이는 첫 결과물, 원장에 실사용.
2. 그 위 4-b 내보내기(PDF·이미지).
3. **기능3 FC** / **기능5 회원앱**(= 같은 코드베이스 역할 뷰 + **보안 하드닝 선행**: Auth·RLS 잠금·권한 분리. 실회원 로그인 게이트).
4. Button 표준화 · 감사 2라운드는 사이사이.

## 4. 보안 게이트 (불변)
- **실회원 개인정보 입력 전 = 보안 게이트**(개인정보 동의·RLS 로그인 잠금·데모 라벨·SIM teardown). 회원앱(기능5)이 이 게이트를 당김. 지금은 디자인/기능 우선 OK.

## 5. 참고 — 데이터/유틸
- `lib/format.js`: `won` · `personName`(이메일→이름) · `hasVal`. `lib/memberStatus.js`: 집계 함수 전부 `ym` 인자로 월 필터(과거월 조회 됨) · 단 `closingStats`는 월 스코프 불가(ot_log에 closed_at 없음 → 누적 라벨).
- 트레이너 탭(page.jsx TABS): 오늘9·회원0·내실적8 ‖ 1차지원1·관찰5·2차2(ot amber) / 운동일지10·인바디12·재등록11(pt sky).

## 6. 별건 — 홈페이지·마케팅
- 이번에 `pt-navigator-홈페이지-마케팅-브리프.md` 별도 작성(기능·차별점·후킹·쓰레드 초안). 코딩과 무관 트랙.

---

## 7. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · 통과 후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 하드리프레시.
> 첨부 먼저 읽어줘: **v2-핸드오프-디자인시스템B완료-다음.md(이 문서·제일 최신)** + CLAUDE.md + MASTERPLAN.md + pt-navigator-총정리.md + v2-디자인-감사-폴리시.md.
> 상태: 디자인시스템 B 완료(부품 8종 추출·이관, Button만 백로그). 월간 리포트 4-a 파스(알맹이 확장 대기). 다음 = **월간 리포트 알맹이 확장**(전월대비·클로징 상세·재등록 파이프라인) 하자. 보안은 실회원 입력 전 게이트.
