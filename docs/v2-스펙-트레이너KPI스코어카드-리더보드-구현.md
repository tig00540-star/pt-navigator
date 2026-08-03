# v2 스펙 — 트레이너 KPI 스코어카드 / 리더보드 (+성과급 연동)

> 작성: 웹Claude · 2026-07-25 · 대상: 클로드코드(로컬 구현) · 커밋: 대수
> 우선순위: **오늘 할일 #1 (가장 임팩트 큼)** — 원장이 제일 원하는 화면.
> 협업 규칙(그대로): 로직·RLS·payload 불변 기본 · **additive 우선** · 스펙은 **라인번호 아닌 코드 내용으로 매칭** · 새 파일 `git add` 먼저 · **배치별 1커밋** · Windows PowerShell(`&&` 금지, `npm.cmd run build/lint`).

---

## 0. 한 줄 요약 / 리스크

트레이너별 한 줄 리더보드를 `app/admin/page.jsx` **실적 탭**에 추가한다. 각 지표는 **전부 이미 로드된 데이터**(`user_table`·`ot_log`·`session_log`·`daily_workout_log`·`pay_scheme`·`payroll_run`)에서 파생 → **DB 쿼리 추가 0 · 마이그레이션 0 · RLS 무변 · payload 무변**. 순수함수(`lib/memberStatus.js`) additive 추가 + 신규 표시 컴포넌트 1개 + admin 통합만. **실데이터**다(QC 탭 같은 데모 아님) — 단 베타라 표본이 적어 "—"가 많을 수 있고, 그게 정상.

리스크 낮음: 계산식 변경 없음, 기존 `트레이너별 실적` 섹션의 **급여 확정(PayrollConfirm) 흐름 보존**(상세 펼침으로 이관).

---

## 1. 지표 정의 (확정본)

`ym` = KST 'YYYY-MM'(admin 기존과 동일: `new Date(new Date().getTime()+9*3600*1000).toISOString().slice(0,7)`). 클로징률·재등록률·이탈률은 **누적 아님/이달 아님 구분 주의** — 아래 표의 "기간" 열이 정본.

| # | 지표 | 정의 | 기간 | 원천 함수 | 우수 | 주의 | 낮을수록 좋음 |
|---|------|------|------|-----------|------|------|:-:|
| a | 담당 회원 수 | `trainer_id==t` & `!hidden` & `status∈{ot_active,pt_active}` | 현재 | 파생(컴포넌트) | — | — | |
| b | 1차 클로징률 | round=1 결과기록 중 success 비율 | 누적 | `closingStatsByRoundByTrainer` | ≥50% | <30% | |
| c | 2차 클로징률 | round=2 결과기록 중 success 비율 | 누적 | `closingStatsByRoundByTrainer` | ≥50% | <30% | |
| d | 재등록률 | `session_log.reg_result` success/(succ+hold+fail) | 누적 | `reregisterStatsByTrainer` | ≥60% | <40% | |
| e | 이달 매출 기여 | `revenueByTrainer(...).total`(환불 차감) | 이달 | `revenueByTrainer`(기존) | 순위 1위 | — | |
| f | 세션 소진(회원당) | 이달 진행 수업 ÷ 담당 활성 PT 회원 수 (회/월·회원) | 이달 | `sessionsThisMonthByTrainer` ÷ b(a의 PT분) | ≥6.0 | <4.0 | |
| g | 수업일지 작성률 | 이달 비노쇼·비보이드 수업 중 내용(ai_summary or sets) 있는 비율 | 이달 | `logWriteRateByTrainer` | ≥90% | <70% | |
| h | 이탈률 | 담당 활성 PT 중 14일+ 무수업(잔여>0) 비율 | 현재 | `churnRiskByTrainer` | ≤10% | >25% | ✔ |
| i | 성과급(자동) | `payForScheme(resolveScheme(schemes,t),{monthRevenue,sessionCount,sessionPriceSum})` | 이달 | 기존 | — | — | |

