# v2 — 스프린트6 중간 인수인계 ②차 · ③ step3 "1b 종료 → 작업2(계약 생성) 진입"

> ③ PT 관리 뷰 진행 중. **1a(공통 저장·차감) + 1b(음성 PT전용화·프롬프트·문구) 완료.**
> **다음 = 작업2 = session_log 계약 생성(금액 3종)을 3진입점에 배선.** 그 위에 작업3(현재 방향·홈카드).
> 역할: 트레이너=클로드 코드 코딩+다리 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너→웹Claude(검토·git diff 원문)→트레이너(폰).
> ★ **커밋은 트레이너가 직접 터미널에서**(파일 지정 `git add`), diff 원문 검토 통과 후에만. 클로드 코드에 커밋 위임 금지.
>
> **새 채팅에 같이 붙일 파일:** 이 문서(직전 인수인계·제일 중요) + `docs/MASTERPLAN.md` ·
> `docs/v2-roadmap-next.md` · `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `docs/v2-sprint6-postscript-handoff.md`(1차 인계) · `CLAUDE.md`.
> 코드는 작업2 착수 시 필요분만 짚어 청구(아래 §6).

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편) ✅
──────────────────────────────
③ PT 관리 뷰       🔄 진행 중
   ├ 1a 공통 저장 + 차감 + 잔여렌더            ✅ 196d720
   ├ 1b-A 음성 PT전용화 + 공통저장 서브          ✅ 3c5705a
   ├ 1b-B 음성 요약 프롬프트(교정·유의점·의료가드) ✅ e6833c8
   ├ 1b-C 카톡 문구 사람화(날짜 헤더·멘트 로테이션) ✅ ced7cba
   ├ 작업2 계약 생성(session_log 금액 3종)      ⏳ ← 다음
   └ 작업3 현재 방향/목표 필드 + 홈카드          ⏳
④ 통계 / ⑤ 치트키 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳
```

**커밋 체인(origin/main 반영 · push 완료 · 작업트리 clean):**
`196d720`(1a) → `3c5705a`(1b-A) → `e6833c8`(1b-B) → `ced7cba`(1b-C).
원격 HEAD = `ced7cba`. 폰 실사용 확인 완료(1b-B 교정·유의점·의료가드 / 1b-C 헤더·멘트 = 둘 다 OK).

---

## 1. 이번 국면(1b)에서 완료·확정된 것

### 1a — PTView 공통 저장 + 차감 (196d720)
- **불변식(★핵심):** `daily_workout_log` INSERT는 **PTView `saveLog` 한 곳뿐.** 잔여는 파생이라 행이 꽂히면 곧 −1(별도 감산 로직 없음).
- `saveLog(source)` = 손입력(manual)·노쇼(noshow) 공통 경로. `.insert(payload).select()` → `error||!data||data.length===0` 실패 처리(교훈2 하드닝). 토스트는 **저장 결과** 기반(복사 결과 아님 = §2-7 함정 구조적 해소).
- 잔여 카드 = `activeContract`(FIFO)·`remainingSessions`(유료 N + 서비스 M) 파생. 계약 없으면 "활성 계약 없음 — 등록/재등록 필요".
- 회원 로드 = `session_log`(계약) + `daily_workout_log`(로그) `Promise.all` 병렬 + `cancelled` stale 가드(회원 빠른 전환 시 늦게 온 fetch 방어).
- ★교훈1 실증 완료: 첫 write raw(contract_id·session_at·source·ai_summary) 실제로 찍힘 = 마이그레이션 반영 확정.

### 1b-A — 음성 PT 전용화 + 공통 저장 서브 (3c5705a)
- **VoiceLogTab이 insert/복사/saved를 내려놓고** `onResult(rawText, summaryText)` **텍스트 생산자로 강등** — insert는 여전히 PTView 한 곳(불변식 유지 = 지난번 되돌린 "음성=메인" 버그 구조적 재발 불가).
- page.jsx: TABS에서 음성일지 제거 + 렌더 `tab===4` 제거 + import 제거(OT 탭 5개: 회원/1차/2차/재등록/관찰). **음성일지 = PT 전용**(PTView 안 `<details>` "음성으로 채우기(선택)" 서브 패널).
- `saveLog` 확장: source `manual|voice|noshow`. 비노쇼면 body 카톡 복사 → 성공 시 `sent_at` 스탬프. `raw_voice_text`는 **voice일 때만** 채움(manual/noshow=null). 성공 토스트만 `copied` 여부로 문구 분기, **저장 실패는 별도 early-return**(복사가 저장실패 못 가림).
- 버튼: [저장+차감]=`saveLog(usedVoice?"voice":"manual")` · [노쇼 차감]=`saveLog("noshow")`. 성공 시 `clearForm`(body·rawText·usedVoice 리셋).

