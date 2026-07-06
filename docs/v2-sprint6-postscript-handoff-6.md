# v2 — 스프린트6 인계 ⑥차 · ④ 통계 **종료** + PWA · 다음 = ⑤/⑥/⑦ 갈림길

> ④ 클로징/매출 통계 **완전 종료**(HEAD `6b094a8`). 관리자 대시보드가 데모 하드코딩 → 실데이터 파생으로 전환.
> PWA 최소분(iOS 설치·standalone)도 완료. **다음 = ⑤ 치트키 / ⑥ 다듬기+lint / ⑦ 로그인·RLS 중 택1.**
> 역할: 트레이너=클로드 코드 코딩+커밋 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너(git diff 원문)→웹Claude(검토)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만.
> ★ **커밋 직후 `git show --stat HEAD`로 대상 파일 다 들어갔나 확인**(반쪽 커밋 방지).
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차) ·
> `-2`(2차) · `-3`(3차) · `-4`(4차) · `-5`(5차) · `CLAUDE.md`. 코드는 착수 시 필요분만 짚어 청구(§6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5)
③ PT 관리 뷰       ✅ (v2-S6 작업1~4)
PWA 최소분         ✅ ← 이번 세션 (번외 · ⑥ 앞당김)
④ 클로징/매출 통계  ✅ ← 이번 세션 종료
   ├ 4-1  순수 집계 6함수          ✅ c290588
   ├ 4-2a 데이터층 + 요약 스트립    ✅ 36d968e
   └ 4-2b KPI 그리드 실채우기       ✅ 6b094a8
