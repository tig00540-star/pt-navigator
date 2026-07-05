# v2 스프린트4 — 종료 후기 · 세션 인수인계

> 스프린트4(① 1차 OT 강화 = FirstOTTab) 완료 + 타임아웃 대응까지 끝낸 시점의 인수인계.
> 상위 설계 docs/MASTERPLAN.md, 로드맵 docs/v2-roadmap-next.md, 스프린트4 설계 docs/v2-sprint4-ot-first.md.
> 다음 세션은 이 문서 + 위 셋을 읽고 ② member_status 설계부터 시작한다.

## 종료 상태
- 로드맵 ① 1차 OT 강화 = 클로즈. 탭1 legacy 전면 은퇴 → 실 AI(FirstOTTab) 교체 완료.
- 커밋 체인: b4fa8ce(탭1→FirstOTTab 추출) → 19c657d(4a route phase:first 신스키마) →
  0b52108(4b FirstOTAssist 신스키마 렌더) → 0f1fa24(legacy 은퇴) → 4426989(완료 docs) →
  03d83e1(출력 슬림 + parseBrief guarded-union) → 39c1e62(필드명 누출 fix).
- 전부 origin/main 반영·프로덕션 배포 확인. 프로덕션 ① 정상(한글, timeout 없음).

## 타임아웃 사건 (왜 슬림했나 — 맥락)
- Vercel Hobby maxDuration=60s인데 ① 첫 콜 55.6s → function invocation timeout, ① 미표시.
- Pro 업그레이드 대신 무료로 해결: firstPrompt 출력 슬림(길이 지침만, 스키마·PREAMBLE 불변)
  → 55.6s→~38s, 출력 토큰 −32%. 스키마·톤 유지.
- ⚠️ 캐시는 이번에 안 함 — ② member_status에 묶기로(저장 위치가 상태 모델과 엮임). §3 "캐시 필요 시 별도 논의"의 그 지점.

## 슬림이 드러낸 잠복 3개 + 해결 (핵심 교훈)
슬림으로 출력이 짧아지자 haiku의 잠복 습성 3개가 표출. 근본 방어는 전부 '프롬프트 부탁'이 아니라 '결정적 코드'로 감:
1. 다중 ```json 블록 분할(2/3, 하나는 5블록) → parseBrief 하드닝: 펜스제거→단일파싱 / 첫완전객체 균형매칭 / guarded-union(키 비겹침일 때만 얕은 union, 겹치면 거부=오염방지, 딥머지 아님) + requiredKeys 스키마 게이트.
2. 값 텍스트에 스키마 필드명 누출(closing_compass 등) → 프롬프트 인용금지 블록(확률적 감소) + sanitizeFieldNames의 FIELD_TERMS에 1차 필드명 10개 한글 매핑(결정적 0건).
3. 메타문장/조사("방향와") → 프롬프트로 안 잡히고 부작용 → 백로그(1/5 경미).
교훈: 프롬프트 지시는 haiku가 확률적으로 어긴다(코드펜스·필드명·메타 3번 반복 확인). 0 보장이 필요하면 sanitizer 같은 통제 가능한 코드로 잡는다.

## harness 주의 (중요)
- scripts/test-first-prompt.mjs 는 gitignored — 리포에 없음. route.js의 PREAMBLE·firstPrompt·parseBrief·sanitizer와 字-동일 '거울'이어야 실측이 유효(harness가 프로덕션 대리 측정기).
- 프롬프트/파서/sanitizer 만질 때 route와 harness 양쪽 동시 수정 + diff 0 확인.
- 실측: node --env-file=.env.local scripts/test-first-prompt.mjs. 슬림 후 출력 ~3.7k토큰이라 max_tokens 8192 유지(잘림 방지).

## 백로그
- 메타문장/josa "방향와"(1/5 경미). 필요 시 sanitizer 조사-흡수(필드명+뒤 조사 한 덩어리 치환) 또는 별도 후처리.
- ① 캐시(재방문 즉시) — ②에서 저장위치 정해지면.
- [단계적] 필드(lukewarm_response·package_suggestion·machine 경로·MBTI 가설·라포 심화·FINANCE 회원기반화) — 실사용 튜닝.

## 다음 = ② OT/PT 뷰 분리 (member_status)
착수 전 현장 판단 3개(코드 아니라 상태 모델 설계 대화 먼저):
1. 상태 몇 개로 가르나 — OT진행 / OT완료·보류(재접근) / PT등록 / PT만기임박 / 이탈 중 트레이너 할 일이 실제로 갈리는 경계.
2. 전이 트리거 — 2차 closing_result=성공 → PT등록: 자동 vs 트레이너 수동 확정(실제 결제 있어야 PT).
3. 보류(미루기)의 위치 — S4 "미루기=2차 다리"의 그 보류를 별도 상태 vs OT완료에 녹이기(④ 클로징 통계와 연결).
+ ① 캐시 저장위치가 이 상태 모델과 엮임(폐기한 round-0 되살릴지 포함).
