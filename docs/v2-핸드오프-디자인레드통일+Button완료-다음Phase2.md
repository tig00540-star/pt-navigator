# v2 인계 — 디자인 레드 브랜드 통일 + Button 프리미티브 완료 → 다음 Phase 2

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): CLAUDE.md · docs/MASTERPLAN.md · docs/pt-navigator-총정리.md · **이 문서**.
> 역할·흐름: 웹Claude(스펙·검토)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 `docs/migrations` 기록본.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본 하드리프레시.

---

## 0. 이번 세션 성과 — 디자인/브랜드 전면 정리

### A. 디자인 즉효 묶음 (감사 P0/P1 잔여)
`docs/v2-디자인-감사-폴리시.md` 후속. P0 대부분은 프리미티브 스프린트에서 이미 반영돼 있었고, 남은 4건만:
- **AA 대비:** `--color-muted #94a3b8 → #64748b`(흰 카드 위 2.57→4.77:1, AA 통과).
- **죽은 `C` 색토큰 제거**(page.jsx 다크테마 잔재).
- **헤더 회원 셀렉트 라벨**(`👤 회원` 보이는 라벨).
- **스케줄 모바일 기본 일뷰**(좁은 폭 <640px 마운트 1회 effect).

### B. 레드 브랜드 전환 (로고 맞춤)
로고 = 레드 크림슨 + 흰 "TO" 모노그램. 앱 accent가 초록이라 충돌 → **브랜드를 레드로 전환.**
- `app/globals.css` 토큰: `--color-primary #dc2626 · -strong #b91c1c · -soft #fef2f2`(레드). 앱 전역 `primary` 사용처(~250)가 선택·포커스·활성·소프트배지·헤더 라벨까지 레드로 수렴.

### C. 초록 완전 제거 (레드톤 통일)
"빨강+초록 부조화" → **초록 전면 제거.** 한국 관습(상승=빨강) 따라 긍정/성공/상승=레드, 위험/하락=rose.
- **success(초록) 시도 롤백** — 급여·매출·성공을 잠깐 초록으로 뺐다가(§2) 방향 바뀌어 전부 `primary`(레드)로 되돌림. success 토큰 삭제.
- **시맨틱 초록 → 레드/재배치:** `MemberBadge` **OT=amber·PT=sky**(그룹탭색과 정렬 + 초록 제거), `tone.js` 재등록 톤 레드, PtConfirmBanner 성공배너·MonthlyReport 성공/델타·PtInbody 개선 델타·PtReReg hover 전부 레드톤.
- **CTA·게이지·글로우·admin바 초록 그라데이션 → `from-red-500 to-red-600`**(짝 텍스트 white). `shadow-lime` 글로우까지.
- **판정:** `Select-String -Path app,components -Pattern "emerald-|lime-"` = **0건**(스케줄 트레이너 구분 팔레트 teal만 잔존 — 의도).

### D. Button 프리미티브 (감사 ⑦) — 전 화면 이관 완료
- **`components/ui/Button.jsx` 신설.** props: `variant`(primary·solid·ghost·danger) × `accent`(trainer·owner) × `size`(sm·md) + `subtle`(danger 저강도)·`fullWidth`·`as`. purge-safe 정적 맵.
  - primary=레드 채움(owner=fuchsia 그라데이션) · ghost=보더(토큰 hover) · **danger=아웃라인 rose**(브랜드 채움과 fill/outline로 분리) · solid=소프트.
- **배치 0(프리미티브)→1(트레이너 코어)→2(설정)→3a(PT)→3b(OT·기타)→4(원장·게이트)** 로 앱 전 화면 표준 버튼 이관.
- **bespoke 제외(인라인 유지):** 탭 네비·회원 카드 selector·세그먼트/토글 pill·아이콘 단독(X·연필·Trash2·chevron)·특수모양(녹음 알약·아이콘 정사각 send)·텍스트 링크(← 뒤로).

---

