# v2 인계 — 디자인 Phase 1 + 폴리시 P0 완료 → 다음: 디자인시스템 B (새 채팅 시작점)

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부: CLAUDE.md · MASTERPLAN.md · pt-navigator-총정리.md ·
> **v2-디자인-감사-폴리시.md · pt-navigator-IA.html · v2-디자인-Phase1-IA재정렬-스펙.md** · 이 문서.
> 역할·흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 git add · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 docs/migrations 기록본.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본 하드리프레시.

---

## 0. 이번 세션 성과 (전부 배포·폰 확인)

### A. 디자인 Phase 1 — IA 재정렬 + "오늘" 통합
- **탭 재정렬:** 글로벌 3탭 **오늘 · 회원 · 내 실적**을 왼쪽 고정(위치 불변=근육기억) + 회원 워크플로우 그룹을 그 오른쪽에 구분선+색으로 묶음(OT amber: 1차 지원·관찰 기록·2차 브리핑 / PT sky: 운동일지·인바디·재등록). `app/page.jsx`의 `TABS` 배열·`GROUP_TAB` 토큰·nav 렌더만(구조 변경 없음).
- **"오늘" 통합:** id 9 재사용 — 스케줄 보드 + 오늘 할일(TodoTab)을 한 스크롤 스택(스케줄엔 `Eyebrow` 헤더, TodoTab은 자체 제목). id 13(할일 단독) 폐지.
- **여정형 라벨:** `1차 OT`→`1차 지원` · `1차 피드백`→`관찰 기록` · `2차 OT`→`2차 브리핑`.
- **회귀 고침:** 미처리예약 클릭이 `setTab(9)`=현재화면 no-op가 되던 것 → `scheduleRef.scrollIntoView`로 상단 스케줄로 스크롤(+`scroll-mt-20`).
- 커밋: `d5f1cc4`(Phase 1) · `fix(ia): 미처리예약 스크롤`.

### B. 폴리시 P0 — 다섯 개 완주
- **P0-1 트레이너 이름:** owner 스케줄·admin에서 트레이너가 이메일로 표시되던 것 → `lib/format.js`의 `personName()`(이메일이면 @앞부분) 표시단 가드. + `trainer.name` 실이름 SQL 교정(`update trainer set name='황대수' where name='...'`).
- **P0-2 이름 폴백:** 명단 밖(숨김·환불) 회원의 남은 예약이 `회원`으로 뜨던 것 → muted `이름 미상`. 실제 터지는 2곳만(ScheduleBoard·PastDueAppointments). 나머지 4개 할일 위젯은 `.in(user_id, memberIds)` 제약이라 폴백이 죽은 코드 = 무수정.
- **P0-3 / 3b 빈값 대시:** `lib/format.js`에 `hasVal()` 추가. 회원 카드(MemberListTab) + 상세 헤더(FirstOTTab OT · PtWorkoutTab PT)의 빈 필드 `-`/`- 세` 숨김, 목표만 항상 표시(미설정=muted). `mapMemberRow`는 무수정(표시단만).
- **P0-4 금액 자간:** 내 실적(MyStats)의 금액이 `font-mono`라 벌어져 보이던 것 → `tabular-nums`(10곳 일괄). 정렬 유지·자연스러워짐.
- **P0-5 스케줄 모바일:** (폰 실측 결과 감사 우려보다 나음 — 이미 가로스크롤/열당 ~103px.) **진짜 버그 = 가로 스크롤 시 왼쪽 시간열이 밀려 사라짐** → 시간열 `sticky left-0`(+헤더 코너) 고정. 일(오늘) 뷰는 이미 모바일 우수.
- 커밋: P0-1~5 각 `fix(polish): …` 서브커밋.

### C. 기능1 공지 — 폰 왕복 테스트 완료
- 앞선 세션에서 A~D 배포(일반/필수확인·게이트·벨·읽음), **이번에 폰 왕복 테스트까지 통과.**

---

## 1. 다음 순서 (권장 확정)