### 지표 추천 근거 (대수 "추천은?"에 대한 결정)
- **세션 소진율 → "회원당 월 수업 빈도"(f)**: 예약 이행률은 스케줄 기능을 꾸준히 쓰는 트레이너만 유효(베타 데이터 신뢰도 낮음). 패키지 진행도(누적)는 높은 게 좋은 건지 애매(만료임박=재등록기회). **회원당 빈도는 `daily_workout_log`만으로 계산되고 "회원이 실제로 오고 있나"를 직접 보여줌 = 방치 조기경보.** 값은 %가 아니라 `회/월` (예: 6.2회).
- **이탈률 → "이탈위험률 14일 무수업"(h)**: 실제 종료(inactive) 전환율은 이미 늦은 후행지표. **14일 무수업은 원장이 지금 개입 가능한 선행지표**이고, #4 재등록·이탈 관제와 원천(`ChurnRiskToday` 로직) 공유 → 화면 간 숫자 일치.
- **일지 작성률 → "진행 수업 중 내용 있는 비율"(g)**: 예약(appointment) 연결 방식은 스케줄 기능 의존. **`daily_workout_log`만으로 계산해 신뢰 가능.** ai_summary(음성/손입력 요약) 또는 sets_structured(구조화 세트) 중 하나라도 있으면 "작성".
- **우수/주의 → "절대 기준선 + 상대순위 혼합"**: 비율 지표(b~d,g,h)는 절대 기준선(원장이 "클로징 30%=주의" 감을 원함), **매출(e)은 상대 순위**(1위 강조). 트레이너 소수일 때 순수 상대순위는 무의미해서 혼합.

### 빈데이터 가드 (중요)
표본이 적을 때 **"—"(neutral)로 두고, 절대 "주의(빨강)"로 칠하지 않는다.** no-data ≠ 나쁨.
- 클로징률(b,c): `attempted < 1` → rate `null` → "—", 색 판정 제외.
- 재등록률(d): `attempted < 1` → "—".
- 일지 작성률(g): 이달 대상 수업 `total < 1` → "—".
- 이탈률(h): 담당 활성 PT `< 1` → "—".
- 세션 소진(f): 활성 PT `< 1` → "—".
- **색 임계 적용 최소표본:** 우수/주의 색은 분모(attempted/total/PT수)가 **1 이상**일 때만. (권장 하한을 더 높이고 싶으면 `MIN_N` 상수로 3 등 조정 — §3 참조.)

---

## 2. 신규 순수함수 — `lib/memberStatus.js` (additive)

기존 파일 **맨 끝**(마지막 `payForScheme` 함수 뒤)에 아래 블록을 append. 기존 함수 **한 줄도 수정 금지**. 전부 순수(모듈 내 `new Date()`/`now` 금지 — 기준시각은 인자 주입, 기존 `kstYm` 재사용).

> ⚠️ `kstYm`은 파일 상단에 이미 정의된 **모듈 로컬 함수**(export 아님) — 새 함수들도 같은 파일 안이라 그대로 호출 가능.

