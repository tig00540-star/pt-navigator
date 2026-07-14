# v2 인계 — solo(A·B) + 앱 느낌(0·1·2) 완료 → 다음 기능 백로그 6종

> 이 문서 = 새 채팅 이어가기용 인계(제일 최신). 함께 첨부(권장): **이 문서** · CLAUDE.md · docs/MASTERPLAN.md · docs/pt-navigator-총정리.md · 직전 인계(`v2-핸드오프-디자인레드통일+Button완료-다음Phase2.md`).
> 역할·흐름: 웹Claude(스펙·검토)→트레이너→클로드코드(diff)→트레이너(git diff)→웹Claude(검토)→트레이너(폰).
> 커밋은 트레이너 직접(파일지정 `git add` · lint 통과 후 · 직후 `git show --stat HEAD`). SQL=Supabase 대시보드, git엔 `docs/migrations` 기록본.
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음 → `Select-String`). lint=`npm.cmd run lint`. 폰=Vercel 배포본 하드리프레시(+홈화면 설치본은 재설치).

---

## 0. 이번 세션 성과 (커밋·검증 완료)

진단(코드 실물 확인) 후 트랙 결정 → **보안 즉시묶음 → solo A·B → 앱 느낌 0·1·2** 순으로 진행. 전부 구현·폰 검증 완료(커밋은 트레이너).

### A. 보안 즉시묶음 — 스펙 `docs/v2-스펙-보안즉시묶음-API인증+active+service_role.md`
- **API 인증+레이트리밋** (오늘 열려있던 구멍): `lib/requireTrainer.js`(서버 · Bearer JWT 검증→활성 트레이너 확인→인메모리 스로틀 20/60s) 신설, `app/api/ot-brief`·`app/api/voice-log` POST 최상단 게이트, 클라 `lib/authHeader.js` + 호출부 5곳(FirstOTAssist·SecondOTTab·PtReRegTab·PtWorkoutTab·VoiceLogTab) 토큰 부착. voice-log는 FormData라 Content-Type 미포함. 데모모드는 인증 스킵.
  - ⚠️ 스펙 초안의 `getUser()` → **`getUser(token)`** 로 수정해 반영(무인자면 persistSession:false라 전건 401 나던 버그).
- **오프보딩 active**: `docs/migrations/2026-07-13-offboarding-active.sql` — `auth_account_id()`·`auth_is_owner()` 헬퍼에 `and active`. (대시보드 적용은 아래 §2 확인.)
- **service_role 감사**: 코드 변경 없음. **§2 미완**(Select-String 5개 아직 안 돌림).

### B. solo Phase A (UI 분기 + 셀프 페이롤) — 스펙 `docs/v2-스펙-solo-PhaseA-UI분기+셀프페이롤.md`
- `lib/useAccount.js` 신설 — 로그인 트레이너 `role`+`account.type`(+이후 `name`/`accountName`) 조회. `isSolo` 제공.
- `app/page.jsx`: solo면 헤더 '관리자' 링크 숨김. `app/admin/page.jsx`: solo가 URL로 와도 `/`로 바운스. `SettingsView`: solo면 셀프 페이롤(`AdminPayrollSettings trainers=[] solo`). `MyStats`: solo 카피 보정.
- **마이그레이션 0** — 페이롤 RLS는 solo=owner라 이미 통과. 기존 center 회귀 0.

### C. solo Phase B (셀프 가입 · 개인/센터) — 스펙 `docs/v2-스펙-solo-PhaseB-셀프가입.md`
- `docs/migrations/2026-07-13-signup-trigger.sql` — `auth.users` INSERT 트리거(`handle_new_signup`, SECURITY DEFINER)가 가입 메타(`account_type`/`display_name`/`account_name`)로 account+owner trainer 생성. **account_type 없으면 no-op → create-trainer(초대 트레이너)와 비충돌.**
- `app/signup/page.jsx` 신설(개인/센터 토글 → `supabase.auth.signUp({options.data})`). `AuthGate.jsx`: `usePathname`으로 `/signup` 로그아웃 통과 + 로그인폼에 가입 링크.
- 이메일 인증 = **대시보드 토글**(코드 아님). 지금 OFF 권장(테스트), 실런칭 전 ON.

