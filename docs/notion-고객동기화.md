# 노션 '앱 고객 관리' 자동 동기화

Supabase `account`(=앱 고객) → 노션 **앱 고객 관리** DB 로 매일 단방향 동기화합니다.
Vercel Cron 이 `/api/cron/sync-notion` 을 호출 → 계정을 읽어 노션에 **upsert**(계정ID 키).

## 무엇이 동기화되나

앱이 진실인 필드만 노션에 덮어씁니다:

| 노션 속성 | 출처 |
|---|---|
| 고객명 (센터/트레이너) | `account.name` (없으면 원장 트레이너 이름) |
| 계정ID | `account.id` — **upsert 키(수정 금지)** |
| 단계 | 구독상태로 파생 (아래 규칙) |
| 플랜 | `account.billing_plan` → 솔로/센터, 미결제=체험 |
| 규모(인원) | 계정의 활성 트레이너 수 |
| 가입일 | `account.created_at` |
| 만료일 | `account.current_period_end` |
| 구독상태 | `account.subscription_status` 원본 |

**사람이 노션에서 직접 쓰는 필드는 절대 안 건드립니다:** `다음 액션` · `기한` · `상태` · `연락처`.
해지·이탈 계정도 노션에서 지우지 않습니다(이력 보존). 단계만 갱신됩니다.

## '단계' 파생 규칙 (`app/api/cron/sync-notion/route.js`의 `deriveStage`)

- 구독상태 없음/`inactive` → **리드**
- 활성 + 해지예약(`cancel_at_period_end`) → **이탈위험**
- 활성 + 실결제 없음(무료체험) → **무료체험** (만료 3일 이내면 **유료전환대상**)
- 활성 + 실결제 있음 → **활성**
- 그 외(만료) → **해지**

> 결제 웹훅이 아직 수동이라(PRODUCT.md), 지금은 대부분 무료체험으로 잡힙니다.
> 웹훅으로 `payment` 성공행(amount>0)이 쌓이면 '활성'이 자동 정확해집니다.
> 규칙을 바꾸고 싶으면 `deriveStage` 한 곳만 고치세요.

## 설정 (한 번만)

### 1. 노션 내부 통합 만들기
1. https://www.notion.so/my-integrations → **New integration** (Internal).
2. 이름 예: `pt-navigator sync`. 만들면 **Internal Integration Secret**(`ntn_...` 또는 `secret_...`)이 나옵니다 → 복사.

### 2. '앱 고객 관리' DB를 통합에 연결
1. 노션에서 **앱 고객 관리** 데이터베이스 페이지 열기.
2. 우측 상단 ··· → **연결(Connections)** → 위에서 만든 통합 추가.
   (이걸 안 하면 API가 DB를 못 찾습니다.)

### 3. DB id 확인
- '앱 고객 관리' DB id: **`b46289001114450eb41cd0d80826bdc5`**
  (URL `notion.so/...b46289001114450eb41cd0d80826bdc5` 의 32자리)

### 4. 환경변수 (Vercel → Project → Settings → Environment Variables)
```
NOTION_TOKEN=ntn_xxx                 # 1번 통합 시크릿
NOTION_CUSTOMER_DB_ID=b46289001114450eb41cd0d80826bdc5
CRON_SECRET=<아무 긴 랜덤 문자열>     # 크론 인증용
SUPABASE_SERVICE_ROLE_KEY=<이미 있으면 그대로>
NEXT_PUBLIC_SUPABASE_URL=<이미 있음>
```
> `SUPABASE_SERVICE_ROLE_KEY` 는 서버 전용 — 절대 `NEXT_PUBLIC_` 붙이지 말 것.

### 5. 배포
`git push origin main` → Vercel 자동 배포. `vercel.json` 의 크론이 **매일 06:00 KST(21:00 UTC)** 실행됩니다.

## 수동 테스트
배포 후, 로컬/터미널에서:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<배포도메인>/api/cron/sync-notion
```
응답 예: `{"ok":true,"total":12,"created":12,"updated":0,"failed":0,"errors":[]}`
두 번째 호출부터는 `created:0, updated:12` 가 됩니다(중복 안 생김).

## 주의
- 단방향입니다. 노션에서 고객명·단계를 바꿔도 다음 동기화 때 앱 값으로 덮어써집니다(그 필드들은 앱이 진실). 대수님 메모는 `다음 액션`/`상태`에 쓰세요.
- 계정이 아주 많아지면(수백+) 노션 API 레이트리밋(약 3req/s)에 닿을 수 있어요. 그때 배치·딜레이를 넣으면 됩니다.
- 실시간이 필요하면 이 크론 대신 Supabase Database Webhook 으로 같은 라우트를 호출하게 바꿀 수 있습니다.