## 1. 현재 색 팔레트 (단일 소스)
| 역할 | 색 |
|---|---|
| 브랜드·CTA·선택·포커스·**돈/급여/매출**·성공·상승 | **red**(`primary` 토큰) |
| 주의·재접근·OT | **amber** |
| PT | **sky** |
| 위험·삭제·환불·하락·미등록 | **rose**(danger=아웃라인) |
| 원장 모드 | **fuchsia**(LIVE·게시·트레이너추가) |
| 중립 | zinc/slate·`sub`/`muted` |
- **초록 없음**(teal 스케줄 구분 팔레트만 예외).
- 토큰: `bg/card/elevate/line/ink/sub/muted/primary/-strong/-soft`(globals.css). muted는 AA 통과값(#64748b).

## 2. 커밋 흐름(대략 순서)
즉효(muted·C정리·헤더라벨·스케줄일뷰) → `feat(theme): 브랜드 레드 전환` → `revert(theme): success 롤백` → `feat(theme): 시맨틱 초록 제거(OT amber/PT sky)` → `feat(theme): CTA·게이지·글로우·admin바 초록→레드` → `docs: 스펙 리포 추가` → `feat(ui): Button 프리미티브` → `refactor(ui): 버튼 이관`(배치 1~4, 파일군별).
> 참고: 초록제거 커밋에 SQL 마이그레이션 파일 2개가 `git add -u`로 섞였음(무해 · 라벨만 안 맞음).

## 3. 관련 스펙 문서(docs/)
`v2-스펙-디자인-즉효묶음.md` · `v2-스펙-레드브랜드전환.md` · `v2-스펙-레드톤통일-초록제거.md` · `v2-스펙-Button프리미티브.md`(색맵은 레드브랜드/레드톤통일 스펙이 supersede).

---

## 4. 디자인 후속 (보류·선택 — 급하지 않음)
- **⑧ 타이포 스케일**(display/title/label/body/num): **미착수.** 전면 텍스트 마이그레이션이라 회귀 위험·분량 큼 대비 이득 작음(앱 타이포 위계 이미 양호). 하려면 별도 세션에서 스케일 정의 → 점진 적용. **정의만 하고 안 쓰면 죽은 토큰**이 되니 주의.
- **⑩ 섹션헤더 통일:** **사실상 완료로 판정.** `Eyebrow`가 앱 전역 표준(40곳+), `SectionHeader`는 오늘-위젯 전용 특수 헤더로 역할 분리됨. 나머지 `uppercase` 라벨은 stat/필드 라벨이라 통일 대상 아님. 손댈 것 없음.
- **원장 CTA accent 혼재:** 게시=보라(owner)·급여저장=레드(기본)로 섞임(현재 색 보존한 결과). 원장 화면 CTA를 전부 owner(보라)로 통일하고 싶으면 소규모 후속 가능(선택).
- **Button 미이관 bespoke:** 필요 시 Segmented/Toggle 프리미티브를 따로 만들어 세그먼트/토글 pill 통일(이번 스코프 밖).

---

## 5. 다음 큰 관문 — Phase 2 (기존 인계 그대로 유효)
> 이전 인계(`v2-핸드오프-Phase1완료-다음Phase2.md`) §4·§5 그대로. 실회원 로그인/개인정보 입력 **전 = 보안 하드닝 필수 게이트.**

1. **보안 하드닝** — 회원별 RLS + 트레이너 내부데이터(closing_result/detail·sales_intensity·AI브리핑) 회원 은폐 + 총정리 §5.1 구멍(오프보딩 active·로그 trainer_id RLS·API 인증/레이트리밋·프롬프트 인젝션·service_role 점검) + 개인정보 동의 + SIM teardown(`residence='SIM-데이터'`). **②의 선행.**
2. **기능5 회원앱** — 회원 로그인 → 본인 일지·인바디 추이·예약 조회. `/m` 별도 라우트+lazy(회원 번들에 트레이너 코드 안 실림 = 무게+보안 동시). **①이 선행.**
3. **기능4 solo(개인트레이너)** — `account.type='solo'` 스키마 있음. solo 온보딩+UI 분기. **보안 게이트 없이 먼저 가능** — 타깃이 개인이면 앞당김.
4. 사진 비포애프터(Storage RLS+동의)·클로징 통계 확장·월간리포트 4-b(PDF/이미지) = 데이터/보안 쌓인 뒤.

## 6. 남은 데모(실데이터화 대기)
admin QC 섹션(TRAINERS 하드코딩)·카피봇 문장 템플릿, 재등록 CRM 정적 대본 일부.

---

## 7. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 배포본 하드리프레시.
> 첨부 먼저 읽어줘: **이 문서(v2-핸드오프-디자인레드통일+Button완료-다음Phase2.md · 제일 최신)** + CLAUDE.md + docs/MASTERPLAN.md + docs/pt-navigator-총정리.md.
> 상태: v1·v2 기능 대부분 완료(실 AI·PT관리·급여·로그인). 디자인=**로고 레드 브랜드 통일 + Button 프리미티브 완료**(초록 0). 다음 = **Phase 2(회원앱은 보안 하드닝 선행 / solo는 먼저 가능)**. 디자인 후속 ⑧ 타이포는 보류·선택.
