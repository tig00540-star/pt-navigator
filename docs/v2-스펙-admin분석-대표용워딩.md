# v2 스펙 — admin 분석 대시보드 대표용 워딩 정리 (쉬운말 + 한 줄 설명)

> 작성: 웹Claude · 2026-07-25 · 대상: 클로드코드 · 커밋: 대수
> **성격: 텍스트(라벨·설명)만 교체 · 로직/집계/payload/RLS 완전 무변 · 순수 additive.** 대상 = **admin(원장) 화면만**. 트레이너 화면(`app/page.jsx`·`components/views/*`)의 "클로징" 용어는 **그대로 유지**(현장 은어라 트레이너에겐 자연스러움).
> 협업 규칙 동일: 코드 내용으로 매칭 · 1커밋 · `npm.cmd`.

---

## 0. 왜 / 원칙
대표가 보기엔 "클로징·유입·전환 퍼널·소진·시점 스냅샷"이 은어라 이해가 안 됨 + "클로징"이 실적·전환 두 화면에 겹쳐 보임. → **① 쉬운 말로 교체 ② 각 화면 맨 위 역할 1줄 + 필요한 곳 짧은 설명.** 숫자·색·계산은 그대로.

용어 매핑 원칙: **클로징 → 등록**, **유입 → OT 상담**, **소진 → 출석**, **전환 → 등록**.

---

## 1. `components/admin/TrainerScorecard.jsx`

### 1-1. 맨 위 역할 설명 추가
`return (<div>` 바로 안, 정렬 토글(`<div className="mb-3 flex flex-wrap items-center gap-1.5">`) **위**에 추가:
```jsx
<p className="mb-3 text-[12px] leading-relaxed text-sub">
  트레이너 성적표 — 누가 <b className="text-ink">등록·관리·매출</b>을 잘 내는지 한눈에.
</p>
```

### 1-2. 정렬 칩 라벨 (`SORTS`)
```
{ key: "rev", label: "매출" }        → 유지
{ key: "r1", label: "1차" }          → label: "1차 등록"
{ key: "r2", label: "2차" }          → label: "2차 등록"
{ key: "rereg", label: "재등록" }    → 유지
{ key: "burn", label: "소진" }       → label: "출석"
{ key: "churn", label: "이탈" }      → label: "이탈위험"
```
정렬 힌트 문구: `sortKey === "churn" && <span ...>· 이탈 높은 순</span>` → `· 이탈위험 높은 순`.

### 1-3. 데스크톱 표 헤더 (`<thead>` `<th>` 텍스트)
| 지금 | 바꿀 값 |
|---|---|
| `담당` | 담당 (유지) |
| `1차` | **1차 등록** |
| `2차` | **2차 등록** |
| `재등록` | 재등록 (유지) |
| `소진` | **출석** |
| `일지` | 일지 (유지) |
| `이탈` | **이탈위험** |
| `이달매출` | 이달 매출 (유지) |
| `성과급` | 성과급 (유지) |

### 1-4. 표 아래 설명 한 줄 추가 (범례)
`</table>`을 감싼 `</div>` **다음**(데스크톱 블록 `<div className="hidden sm:block">` 안, 표 밑)에 추가:
```jsx
<p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
  1차·2차 등록 = OT 상담 후 실제 PT 등록 비율 · 출석 = 회원 1인당 이달 수업 수 · 이탈위험 = 14일 이상 안 온 회원 비율 · <span className="text-cyan-700">파랑=우수</span> <span className="text-danger-text">빨강=주의</span> · "—"는 아직 데이터 부족.
</p>
```

### 1-5. 모바일 카드 metric 라벨 (`<MetricTile label=...>`)
```
"담당"          → 유지
"1차 클로징"    → "1차 등록률"
"2차 클로징"    → "2차 등록률"
"재등록"        → 유지
"소진(회/월)"   → "출석(월 수업)"
"일지 작성"     → 유지
"이탈위험"      → 유지
"성과급"        → 유지
```

---

## 2. `components/admin/ConversionFunnel.jsx`

### 2-1. 맨 위 역할 설명 추가
`return (<div className="space-y-6">` 바로 안, 첫 `<Card>` **위**에 추가:
```jsx
<p className="text-[12px] leading-relaxed text-sub">
  OT 상담이 <b className="text-ink">등록으로 이어지는 흐름</b> — 어디서 빠지고, 이번 주 누구를 챙길지.
</p>
```

