# v2 스펙 — 전환 퍼널 (OT → PT 등록)

> 작성: 웹Claude · 2026-07-25 · 대상: 클로드코드 · 커밋: 대수 · **오늘 할일 #2** (구현 순서상 마지막)
> 협업 규칙 동일: additive 우선 · 코드내용 매칭 · 배치별 1커밋 · `npm.cmd` · 새 파일 `git add` 먼저.
> **선행 완료:** #1·#4 배치 커밋됨. 확정 규율 반영 — **(a) hidden 회원은 컴포넌트 `visible`로 필터** · **(b) 색 = cyan(긍정)·rose(위험) 통일**(단계 막대는 OT amber→primary 별도) · **(c) ATABS "전환"은 실적 뒤 → 실적·전환·리텐션·QC·급여·운영**.

---

## 0. 요약 / 리스크
OT 세일즈 퍼널(유입→1차 클로징→2차 클로징→등록 확정)을 깔때기로 시각화 + 트레이너별 약점 + **"이번 주 클로징 임박 회원"** 리스트. `app/admin/page.jsx` **새 탭 "전환"**. 데이터 전부 로드분(`user_table`·`ot_log`) → 쿼리·마이그레이션 0 · RLS 무변. 순수함수 4개(내부 1 + export 3) + 컴포넌트 1개 + ATABS 1항목. 실데이터.

⚠️ 퍼널은 **시점 스냅샷**(코호트 아님) — 서로 다른 시기 회원이 각 단계에 분포. 화면에 "현재 각 단계 분포"로 명시.
⚠️ **hidden(환불) 회원 제외** — #1/#4와 동일 규율. 컴포넌트가 `visible = members.filter(m=>!m.hidden)`로 걸러 함수에 넘긴다.

---

## 1. 단계 정의
대상 = **OT 퍼널 유입 회원** = `origin === "ot_funnel"`(= `isClosingStatSubject`, 인계·외부 제외) **∩ visible(hidden 제외)**. 회원별 "도달 단계"를 ot_log·status로 판정.

| 단계 | 정의(회원 수) |
|------|--------------|
| ① 유입 | `origin==='ot_funnel'` & !hidden 전체 (분모) |
| ② 1차 클로징 | round=1 ot_log에 결과기록(success/hold/fail) 있는 회원 |
| ③ 2차 클로징 | round=2 ot_log에 결과기록 있는 회원 |
| ④ 등록 확정 | `status==='pt_active'` (전환 성공) |

- **전환율(핵심)** = ④ ÷ ① (유입 대비 등록 확정). 화면 최상단 큰 숫자.
- 단계별 성공률: 1차 성공률 = round1 success ÷ round1 시도, 2차 성공률 = round2 success ÷ round2 시도.
- ⚠️ ②③④는 엄밀 단조 아님(1차 즉등록=2차 없이 확정 가능). 화면은 "각 단계 도달 회원 수"로 표기, 단계 간 하락(drop-off)은 참고 %만. 총전환율(④÷①)이 핵심.

### "이번 주 클로징 임박 회원"
- (a) **보류 재접근 도래**: ot_log `closing_result==='hold'` & `closing_reapproach_at`가 [오늘, 이번주말] 구간 (round 1·2).
- (b) **2차 미마감**: round=2 있는데 `closing_result` 비어있음(= `unclosedClosings` 대상 · 지금 결정 필요).
→ 원장이 직접 챙길 "이번 주 클로징" 액션 리스트. 트레이너·회원명·사유 표기. **hidden·비-OT-회원 제외**(§3에서 visible 게이트).

---

## 2. 신규 순수함수 — `lib/memberStatus.js` (additive, 파일 끝 append)

> ⚠️ 받은 members 그대로 처리(hidden 필터는 호출부 · §3). `isClosingStatSubject`는 파일에 이미 있음(재사용).

