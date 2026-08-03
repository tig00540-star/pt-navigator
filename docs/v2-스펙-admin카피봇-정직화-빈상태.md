# 수정 스펙 — admin '운영' 탭 카피봇 정직화 + 빈상태 · 2026-07-25

> **범위:** `app/admin/page.jsx`의 **카피봇 섹션(atab `ops`)** + `aggregate()` 함수 **한 파일만**.
> **문제:** ① 회원 0~소수 센터에서 `aggregate` fallback("센터 인근 오피스텔·무릎 통증·IT 개발자")이 **실측처럼** 칩에 노출 + "회원 0명 분석"(모순). ② "AI 상권 공략 카피봇 · DB 빅데이터 기반 자동 생성" = **과장**(실제는 정적 템플릿 5종 회전 + 회원분포 치환, AI·빅데이터 아님). 코드 주석상 이런 오인은 "신뢰 사고"(PRD §7.2).
> **해결:** 데이터 부족 시 **일반 템플릿임을 고지**, 충분 시 **실데이터 칩만**(fallback 숨김) + 라벨을 정직하게("초안·템플릿·회원 데이터 기반").
> **성격:** **로직 코어 불변**(카피 생성·회전 그대로). aggregate에 **파생 플래그 3개 추가(additive)** + 렌더 분기·워딩. payload·RLS 무관.
> **커밋 1개:** 예: `fix(admin): 카피봇 정직화 — 데이터부족 고지·fallback 숨김·과장표현 제거`.

---

## 변경 ① aggregate — 실데이터 여부 플래그 추가(additive)
아래 앵커(내용 매칭)를 찾는다:
```jsx
  return {
    total: rows.length,
    topResidence: res[0]?.[0] || "센터 인근 오피스텔",
    topPain: pain[0]?.[0] || "무릎 통증",
    topJob: job[0]?.[0] || "IT 개발자",
    residenceTop: res.slice(0, 3),
    painTop: pain.slice(0, 3),
  };
```
`painTop` 줄 **다음에** 3줄 추가(기존 필드 무변 → `buildCopies`는 그대로 동작):
```jsx
    hasResidence: res.length > 0,
    hasPain: pain.length > 0,
    hasJob: job.length > 0,
```

## 변경 ② 최소 회원 상수(모듈 레벨)
아래 줄(내용 매칭)
```jsx
const rateText = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
```
**다음 줄**에 추가:
```jsx
// 카피봇 '센터 맞춤' 프레이밍 최소 회원 수. 미만이거나 프로필 분포가 없으면 일반 템플릿으로 고지(fallback을 실측처럼 안 보이게). 원장 상황 따라 조정 가능.
const MIN_COPY_MEMBERS = 5;
```

## 변경 ③ copyDataReady 계산
아래 줄(내용 매칭)
```jsx
  const shown = [0, 1, 2].map((i) => copies[(copyOffset + i) % copies.length]);
```
**다음 줄**에 추가:
```jsx
  const copyDataReady = agg.total >= MIN_COPY_MEMBERS && (agg.hasResidence || agg.hasPain || agg.hasJob);
```

## 변경 ④ 섹션 제목 — "AI"·과장 제거
```jsx
            <Eyebrow icon={Megaphone}>AI 상권 공략 카피봇 · 이번 주 광고</Eyebrow>
```
→
```jsx
            <Eyebrow icon={Megaphone}>상권 공략 카피 초안 · 이번 주 광고</Eyebrow>
```

