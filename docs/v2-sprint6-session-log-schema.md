# v2 스프린트6 — ③ PT 관리 뷰 · `session_log` 스키마 설계 확정본 (SQL 직전)

> 로드맵 ③ 진입. B(2차 OT 탭 재편) 종료 후 첫 본론 = **`session_log` 스키마 설계 대화**의 확정본이다.
> 상위 설계 docs/MASTERPLAN.md, 로드맵 docs/v2-roadmap-next.md ③, 직전 인수인계 docs/v2-B2-postscript-handoff.md,
> ② 종료 docs/v2-sprint5-postscript.md · 착수 스펙 docs/v2-sprint5-member-status.md, 규율 CLAUDE.md.
> 이 문서는 트레이너와의 **설계 대화에서 확정된 결정 + 근거(현장 장면) + 남은 선행**이다.
>
> **✅ SQL 실행 완료 (Supabase 에디터).** §7 컬럼 스케치대로 session_log 신설 + daily_workout_log 확장 +
> user_table.trainer_id 선반영 + anon 정책까지 Run 성공(Success, no rows). 코드 파일(`VoiceLogTab.jsx`·
> `voice-log/route.js`)은 검토 완료 — route.js는 순수 STT→요약(DB 저장 안 함)이라 스키마 무관, 저장은
> `VoiceLogTab.copyAndSave` insert 한 곳뿐 확인. **⚠️ 교훈1: SQL 성공 = 자리 생김이지 반영 검증 아님.**
> 진짜 검증은 첫 write 경로(차감 배선)에서 `.select()` → `data.length>0`로 한다(다음 스텝).
>
> **다음 세션이 할 일:** §9 "SQL 이후 착수 순서"의 **1·2(차감 배선 + 잔여 파생)를 묶어** 스펙 착수.

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화        ✅ (v2-S4)
② OT/PT 뷰 분리       ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편 B1·B2) ✅
──────────────────────────────────────────
③ PT 관리 뷰          🔄 진행 중 — 스키마 설계 확정(이 문서) → 다음: SQL → PTView → 재등록
④ 클로징/매출 통계     ⏳ 대기
⑤ 치트키 운동          ⏳ (③에 얹는 대칭)
⑥ 다듬기              ⏳ 후반
⑦ 로그인/RLS          ⏳ 최후 (anon 개방·부채 일괄 잠금)
```

③의 성격(handoff §3.1): B는 "한 파일 작은 diff"였지만 ③는 **새 테이블 설계부터**라 코드 스펙 전에 스키마 대화가 선행했다.
그 대화가 이 문서로 종결됐다. 착수 순서 = 스키마 SQL → 그 위에 세로로 채우기(PTView·재등록).

---

## 1. 한 줄 목표

PT 회원을 **매일 쓰는 관리 도구**로 만든다. 회원을 고르면 "남은 세션·다음 재등록 타이밍·최근 수업"이 바로 뜨고,
재등록은 **OT 클로징 흐름의 PT 대칭 복제**로 (성공/실패/보류 + 이유 + 다음 트라이) 돌린다.
**관통 상수 = 트레이너가 쓰기에 불편함이 없어야 한다**(§7 편의성 · 트레이너가 대화 내내 강조).

---

## 2. 확정된 핵심 결정 (전체 — 재론 불필요)

```
[③ session_log 스키마 — 확정 결정 전체]
· 계약 = 행 (등록/재등록마다 1행). 재등록마다 세션수·회당단가가 달라지니 행을 나눈다.
  └ 할인 개념이 아니라 "다른 계약"이라 행 분리가 맞다(트레이너 확인: 첫 6만50회→재등록 5만30회 식).
· 재등록 = 새 session_log 행 = OT closing의 PT 대칭(검증된 패턴 재사용, 설계 위험 낮음).
· 만기 날짜축 삭제 → 재등록 트리거 = "남은 세션수". pt_expiring를 "만기임박"이 아니라 "잔여 ≤ N회"로 재정의.
· 금액 3종 전부 저장: sessions_total · price_per_session · amount_total(NULL 허용).
  └ 셋 다 급여/매출 원천이라 파생 금지. amount_total은 할인 시 회당×세션과 어긋나서 따로 저장.
