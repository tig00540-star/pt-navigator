# v2 — 스프린트6 중간 인수인계 · ③ 차감/PTView(step3) 진입

> ③ PT 관리 뷰 진행 중. session_log 스키마 SQL + memberStatus 잔여 파생 3함수 완료.
> **다음 = step3(PTView 본체 + 차감을 손입력 공통 경로에 배선).** ① 음성 차감 배선은
> 구조 문제로 되돌림(아래 §2-7). 역할: 트레이너=클로드 코드 코딩+다리 / 웹 Claude=설계·스펙·검토.
> 흐름: 웹Claude(스펙)→트레이너→클로드코드(diff)→트레이너→웹Claude(검토)→폰.
>
> **새 채팅에 같이 붙일 파일:** 이 문서 + `docs/MASTERPLAN.md` · `docs/v2-roadmap-next.md` ·
> `docs/v2-sprint5-member-status.md` · `docs/v2-sprint5-postscript.md` ·
> `docs/v2-sprint6-session-log-schema.md` · `CLAUDE.md`. 코드는 step3 착수 시 필요분만 짚어 청구.

---

## 0. 지금 위치 (로드맵 ①~⑦)

```
① 1차 OT 강화     ✅ (v2-S4)
② OT/PT 뷰 분리    ✅ (v2-S5) + 현장 사용성 패스 + B(2차 탭 재편) ✅
──────────────────────────────
③ PT 관리 뷰       🔄 진행 중
   ├ session_log 스키마 SQL        ✅ (service_sessions 포함)
   ├ memberStatus 잔여 파생 3함수   ✅ (커밋 4823351)
   ├ 차감 배선                     ⏳ ← step3 공통 저장 경로에 붙임(음성 아님)
   ├ PTView 실채우기·홈카드         ⏳ step3
   └ 재등록 전이/writer·브리핑       ⏳ step4
④ 통계 / ⑤ 치트키 / ⑥ 다듬기 / ⑦ 로그인·RLS  ⏳
```

---

## 1. 완료된 것

**SQL(실행 완료):** session_log 신설(sprint6 §7) + daily_workout_log 확장(contract_id·session_at·source·sent_at·voided) + user_table.trainer_id 선반영 + anon 정책 + **session_log.service_sessions int not null default 0**.
컬럼 실존 anon SELECT로 확인(마이그레이션 반영 실증 — 교훈1의 "자리 생김"까지). **값 실증(첫 write raw)은 아직** — 실저장 경로가 step3에서 생기면 그때.

**memberStatus.js 3함수(커밋 4823351·순수 유지):**
- `remainingSessions(contract, logs)` → `{paid, service, total}`. used = logs 중 contract_id 일치 & !voided 개수. **유료 먼저 소진**(paid = max(0, sessions_total−used); service는 유료 0 된 뒤 감소). `?? 0` 구행/미반영 안전.
- `activeContract(contracts, logs)` → contract|null. 잔여>0 계약 중 started_at **FIFO 최고참**(먼저 등록한 단가부터 소진 = 급여 정확성). 없으면 null(계약없음·전소진 = 재등록 신호).
- `reregisterDue(contract, logs, {basis:'paid', threshold:10})` → bool. `r[basis] < threshold`("10회 미만" = 잔여 9회부터 재등록 트라이 = 트레이너 기준). basis 'paid'|'total' 한 글자로 타이밍 뒤집기.
- 검증 7케이스 PASS(FIFO 넘어감·유료먼저·voided제외·null방어·10회경계)·lint clean·import/new Date() 0.

**커밋 체인(origin/main):** `6531fab`(세션 시작) → `4823351`(memberStatus 3함수) → `781407f`(sprint6 스키마 문서).
원격 HEAD = `781407f`, working tree clean.

---

## 2. 이번 세션 핵심 결정 (뒤집기 전 근거 읽을 것)