```js
/* =========================================================================
   #1 트레이너 KPI 스코어카드 — 트레이너별 파생 (기존 파생의 per-trainer/per-round 확장).
   전부 순수: 기준시각 nowISO 주입 · ym 주입 · kstYm(모듈 로컬) 재사용.
   ========================================================================= */

/**
 * 트레이너별·라운드별 클로징률. round(1|2)마다 결과기록(none/빈값 제외) 중 success 비율.
 * closingStats(회원기준·라운드통합)와 달리 라운드 분리 + 행 기준(회원당 라운드 1행 전제).
 * @param {Array} otRows  ot_log 행
 * @param {Map} memberTrainer  Map(user_id → trainer_id)
 * @returns {Map} trainer_id → { r1:{attempted,success,rate}, r2:{attempted,success,rate} }
 */
export function closingStatsByRoundByTrainer(otRows, memberTrainer) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const mk = () => ({ attempted: 0, success: 0, rate: null });
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { r1: mk(), r2: mk() }; map.set(tid, c); }
    return c;
  };
  for (const r of rows) {
    if (!r || r.user_id == null) continue;
    if (r.ot_round !== 1 && r.ot_round !== 2) continue;
    const res = r.closing_result;
    // 결과 기록된 행만 시도로 카운트(none/빈값 = 미시도 제외).
    if (res !== "success" && res !== "hold" && res !== "fail") continue;
    const tid = mt.get(r.user_id) ?? "unknown";
    const slot = get(tid)[r.ot_round === 1 ? "r1" : "r2"];
    slot.attempted += 1;
    if (res === "success") slot.success += 1;
  }
  for (const c of map.values()) {
    c.r1.rate = c.r1.attempted ? c.r1.success / c.r1.attempted : null;
    c.r2.rate = c.r2.attempted ? c.r2.success / c.r2.attempted : null;
  }
  return map;
}

/**
 * 트레이너별 재등록률 — reregisterStats의 per-trainer판(session_log.trainer_id로 그룹).
 * @param {Array} contractRows  session_log 행
 * @returns {Map} trainer_id → { attempted, success, hold, fail, rate }
 */
export function reregisterStatsByTrainer(contractRows) {
  const rows = Array.isArray(contractRows) ? contractRows : [];
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { attempted: 0, success: 0, hold: 0, fail: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  for (const r of rows) {
    if (!r) continue;
    const res = r.reg_result;
    if (res !== "success" && res !== "hold" && res !== "fail") continue;
    const c = get(r.trainer_id ?? "unknown");
    c[res] += 1;
    c.attempted += 1;
  }
  for (const c of map.values()) c.rate = c.attempted ? c.success / c.attempted : null;
  return map;
}

/**
 * 트레이너별 이달 진행 수업 수(회원기준). voided·noshow 제외 · session_at 해당월 · user_id→trainer.
 * sessionCountByTrainer(계약기준·급여용)와 달리 회원 귀속이라 보강(contract 없음)도 포함 → "회원당 빈도" 분자.
 * @param {Array} logs  daily_workout_log 행
 * @param {Map} memberTrainer  Map(user_id → trainer_id)
 * @param {string} ym  'YYYY-MM'
 * @returns {Map} trainer_id → count
 */
export function sessionsThisMonthByTrainer(logs, memberTrainer, ym) {
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided || l.source === "noshow") continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const tid = mt.get(l.user_id) ?? "unknown";
    map.set(tid, (map.get(tid) || 0) + 1);
  }
  return map;
}

/**
 * 트레이너별 수업일지 작성률 — 이달 비보이드·비노쇼 수업 중 '내용 있는' 비율.
 * 내용 = ai_summary(trim 비어있지 않음) OR sets_structured(비어있지 않은 배열).
 * @returns {Map} trainer_id → { written, total, rate }
 */
export function logWriteRateByTrainer(logs, memberTrainer, ym) {
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { written: 0, total: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  const hasContent = (l) => {
    const s = typeof l.ai_summary === "string" && l.ai_summary.trim() !== "";
    const sets = Array.isArray(l.sets_structured) && l.sets_structured.length > 0;
    return s || sets;
  };
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || l.voided || l.source === "noshow") continue;
    if (typeof l.session_at !== "string" || kstYm(l.session_at) !== ym) continue;
    const c = get(mt.get(l.user_id) ?? "unknown");
    c.total += 1;
    if (hasContent(l)) c.written += 1;
  }
  for (const c of map.values()) c.rate = c.total ? c.written / c.total : null;
  return map;
}

/**
 * 트레이너별 이탈위험 — ChurnRiskToday와 동일 판정을 서버측 배열에서 트레이너별 집계.
 * 대상: view==='pt' & activeContract 존재 & remainingSessions.total>0 & 마지막 실수업 gap ≥ staleDays.
 * gap 기준시각 = nowISO(주입). 마지막 실수업 없으면 계약 started_at/created_at 기준(ChurnRisk와 동일).
 * @param {Array} members  user_table 행
 * @param {Array} contracts  session_log 행
 * @param {Array} logs  daily_workout_log 행
 * @param {{nowISO:string, staleDays?:number}} opts  nowISO 필수(모듈 내 now 금지)
 * @returns {Map} trainer_id → { atRisk, activePt, rate }
 */
export function churnRiskByTrainer(members, contracts, logs, { nowISO, staleDays = 14 } = {}) {
  const nowT = Date.parse(nowISO);
  const daysSince = (iso) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.floor((nowT - t) / 86400000);
  };
  const map = new Map();
  const get = (tid) => {
    let c = map.get(tid);
    if (!c) { c = { atRisk: 0, activePt: 0, rate: null }; map.set(tid, c); }
    return c;
  };
  const cByMember = new Map();
  const lByMember = new Map();
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (c?.user_id == null) continue;
    (cByMember.get(c.user_id) || cByMember.set(c.user_id, []).get(c.user_id)).push(c);
  }
  for (const l of Array.isArray(logs) ? logs : []) {
    if (l?.user_id == null) continue;
    (lByMember.get(l.user_id) || lByMember.set(l.user_id, []).get(l.user_id)).push(l);
  }
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || viewFor(m) !== "pt") continue;
    const tid = m.trainer_id ?? "unknown";
    const mc = cByMember.get(m.id) || [];
    const ml = lByMember.get(m.id) || [];
    const active = activeContract(mc, ml);
    if (!active) continue;                         // 활성계약 없음 = 재등록 대상, 이탈 아님
    const rem = remainingSessions(active, ml);
    if (rem.total <= 0) continue;                  // 전소진 = 재등록 대상
    const stat = get(tid);
    stat.activePt += 1;                            // 분모 = 활성계약 있는 PT 회원
    const done = ml.filter((l) => !l.voided && l.source !== "noshow");
    const last = done.map((l) => l.session_at ?? l.created_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const ref = last ?? active.started_at ?? active.created_at ?? null;
    const gap = ref ? daysSince(ref) : null;
    if (gap != null && gap >= staleDays) stat.atRisk += 1;
  }
  for (const c of map.values()) c.rate = c.activePt ? c.atRisk / c.activePt : null;
  return map;
}
```