### 2-2. 깔때기 카드
- 헤더 라벨: `OT → PT 전환 퍼널` → **`등록까지 흐름 · 어디서 빠지나`**
- 큰 문장(전환율 옆): 현재 `유입 <b ...>{funnel.intake}명</b> → 등록 확정 <b ...>{funnel.confirmed}명</b>` → **`OT 상담 <b className="text-ink">{funnel.intake}명</b> 중 <b className="text-cyan-700">{funnel.confirmed}명</b> 등록`**
- 단계 라벨(`stages` 배열의 `label`):
```
"유입"       → "OT 상담 시작"
"1차 클로징" → "1차 OT"
"2차 클로징" → "2차 OT"
"등록 확정"  → "PT 등록"
```
- 성공률 문구: `1차 성공률` → **`1차 OT 등록률`**, `2차 성공률` → **`2차 OT 등록률`**.
- 어려운 캡션 교체 — 현재:
  `현재 각 단계 분포(시점 스냅샷 · 코호트 아님) · 확정은 status(pt_active) 기준. ②③④는 엄밀 단조 아님(즉등록 가능).`
  → **`지금 각 단계에 있는 회원 수예요. 상담 시기가 다른 회원이 섞여 있어 참고용입니다. (1차 OT에서 바로 등록하기도 해요.)`**

### 2-3. 트레이너별 표
- 섹션 헤더: `트레이너별 퍼널 · 어디서 새는지` → **`트레이너별 등록 흐름 · 어디가 약한지`**
- 표 헤더:
```
"트레이너" → 유지
"유입"     → "OT 상담"
"1차"      → "1차 OT"
"2차"      → "2차 OT"
"확정"     → "등록"
"전환율"   → "등록률"
"약점"     → 유지
```
- 약점 태그:
```
"1차 시도율↓" → "첫 상담서 등록권유 적음"
"2차 성공률↓" → "2차서 등록 놓침"
```
(태그가 길어지면 표 폭 여유 위해 `min-w-[560px]` → `min-w-[640px]`로. 로직 무변.)

### 2-4. 이번 주 임박 카드
- 제목: `이번 주 클로징 임박` → **`이번 주 챙길 등록 (임박)`**
- 태그: `2차 미마감 · 결정 필요` → **`2차 OT 후 미결정`** · `재접근 {d.date}...` 의 "재접근" → **`재상담 {d.date}`**
- 빈 문구: `이번 주 임박한 클로징이 없습니다.` → **`이번 주 챙길 등록 건이 없습니다.`**

---

## 3. `components/admin/RetentionConsole.jsx` (가벼운 통일 · 선택)
대체로 이미 쉬움. 통일 위해 맨 위 1줄만 추가(첫 `<div className="grid ...tiles">` 위):
```jsx
<p className="text-[12px] leading-relaxed text-sub">
  놓치면 아까운 매출 — <b className="text-ink">재등록 챙길 회원</b>과 <b className="text-danger-text">떠나려는 회원</b>을 미리.
</p>
```
나머지(만료 임박·이탈 위험·재등록률)는 이미 대표 친화적이라 유지.

---

## 4. `app/admin/page.jsx` (선택 · Eyebrow 문구)
실적 탭 Eyebrow가 `트레이너 리더보드 · {ym}`인데, 컴포넌트 내부 설명 1줄이 생기므로 **그대로 둬도 무방**. 굳이 바꾼다면 `트레이너 성적표 · {ym}` 정도(선택).

---

## 5. 검증
1. `npm.cmd run build`/`lint` green — **텍스트만 바뀌어 로직·경고 무변**.
2. 숫자·색·정렬·계산 **적용 전과 100% 동일**(라벨만 다름). 값 회귀 0.
3. 폰/데스크톱에서 대표가 읽고 "클로징/유입" 없이 바로 이해되는지 · 표 헤더·태그 안 깨지는지(퍼널 표 `min-w` 조정 확인).
4. 트레이너 화면(`app/page.jsx`·views)은 **안 건드림** — "클로징" 그대로.

## 6. 커밋 배치 (1커밋 = 워딩 정리)
```
git commit -m "copy(admin): 분석 대시보드 대표용 쉬운말 워딩 + 설명 한 줄" -- components/admin/TrainerScorecard.jsx components/admin/ConversionFunnel.jsx components/admin/RetentionConsole.jsx
```
(admin/page.jsx Eyebrow 안 바꾸면 제외. 3파일 텍스트만.)