· counts_as_revenue bool DEFAULT true — origin 자동판정(handover/external=false, 그 외=true).
  └ 관리자가 특별 사정 시 수동 수정 가능(UPDATE). 권한강제=⑦, 소급 파장=④ 소관.
· 인계/외부: price 살림(급여 원천이라 NULL 아님) · amount 비움 · counts_as_revenue=false · 남은세션수 이월 입력.
· 잔여 = sessions_total − 수업로그 count (저장값 아님 · 파생). 손 장부질 0.
· 카운트 원천 = "수업확인서 겸 운동일지" = 기존 daily_workout_log 확장(신설 아님).
· daily_workout_log += contract_id · session_at · source · sent_at, body NULL 허용.
· 노쇼 = 빈 본문 저장 + 차감(트레이너 재량). source='noshow'로 통계 자리까지 심음.
· 활성계약 자동연결(일지 저장 시 최신 미소진 session_log 행). 차감 되돌리기 = voided 플래그(SQL 때 확정).
· 재등록 클로징 축: reg_result(success/hold/fail 영문) · reg_reason(카테고리) · reg_reapproach_at · report(reg_brief 캐시).
· 미래 자리(값 나중·자리 미리): scheduled_at NULL(§9 스케줄표) · user_table.trainer_id 선반영(값은 ⑦).
· "오늘의 대상자"(OT재접근/재등록재접근/재등록타이밍) = 전부 파생. 새 저장 0.
· 부채: session_log·daily_workout_log anon 정책 + .select() 0행 하드닝 → ⑦ 일괄 잠금.
```

아래 §3~§6이 각 결정의 **근거(현장 장면)**다. MASTERPLAN "코드가 안 보여주는 의도"를 남기려는 것이니,
다음 세션은 결정을 뒤집기 전에 근거부터 읽을 것.

---

## 3. 왜 계약=행인가 · 재등록 = OT 클로징의 PT 대칭

**계약=행 근거(트레이너 현장):** 재등록 시 트레이너들이 흔히 첫 등록(6만원×50회=300만)보다 **가격·횟수를 낮춰**
재등록(5만원×30회)한다. 값이 계약마다 다르니 한 행에 못 담는다 → 등록/재등록마다 행 1개. 그러면 **재등록이 곧 새 행**이라,
OT에서 만든 closing 흐름을 그대로 복제한 게 된다(새 개념 0 = 설계 위험 낮음).

**재등록 루프(남은 세션수 트리거):**
```
session_log 최신 행 (등록세션수 N · 회당단가 · 총액)
   │  ← 수업로그 쌓이며 잔여 ↓
   ▼  잔여 ≤ N → "재등록 대화 타이밍" (nextAction)
재등록 대화 + AI 브리핑 (이유별·근거+방향, 설득 대본 금지 = OT와 동일 철학)
   ▼
재등록 결과 기록 (reg_result · reg_reason · reg_reapproach_at)
   ├ success → 수동 '재등록 확정' → 새 행(새 세션수·새 회당단가) = 잔여 리셋   ← toPtActive 대칭(성공≠자동)
   ├ hold    → reg_reapproach_at → "오늘 재접근" 파생 (reapproachToday reader 그대로 재사용)
   └ fail    → 재접근 or status='inactive' 보관(삭제X · ④ 통계 원천)