## 변경 ⑤ 빅데이터 요약 칩 → 실데이터일 때만·부족하면 고지
아래 **블록 전체**(주석 `{/* 빅데이터 요약 */}`부터 그 `</div>`까지)를 찾는다:
```jsx
          {/* 빅데이터 요약 */}
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              회원 <span className="font-semibold text-ink">{agg.total}명</span> 분석
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 거주 <span className="font-semibold text-primary-strong">{agg.topResidence}</span>
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 통증 <span className="font-semibold text-fuchsia-700">{agg.topPain}</span>
            </span>
            <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
              주 직군 <span className="font-semibold text-cyan-700">{agg.topJob}</span>
            </span>
          </div>
```
**아래로 교체**:
```jsx
          {/* 회원 데이터 요약 — 실데이터 충분할 때만 칩(fallback 숨김) · 부족하면 고지 */}
          {copyDataReady ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
                회원 <span className="font-semibold text-ink">{agg.total}명</span> 기준
              </span>
              {agg.hasResidence && (
                <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
                  주 거주 <span className="font-semibold text-primary-strong">{agg.topResidence}</span>
                </span>
              )}
              {agg.hasPain && (
                <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
                  주 통증 <span className="font-semibold text-fuchsia-700">{agg.topPain}</span>
                </span>
              )}
              {agg.hasJob && (
                <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
                  주 직군 <span className="font-semibold text-cyan-700">{agg.topJob}</span>
                </span>
              )}
            </div>
          ) : (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-line bg-elevate px-3.5 py-2.5">
              <Badge tone="ot" className="mt-px shrink-0">예시</Badge>
              <p className="text-[12px] leading-relaxed text-sub">
                아직 회원 데이터가 적어 <b>일반 템플릿</b>으로 보여드려요(현재 {agg.total}명).
                거주지·통증·직군이 {MIN_COPY_MEMBERS}명 이상 쌓이면 <b>센터 맞춤 문구</b>로 바뀝니다.
              </p>
            </div>
          )}
```
> `Badge`는 이미 import·QC 탭에서 `tone="ot"` 예시 뱃지로 사용 중(동일 패턴).

## 변경 ⑥ 카드 하단 — "DB 빅데이터 기반 자동 생성" 정직화
```jsx
                    <Sparkles className="h-3 w-3" /> DB 빅데이터 기반 자동 생성
```
→
```jsx
                    <Sparkles className="h-3 w-3" /> {copyDataReady ? "회원 데이터 기반 초안" : "예시 템플릿"}
```

## 변경 ⑦ 하단 안내문 — "자동 생성/빅데이터" 대신 실제(템플릿) 명시
```jsx
          <p className="mt-4 text-[10px] leading-relaxed text-muted">
            ※ 카피는 현재 회원 데이터 분포를 바탕으로 조합한 초안입니다. 광고 집행 전 과장·의료
            표현(치료·완치 등) 여부를 검토하세요.
          </p>
```
→
```jsx
          <p className="mt-4 text-[10px] leading-relaxed text-muted">
            ※ 정해진 문안 템플릿에 회원 분포를 넣어 만든 <b>초안</b>이에요(AI 생성 아님). 광고 집행 전 과장·의료
            표현(치료·완치 등) 여부를 검토하세요.
          </p>
```

---

## 검증 (구현 후)
- `npm.cmd run build` / `npm.cmd run lint` **green**.
- **회원 0~4명(또는 프로필 분포 없음):** 칩 대신 "예시" 뱃지 + "일반 템플릿으로 보여드려요" 고지. 카드 하단 "예시 템플릿". **"회원 0명 분석"·가짜 거주지/통증/직군 노출 안 됨.**
- **회원 5명+ & 프로필 있음:** "회원 N명 기준" + 실제 값 있는 칩만 표시(빈 필드는 칩 자체가 안 뜸). 카드 하단 "회원 데이터 기반 초안".
- 카피 카드 5종·"새로 뽑기" 회전은 **이전과 동일**(생성 로직 무변).
- 제목/안내문에 "AI·빅데이터·자동 생성" 과장 표현 사라짐.
- 다른 탭 **무변**.

## diff 범위 체크(리뷰 포인트)
정상 diff는 `app/admin/page.jsx` **한 파일**, 아래에만:
1. `aggregate` 반환에 `hasResidence/hasPain/hasJob` 3줄 · 2. 모듈 상수 `MIN_COPY_MEMBERS` · 3. `copyDataReady` 1줄 · 4. Eyebrow 제목 · 5. 칩 블록 분기 교체 · 6. 카드 하단 문구 · 7. 하단 안내문.
그 외 파일·`buildCopies`/카피 생성 로직·payload 변화 있으면 반려.