> ⚠️ **CC 확인 요청 1:** `sets_structured`가 DB에서 문자열(jsonb 직렬화)로 올 가능성 — PostgREST는 jsonb를 JS 배열/객체로 파싱해 반환하므로 `Array.isArray`로 충분. 만약 로컬에서 문자열로 관측되면 알려줘(파싱 가드 추가).
> ⚠️ **CC 확인 요청 2:** `cByMember.get(...)||cByMember.set(...).get(...)` 패턴이 어색하면 명시적 2줄로 풀어도 무방(동작 동일). 가독성 우선.

---

## 3. 임계값 상수 — 신규 컴포넌트 상단

원장이 나중에 감으로 조정할 수 있게 **한 곳에 상수로**. 신규 컴포넌트(`TrainerScorecard.jsx`) 파일 상단에 둔다(memberStatus는 순수 계산만, 임계=표시 정책이라 UI측).

```js
// 우수(good)/주의(warn) 임계 — 원장 조정 가능. rate는 0..1, 세션소진은 회/월.
const TH = {
  closing:   { good: 0.50, warn: 0.30 },   // 1·2차 공통
  rereg:     { good: 0.60, warn: 0.40 },
  logWrite:  { good: 0.90, warn: 0.70 },
  churn:     { good: 0.10, warn: 0.25, invert: true },  // 낮을수록 좋음
  burn:      { good: 6.0,  warn: 4.0 },     // 회/월·회원
};
const MIN_N = 1; // 색 판정 최소 표본(분모). 더 보수적으로 하려면 3.
```