1. **활성계약 판정 = 순수함수 + 조회 주입**(insert 직전 조회 아님). 규칙은 memberStatus 한 곳, 조회(supabase)는 호출부. PTView·홈카드·차감이 같은 순수함수 공유 → 숫자 어긋남 방지(S5 교훈4 재발 방지).
2. **FIFO 소진** — 활성계약 = 잔여>0 중 **가장 오래된** 계약. contract_id는 "그 수업의 단가표"라, 먼저 등록한 6만원짜리를 다 태워야 재등록 5만원으로 넘어감(안 그러면 급여 오정산). §3 "이월은 트레이너가 새 세션수에 반영" 애매함도 FIFO가 해소.
3. **서비스 수업 = 잔여엔 포함, 돈엔 불포함.** `service_sessions` 별도 컬럼. 매출0·급여0(트레이너의 매출 수단일 뿐 — "2개 더 드릴게요, 등록하시죠"). sessions_total 부풀리면 무급을 유급으로 = 가짜숫자 회귀(§5 위반)라 분리.
4. **잔여 표시 = 유료·서비스 분리**("유료 5 + 서비스 3"). 서비스가 재등록 미끼라 구분 노출이 대화 무기.
5. **재등록 타이밍 = 유료(paid) 기준**(basis 기본 'paid'). 서비스는 매출0이라 "장사 관점 이미 끝난 회원" → 유료 0에서 대화 시작, 서비스는 대화 끌 쿠션. 폰 실사용 뒤 'total'이 나으면 한 글자 교체(미결정 → basis로 흡수).
6. **고정수업료 vs 매출구간% 센터 = ④ 소관.** session_log는 price_per_session raw만. 방식 분기는 ④ 관리자 설정. 지금 자리도 안 만듦(오버빌드 방지). 핸드오프 메모: ④ 급여 계산 = 센터별 {매출구간% | 고정수업료} 분기 필요.
7. **★차감 배선은 음성일지 아니라 "손입력 공통 저장 경로"에 붙인다 (이번 세션 되돌림).**
   음성일지에 차감을 붙였더니 "음성=메인" 구조가 됨 → 손입력으로 저장하면 차감이 안 도는 뒤집힘.
   올바른 구조: **손입력이 기본**(헬스장은 녹음 잘 되는 환경 아닐 수 있음), **음성은 서브**(STT 결과가
   손입력 폼에 자동 채워지고, 최종 저장은 폼 하나). 차감은 그 **공통 폼 저장 성공 한 곳**에만 붙음
   → 손입력·음성 공통으로 돌아감. sprint6 §9-3 "PTView 본체=수업확인서겸운동일지, 음성은 서브"와 정합.
   되돌린 것 = VoiceLogTab 배선 한 파일뿐(커밋 안 한 상태라 git restore로 clean). memberStatus 3함수는
   순수라 그대로 재사용(어느 경로가 부르든). 토스트 개선 아이디어(저장 실패가 "복사 완료"에 안 가려지게)도
   step3 공통 저장 경로에 그대로 재사용.

---

## 3. 관통 상수 — 경량·단순 (트레이너 daily: 50분 수업 / 10분 쉬는시간)

로딩·런타임이 길면 10분 안에 확인·넘어가기 불가 = daily 앱 실격. 그래서:
- 차감은 **저장 폼 하나에 얹기만** — 새 화면·버튼 0.
- 조회는 회원 1명치 몇 행(폰 체감 0). AI 호출은 차감 경로에 없음(유일한 큰 비용 Sonnet은 캐시로 이미 해결).
- 규칙은 순수함수 한 곳 → 나중 수정도 함수 하나만.
- ③ 국면 닫을 때 경량화 실측 1회(§8 규약 · 번들/런타임/유지보수 세 축).

---

## 4. step3 구성 (PTView 본체 = member-status §5 하이브리드 · origin 독립)

⚠️ PTView는 `ot_log`에 필수 의존하면 안 됨(인계·외부 PT 회원은 ot_log 아예 없음).

1. **PTView 본체 = "수업확인서 겸 운동일지" 타임라인** — origin 무관, PT면 누구나 쌓임.
   - **저장 경로 = 손입력 기본 + 음성 서브(STT→폼 자동채움) + 노쇼(빈 본문).** `source`: manual / voice / noshow.
   - **차감 = 이 저장 성공 시 한 곳에서.** `activeContract(FIFO)`로 contract_id 연결 + `.select()` → `data.length>0`
     하드닝(교훈1 값 실증이 여기서 처음 일어남). contract_id null이면 계약없음/전소진(안전, count 제외).
   - **body(raw_voice_text/ai_summary) NULL 허용** 유지 → 노쇼·빈 본문 저장 가능(차감 막지 말 것).