```

- **성공≠PT 게이트 상속:** 재등록 "성공 기록" ≠ 자동 계약 갱신. 성공은 의향, 실제 갱신은 수동 확정(또는 결제). ④ 무결성(성공률 vs 실등록률 따로).
- **값 컨벤션 영문**(success/hold/fail) — S5 교훈4(한글 '성공'이 영문 필터에 누락) 재발 방지.
- **일찍 재등록 시 남은 세션 이월**은 스키마로 강제 안 함. 트레이너가 새 등록세션수에 반영(현장마다 이월 정책 다름).

**재등록 실패 이유 카테고리 — seed(확정 아님, postscript대로 실데이터 보며 확정):**
`금전 부담 / 시간 부족 / 스케줄 안 맞음 / 수업 남아 나중에 / 효과 체감 부족 / 개인 사정(이사·부상) / 기타`
자유서술 금지(④ 이유별 분포 집계 불가). '기타' 시 메모 한 줄 허용은 열어둘 수 있음. **지금 못 박지 않음.**
이유별 피드백 = OT 브리핑의 재등록판(근거+방향까지만, "지금 안 하시면…" 압박 대본 X).

---

## 4. 잔여 세션 = 수업로그 count 파생 · daily_workout_log 확장

**결론:** 잔여를 저장·수동감산하지 않고 **수업로그 count로 파생**한다. 카운트 원천은 트레이너가 실제로 세는 단위
= **"수업확인서 겸 운동일지"**(음성일지는 서브). 이게 곧 기존 `daily_workout_log` 파이프라인이라 **새 테이블 안 만들고 확장**한다.

**왜 확장(가)이지 신설(나)이 아닌가:** daily_workout_log는 이미 "수업 겸 운동일지 겸 카톡용 복사"(v2-S1 실연동)라
트레이너가 묘사한 물건 그 자체. 신설하면 음성일지가 옛/새로 쪼개져 MASTERPLAN이 없애랬던 **음성일지↔세션 중복이 되레 재발**.
→ 확장이 맞다.

**차감 로직(트레이너 문장 그대로 "일지 생성·등록하면 차감"):**
```
일지 작성(손입력 or 음성→STT정리) → session_at·body 채움 → 저장 시 활성계약(contract_id) 자동 연결
  → 잔여 = sessions_total − count(그 계약 소속 로그)  자동 −1
  → 카톡 전송(sent_at) = 회원 인증 증거 (사인 불요 — 날짜·시간 확실 + 카톡전송기록으로 갈음)
  → 잔여 ≤ N → 재등록 대화 타이밍
```

- **사인 안 넣음:** "수업확인서 겸 운동일지를 카톡 전송 = 증거". 날짜·시간(`session_at`)만 확실하면 됨.
- **활성계약 자동연결:** 일지 저장 시 그 회원의 **최신 미소진 session_log 행**으로 자동. 트레이너가 계약 안 고름. 겹치면 최신 우선.
- **차감 되돌리기:** 이 앱은 DELETE 정책을 일부러 안 열었음(부채). 삭제 대신 **voided 플래그**(count 제외)로 무를지 vs 수정만 허용할지 → SQL 때 확정(사소).

---

## 5. 노쇼 · 인계/외부 · 매출↔급여 경계 (금액 컬럼의 의미)

### 5.1 노쇼 — 스키마 변경 0
`body NULL 허용` 덕에 **노쇼 = 빈 본문 일지 저장 + 차감**이 이미 성립. 차감 여부는 트레이너 재량(빈 일지 저장하면 −1, 안 하면 유지).
`source`에 `'noshow'` 값 추가 = 나중 노쇼율 집계 공짜 → **트레이너가 원해서 심기로 함**(자리 미리·값은 실사용).

### 5.2 인계/외부 회원 (member-status §1.5 진입 문 2개의 session_log 채움)
이미 ②가 깔아둔 것: `origin='handover'`(등록 시 선택)→status 바로 `pt_active` 직행 · PTView origin 독립(ot_log 없어도 성립).
**session_log에서 터지는 구멍 = 인계 회원의 "남은 세션수".** 우리 앱에 계약 행이 없으니 잔여를 못 세고 → 재등록 사이클이 안 돈다.

**해결 = 등록 시 "이월 계약" 행 하나 세우기:**
```
handover/external 등록 → session_log 행 생성:
  sessions_total     = 인계 시점 남은 세션수 (트레이너 입력)
  price_per_session  = 인계회원이 원래 등록했던 회당단가  ← 있음! 급여 원천이라 NULL 아님
  amount_total       = NULL 또는 0                     ← 내 매출 아님
  counts_as_revenue  = false                           ← 매출 집계 제외
  origin             = user_table.origin 참조(중복 저장 안 함)