```js
/* =========================================================================
   #2 전환 퍼널 — OT→PT. 대상=origin 'ot_funnel'. 순수·기준일 주입.
   hidden 필터는 호출부 책임(컴포넌트가 visible만 전달).
   ========================================================================= */

// 회원별 ot_log 라운드 결과 맵 빌더(내부 공용). user_id → {r1, r2} (결과 문자열|null).
function _otResultByMember(otRows) {
  const m = new Map();
  for (const r of Array.isArray(otRows) ? otRows : []) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    const cur = m.get(r.user_id) || { r1: null, r2: null };
    const res = (r.closing_result === "success" || r.closing_result === "hold" || r.closing_result === "fail") ? r.closing_result : null;
    if (r.ot_round === 1) cur.r1 = cur.r1 ?? res; else cur.r2 = cur.r2 ?? res;
    m.set(r.user_id, cur);
  }
  return m;
}

/**
 * OT 전환 퍼널 집계. 대상 회원(origin 'ot_funnel') 배열 + ot_log.
 * @returns {{intake, first, second, confirmed, firstSuccess, firstAttempt, secondSuccess, secondAttempt}}
 */
export function otFunnel(members, otRows) {
  const subjects = (Array.isArray(members) ? members : []).filter(isClosingStatSubject);
  const res = _otResultByMember(otRows);
  let intake = 0, first = 0, second = 0, confirmed = 0;
  let firstSuccess = 0, firstAttempt = 0, secondSuccess = 0, secondAttempt = 0;
  for (const m of subjects) {
    intake += 1;
    if (m.status === "pt_active") confirmed += 1;
    const r = res.get(m.id);
    if (r?.r1) { first += 1; firstAttempt += 1; if (r.r1 === "success") firstSuccess += 1; }
    if (r?.r2) { second += 1; secondAttempt += 1; if (r.r2 === "success") secondSuccess += 1; }
  }
  return { intake, first, second, confirmed, firstSuccess, firstAttempt, secondSuccess, secondAttempt };
}

/**
 * 트레이너별 퍼널 — 어디서 새는지 비교용(라운드별 성공수 포함 = 2차 성공률 약점 판정).
 * @returns {Array<{trainer_id, intake, first, second, confirmed, firstSuccess, secondSuccess, convRate}>} 유입 내림차순.
 */
export function otFunnelByTrainer(members, otRows) {
  const subjects = (Array.isArray(members) ? members : []).filter(isClosingStatSubject);
  const res = _otResultByMember(otRows);
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { intake: 0, first: 0, second: 0, confirmed: 0, firstSuccess: 0, secondSuccess: 0 }; map.set(tid, c); } return c; };
  for (const m of subjects) {
    const c = get(m.trainer_id ?? "unknown");
    c.intake += 1;
    if (m.status === "pt_active") c.confirmed += 1;
    const r = res.get(m.id);
    if (r?.r1) { c.first += 1; if (r.r1 === "success") c.firstSuccess += 1; }
    if (r?.r2) { c.second += 1; if (r.r2 === "success") c.secondSuccess += 1; }
  }
  return [...map.entries()]
    .map(([trainer_id, v]) => ({ trainer_id, ...v, convRate: v.intake ? v.confirmed / v.intake : null }))
    .sort((a, b) => b.intake - a.intake);
}

/**
 * 이번 주 클로징 임박 — (a) hold 재접근 도래[오늘~horizon] (b) 2차 미마감.
 * @param {Array} otRows  ot_log 행(round 1·2)
 * @param {{todayISO:string, horizonISO:string, otMemberIds?:Set, validMemberIds?:Set}} opts
 *        todayISO/horizonISO = 'YYYY-MM-DD'. otMemberIds = 현재 OT 회원(미마감 교집합). validMemberIds = 전체 visible 회원(둘 다 게이트).
 * @returns {Array<{user_id, ot_round, kind:'reapproach'|'unclosed', date:string|null}>}
 */
export function closingDueSoon(otRows, { todayISO, horizonISO, otMemberIds, validMemberIds } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const otIds = otMemberIds instanceof Set ? otMemberIds : null;
  const okIds = validMemberIds instanceof Set ? validMemberIds : null;
  const out = [];
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    if (okIds && !okIds.has(r.user_id)) continue; // hidden·비대상 제외(전체 게이트)
    // (a) 보류 재접근 도래
    if (r.closing_result === "hold" && r.closing_reapproach_at &&
        r.closing_reapproach_at >= todayISO && r.closing_reapproach_at <= horizonISO) {
      out.push({ user_id: r.user_id, ot_round: r.ot_round, kind: "reapproach", date: r.closing_reapproach_at });
      continue;
    }
    // (b) 2차 미마감(빈 결과)
    if (r.ot_round === 2) {
      const empty = r.closing_result == null || r.closing_result === "";
      if (empty && (!otIds || otIds.has(r.user_id))) out.push({ user_id: r.user_id, ot_round: 2, kind: "unclosed", date: null });
    }
  }
  return out;
}
```

> ⚠️ **확정=status pt_active 근거:** OT 성공→PT 전이는 `toPtActive`가 `status:'pt_active'`로 확정. origin은 유입 시 'ot_funnel' 고정이라 확정돼도 유지 → "유입 회원 중 pt_active"가 전환 성공. (성공했으나 status 미전이 케이스는 ④에서 누락 가능 — 화면 캡션에 "status 기준" 명시.)
> ⚠️ **closingDueSoon 중복:** 한 회원이 여러 조건에 걸릴 수 있음(드묾) — §3 컴포넌트에서 user_id 기준 1건으로 정리(우선순위: unclosed > reapproach).

---

## 3. 신규 컴포넌트 — `components/admin/ConversionFunnel.jsx`
Props: `{ members, otRows, trainers }`. `todayISO`/`horizonISO`는 마운트 1회 고정(오늘 + 7일 · KST).