### 1b-B — 음성 요약 프롬프트 강화 (e6833c8)
- `app/api/voice-log/route.js`의 `SUMMARY_SYSTEM`만 개정(스키마 `{machines,feedback,homework}`·모델·파싱·에러코드 무변경, `max_tokens` 1024→1536).
- 추가: ① **STT 오인식 '표기 교정'**(벤치프러스→벤치프레스, 20거→20개) — 단 수량·운동 종류 자체는 안 바꿈·안 지어냄(기존 안전선 유지). ② **운동방법·유의점**(homework) — 트레이너가 짚은 것 우선 + 일반 팁은 보수적. **⚠️ 의료 가드:** 치료·진단 단정 금지, 통증·부상은 "전문가/병원 상의" 방향만, 구체 처방 금지.
- ⚠️ **음성일지 harness 없음**(OT `test-first`/`test-second`만) → 프롬프트 A/B 실측 도구 부재. 헤드리스 검증 약함 → 실키 폰 검증으로 갈음(완료).

### 1b-C — 카톡 텍스트 사람화 (ced7cba)
- VoiceLogTab `buildText`만: 헤더 `[2026.07.26, {name} 회원님 운동일지 입니다!]`(AI 언급 제거+날짜), 마무리 `— 담당 트레이너 드림` → **날짜 시드 로테이션 멘트**(CLOSING_MESSAGES 6개, 같은 날 고정·랜덤 아님). 중간 본문(1머신/2피드백/3홈트) 무변경. route/스키마 무관(클라 조립부).

---

## 2. ★ 작업2 — session_log 계약 생성 (다음 세션 본론)

### 왜 지금
잔여·차감·재등록판정(`remainingSessions`·`activeContract`·`reregisterDue`)이 전부 **계약 행(session_log)** 을 전제하는데, 계약을 만드는 UI가 없어 지금까지 "황대수 수동 계약"으로만 돌았음. 실회원이 돌려면 계약이 3진입점에서 자동 생성돼야 함. 계약이 서야 잔여가 실값이 되고 그 위에 작업3(홈카드)이 얹힘.

### 3진입점
```
① OT→PT 확정   PtConfirmBanner → confirmPtActive(page.jsx ~917줄) 시점  → 첫 PT 계약 (금액 입력 필요)
② 인계·외부    MemberForm origin=handover|external 등록 시               → 이월 계약(스키마 §5.2)
③ 재등록       step4 소관                                               → 새 계약 (지금 안 만듦 · 로직 재사용 가능하게만)
```
- **①:** 현재 `confirmPtActive`는 `toPtActive` 패치(status만) + UPDATE 하드닝뿐, **계약 INSERT 없음.** 여기에 금액 입력 + session_log INSERT를 얹어야 함.
- **②:** 인계/외부는 OT 없이 PT 직행이라 등록 폼에서 **남은세션수·회당단가**를 받아 이월 계약을 세워야 잔여가 돎. `counts_as_revenue=false`·`amount_total=null`(origin 자동판정), `price_per_session` 살림(급여 원천).
- **③:** step4. 계약 생성 헬퍼를 재사용 가능하게 짜두면 공짜(toPtActive 대칭).

### 편의성 (schema §6 · 지켜야 daily 성립)
- 폼 입력 최소: **회당단가 · 세션수 2개만 입력 → 총액 자동계산 → 총액만 수정 허용**(할인 시). 저장은 3종(sessions_total·price_per_session·amount_total).
- `counts_as_revenue` = origin 보고 **자동판정**(handover/external=false, 그 외=true). 트레이너 손 안 감.
- 서비스 세션(`service_sessions`) 입력 자리(재등록 미끼) — 있으면 받되 필수 아님.

### ★ 미결정 — 다음 세션 첫 확정 사항 (웹 Claude 권고 = 가)
**①(OT→PT 확정) 때 금액 입력을 어디서 받나:**
- **(가) 확정 버튼 → 금액 입력 모달 → [계약 생성 + PT 확정] 한 번에.** (권고)
  근거: "성공→등록=몇 회 얼마"가 한 순간의 결정. 확정만 하고 계약이 없으면 PTView가 "활성 계약 없음"으로 떠 어색(현재 그 상태)하고 계약 등록 까먹을 여지. 확정=계약을 한 모달에 묶는 게 daily 정합.