2. **현재 방향/목표 필드**(user_table 컬럼 1개로 시작 가능) — origin 무관. OT 있었으면 그 목표에서 출발, 없으면 첫 세션에 트레이너가 잡음.
3. **잔여 렌더** — `remainingSessions`로 "유료 N + 서비스 M" 분리 표시.
4. **홈카드 재등록 타이밍** — `reregisterDue(basis:'paid')` 물림. 기존 `reapproachToday` 카드 옆 형제.
5. **참고(옵션) = ot_log 스냅샷** 있으면 과거 관찰·목표 표시, 없어도 무해.
6. **음성일지 = PT 전용 편입**(viewFor pt만 노출, ot 숨김). **음성 디테일 강화는 백로그**(지금 당기면 복잡 — 트레이너가 나중으로 미루기로 결정).
7. **회원 보관 = inactive 종결**(삭제 아님, status_note 사유). `toInactive` 실체화(writer는 있음·UI 없음). 삭제 금지 = ④ 통계 원천.

---

## 5. step4 (재등록 흐름 · step3 뒤)

- 재등록 = OT 클로징의 PT 대칭(설계 위험 낮음, 검증된 패턴 재사용).
  - reg_result: success / hold / fail (**영문** · 교훈4).
  - reg_reason: 카테고리(자유서술 X — ④ 집계). seed(sprint6 §3): 금전 부담 / 시간 부족 / 스케줄 안 맞음 / 수업 남아 나중에 / 효과 체감 부족 / 개인 사정 / 기타. **실데이터 보며 확정.**
  - reg_reapproach_at → `reapproachToday` reader 그대로 재사용.
  - report = reg_brief 캐시(공존 패턴).
- **성공 ≠ 자동 갱신** → 수동 '재등록 확정' = 새 session_log 행(새 세션수·새 회당단가 = 잔여 리셋, toPtActive 대칭).
- 재등록 브리핑 = route.js **별도 phase:"reregister"** 권장(2차에 얹지 말 것 — maxTokens·가드 독립). route↔harness 字-동일.
- 이유별 피드백 = OT 브리핑의 재등록판. **근거+방향까지만, 설득 대본 금지**("○○님 지금 안 하시면…" X).

---

## 6. step3 진입 시 첨부할 코드 (필요할 때 짚어 청구 · 최신 main 커밋본)

- `components/views/PTView.jsx`(빈 껍데기 50줄) · `MemberViewShell.jsx` · `app/page.jsx`(CRMTab 데모 292줄·마운트·closingVersion 배선)
- `components/tabs/VoiceLogTab.jsx`(음성 서브 편입 · STT→폼 자동채움 대상 · 기존 copyAndSave insert 1곳)
- `lib/memberStatus.js`(4823351 — 3함수 소비처) · `lib/labels.js`(source·재등록 카테고리 *_OPTS 추가 위치)
- (step4) `components/tabs/ObservationTab.jsx`(writer 패턴) · `app/api/ot-brief/route.js`(브리핑 대칭)

⚠️ 붙는 코드는 항상 최신 main 커밋본(업로드 스냅샷 아님). 웹 Claude는 상단 주석·줄수로 최신 확인, §1 커밋 해시와 어긋나면 알림.

---

## 7. 살아있는 부채·주의 (step3에서 밟을 것)