### 계산
- **★hidden 필터:** `const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);`
- `funnel = otFunnel(visible, otRows)`
- `byTrainer = otFunnelByTrainer(visible, otRows)` + `nameOf(trainer_id)`(#1/#4와 동일 규약: `personName`, "미배정")
- `otIds = new Set(visible.filter(m=>viewFor(m)==='ot').map(m=>m.id))`
- `validIds = new Set(visible.map(m=>m.id))`
- `due = closingDueSoon(otRows, {todayISO, horizonISO, otMemberIds: otIds, validMemberIds: validIds})` → **user_id 기준 dedup**(unclosed 우선) + 회원/트레이너명 매핑.
- `nowISO`/날짜: `const [todayISO] = useState(() => kst 'YYYY-MM-DD')`, `horizonISO = todayISO + 7일`. (KST: `new Date(Date.now()+9*3600*1000)` 대신 렌더 순수 위해 `useState(()=>...)` 초기화.)

### 렌더 (섹션 3개 · DS `Card`/`ToneCard`)
1. **깔때기 시각화**(`Card`): 상단 **총 전환율 {confirmed/intake}%** 크게(cyan 강조) + "유입 N명 → 등록 확정 M명". 4단(유입→1차→2차→확정) 가로 막대, 폭 = count/intake 비례, 단 사이 하락% 표기. **단계 막대색 = OT 흐름색**(amber→primary 그라데이션 · `--color-ot` 계열 · 정적 리터럴). 하단 "1차 성공률 X% · 2차 성공률 Y%". 캡션 "현재 각 단계 분포(시점 스냅샷) · status 기준".
2. **트레이너별 퍼널 비교**(`Card`, 표): 트레이너 · 유입 · 1차 · 2차 · 확정 · 전환율 · 약점. **전환율 색: 낮으면 rose(`text-danger-text`)·높으면 cyan(`text-cyan-700`)**(#1 임계 참고: ≥45% good·≤25% warn 정도, 표본 적으면 neutral). 약점 태그(rose 톤 `bg-rose-500/10 text-danger-text`):
   - `1차 시도율↓` — `t.intake >= 3 && t.first / t.intake < 0.5`
   - `2차 성공률↓` — `t.second >= 3 && t.secondSuccess / t.second < 0.5` (★정확 지표 — `confirmed/second` 프록시는 1차 즉등록자가 분자에 섞여 나쁜 2차 클로저를 가리므로 금지. `otFunnelByTrainer`의 `secondSuccess` 필드 사용.)
3. **이번 주 클로징 임박 리스트**(`ToneCard tone="unclosed"` = red 우선순위): 회원명 · 담당 · 사유(`재접근 {date}` cyan / `2차 미마감` rose). 빈 배열이면 "이번 주 임박 없음".

### 색·톤 (★통일)
- 긍정/좋음 = `text-cyan-700`, 위험/주의 = `text-danger-text`(rose) — #1/#4와 동일.
- 단계 막대만 OT 흐름색(amber→primary) — good/bad 아니라 '단계'라 예외.
- 전부 정적 리터럴 클래스(purge 안전). 모바일 1열, 퍼널 세로 스택.
- ⚠️ 코호트 오독 방지 캡션 필수.

## 4. `app/admin/page.jsx` 통합 (additive · 코드내용 매칭)
### 4-1. import
```js
import ConversionFunnel from "@/components/admin/ConversionFunnel";
```
### 4-2. ATABS — `{ id: "perf", label: "실적" }` **바로 뒤**에 삽입(리텐션 앞):
```js
{ id: "funnel", label: "전환" },
```
결과 순서: 실적 · **전환** · 리텐션 · QC · 급여 · 운영.
### 4-3. 섹션 렌더:
```jsx
{atab === "funnel" && (
<section className="mb-8">
  <ConversionFunnel members={rows} otRows={otRows} trainers={trainers} />
</section>
)}
```
(schemes/runs/contracts/logs 불필요 — 퍼널은 members·otRows만.)

## 5. 검증
1. build/lint green(신규 경고 0).
2. 퍼널 ① 유입 = `origin==='ot_funnel'` & !hidden 회원 수 · ④ 확정 = 그 중 pt_active 수 · 총전환율 계산 일치.
3. **hidden 파리티:** 환불 회원이 유입·확정·임박 리스트에 안 뜸.
4. 1차/2차 성공률이 #1 리더보드 클로징 열(라운드별)과 방향 일치(리더보드는 트레이너 스코프·회원×라운드 dedup, 여기는 전체·행기준 — 값 근사).
5. "이번 주 임박" ⊇ 트레이너 `ReapproachToday`(오늘 도래) + `UnclosedClosingToday`(2차 미마감), visible·이번주(horizon) 범위. user_id 중복 1건.
6. 폰 1열·퍼널 세로 표시 · 색 cyan/rose 통일.

## 6. 커밋 배치
- **배치 1:** `lib/memberStatus.js` 함수 append(`_otResultByMember`·`otFunnel`·`otFunnelByTrainer`·`closingDueSoon`).
  `git commit -m "feat(stats): OT→PT 전환 퍼널 파생 추가" -- lib/memberStatus.js`
- **배치 2:** `components/admin/ConversionFunnel.jsx` 신규(§3 · visible 필터·cyan/rose) + `app/admin/page.jsx`(ATABS·섹션). 새 파일 `git add` 먼저.
  `git commit -m "feat(admin): OT→PT 전환 퍼널(전환 탭)" -- components/admin/ConversionFunnel.jsx app/admin/page.jsx`

각 배치 diff 붙여주시면 리뷰(배치1 실행 검증 · 배치2 visible 필터·색·파리티·dedup 중점).