```
→ 잔여 카운트·재등록 사이클이 인계 회원에서도 정상 작동하되, **매출엔 안 잡히고 급여(수업료)는 잡힌다.**
**미룰 것(⑦):** 이전 트레이너 추적·재배정·인계 이력. ②/③은 origin 스탬프 + 잔여 이월까지만(member-status §2와 정합).

### 5.3 매출 ↔ 급여(수업료) 경계 — 트레이너 설명 구조
```
매출(등록금액)  →  월초 1일 리셋  →  월 목표매출 채울수록 수업료 구간% ↑
수업료(급여)    =  회당단가 × (그 달 매출구간 %)   ← 회당 정산
인계 회원       =  매출 0 BUT 수업료는 발생(= 인계회원 원래 회당단가 × 내 그달 구간%)
구간% 산정 방식  =  센터마다 다름 → 관리자 설정 대상
```
**⚠️ 이 중 ③ 소관은 raw뿐.** 월별 집계·월초 리셋(조회 시 월 필터, 저장 아님)·급여 구간% 계산·관리자 구간표 설정은
**전부 ④/⑦ 다운스트림.** ③ session_log는 `amount_total·price_per_session·counts_as_revenue·started_at`만 깨끗이 담으면,
④가 "월 필터 + 합산 + 구간% 적용"을 얹어 매출·급여를 계산한다. **급여 로직을 지금 session_log에 넣으면 = 가짜 숫자 회귀(MASTERPLAN §5 위반).**

### 5.4 counts_as_revenue — 자동판정 + 관리자 수동 수정
- **자동:** 등록 시 origin으로 기본값(handover/external=false, 그 외=true). 트레이너 손 안 감(daily 마찰 0).
- **수동 수정:** 특별 사정 시 `/admin`에서 UPDATE(기존 하드닝 패턴 재사용 = toPtActive와 동일 메커니즘, 난이도 낮음).
- **⚠️ "관리자만" 권한 강제 = ⑦**(현재 anon 전면 개방이라 지금은 URL 아는 누구나 만짐 — 기존 부채에 한 줄 얹기, ⑦ 일괄 잠금에 흡수).
- **⚠️ 수정 소급 파장 = ④ 소관**(월초 리셋·구간% 소급이라 지난 달 매출 바꾸면 급여구간 흔들림 → ④에서 "월 확정 스냅샷 vs 실시간 재계산" 결정). ③ 스키마엔 영향 0.
- **수정 이력**(누가·언제·왜)은 ⑦(audit) 소관. 지금 자리도 안 만듦(오버빌드). 나중 필요 시 `revenue_note` 1컬럼으로 값싸게.

---

## 6. 편의성 검산 (트레이너 상수 — §7 daily)

방향이 트레이너 손을 실제로 가볍게 하는지 확인 완료:
- **잔여 = 수업로그 count 파생** → 매 수업 "−1 버튼" 없음(원래 하던 일지 작성 하나가 차감·확인서·카톡증거 다 함).
- **활성계약 자동연결** → 일지 저장 시 계약 안 고름.
- **만기 날짜축 삭제** → 만기 입력·관리 필드 자체가 사라짐.
- **금액 3종이 유일한 입력 증가점** → 폼에서 **회당단가·세션수 2개만 입력 → 총액 자동계산 → 총액만 수정 허용**
  (할인 시만 총액 손봄). 저장은 3개, 입력은 사실상 2개. ※ 이건 스키마 아니라 폼 UX → PTView/등록폼 단계 스펙에 반영.
- **body NULL 허용** → 바쁜 날 "일지 못 썼지만 수업함"을 막지 않음(안 그러면 차감이 막혀 방향 붕괴). **스키마 레벨 결정.**
- **counts_as_revenue 자동** → 트레이너 판단 불요.
- **재등록 = 등록폼 재사용** → 학습비용 0. "오늘 재접근"·nextAction·뷰분리 등 ②가 깐 편의 장치에 얹혀 새 UI 거의 안 늘어남.

---

## 7. 확정 컬럼 스케치 (SQL의 청사진)

```
session_log  (계약 = 행 · 등록/재등록마다 1행 · 신설)
 ── 계약 축 (급여·매출 원천 raw) ──
  id                 uuid PK
  created_at         timestamptz DEFAULT now()
  user_id            uuid FK → user_table
  sessions_total     int                 -- 등록세션수
  price_per_session  int                 -- 회당단가 (급여 원천 · 인계도 있음)
  amount_total       int   NULL          -- 총등록금액 (매출 · 인계는 NULL/0)
  counts_as_revenue  bool  DEFAULT true  -- 내 매출 집계 대상? (인계/외부이월=false, origin 자동판정)
  started_at         timestamptz DEFAULT now()  -- 계약일 (월별 매출·리셋 파생 축)
   ※ 잔여 = sessions_total − count(이 계약 소속 수업로그).  used/잔여 컬럼 없음(파생).
   ※ 만기일 컬럼 없음(트레이너 판단). 트리거 = 남은 세션수(잔여 ≤ N → pt_expiring 재정의).
   ※ origin은 session_log에 중복 저장 안 함 → user_table.origin 참조.
 ── 재등록 클로징 축 (ot_log closing_* 대칭) ──
  reg_result         text  NULL          -- 'success' | 'hold' | 'fail' (영문 · 교훈4)
  reg_reason         text  NULL          -- 실패/보류 이유 카테고리(§3 seed, 실데이터로 확정)
  reg_reapproach_at  date  NULL          -- 다음 트라이 (reapproachToday 재사용)
  report             jsonb NULL          -- reg_brief (AI 재등록 브리핑 캐시 · 공존 패턴)
 ── 미래 자리 (값 나중·자리 미리) ──
  scheduled_at       timestamptz NULL    -- §9 스케줄표 / 수업=행 승격 대비