- (나) PT 확정은 status만(현행), 계약은 PTView 별도 "계약 등록" 버튼으로. (분리 — 비권장)
→ **트레이너가 가/나 확정 후 스펙 착수.**

### 계약 생성 로직 위치 제안
- `lib/memberStatus.js`에 **순수 계약 빌더**(예: `buildContract({sessions_total, price_per_session, amount_total, service_sessions, origin})` → `counts_as_revenue` 자동판정 포함한 payload 반환) — 규칙 단일 소재지 유지, 실제 INSERT+가드는 호출부(toPtActive·MemberForm이 공유 → step4 재등록도 재사용).
- INSERT는 `.select()` → `data.length>0` 하드닝(현장 트러블슈팅 규율) + demo `if(!supabase)` 가드.
- ⚠️ **여기서 session_log 첫 write raw 값 실증**(handoff 1차 §7 "교훈1 값 실증 미완"의 착지점 — 지금까진 황대수 수동계약뿐, 앱 경로 저장은 작업2에서 처음).

---

## 3. 작업3 (작업2 뒤) — PTView 실채우기 마저

- **현재 방향/목표 필드** (`user_table` 컬럼 1개로 시작 · origin 독립). OT 있었으면 그 목표에서, 없으면 첫 세션에 잡음.
- **홈카드 재등록 타이밍** — `reregisterDue(basis:'paid')`를 홈 `ReapproachToday` 카드 형제로. (⚠️ 클로징 저장 지점 늘면 `onClosingSaved`/`closingVersion`도 물려야 함 — page.jsx 872줄 주석 참고.)
- **운동일지 타임라인**(과거 daily_workout_log 렌더) — 지금 PTView는 저장 폼·잔여만, 과거 로그 목록은 아직 안 그림. 작업3에서.
- **참고(옵션):** ot_log 스냅샷 있으면 표시, 없어도 무해(origin 독립 유지).

---

## 4. 살아있는 부채·주의 (작업2에서 밟을 것)

- **★ 테스트 잔재 — 황대수 원복 안 됨:** 1b-A 검증 때 황대수를 `pt_active`로 세팅 + `session_log` 테스트 계약 1건 + `daily_workout_log` 테스트 행 여러 개 생성했는데, **마지막 ot_active 원복이 안 먹음**(현재 pt_active 추정). 실회원 투입 전 **Supabase 대시보드 수동 정리**(DELETE 정책 없음): user_table 황대수 status 원복(또는 실제 맞는 값) + session_log 계약 삭제 + daily_workout_log 테스트행 삭제. + 1차 인계 §7의 옛 목록(옛 한글 '성공' 행 등)도 같은 묶음.
- **보안 ⑦ 이월:** session_log·daily_workout_log anon 정책 개방분 + user_table anon UPDATE + 기존 anon 전면 개방 → ⑦ 일괄 잠금. 신규 write엔 anon 정책 + `.select()` 0행 하드닝 계속 적용.
- **① 캐시/배너 lift(C2):** 작업3에서 부모가 회원 round 상태 소유(lift) 시 배너 refetch·① 재방문 stale·2차 조회 통합 해소. C1 안 함·C2 채택(1차 인계 §7 이월).
- **음성 harness 부재:** 음성일지 프롬프트(1b-B) A/B 실측 도구 없음. 프롬프트 튜닝 본격화(⑥/실사용) 시 OT `test-first-prompt.mjs` 패턴대로 음성 harness 신설 검토. 지금은 오버빌드라 안 함.
- **[미래] 카톡 알림톡 자동발송:** ⑦ 이후·센터 카카오 비즈채널 계약·템플릿 승인 전제. **개인 카톡 자동전송은 카카오 정책상 불가** → '복사→붙여넣기' 방식 유지(현행이 맞는 선택). 화이트라벨·센터 가격표 묶음.
- **route↔harness 字-동일**(step4 재등록 브리핑 프롬프트 붙일 때). **재등록 브리핑 = 별도 phase:"reregister"** 권장.
- **[미래] 스케줄표**(session_log `scheduled_at` 자리 이미 비워둠) · **트레이너 프로필 세일즈 개인화**(선행 ⑦) · **센터 가격표 테이블**(⑦ 언저리) · **고정수업료 vs 매출구간% 급여계산**(④ 소관, session_log는 raw만).

---