- **보안 ⑦ 이월:** session_log·daily_workout_log anon 정책 개방분 + 기존 anon 전면 개방 → ⑦ 일괄 잠금. 신규 write 경로엔 anon 정책 + `.select()` 0행 하드닝 동일 적용(현장 트러블슈팅 규율).
- **교훈1 값 실증 미완:** 컬럼 실존은 확인(anon SELECT). 첫 write raw 값 확인(contract_id·session_at·source·sent_at 실제 찍힘)은 step3 저장 경로에서. 현재 session_log 0행이라 첫 저장은 contract_id=null 경로부터.
- **테스트행 청소**(대시보드 수동 · DELETE 정책 없음): 옛 한글 '성공' 행 등 + step3 테스트 저장분. 실회원 투입 전.
- **route↔harness 字-동일**(step4 재등록 브리핑 프롬프트 붙일 때). test-*-prompt.mjs는 gitignored 거울.
- **재등록 카테고리 실데이터 확정 · voided 되돌리기 UI · session_at 수정 UI** — step3/4에서 착지.
- **① 캐시/배너 lift(C2):** step3에서 부모가 회원 round 상태 소유(lift) 시 배너 refetch·① 재방문 stale·2차 조회 통합 해소. C1 안 함·C2 채택.
- **[미래] 스케줄표**(scheduled_at 자리 이미 비워둠) · **트레이너 프로필 세일즈 개인화**(선행 ⑦) · **센터 가격표 테이블**(⑦ 언저리).

---

## 8. 작업 규약 (B·③ 국면에서 검증된 방식 — 유지)

- **착수 스펙 = 클로드 코드 붙여넣기 블록**: `[작업]` 한 줄 + 대상 파일 + `diff 작게` + `lint green 필수` + ■ 목표 / ■ 변경(정확한 위치·함수·키) / ■ 절대 무변경 / ■ 범위 밖 / ■ 확인.
- **선택지 = 실사용 수업 장면으로 설명**, 권고는 분명히(결정 지연 방지), 근거는 현장 동선으로.
- **커밋도 붙여넣기 블록** · 검토(diff 원문) 통과 후에만. 파일 단독 스테이징.
- **코드 파일은 필요할 때 짚어서 청구**(처음에 다 안 붙임). 저장 경로·프롬프트·배선은 눈으로 봐야 정확.
- **국면 끝에 경량화 실측 1회**(번들 / 런타임 체감 / 유지보수 줄수 세 축, 체감 아닌 숫자).

---

## 9. 관통 철학 (MASTERPLAN ⭐⭐)

- **스파링 파트너:** 재등록 피드백도 근거+방향까지만, 설득 대본 금지.
- **숫자 금지·방향만:** ⑤ 치트키·재등록 운동 방향 모두 처방(각도·세트·중량) 금지.
- **압박 아닌 공감:** 세일즈 강도 = 근거의 세기지 압박의 세기 아님.
- **거절을 데이터로:** 실패도 inactive로 보관(삭제 금지) = ④ 통계 원천.
- **뼈대 먼저, AI는 그 위:** session_log·재등록 데이터 배선부터 깔고 AI 브리핑을 얹는다.
- **입력=사고 / 편의성:** 핵심만 입력, 나머지 드롭다운·기본값·음성. 트레이너가 쓰기 불편하면 설계가 틀린 것.

---

## 10. 새 채팅 첫 입력 메시지 (복붙용)

> pt-navigator 트레이너야. 역할 = 나는 클로드 코드로 코딩, 너(웹 Claude)는 설계·스펙·검토.
> 흐름: 너(스펙)→나→클로드 코드(diff)→나→너(검토)→나(폰).
> 첨부 문서 먼저 읽어줘: v2-sprint6-postscript-handoff.md(직전 인수인계·제일 중요) + MASTERPLAN ·
> v2-roadmap-next · v2-sprint5-member-status · v2-sprint5-postscript · v2-sprint6-session-log-schema · CLAUDE.md.
>
> ③ 진행 중 — session_log 스키마 SQL + memberStatus 잔여 파생 3함수(커밋 4823351)까지 완료.
> 음성일지에 차감 붙였던 건 "음성=메인" 구조라 되돌렸고(인수인계 §2-7), 이번엔 step3 = PTView 본체를
> 제대로 짜면서 차감을 손입력 공통 저장 경로에 붙일 거야.
>
> 먼저 방향부터: PTView 저장 경로를 "손입력 기본 + 음성 서브(STT가 폼에 자동채움) + 노쇼" 한 폼으로 두고
> 차감을 그 저장 성공 한 곳에 붙이는 구조 — 이거 확정하고 step3 세부 설계 가자.
> 필요한 코드 파일은 짚어서 청구해줘. 작업 방식은 인수인계 §8 규약대로.
