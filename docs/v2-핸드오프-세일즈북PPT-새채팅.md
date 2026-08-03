# 핸드오프 — 새 채팅 이어가기 (세일즈북 PPT 기능 착수 + OT AI 재설계 현황)

> **이 문서 쓰는 법:** 새 채팅(웹Claude) 시작할 때 이 파일을 첨부/붙여넣기. 아래 §1 협업규칙 → §2 현재 진행상황 → §3 새 기능 브리핑 순으로 읽으면 바로 이어감. 레포 루트 `CLAUDE.md`·`docs/MASTERPLAN.md`가 정본.

---

## 1. 프로젝트 · 협업 모델 (30초)
- **오직 트레이너** — 한국어 PT 트레이너용 SaaS(Next.js 16 App Router · React 19 · JS/JSX · Tailwind v4 · Supabase RLS 잠금·account 스코프). 방향: **회원 리텐션 + 업무 자동화**, 재등록은 결과(`docs/v2-제품정의-재정렬-리텐션+자동화.md`).
- **협업 3역할:** 웹Claude(스펙·코드리뷰) → 클로드코드(로컬 구현) → **대수 직접 커밋**.
- **불변 규칙:** 로직·RLS·payload 불변 기본 · 표시/additive 우선 · **스펙은 라인번호 말고 코드 내용으로 매칭** · 새 파일 `git add` 먼저 · **배치별 1커밋=revert 단위** · Windows **PowerShell**(`&&` 금지 · `-m` 여러 개로 멀티라인 커밋) · 클라 write는 교훈1 하드닝(`.select()`+0행 체크) · anon-open RLS 금지 · 디자인시스템 프리미티브(`components/ui/`) 사용.

---

## 2. OT AI 재설계 — 현재 진행상황 (이번 세션 결과)

| 배치 | 내용 | 상태 |
|---|---|---|
| **클로징 시퀀스(C-1)** | `closing_line`→`closing_sequence`(떠보기·근거·요청·침묵·플러시) · goal별 손실축 · 결제=등록 현실 반영 | ✅ **커밋 완료**(`3712691`) · push·스모크 대수 확인 |
| **당일 체감 운동(C-2)** | session_plan·target_exercise·proof 재활/기능성 당일체감 강화 · 의료표현 체감화 · point_it_out '세팅'→'각도' | ✅ 구현·리뷰 OK · **커밋 대수 확인**(커밋 명령 전달됨) |
| **영어 키 누출 fix** | 2차 브리핑에 `movements`·`reaction.memo`·`observation` 영어 노출 → 프롬프트 금지 명시 + FIELD_TERMS 누락키 추가 | ✅ 구현·리뷰 OK · **커밋 대수 확인** |
| **성별 필드(배치 A)** | `user_table.gender`(nullable·male/female) 마이그레이션 + MemberForm select + mapMemberRow 매핑 + ot-brief 기본정보 4곳 + GENDER_HINT | ✅ 구현·리뷰 OK · ⚠️**마이그레이션 Supabase 실행 먼저** 후 커밋 |
| **영상 라이브러리(배치 B)** | 트레이너 큐레이션 운동 라이브러리를 AI 재료로 | ⏸ **보류** · 설계 결론: **"텍스트 우선 + 선택적 링크"(A안)** 추천(AI는 영상 못 봄 → 동작명+체감 한 줄이 뼈대, url은 트레이너 참고용 선택 첨부). 재개 시 이 방향으로 스펙 |

- 관련 스펙 파일(이번 세션 산출 · 레포 docs에 기록할지는 대수 판단): `v2-스펙-클로징-시퀀스-재설계.md` · `v2-스펙-당일체감-운동강화.md` · `v2-스펙-2차관찰-영어키-누출수정.md` · `v2-스펙-성별필드.md` · `v2-스펙-OT-AI재설계-…(성별+당일체감+영상라이브러리+클로징).md` · `클로징-샘플-재설계-3케이스.md`.
- **핵심 코드:** `app/api/ot-brief/route.js` — 4 phase(`first`/`second`/`reregister`/`acute`) · 공용 상수(`PREAMBLE`·`STAKES_AXIS`·`MEMBER_LANG`·`SAMEDAY_PLAN`·`SAMEDAY_PROOF`·`REHAB_TONE`·`GENDER_HINT`·`CLOSING_SEQ_JSON`·`closingSeqInstruction`) · `FIELD_TERMS`/`sanitizeText` · `parseBrief`. 렌더: `FirstOTAssist`·`SecondOTTab`·`RegBriefView` + `components/ui/ClosingSequence.jsx`.