daily_workout_log  (기존 테이블 확장 = "수업확인서 겸 운동일지" · 수업 = 행)
  기존: id · created_at · user_id · raw_voice_text · ai_summary  (코드 확인 완료. 저장=copyAndSave insert 1곳)
  + contract_id      uuid  NULL  FK → session_log  -- 어느 계약에서 차감(잔여 경계). 계약前 구행=NULL→count 제외(안전)
  + session_at       timestamptz NULL              -- 날짜·시간(사인 갈음 조건). 앱 기본 now(), 수정 가능
  + source           text  NULL                    -- 'voice' | 'manual' | 'noshow'
  + sent_at          timestamptz NULL              -- 카톡 전송 시각(=증거)
  + voided           boolean NOT NULL DEFAULT false -- 차감 되돌리기(count 제외). DELETE 안 여는 규율과 정합 [SQL때 확정·심음]
   ※ raw_voice_text/ai_summary 는 이미 NULL 허용 → 노쇼·빈 본문 저장 가능(NOT NULL 걸지 말 것).
   ※ STT 실패 시 route가 422로 끊겨 insert 자체가 안 남 → source='voice'는 항상 STT 성공분. manual/noshow는 route 안 타는 별도 경로.

인덱스(SQL때 심음): session_log(user_id, started_at desc) · session_log(reg_reapproach_at) where hold
                    · daily_workout_log(contract_id) where voided=false · daily_workout_log(user_id, session_at desc)
정책명(ASCII): "session_log anon all (v2-3 open, lock in step7)" · 동 daily_workout_log
              ⚠️ 정책 이름에 한글/특수문자(■·③) 넣지 말 것 — SQL 에디터 구문에러(실제로 밟음). ASCII로.

user_table  (선반영 1컬럼)
  + trainer_id       uuid  NULL          -- ⑦ 소유권·"본인 매출" 필터 축(값은 ⑦, 자리만 지금 · ot_log 선반영 논리)