색 판정 헬퍼(컴포넌트 내부):
```js
// value=지표값, n=분모(표본), t=TH 항목. n<MIN_N 또는 value==null → 'neutral'.
function grade(value, n, t) {
  if (value == null || (n ?? 0) < MIN_N) return "neutral";
  const good = t.invert ? value <= t.good : value >= t.good;
  const warn = t.invert ? value >= t.warn : value <= t.warn;
  if (good) return "good";
  if (warn) return "warn";
  return "mid";
}
```

색 매핑(정적 리터럴만 — purge 안전):
- `good` → `text-emerald-700` / 셀 배경 `bg-emerald-500/10 border-emerald-500/20`
- `warn` → `text-danger-text` / `bg-rose-500/10 border-rose-500/20`
- `mid` → `text-ink`
- `neutral` → `text-muted`
> ⚠️ **CC 확인 요청 3:** DS에 `--color-danger-text`는 있으나 emerald 계열은 역할토큰 없음(초록 제거 정책). 스코어카드의 "우수=초록"은 **의미색(성과 good)**이라 로고/CTA 아님 → emerald 유틸 직접 사용 허용 판단. 만약 초록 전면금지면 우수를 `text-primary-strong`(레드 강조)로 대체하고 주의를 amber(`text-ot-text`)로 바꾸는 대안 제시 가능. **대수 결정 필요** — 목업은 emerald 안으로 렌더함(§6).

---

## 4. 신규 컴포넌트 — `components/admin/TrainerScorecard.jsx`

새 파일(`git add` 먼저). admin이 이미 로드/파생한 데이터를 **props로 받아** 계산·렌더만. 자체 fetch 없음.

### Props
```
{ members, otRows, contracts, logs, trainers, schemes, runs, ym, onSaveRun }
```
- `members`=user_table, `otRows`=ot_log, `contracts`=session_log, `logs`=daily_workout_log, `trainers`=[{id,name}], `schemes`=pay_scheme, `runs`=payroll_run(이달 Map 말고 원배열도 OK), `ym`=KST월, `onSaveRun`=PayrollConfirm 저장 콜백(admin의 `setRuns` 갱신).

### 내부 계산(useMemo)
1. `memberTrainer` Map(user_id→trainer_id) — admin에 이미 있음. 중복 계산 피하려면 admin에서 prop으로 내려도 됨(선택). 기본은 컴포넌트 내 재구성(순수·저렴).
2. `nowISO = new Date().toISOString()` — **컴포넌트 상단 1회**(effect/useMemo 밖 또는 `useState(()=>...)` 초기화). React purity 상 렌더 중 `new Date()`는 지양 → `const [nowISO] = useState(() => new Date().toISOString());` 권장(마운트 1회 고정).
3. 파생 Map들: `closingStatsByRoundByTrainer`, `reregisterStatsByTrainer`, `sessionsThisMonthByTrainer`, `logWriteRateByTrainer`, `churnRiskByTrainer(...,{nowISO})`, `revenueByTrainer`(기존), `sessionPriceSumByTrainer`·`sessionCountByTrainer`(기존, 급여용).
4. 트레이너별 행 조립 `rows`:
   - `activePt` = members에서 trainer==t & !hidden & status==pt_active count
   - `activeAll` = 위에서 status∈{ot,pt} count (담당 회원 수 표시)
   - `burn` = churn.activePt>0 ? sessionsThisMonth/churn.activePt : (activePt>0? sess/activePt : null) — **분모는 churnRisk의 activePt(활성계약 PT)와 통일**하지 말고 "담당 활성 PT 회원 수"로. ⚠️ 정합: 세션소진 분모 = `activePt`(status==pt_active & !hidden). churn 분모(activePt)는 "활성계약 있는 PT"라 다름 → **혼동 방지 위해 세션소진 분모는 status 기준 PT 수 사용**. 주석 명시.
   - `pay` = payForScheme(resolveScheme(schemes,t.id), {monthRevenue:rev.total, sessionCount:sessCount.get(t.id)||0, sessionPriceSum:sessPriceSum.get(t.id)||0})
   - `run` = runs에서 ym·trainer 매칭
   - `grades` = 각 지표 grade() 결과