### D. 헤더 카피
- 트레이너 헤더 = 회원이름+"세일즈 네비게이터" → **트레이너 본인 이름**. admin 헤더 = "강남 1호점 경영 대시보드" → **실제 센터명**. `useAccount` 확장(trainerName/accountName) + page.jsx + admin/page.jsx.
- 파일럿 owner는 `trainer.name`이 이메일로 시드됐을 수 있음 → 대시보드 `update trainer set name='…' where id='<uid>';` 로 교체 가능.

### E. 폰트 (중대·저비용)
- `app/globals.css` body가 Geist 로드해놓고 **Arial로 하드코딩**돼 있던 것 발견 → `var(--font-geist-sans), …`로 교체. 앱 전체 텍스트 인상 상승.

### F. 앱 느낌 0·1단계 — 스펙 `docs/v2-스펙-앱느낌-PWA폴리시+화면전환.md`
- **0(PWA 폴리시)**: `manifest.js`·`layout.js` 색을 다크잔재(#09090b)→밝은테마(#ffffff), `statusBarStyle=default`, `viewportFit=cover`. `globals.css`에 tap-highlight 투명 + `overscroll-behavior-y:none`(고무줄/당겨서새로고침 제거). page.jsx 헤더 `pt-[env(safe-area-inset-top)]`.
- **1(화면 전환)**: `npm i motion`. `app/page.jsx` `<main>` 스위치를 `AnimatePresence mode="wait"`+`motion.div key={tab}`로 감싸 페이드+상승+스프링 전환. 기존 `.tab-anim` 제거.
- 참고: `key={tab}`이라 탭 전환 시 하위(MemberViewShell 등) remount·재조회 — 폰 검증 "매끄러움" 확인됨.

### G. 앱 느낌 2단계 (하단 탭바) — 스펙 `docs/v2-스펙-앱느낌-2단계-하단탭바.md`
- `components/ui/BottomNav.jsx` 신설 — 하단 고정바 글로벌 4탭(오늘·회원·내실적·설정, lucide 아이콘 CalendarDays/Users/**Award**/Settings · safe-area-inset-bottom). 워크플로우/회원목록→'회원' 섹션 활성.
  - ⚠️ `BarChart3`가 lucide 1.x에 없을 수 있어 **`Award`로 교체**(MyStats와 동일 아이콘 = 일관 + 확실). 아이콘 문제는 lint 아닌 **build**에서 잡힘 주의.
- `app/page.jsx`: 상단 `<nav>`는 **워크플로우 탭일 때만 + 워크플로우 서브탭만**(OT amber/PT sky). 글로벌 4탭은 하단바로 이관. 루트 끝에 `<BottomNav>`.
- `AuthGate.jsx`: 로그아웃 버튼 `bottom-4`→`bottom-20`(하단바 위).

---

## 1. 커밋 메시지 (트레이너가 친 것 · 참고)
- `feat(security): AI 라우트 인증+레이트리밋 (voice-log·ot-brief)` (+ 오프보딩 SQL·스펙 docs)
- `feat(solo): account.type 분기 — /admin 숨김·바운스 + 설정 셀프 페이롤`
- `feat(signup): 공개 셀프 가입(개인/센터) — signUp + 게이트 우회` (+ 트리거 SQL·스펙)
- `feat(header): 트레이너 헤더=본인 이름 / admin 헤더=센터명`
- `fix(theme): 본문 폰트 Arial→Geist`
- `feat(app-feel): PWA 밝은테마 색·safe-area + 화면 전환(Framer Motion)`
- `feat(nav): 하단 탭바(글로벌 4) + 상단 워크플로우 서브탭 분리`

---

## 2. 남은 즉시 확인 (다음 세션 초반에 마무리)
- [ ] **B 트리거 대시보드 적용** + Authentication → Email **"Confirm email" OFF** + 개인/센터 각각 `/signup` 가입 테스트(account+owner trainer 생성 확인 · 기존 create-trainer 초대 여전히 정상).
- [ ] **오프보딩 active SQL** 대시보드 적용(사전확인 `select id,role,active from trainer;` 후).
- [ ] **service_role 감사**(보안 C) — PowerShell 5개: `Select-String -Path app,components,lib,scripts,hooks -Pattern "SERVICE_ROLE" -List` / `Select-String -Path . -Pattern "NEXT_PUBLIC.*SERVICE" -List` / `Select-String -Path app\api\create-trainer\route.js -Pattern "SERVICE_ROLE_KEY|console\."` / `git check-ignore .env.local` / `git log --all --oneline -- .env.local .env`. 기대: create-trainer 1곳만·나머지 결과 없음·ignore됨. 이상 시에만 후속.

---

## 3. 결정사항 (방향 · 다음 세션 전제)

### solo = 외부 판매용 구독 SaaS (3층: A 경험 → B 셀프가입 → C 결제게이트)
- A·B 완료. **C(결제)는 보류** — 사업자등록 + PG 계약/**심사**(SaaS 고위험: 로그인 없이 보는 공개 요금제 페이지 + 환불·해지 약관 필수)가 선행이라 코드 아님.
- **구독 모델 = 트레이너 시트(seat)당 월정액.** 근거: 가치·원가(AI 실비 ∝ 활성 트레이너)·스키마(`trainer` 활성행=시트) 다 정렬. **회원수 기반 금지, 센터 정액 금지**(트레이너 수 늘면 적자).
- 가격 **미확정**: 침투 ₩29k~49k/시트 vs 프리미엄 ₩99k/시트. 시트당 원가 ≈ ₩15~25k(헤비) → **₩99k/시트면 마진 ~80%**(높음·안전) 단 반드시 시트당. 볼륨할인·14일 체험·연납 2개월 무료 제안해둠.
- **결제사**: 포트원(PortOne 슈퍼빌링키·멀티PG) 추천 vs 토스 직접 → **나중 결정**. 빌링키 모델(카드1회→키저장→매월 서버가 금액 승인, 스케줄은 직접(Vercel Cron), 웹훅). C는 C1(구독상태 모델+SubscriptionGate 뼈대·외부의존0) → C2(실결제) 로 분해.

### 디자인/앱
- **reactnativereusables = RN/Expo용 → 지금 Next.js 웹앱엔 부적합.** 웹 등가물은 shadcn/ui지만 **디자인 시스템 통째 교체는 손해**(자체 시스템 방금 완성). shadcn은 **Radix 프리미티브 필요할 때만 체리픽**(방법 B: `npm i @radix-ui/…` + 소스 손복사 후 내 토큰으로 재스킨).
- 타이포 스케일: **보류**(앱 느낌과 무관·회귀 위험·이득 작음). 원하면 가벼운 20%(숫자 tabular-nums + 제목 2~3단 통일)만.
- admin 앱-느낌 정합: **지금은 둠**(원장용·2차·solo는 안 봄). 폰트·PWA색은 전역이라 이미 적용됨. 안 된 건 admin 헤더 safe-area·전환·하단바(admin은 단일스크롤이라 하단바/전환 구조상 안 맞음).

### MCP (개발 워크플로우) — 킵(보류)
- **Supabase MCP(호스티드·OAuth·PAT불요)**: `claude mcp add --scope local --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<REF>&read_only=true&features=database,docs"` → `claude /mcp` 인증. **읽기전용**이면 검증 SELECT 자동화·마이그레이션은 수동 유지(감사흐름 보존). ⚠️ read-only여도 직접DB접속이라 RLS 우회·전 회원 PII 읽힘 → 실회원 전 단계에서만.
- **커밋 자동화 = MCP 아님.** Claude Code 셸이 이미 git 가능 → CLAUDE.md에 레일 박기(lint 게이트·파일지정 add·`git add .` 금지(루트 스크래치 caf.txt·diff-*.txt)·`show --stat` 자기검증·SQL은 수동). GitHub MCP는 PR/이슈용, 불필요.

---

## 4. 다음 = 기능 백로그 6종 (트레이너 요청 · 이 순서로 하나씩)

| 순 | # | 요청 | 크기 | 착수 시 |
|---|---|---|---|---|
| 1 | 3 | **숫자입력 콤마** | S~M | 재사용 포맷 number 입력 컴포넌트 → 가격·세션·급여·환불 등 교체. 독립·전화면 이득. **추천 시작점.** |
| 2 | 1 | **총수업수·잔여수업수 표시** | S | 데이터 있음(session_log.sessions_total − 비-voided daily_workout_log). PtWorkoutTab에 이미 뭐 있는지 확인 후 붙일 위치. |
| 3 | 4 | **트레이너 프로필 → 맞춤 세일즈** | M | **1차·2차·재등록 세 phase 전부**(급한불 제외 — 의료안전). ot-brief `firstPrompt`/`secondPrompt`/`reregisterPrompt`에 트레이너 프로필 블록 주입 + 클라 호출부 3곳이 프로필 전송. 착수 전 TrainerProfileSettings + trainer-profile 마이그레이션 읽기. |
| 4 | 5 | **1차 지원 캐시+재생성 금지+확인** | M | 지금 1차는 무캐시·무한재생성(비용). 캐시 위치(ot_log round1 report?)·"회원정보 맞나?" 확인 UX **결정 필요**. |
| 5 | 6 | **관찰기록 입력 간략화** | M | ObservationTab(큰 폼) 읽고 뭘 줄일지 제안(내 판단). |
| 6 | 2 | **OT도 음성일지** | M | **의미 미정** — OT엔 계약·수업차감 없음. "OT 수업 구두요약→관찰기록 채우기"인지 등 트레이너 확인 필요. |

- **의존성 없음**(4·5는 둘 다 1차 건드리지만 별개: 4=세일즈3종 프로필주입, 5=1차만 캐시/확인).

---

## 5. 파킹된 것 (원할 때)
- C 결제(사업자등록·PG심사 선행) · 요금제 공개페이지+약관 초안(심사용, 코드없이 먼저 가능)
- MCP 개발 워크플로우(Supabase 읽기전용) · 커밋 자동화(CLAUDE.md 레일)
- 타이포 스케일 · 화면별 폴리시(캡처 주면) · 스와이프 제스처(motion drag) · 스켈레톤 로딩 · admin 정합
- 기존 데모 잔여: admin QC(TRAINERS 하드코딩)·카피봇 템플릿·재등록 정적대본 일부

---

## 6. 관련 스펙 문서 (docs/)
`v2-스펙-보안즉시묶음-API인증+active+service_role.md` · `v2-스펙-solo-PhaseA-UI분기+셀프페이롤.md` · `v2-스펙-solo-PhaseB-셀프가입.md` · `v2-스펙-앱느낌-PWA폴리시+화면전환.md` · `v2-스펙-앱느낌-2단계-하단탭바.md`

---

## 7. 새 채팅 첫 메시지 (복붙용)

> pt-navigator 트레이너야. 역할=나 클로드코드 코딩, 너(웹Claude) 설계·스펙·검토. 흐름: 너(스펙)→나→클로드코드(diff)→나(git diff)→너(검토)→나(폰). 커밋은 내가 직접(파일지정 git add · lint 통과 후 · 직후 `git show --stat HEAD`).
> 환경: PowerShell(C:\Users\tig00\pt-navigator · grep 없음→Select-String). lint=`npm.cmd run lint`. SQL=Supabase 대시보드(git엔 docs/migrations 기록본). 폰=Vercel 배포본 하드리프레시.
> 첨부 먼저 읽어줘: **이 문서(v2-핸드오프-solo가입+앱느낌완료-다음기능백로그.md · 제일 최신)** + CLAUDE.md + docs/MASTERPLAN.md + docs/pt-navigator-총정리.md.
> 상태: 보안 즉시묶음 + solo(개인/센터 셀프가입·셀프페이롤) + 앱 느낌(Geist폰트·PWA·스프링 전환·하단탭바) **완료**. 다음 = **기능 백로그 6종**(콤마입력 → 총/잔여수업 → 트레이너프로필 맞춤세일즈(1·2·재등록) → 1차 캐시+확인 → 관찰 간략화 → OT 음성일지). **#3 콤마입력부터** 하자. 그 전에 §2 남은 확인(B 트리거·이메일OFF·가입테스트 / 오프보딩 SQL / service_role 감사)부터 짚어줘.