---

## 3. 새 기능 브리핑 — 세일즈북 PPT 자동 생성

### 3-1. 무엇을
2차 OT · 재등록 **대상 회원에게 보여줄(또는 건넬) 세일즈북 PPT**를 자동 생성. 트레이너가 클로징 자리에서 화면/출력물로 제시해 설득력을 높임.

### 3-2. ★가장 중요한 설계 전제 (여기서 갈림)
**대상이 '트레이너'가 아니라 '회원'이다.** 기존 OT 브리핑(`ot-brief`)은 **트레이너용 컨닝페이퍼**(거절방어 대사·클로징 멘트 = 회원에게 보이면 안 됨). 세일즈북은 **회원 대면 자료**라 내용을 반드시 **변환**해야 함:
- **넣을 것(회원용):** 회원 목표 · 1차에서 확인된 체감/변화(proof) · 재등록이면 그동안의 진전(why_now·roadmap) · 추천 프로그램(회차·빈도·기간 + '왜 이만큼'의 당위) · 앞으로의 로드맵 · (선택)비포애프터·인바디 추이.
- **빼야 할 것(트레이너 내부용):** `objection_defense`(거절 방어 대사) · `closing_sequence`(클로징 멘트) · 재정신호 판단 · sales_intensity 등. 이건 회원이 보면 역효과.

### 3-3. 데이터 소스 (이미 있는 것)
- **2차:** `ot_log`(1차 관찰) + `secondPrompt` 산출(member_read·proof·recommended_program(pick_ref/frequency/duration/session_logic)·…) · 패키지(가격 설정 · 금액은 앱이 채움).
- **재등록:** PT 관리 데이터(계약·잔여·수업일지) + `reregisterPrompt` 산출(why_now(proven/risk_if_stop/next_roadmap)·recommended_program·sweetener·…).
- ⚠️ 이 산출들은 **트레이너 톤**이라 세일즈북용으론 **회원 대면 톤으로 재생성/변환** 필요 → 새 phase(`salesbook`?) 또는 별도 라우트가 자연스러움.

### 3-4. 열린 질문 (새 채팅 첫 결정)
1. **콘텐츠 출처:** 기존 브리핑 JSON을 **변환**할지 vs **회원 대면용 새 AI 생성**(ot-brief에 `phase:"salesbook"` 추가 or 신규 `app/api/salesbook`)? (추천: 신규 phase — 회원 톤·구성 다름.)
2. **PPT 생성 위치:** 서버 라우트에서 pptx 생성→다운로드 vs 클라 렌더(슬라이드 뷰)→내보내기 vs Cowork/문서생성? (앱 안에서 트레이너가 즉시 받아야 하니 서버 pptx 생성이 유력.)
3. **디자인:** 오직 트레이너 브랜드(빨강 `#dc2626`·Pretendard) 반영 · 슬라이드 구성(표지→목표→체감증거→로드맵→추천프로그램→마무리?).
4. **전달:** 화면 프리뷰 후 다운로드? 회원앱으로 공유 링크? 출력용 PDF 겸용?
5. **가드레일:** 회원 대면이라 의료 단정·수치 처방·과장 성과 보장 금지(기존 PREAMBLE 원칙 계승). 가격은 실제 패키지에서.

### 3-5. 도구
- **PPT는 `pptx` 스킬** — ⚠️ 순서: **먼저 콘텐츠(데이터·문구) 확정 → 그다음 `pptx` SKILL.md 읽고 빌드**(리서치 먼저, 포맷 스킬은 나중). 브랜드 톤은 CLAUDE.md의 디자인 토큰 참고.
- 회원 대면 카피는 세일즈이되 **압박·조작·의료단정 금지**(제품 원칙).

### 3-6. 새 채팅 첫 스텝 제안
① 위 §3-2(회원 대면 전제)·§3-4 열린질문을 대수와 확정 → ② 슬라이드 구성(스토리라인) 초안 → ③ 콘텐츠 소스(변환 vs 신규 phase) 결정 → ④ 샘플 슬라이드 1세트(2차 1케이스)로 종이 검증 → ⑤ 스펙 → 클로드코드.

---

## 4. 넘길 때 한 줄
"OT AI 재설계 4배치(클로징·당일체감·영어누출·성별) 구현·리뷰 완료, 영상 라이브러리는 텍스트우선 A안으로 보류. 이제 **2차/재등록 회원 대면 세일즈북 PPT** 기능 착수 — 핵심은 '트레이너 컨닝페이퍼'가 아니라 '회원에게 보여줄 자료'라 톤·내용 변환이 관건."