5. 정렬: 기본 **매출(rev.total) 내림차순**. 상단 정렬 토글(매출·1차클로징·2차클로징·재등록·이탈·소진). 이탈은 오름차순(낮은 게 좋음)이지만 정렬은 "나쁜 순"으로 보고 싶을 수도 → 토글 시 **문제 큰 순(높은 이탈 먼저)** 기본, 화살표 표기.
6. `rank` = 매출 정렬 기준 순위(1,2,3…). 매출 동률·0이면 순위 부여하되 메달은 매출>0에만.

### 렌더 (반응형)
- **데스크톱(sm+): 표(table).** 열: 순위 · 트레이너 · 담당 · 1차 · 2차 · 재등록 · 소진 · 일지 · 이탈 · 이달매출 · 성과급 · (펼침). 각 비율 셀은 grade 색. 1위 매출은 primary 강조 + 🥇(lucide `Medal`/`Crown` 아님 → `Trophy`/`Award` 아이콘 또는 순위 뱃지). 행 hover 강조.
- **모바일(<sm): 트레이너별 카드**(표는 폰에서 안 됨). `Card`(DS) 셸 + 상단 순위·이름·이달매출, 하단 2열 metric 그리드(각 지표 label/value/색). 담당·성과급 포함.
- **펼침(상세):** 행/카드 클릭 → 기존 `트레이너별 실적` 상세(신규/재등록 매출 split + `PayrollConfirm`)를 그 자리에 표시. **PayrollConfirm 그대로 재사용**(급여 확정 흐름 보존). 펼침 상태는 컴포넌트 local `expandedId`.
- 빈상태: 트레이너 0 → "트레이너 데이터가 없습니다"(기존 문구 유지).
- 상단 미니 요약(선택): 센터 합계 — 총 담당 · 평균 클로징 · 총 이탈위험 N명 · 이달 총매출. (있으면 원장 한눈. 없어도 무방 — v1은 표만, 요약은 v1.1.)

### DS 준수
- 카드=`Card`(인라인 금지) · 펼침 내부 폼/버튼=기존 그대로 · 아이콘 `lucide-react`만 · 색 클래스 **정적 리터럴만**(동적 조립 금지) · 한글 라벨 자간 `tracking-label-ko`.
- grade 색은 §3 정적 매핑을 **객체 리터럴 룩업**(`{good:'...', warn:'...'}[g]`)으로 — 문자열 템플릿 동적 조립 아님(purge 안전).

---

## 5. `app/admin/page.jsx` 통합 (additive · 코드내용 매칭)

### 5-1. import 추가
기존 import 블록의 `import PayrollConfirm ...` 줄 **아래**에 추가:
```js
import TrainerScorecard from "@/components/admin/TrainerScorecard";
```
(memberStatus 신규 함수는 컴포넌트가 직접 import하므로 admin의 import 목록 변경 불필요.)