──────────────────────────────
⑤ 치트키 운동 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳ ← 다음 갈림길
```

**커밋 체인(origin/main · push 완료 · 폰 확인 완료):**
`ca98fcd`(PWA 6파일) → `dad3db4`(gitignore harness) → `c290588`(4-1) → `36d968e`(4-2a) → `6b094a8`(4-2b).
원격 HEAD = `6b094a8`. 작업트리 clean.

> ⚠️ **SQL 없음**: 이번 세션 전체에서 새 마이그레이션 0. ④는 이미 쌓인 raw(ot_log·session_log·
> daily_workout_log)를 읽는 파생뿐. PWA도 스키마 무관.

---

## 1. 이번 세션 완료·확정

### PWA 최소분 (ca98fcd · dad3db4)
- `app/manifest.js`(신설) + `app/layout.js` metadata(appleWebApp·icons.apple·viewport themeColor·lang ko) +
  `public/icons/` 4장(icon-192·icon-512·icon-512-maskable·apple-touch-icon 180 불투명).
- iOS Safari "홈 화면에 추가" → 라벨 "PT 내비" + 라임 PT 아이콘 · 주소창 없이 standalone 확인.
- **가드레일(의도적 미착수):** 서비스워커·오프라인 캐싱 **안 넣음**(기존 `.next`/HMR/하드리프레시
  캐시부채와 충돌). 하단 탭바·apple 스플래시 = ⑥ 규모. 신규 부채 0.

### ④-1 순수 집계 6함수 (c290588 · lib/memberStatus.js)
`buildContract` 다음에 append. react·supabase import 0 · 내부 `new Date()` 0(기준월 ym은 호출부 주입):
- `closingStats(otRows)` → `{attempted, success, hold, fail, rate}`. 회원 기준(user_id 묶음), 우선순위 success>hold>fail.
- `closingApproachStats(otRows)` → `[{approach, count}]` desc. 성공 클로징의 방향 분포(행 기준).
- `reregisterStats(contractRows)` → `{attempted, success, hold, fail, rate}`. reg_result 집계.
- `reregisterReasonStats(contractRows)` → `[{reason, count}]` desc. reg_reason 분포.
- `revenueInMonth(contractRows, ym)` → number. counts_as_revenue 게이트 + started_at 해당월. amount_total null=0.
- `sessionsCount(logRows, {ym?})` → number. voided 제외 count.
- 노드 눈검사 6케이스 PASS(closing/approach/rereg/reason/revenue/sessions).

### ④-2a 데이터층 + 요약 스트립 (36d968e · app/admin/page.jsx)
- `useEffect` fetch를 Promise.all 3개로(user_table·ot_log·session_log). **⑦ trainer_id seam 주석** 표시.
- 상단 데모 `TODAY`(오늘 live·소스없음) → **"실데이터 요약"**: 이달 매출(`revenueInMonth`)·누적 클로징률
  (`closingStats.rate`)·누적 재등록률(`reregisterStats.rate`). `rateText` 헬퍼로 **null→"—" 빈상태 가드**.
- `Activity` import 제거(미사용화).

### ④-2b KPI 그리드 실채우기 (6b094a8 · app/admin/page.jsx)
- KPI 그리드 3카드 교체: **클로징 방향별 강점**(closingApproachStats·lime Bar)·**재등록 사유 분포**
  (reregisterReasonStats·amber Bar)·**총 수업수**(sessionsCount). labels.js `labelOf`로 한글화. `length===0` 빈상태 가드.
- `daily_workout_log` fetch 추가(4번째 Promise.all) + `logs` 상태.
- 데모상수 **TODAY·KPI·GaugeCard·churnRisk·AlertTriangle 제거**(참조처 사라짐 · lint green으로 확증).

---

## 2. ④ 소관 / 경계 (오버빌드 방지 · 재확인)

- **④가 한 것:** raw 파생 조립 = 이달 매출 · 누적 클로징률/재등록률 · 방향별 강점 · 재등록 사유분포 · 총 수업수. 관리자 시점.
- **④가 안 한 것 (다운스트림):**
  - **급여(회당단가×매출구간%)·센터 구간표** = ⑦ 언저리(관리자 설정 선행). session_log는 price_per_session raw만.
  - **트레이너 QC 실데이터화**(조회율·리딩률·grade) = ⑦(다중 트레이너) + 애초에 추적 컬럼 없음. **데모 유지·파킹.**
  - **counts_as_revenue 수정 소급 파장**(월초 리셋·구간% 소급) = "월 확정 스냅샷 vs 실시간 재계산" ④ 후반/⑦ 결정.
  - **나이·직업·mbti 교차 강점분석** = member join 필요. 필요 시 후속.
- **기간:** 클로징률·재등록률 = **누적**(작은 N에서 월별은 노이즈), 매출 = **이달**(ym UTC). KST 월경계 보정은 표시층 후속(⑥).
- **카피봇은 이미 실집계**(user_table 거주지·통증·직군) → 무변경. 카피 문장만 템플릿.

---

## 3. 살아있는 부채·주의 (다음 국면에서 밟을 것)

- **★ lint 5에러**(react-hooks 규칙 승격분 · 선재 · 동작 무해) → **⑥ 초입 일괄 수정:**
  - `app/page.jsx:1008` set-state-in-effect(loadMembers/loadMachines)
  - `components/views/PtConfirmBanner.jsx:29` set-state-in-effect
  - `components/tabs/FirstOTAssist.jsx` `Example` 컴포넌트 render 내 생성(static-components ×3) — **Example 밖으로 이동**이 최소수정.
  - ⚠️ 커밋 판별법: "**대상 파일이 lint 목록에 새로 뜨나**"로만(기존 5개는 무시). 나 없이 커밋 시 이 대조 필수.
- **★ ④ 테스트행 청소**(Supabase 대시보드 수동 · DELETE 정책 없음): 통계 검증(§확인3)에서 만든 테스트 회원/계약/
  수업로그. **실회원 투입 전 청소**(안 하면 통계 오염 — ④ 산출 전 청소 규율).
- **보안 ⑦ 이월:** admin이 ot_log·session_log·daily_workout_log를 anon SELECT(전체 = trainer_id 없음).
  trainer_id **seam(주석 표시됨)**에 `.eq("trainer_id", me)` 한 줄 = ⑦. + 기존 anon 전면 개방 일괄 잠금.
- **PWA 후속**(⑥/필요시): 서비스워커(캐시부채 주의)·하단 탭바·apple 스플래시·헤더 "LIVE" 배지 톤(누적/이달과 불일치).
- **급여/QC/가격표**(⑦ 언저리): 매출구간% 관리자 설정 · 트레이너 QC 추적 컬럼 · 센터 가격표 테이블.
- **[미래]** 스케줄표(session_log `scheduled_at` 자리 있음) · 회원용 앱 "재등록 아쉬움"(§5.1 handoff-5) ·
  식단 사진분석 v3(§5.3) · 카톡 알림톡(⑦ 후 · 복사방식 유지).

---

## 4. 다음 갈림길 (트레이너 판단 · 근거)

- **⑤ 치트키/급한불** — ③ PTView에 얹는 대칭(미착수). 회원 급변(부상·통증 급발생) 시 대처 방향 즉답.
  **DB 무관(새 테이블/컬럼 0)** · `app/api/ot-brief` 프롬프트 재사용(stimulus_response 일반화).
  ⚠️ **의료 경계 가드 필수**(병원·의료진 우선) · **숫자 처방 금지·방향만**.
- **⑥ 다듬기 + lint 청소** — 탭 이름·순서·프롬프트 문구 + 위 **lint 5에러** + 헤더 LIVE 배지 + KST 보정 등 표면 정돈 묶음.
  기능 굳은 뒤라 지금 하기 좋음. lint 청소가 특히 값어치(이후 커밋 판별 쉬워짐).
- **⑦ 로그인/RLS** — anon 전면 개방 잠금 + `/admin` 권한 분리 + `trainer_id` 소유권 RLS. 스키마 다 자리잡음
  (member_status·session_log·trainer_id 선반영) → **이제 가능**. **현장 실회원 배포 전 필수**.

> 권고 관점: **현장 실회원 투입이 임박했으면 ⑦(보안)이 배포 전 필수**라 우선. 개발 계속 단계면
> ⑤(가벼움·DB무관)나 ⑥(부채 청소·lint)가 흐름상 편함. ⑤는 ③ 대칭이라 설계 위험 낮음.

---

## 5. ④/향후 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main)

- `app/admin/page.jsx` — 관리자 대시보드(④ 실데이터 반영본 `6b094a8`).
- `lib/memberStatus.js` — 순수 규칙/파생 단일 소재지(④ 6함수 포함).
- `lib/labels.js` — 집계 라벨축(CLOSING_APPROACH_OPTS·REG_REASON_OPTS·GOAL_TYPE_OPTS 등).
- (⑤) `app/api/ot-brief/route.js` — 프롬프트 대칭 추가 위치 + `components/views/PTView.jsx`(얹을 자리).
- (⑥ lint) `components/tabs/FirstOTAssist.jsx`(Example) · `app/page.jsx`(loadMembers) · `components/views/PtConfirmBanner.jsx`.
- (⑦) `lib/supabaseClient.js` · 각 write 경로 · Supabase RLS 정책.

⚠️ 붙는 코드는 항상 최신 main 커밋본. 웹 Claude는 상단 주석·줄수로 최신 확인, §0 해시(`6b094a8`)와 어긋나면 알림.

---

## 6. 관통 철학 (유지 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백·⑤ 치트키·통계 인사이트도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만** (음성일지 요약은 예외 = 트레이너 발화 수치 정리). 통계 "정밀 %"도 과신 금지 — 구간·방향 우선.
- **의료 경계:** 통증·부상·영양은 전문가/병원 우선, 치료·진단·건기식 처방 단정 금지(⑤ 특히).
- **압박 아닌 공감:** 세일즈 강도 = 근거의 세기지 압박의 세기 아님.
- **거절을 데이터로:** 재등록 실패도 inactive 보관(삭제 금지) = ④ 통계 원천.
- **뼈대 먼저, AI는 그 위:** ④도 raw(이미 쌓임) 위에 집계·인사이트. %하드코딩=가짜 회귀 금지.
- **★ 상향평준화(제품의 영혼):** 통계도 "정답 하달"이 아니라 트레이너가 자기 강점/약점 보고 스스로 교정하게.

---

## 7. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록:** `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green` +
  ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인 + ★"커밋 금지 — 트레이너가 직접".
- **검토 = git diff 원문**(`git --no-pager diff <파일>`). 신설 파일은 `--no-index /dev/null <파일>`.
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만.
  **커밋 직후 `git show --stat HEAD`로 반쪽 확인.**
- **큰 작업은 작은 스텝 분할**(4-2a/4-2b처럼) — 각 독립 커밋·검토·폰확인 깔끔.
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **환경:** 터미널 = PowerShell (`C:\Users\tig00\pt-navigator`). lint = `npm.cmd run lint`(실행정책 회피).
  폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영). `.next` stale 유령버그 주의(`Remove-Item -Recurse -Force .next`).
  배포 Ready = Vercel 대시보드 수동(토큰 상시 부여 금지).

---

## 8. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff-6.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1~5차) · CLAUDE.md.
>
> ④ 클로징/매출 통계 **완전 종료**(HEAD 6b094a8) — 관리자 대시보드 실데이터화(이달매출·누적 클로징/재등록률·
> 방향별 강점·재등록 사유분포·총수업수). PWA 최소분도 완료.
>
> 다음 갈림길 = ⑤ 치트키(DB무관·③ 대칭·의료가드) / ⑥ 다듬기+lint 청소(5에러·표면정돈) / ⑦ 로그인·RLS(배포 전 필수).
> 어디로 갈지 먼저 정하고, ④ 테스트행 청소(handoff-6 §3)를 언제 낄지도 정하자. 필요 코드는 짚어서 청구(§5). 방식은 §7.
