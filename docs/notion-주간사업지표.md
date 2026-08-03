# 주간 사업 지표 자동 리포트 (운영자용)

매주 1회 Vercel Cron 이 `/api/cron/weekly-report` 를 호출 → Supabase 전체(모든 센터)를 읽어
KPI를 계산 → 노션 **주간 사업 지표** DB에 그 주 한 줄을 append 합니다. 주차별 추이가 표로 쌓여요.

지표 정의는 앱의 순수 함수(`lib/memberStatus`)를 그대로 재사용해서 **admin 대시보드와 숫자가 일치**합니다.

## 기록되는 지표

- 전환율(%) · OT유입 · PT전환 — `otFunnel` (유일 성공지표)
- 활성구독 · 무료체험 · 유료전환대상(만료 3일내) · 해지 — `account` 구독상태
- MRR추정 — 활성 구독의 좌석 플랜 금액 합(`lib/plans` 기준: 솔로 59,000 / 센터 149,000)
- 활성트레이너7d — 최근 7일 수업일지 작성한 트레이너 수
- 일지작성률(%) — `logWriteRateByTrainer` 전체 평균(활성화 선행지표)
- GMV이번달 — 센터들 이번달 PT 계약 매출 합 `revenueInMonth`(앱이 만든 가치)
- 재등록률(%) — `reregisterStats`
- 이탈위험 · 만료임박 — `churnRiskMembers` · `expiringMembers` 전체 합

## 설정 (한 번만)

1. **노션 통합을 이 DB에도 연결** — 노션에서 **주간 사업 지표** DB 열기 → ··· → 연결(Connections) → `pt-navigator sync` 추가.
   (팁: 대신 상위 페이지 **운영·관리 홈**에 통합을 연결하면 그 아래 '앱 고객 관리'·'주간 사업 지표'가 한 번에 커버됩니다.)
2. **Vercel 환경변수 추가**
   ```
   NOTION_METRICS_DB_ID=13daf75bfea74015b054c7a473d72c1f
   ```
   (NOTION_TOKEN·CRON_SECRET·SUPABASE_SERVICE_ROLE_KEY 는 고객 동기화 때 넣은 걸 그대로 씁니다.)
3. `git push` → 배포. 크론은 **매주 월요일 06:00 KST(일 21:00 UTC)** 실행.

## 수동 테스트
```bash
curl.exe -s -H "Authorization: Bearer <CRON_SECRET>" https://<도메인>/api/cron/weekly-report
```
응답에 지표가 JSON으로 나오고, 노션 '주간 사업 지표'에 한 줄이 쌓입니다.

## 참고
- Vercel Hobby 플랜은 프로젝트당 크론 2개까지 — 지금 sync-notion(일) + weekly-report(주) 2개예요. 더 늘리려면 Pro 필요.
- 결제 웹훅이 붙기 전엔 '무료체험/활성' 구분이 대략치예요(활성 구독 전체를 무료체험/전환대상으로 봄). 웹훅 후 정밀해집니다.
- 추이를 차트로 보고 싶으면 노션에서 이 DB에 '차트' 뷰를 추가하면 돼요.