### 5-2. 기존 "트레이너별 실적" 섹션 교체
아래 주석 앵커로 시작하는 섹션 전체를 찾는다:
```
{/* ===== 트레이너별 실적 (④) ===== */}
{atab === "perf" && (
<section className="mb-8">
  <Eyebrow icon={Award}>트레이너별 실적 · {ym}</Eyebrow>
  ...
</section>
)}
```
이 섹션의 **본문(`<div className="space-y-3">…</div>`)을 스코어카드로 교체**하고, `<Eyebrow>` 헤더는 유지(문구만 "트레이너 리더보드 · {ym}"로). 교체 후:
```jsx
{/* ===== 트레이너 리더보드 / KPI 스코어카드 (#1) ===== */}
{atab === "perf" && (
<section className="mb-8">
  <Eyebrow icon={Award}>트레이너 리더보드 · {ym}</Eyebrow>
  <TrainerScorecard
    members={rows}
    otRows={otRows}
    contracts={contracts}
    logs={logs}
    trainers={trainers}
    schemes={schemes}
    runs={runs}
    ym={ym}
    onSaveRun={(row) => setRuns((p) => [...p.filter((r) => r.id !== row.id), row])}
  />
</section>
)}
```
> `onSaveRun` 콜백은 기존 `트레이너별 실적`의 `PayrollConfirm onSaved`와 **동일 로직**(`setRuns((p) => [...p.filter((r) => r.id !== row.id), row])`) — 그대로 이관.
>
> ⚠️ **기존 파생 상수 정리:** 교체 후 `trainerPerf`·(그리고 오직 그 섹션에서만 쓰던) 파생이 미사용이 되면 lint(`no-unused-vars`) 경고. **컴포넌트가 admin의 파생을 안 쓰고 자체 계산하므로**, admin의 `trainerPerf`/`sessPriceSum`/`sessCount`/`runMap`/`closingByTrainer`/`revByTrainer`/`memberTrainer`는 다른 곳에서 안 쓰이면 제거 가능. **단 additive 원칙상 1차 배치では 남겨두고**(경고만), 별도 정리 배치에서 제거 권장. CC는 build/lint 결과 보고 판단 후 대수에게 보고.

> **대안(더 additive):** 기존 섹션을 **지우지 말고**, 스코어카드를 그 **위에 새 섹션으로 추가**하는 방법도 있음(중복 표시). 원장 리뷰 후 기존 상세 섹션 제거. 목업 승인 나면 대수가 택1 지시.

---

## 6. 목업 (웹Claude가 렌더 검증)
`v2-목업-트레이너리더보드.html` — 데스크톱 표 + 모바일 카드 + 우수/주의 색 + 순위 + 성과급 + 펼침 상세를 데모 데이터로. DS 토큰(레드/Pretendard 근사)·emerald 우수색안 반영. 원장이 레이아웃·색·열 구성 확인용. (별도 전달)

---

## 7. 검증 (구현 후)
1. `npm.cmd run build` green · `npm.cmd run lint` 신규경고 0(기존 `trainerPerf` 미사용 경고는 §5-2 대로 처리).
2. 데모모드(키 없음): admin은 `role="owner"`로 게이트 스킵하나 데이터 0 → 스코어카드 "트레이너 데이터 없음" 정상.
3. 실데이터: 트레이너 2명+ 계정에서 — 리더보드 매출순 정렬 · 클로징/재등록/이탈/일지/소진 값과 색이 §1 임계와 일치 · 표본 0 지표는 "—" neutral(빨강 아님) · 정렬 토글 동작 · 펼침 시 PayrollConfirm 확정 정상(payroll_run write `.select()` 가드).
4. **숫자 교차검증:** 스코어카드 이달매출 합 = 기존 "실데이터 요약 · 이달 매출"과 일치. 클로징률(라운드통합 근사)·재등록률이 상단 KPI 카드와 크게 어긋나지 않는지(라운드분리 vs 회원통합 차이는 정상).
5. 폰: 카드 레이아웃 1열·가로스크롤 없음.

## 8. 커밋 배치 (배치별 1커밋 = revert 단위)
- **배치 1:** `lib/memberStatus.js` 신규 순수함수 5개 append(§2). — `git commit -m "feat(stats): 트레이너 KPI 스코어카드용 per-trainer 파생 5종 추가" -- lib/memberStatus.js`
- **배치 2:** `components/admin/TrainerScorecard.jsx` 신규(§3·§4) + `app/admin/page.jsx` 통합(§5). 새 파일 `git add` 먼저. — `git commit -m "feat(admin): 트레이너 리더보드/KPI 스코어카드 + 성과급 연동" -- components/admin/TrainerScorecard.jsx app/admin/page.jsx`
- **배치 3(선택·후속):** admin 미사용 파생 상수 정리(lint). — 별도 커밋.

각 배치 후 대수가 `git diff` 붙여넣기 → 웹Claude 리뷰 → 커밋.