```

**정책(부채):** session_log·daily_workout_log 신규 write 경로 = anon INSERT/SELECT/**UPDATE 정책** +
저장 시 `.select()` → `data.length===0` 실패 처리(ObservationTab 하드닝과 동일). demo = `if(!supabase)` 가드 + DEMO 기본값.
→ 이 개방은 ⑦에서 잠글 부채로 기록.

---

## 8. 소관 지도 — 뭐가 ③이고 뭐가 ④/⑦/§9인가 (오버빌드 방지)

당겨 짓기 쉬운 것들의 소관을 못 박는다. **③는 raw만 깔고, 집계·소유권·급여규칙은 다운스트림.**

```
트레이너 대시보드 (트레이너 아이디어 · 나중 조립)
├ PT/OT 회원 목록          → ② 이미 있음(member_status·viewFor). 얹기만.
├ 오늘의 OT 재접근 대상자    → ② 이미 있음(reapproachToday 홈카드).
├ 오늘의 재등록 대상자       → ③에서 공짜(reg_reapproach_at을 같은 reader에 물림).
├ 재등록 타이밍 도래(잔여≤N) → ③에서 공짜(잔여 count 파생).
├ 일주일치 스케줄표          → §9 [미래](scheduled_at 자리 + ⑦ 소유권).
├ 이달 총매출               → ④(amount_total 월필터 · counts_as_revenue 게이트 · 월초리셋).
├ 총 수업수(전체)           → ④(수업로그 count 전체 합산).
└ 현재 매출 기준 총 수업료    → ④+⑦(매출구간% 규칙=관리자 설정=급여 계산).
```

- **"오늘의 대상자"는 ③ 재료 완비 → ④/⑦ 조립 or ③ 말미 홈카드**(단일 트레이너 가정이면 로그인 불요라 ③ 끝에 먼저 얹어도 가벼움).
- **매출·수업료는 ⑦ 없이는 "본인 것" 필터 불가**(현재 anon·trainer_id 없음). 급여 숫자를 지금 만들면 %하드코딩=가짜 회귀.
- **③가 할 일 = 재료(session_log raw) 깨끗이·경계(counts_as_revenue) 지켜 담기.** 이미 하고 있는 그것.

---

## 9. 다음 스텝 (SQL ✅ 완료 → 앱 코드 세로 슬라이스)

**SQL 실행 완료.** 코드 2개(`VoiceLogTab.jsx`·`voice-log/route.js`) 검토 완료 — 아래 사실 확정:
- `daily_workout_log` 저장 경로 = `VoiceLogTab.copyAndSave`의 `insert({ user_id, raw_voice_text, ai_summary })` **딱 한 곳.**
- ⚠️ 그 insert에 `.select()` 하드닝 **지금 없음**(`if(!error) setSaved(true)`만) → 차감 배선 붙일 때 **반드시 추가**(조용한 실패 방지 = 교훈2·현장 트러블슈팅).
- ⚠️ 이 탭은 **음성 전용**(MediaRecorder→STT 전제, 손입력 폴백 없음) → `source='voice'`만 생성. **manual/noshow 경로는 PTView에 형제로 추가**(합치면 무거움).
- route.js는 순수 STT→요약, `{raw_text, report}`만 반환(DB 저장 안 함). STT 실패 시 422로 끊겨 insert 자체가 안 남.

### SQL 이후 ③ 착수 순서

**▶ 다음 = 1·2 묶어서 착수 (차감 배선 + 잔여 파생을 같이 설계):**
활성계약 자동판정을 "insert 직전 조회"로 할지 "memberStatus 순수함수"로 할지가 1·2에 걸쳐 있어 **묶는 게 깔끔**.

1. **차감 배선** — `VoiceLogTab.copyAndSave` insert에 `contract_id`(활성계약 자동판정=user_id·잔여>0 중 started_at 최신)·`session_at`(기본 now, 수정 가능 UI)·`source:'voice'`·`sent_at` 싣기 + **`.select()` → `data.length===0` 실패 처리**. **여기서 마이그레이션 진짜 검증**(교훈1).
2. **`lib/memberStatus.js` 확장** — `remainingSessions(contract, logs)` 잔여 파생 · `activeContract(contracts)` 활성계약 판정 · 재등록 전이 함수(`toReregister`/재등록 확정). 순수 규칙 단일 소재지(supabase·react import 0).
3. **PTView 실채우기** — 수업확인서겸운동일지 타임라인(손입력·노쇼 형제 경로 추가) + 현재 방향 필드 + 잔여/재등록 타이밍. **⚠️ 스펙 개정:** member-status §5 "PTView 본체=음성일지 타임라인" → 트레이너가 "음성일지는 서브"라 함 → **"본체=수업확인서겸운동일지, 음성일지는 서브 첨부"로 개정**(PTView.jsx·MemberViewShell.jsx·VoiceLogTab.jsx·memberStatus.js).
4. **재등록 흐름** — reg_* writer(ObservationTab 패턴)·reg_reason 카테고리(labels.js *_OPTS)·재등록 브리핑(route.js **별도 phase:"reregister"** 권장 — 2차에 얹지 말 것, maxTokens·가드 독립)·확정 게이트(page.jsx 배선).
5. **음성일지=PT전용 편입 · 회원 보관=inactive(toInactive 실체화) · ① 캐시/배너 lift 통합(C2) · ⑤ 급한불/치트키(stimulus_response 대칭, §10 의료가드).**

### counts_as_revenue 자동판정은 SQL 아니라 앱에서
DB엔 `default true`만. "handover/external → false"는 **등록 insert 시 앱이 origin 보고 실음**(SQL default는 origin 못 봄). 등록폼 배선 스텝에서 `initialStatus` 옆에 한 줄(memberStatus 규칙 재사용).

---

## 10. 넘어가는 부채·주의 (③에서 밟을 것)

- **보안(⑦ 이월):** session_log·daily_workout_log anon 정책 개방분 + counts_as_revenue 수정 UI 권한 미강제 + 기존 anon 전면 개방 → ⑦ 일괄 잠금.
- **route↔harness 字-동일:** 재등록 브리핑 프롬프트 붙일 때 test-*-prompt.mjs(gitignored 거울)도 같이. maxTokens — 재등록 브리핑은 별도 phase면 자체 예산(2차 out≈4300/5120 여유와 무관), 그래도 phase별 상한 확인.
- **재등록 브리핑 = 별도 phase 권장**(phase:"reregister"): 2차 프롬프트에 얹지 말고 분리 → maxTokens·가드레일 독립.
- **① 캐시/배너 lift(C2):** ③에서 부모가 회원 round 상태 소유(lift)하면 배너 refetch·① 재방문 stale·2차 조회 통합 해소(postscript 결정·이월). C1 안 함·C2 채택.
- **테스트 흔적 청소(대시보드 수동·DELETE 정책 없음):** 기존 목록(옛 한글 '성공' 행 등 postscript) + session_log 착수 시 생길 테스트행. 실회원 투입 전 청소.
- **⑤ 급한불 탭 (치트키 운동 · ③ PTView와 함께 · 트레이너 아이디어):** 회원 급변(부상·통증 급발생, 예 "PT 회원 디스크 터짐 → 지금 뭘 시키나") 시 대처 방향 즉답 탭. B2-c `stimulus_response`(자극반응 3분기 대처, 숫자0) 패턴을 급변 상황으로 **일반화**, `app/api/ot-brief` 프롬프트 재사용. **DB 무관 = 새 테이블/컬럼 0 · SQL 선행 없음.** roadmap⑤대로 독립 스프린트 아니라 ③ PTView에 얹는 대칭(수업 전 준비 프레이밍).
  - ⭐ **숫자(횟수·중량·각도) 금지 · 방법도 간략**(트레이너 자발 공부) · **원리+방향까지만**(스파링 파트너·하향평준화 방지). 트레이너 직관과 자동 정렬됨.
  - ⚠️ **의료 경계 가드 필수:** 디스크 등 부상은 의학 상황 → **병원·의료진 우선** 안전선을 프롬프트에 심어 진단·치료 처방으로 오인/오용 방지. ⑤가 주는 건 "피할 움직임/접근 결"까지지 처방 아님. 가드레일 = sales_intensity strong 가드와 동일 방어.
- **[미래] 트레이너 프로필 기반 세일즈 개인화**(성향·MBTI·세일즈방향·자신있는 운동축 → 1·2차·재등록 맞춤): 선행 ⑦(trainer 테이블), 단일 트레이너면 로그인 전 우회로 가능. ⑤와 짝. 가드레일 = sales_intensity strong 가드 동일.
- **센터 가격표 테이블**: PT가격이 트레이너 재량 or 센터 가격표 → MVP는 자유 입력, 가격표 테이블은 ⑦ 언저리(관리자 설정과 한 묶음).
- **차감 되돌리기 voided 플래그** · **재등록 이유 카테고리 실데이터 확정** · **PTView 본체 스펙 개정**(§9-2) — SQL/뷰 단계에서 착지.

---

## 11. 관통 철학 (③에서도 지킬 것 — MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백도 근거+방향까지만, 설득 대본 금지("○○님 지금 안 하시면…" X).
- **숫자 금지·방향만:** ⑤ 치트키·재등록 운동 방향 모두 처방(각도·세트·중량) 금지.
- **압박 아닌 공감:** 세일즈 강도 = "근거의 세기지 압박의 세기 아님"(PREAMBLE 상속).
- **거절을 데이터로:** 재등록 실패도 inactive로 보관(삭제 금지) = ④ 통계 원천.
- **뼈대 먼저, AI는 그 위:** session_log·재등록 데이터 배선부터 깔고 AI 브리핑을 얹는다.
- **입력=사고 / 편의성:** 핵심만 입력, 나머지 자동·기본값·음성. **트레이너가 쓰기 불편하면 설계가 틀린 것.**