## 5. 관통 철학 (③에서도 지킬 것 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백·⑤ 치트키도 근거+방향까지만, 설득/처방 대본 금지.
- **숫자 금지·방향만** (단 **음성일지 요약은 예외** = 트레이너가 말한 수치 정리 자리라 수치 OK · v1.5 리스트 명시). ⑤/재등록 운동 방향은 처방(각도·세트·중량) 금지.
- **의료 경계:** 통증·부상은 전문가/병원 우선, 치료·진단 단정 금지(1b-B 가드 = ⑤ 의료가드와 같은 결).
- **거절을 데이터로:** 실패도 inactive 보관(삭제 금지) = ④ 통계 원천.
- **뼈대 먼저, AI는 그 위:** session_log·계약 배선부터 깔고 AI(재등록 브리핑)는 그 위.
- **입력=사고 / 편의성:** 핵심만 입력(회당단가·세션수 2개→총액 자동), 나머지 자동·기본값·음성. **트레이너가 쓰기 불편하면 설계가 틀린 것.**

---

## 6. 작업2 착수 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main 커밋본)

- **`app/page.jsx`** — `MemberForm`(등록 모달 정의부 · origin 드롭다운 배선) + `confirmPtActive`(~917줄 · 계약 INSERT 얹을 자리). 통 부담되면 두 군데만 잘라 붙여도 됨.
- **`components/views/PtConfirmBanner.jsx`** — 확정 버튼이 `onConfirm`(=confirmPtActive) 부르는 구조. 금액 모달을 여기 끼울지 confirmPtActive에서 처리할지 결정에 필요.
- **`lib/memberStatus.js`**(ced7cba 기준 소비처 · 순수 계약 빌더 추가 위치) — 이미 최신본 확보돼 있음(remainingSessions·activeContract·reregisterDue·toPtActive 등).
- (참고) **`components/views/PTView.jsx`**(1b 최신) · **`components/tabs/VoiceLogTab.jsx`**(1b 최신) — 계약 생기면 잔여가 실값으로 도는지 확인용. 필요 시.

⚠️ 붙는 코드는 항상 최신 main 커밋본(업로드 스냅샷 아님). 웹 Claude는 상단 주석·줄수로 최신 확인, §1 커밋 해시(`ced7cba`)와 어긋나면 알림.

---

## 7. 작업 규약 (검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록**: `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green 필수` + ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ lint / ■ 확인. + ★"커밋하지 말 것 — 트레이너가 git diff 원문 검토 후 직접 커밋" 한 줄.
- **검토 = git diff 원문** (`git --no-pager diff <파일>`). 클로드 코드 서술 보고 ≠ 검토. 파일로 뽑을 땐 `| Out-File -Encoding utf8`(기본 `>`는 UTF-16라 깨짐).
- **커밋 = 트레이너 직접 터미널** · 파일 지정 `git add`(전체 `git add .` 금지) · 검토 통과 후에만. 커밋 메시지 `③`→`3`(셸 특수문자 회피).
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지).
- **코드는 필요할 때 짚어서 청구**(처음에 다 안 붙임). 저장 경로·프롬프트·배선은 눈으로 봐야 정확.
- **환경:** 터미널 = PowerShell (`C:\Users\tig00\pt-navigator`). 폰 확인 = Vercel 배포본 하드리프레시(로컬은 push 후 반영). `.next` stale 유령버그 주의(`rm -rf .next` = PowerShell `Remove-Item -Recurse -Force .next`).

---

## 8. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나(git diff 원문)→너(검토)→나(폰). 커밋은 내가 직접 터미널에서.
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff-2.md(직전 인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema ·
> v2-sprint6-postscript-handoff(1차 인계) · CLAUDE.md.
>
> ③ 진행 중 — 1a(공통 저장·차감) + 1b(음성 PT전용화·프롬프트·카톡문구) 완료, push됨(HEAD ced7cba). 폰 확인 OK.
> 다음 = **작업2 = session_log 계약 생성(금액 3종)을 3진입점에 배선.**
>
> 먼저 결정할 것부터: ①(OT→PT 확정) 때 금액 입력을 (가)확정 버튼→금액 모달→[계약 생성+PT 확정] 한 번에 vs
> (나)확정은 status만·계약은 PTView 별도 버튼 — 인계 문서 §2에 네 권고(가) 근거 있어. 이거 정하고 작업2 세부 설계 가자.
> 필요한 코드 파일은 짚어서 청구해줘(§6). 작업 방식은 인계 §7 규약대로.