**디자인시스템 B를 기능 4보다 먼저.** 근거: 감사 §3 = "새 기능 쌓기 전 지금이 가장 값싼 타이밍". 기능 4를 먼저 만들면 리포트도 카드/헤더/행을 인라인으로 또 짜서 나중에 마이그레이션 대상만 늘어남. B를 먼저 하면 기능 4가 부품을 상속해 처음부터 일관.

1. **디자인시스템 B — 1차: Card + SectionHeader + ListRow (3부품).** 가장 중복 심한 지점(할일 위젯 5개: ReapproachToday·PastDueAppointments·UnclosedClosingToday·RegisterDueToday·RegisterReapproachToday가 동일 뼈대) + 회원 카드·내 실적·공지가 같은 패턴. **부품 하나씩 뽑고 각 단계 diff·폰으로 "픽셀 동일" 검증**하며 작은 서브커밋. 겉모습 변화 최소(=목적), 미세 통일만.
2. **기능 4 월간 리포트** — B 부품 위에 구축(폴리시 자동 상속).
3. **디자인시스템 B — 2차: Badge · Chip · StatTile · EmptyState · Modal · Button** (남은 프리미티브, 감사 §3 목록).
4. **기능 3 FC → 기능 5 회원앱.**
5. **이후 C(claude.ai/design)** — 추출한 부품을 단일 소스로.

- **감사 2라운드**는 B 하면서 부품 통일로 자연 흡수. 남은 폰 정밀(OT/PT AI 탭)만 필요 시 별도.
- **페이롤 `time_slot` 자동**(짬) · **파일럿 D-3 케이스 5건**(코드 아님·축적) — 백로그.

## 2. 보안 게이트 (중요)
- **실회원 개인정보는 아직 입력 전.** 보안 기본(개인정보 동의·SIM 시뮬데이터 teardown·데모 라벨·최악 RLS 갭, 총정리 §5.2)은 **실회원 입력 시작 직전이 게이트**. 지금은 디자인/기능 우선 OK.
- 전면 하드닝(API 인증·레이트리밋·오프보딩 active·트레이너 RLS)은 파일럿 확산 전 최종 게이트.

## 3. 참고 — 현재 지점
- **트레이너 탭(현재 TABS · page.jsx):** 오늘9 · 회원0 · 내실적8 (글로벌) ‖ 1차지원1 · 관찰5 · 2차2 (ot) / 운동일지10 · 인바디12 · 재등록11 (pt). `GROUP_TAB` = ot(amber)·pt(sky).
- **표시 유틸(`lib/format.js`):** `won` · `personName`(이메일→이름) · `hasVal`(빈값/"-" 판정) — **B에서 재사용**.
- **B 마이그레이션 후보(감사 §3):** Card · SectionHeader · Badge · Chip · StatTile · ListRow · EmptyState · Modal · Button → `components/ui`.
- **기존 자산:** `components/ui/`(Eyebrow · MemberBadge · Toast · ReapproachDateField) · MemberViewShell(회원 뷰 라우터) · C 토큰맵/globals.css `@theme`.

## 4. 확인 필요(다음 세션 초반)
- `trainer.name` 실이름 교정 **SQL 기록본을 `docs/migrations`에 남겼는지** 확인(안 남겼으면 한 줄 추가).

---

## 5. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · 통과 후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 하드리프레시.
> 첨부 먼저 읽어줘: **v2-핸드오프-Phase1+P0완료-다음디자인시스템B.md(이 문서·제일 최신)** + CLAUDE.md + MASTERPLAN.md + pt-navigator-총정리.md + v2-디자인-감사-폴리시.md + pt-navigator-IA.html + v2-디자인-Phase1-IA재정렬-스펙.md.
> 상태: 디자인 Phase 1(IA 재정렬+"오늘" 통합) · 폴리시 P0 다섯 개 · 공지 폰 테스트 전부 완료·배포. 남은 것 = **디자인시스템 B(부품 추출)** · 기능 4 월간 리포트 · 기능 3 FC · 5 회원앱 · 보안은 실회원 입력 전 게이트.
> 오늘은 **디자인시스템 B 1차(Card + SectionHeader + ListRow) 하자** — 할일 위젯 5개부터 마이그레이션, 부품 하나씩 픽셀 동일 검증하며 작은 서브커밋으로.
