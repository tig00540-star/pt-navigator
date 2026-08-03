# v2 구현 스펙 — 트레이너 OT·재등록 품질 리포트 "오늘의 리포트" (원장 코칭용 · 읽기 전용)

> **확정(2026-07-27 재설계):** 원장이 각 트레이너의 OT·재등록 업무를 **실제 내용까지** 보고 부족한 부분을 찾아 **오프라인 대면 코칭**하는 읽기 전용 리포트. 제거된 "QC 모니터링"(하드코딩 데모)의 **실측 대체재**(MASTERPLAN §7 "QC 티칭 지표" 방향).
> **위치:** **`트레이너` 탭(atab==="perf") 하단 섹션** · 제목 **"오늘의 리포트"**. **새 admin 탭 없음(ATABS 8 그대로).**
> **뷰 2개(같은 섹션 토글):** ①**오늘**(기본) — 오늘 진행한 건별 코칭 카드 ②**전체 누적**(토글) — 트레이너별 누적 요약(보관/큰그림).
> **대전제:** 앱 내 코멘트·피드백 write **없음**(피드백은 대면). **새 테이블 0 · write 라우트 0 · RLS 무변 · 마이그레이션 0 · 신규 fetch 0.** admin이 이미 로드한 배열(`rows·otRows·contracts·logs·trainers`)을 props로 받아 **순수 파생만**.
> 흐름: 이 스펙 → CC(diff) → 대수(git diff) → 웹Claude(검토). 커밋 대수 직접.
> ⚠️ **mount-cache 파일:** `lib/memberStatus.js`·`app/admin/page.jsx` 재스테이징이 옛 바이트 반환 → **두 파일 diff는 대수가 `git diff` 붙여넣기로.**

---

## 0. 무엇을 · 부족의 4정의 · 성공 건 규칙

원장이 "부족"을 판단하는 근거 = 네 신호. 셋 재사용, 셋 신규(관찰·data_gaps·오늘건).

| 신호 | 원천(이미 로드) | 오늘 뷰 | 전체 뷰 | "부족" 의미 |
|---|---|---|---|---|
| ① 관찰 충실도 | `otRows` round1 `report` | `todayCases`(신규) | `observationQualityByTrainer`(신규) | 1차 관찰 얇음 → 근거 빈약 |
| ② 브리핑 data_gaps | `otRows` round2 `report.brief` | `todayCases` | `briefGapsByTrainer`(신규) | 입력 얇아 AI가 근거부족 신고 |
| ③ 일지 작성 | `logs` | `todayCases` | `logWriteRateByTrainer`(재사용·이달) | 기록 습관 부실 |
| ④ 클로징/재등록 결과·사유 | `otRows` `closing_*`·`contracts` `reg_*` | `todayCases`(클로징만) | `closingStatsByRoundByTrainer`·`reregisterStatsByTrainer`(재사용) + 사유 인라인 | 실패·보류 패턴 |

**성공 건 규칙(사용자 확정):** 클로징·재등록 **성공 건은 코칭 리스트에서 제외**, 상단 **"오늘 성공 N건"** 카운트로만. **단** 성공했어도 그 회원이 **관찰 얇음/일지 미작성/브리핑 data_gaps**면 그 신호는 잡는다(운으로 닫았거나 다음에 위험). → `todayCases`에 구현·검증완료.

**당일 기준 = A안(사용자 확정):** "오늘 건" = 오늘 타임스탬프가 확실한 이벤트로 앵커 — 오늘 기록한 **OT 관찰**(`ot_log` round1 `created_at`=오늘 KST) · 오늘 진행한 **2차 OT**(round2 `created_at`=오늘) · 오늘 한 **수업**(`daily_workout_log.session_at`=오늘, 노쇼·voided 제외). **마이그레이션 0.**

**⚠️ 데이터 한계 2종(스펙·화면 각주 필수):**
1. **재등록 결과는 '완료 시각' 컬럼이 없어** 오늘 판정 불가 → **오늘 뷰에서 제외**, **전체 뷰에서만**(누적 `reregisterStatsByTrainer` + 사유). 각주: "재등록 코칭은 전체 뷰에서 봅니다."
2. **1차 사전무장은 미캐시** → data_gaps는 **2차 OT만**. 1차 품질은 ①관찰 충실도가 대신 잡음. 각주 유지.

---

## PART 1 — `lib/memberStatus.js` (신규 순수함수 3종 · additive append)

> 기존 export·함수 **불변**. per-trainer 파생 모음 근처(예: `otFunnelByTrainer` 뒤)에 **append**. 전부 순수. ⚠️ mount-cache → `git diff` 리뷰.

### 1-a. 로컬 헬퍼(export 안 함) — 관찰 충실도 + KST 일자

```js
/* round1 관찰 report 충실도 — 7항목 중 '실제 내용 있는' 비율. 기본값만 있는 미기입은 '안 채움'(존재≠기입). */
function obsFilled(report) {
  const r = report || {};
  const moves = Array.isArray(r.movements) ? r.movements : [];
  const nz = (s) => typeof s === "string" && s.trim() !== "";
  const checks = {
    movements:    moves.some((m) => m && nz(m.observation)),
    plan2nd:      moves.some((m) => m && nz(m.plan2nd)),
    reactionMemo: nz(r.reaction?.memo),
    attitude:     Array.isArray(r.reaction?.attitudeTags) && r.reaction.attitudeTags.length > 0,
    goal:         !!r.goal?.identified && nz(r.goal?.detail),
    memberQuote:  nz(r.memberQuote),
    trainerNote:  nz(r.trainer_note),
  };
  const keys = Object.keys(checks);
  return { score: keys.filter((k) => checks[k]).length / keys.length, missing: keys.filter((k) => !checks[k]) };
}

/* ISO(UTC) → KST 'YYYY-MM-DD'. lib/date.js kstToday()와 같은 +9h 규약(경계 통일). */
function kstDay(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
```
> ※ `nz`는 아래 함수들과 공유되게 파일 스코프로 두거나 각 함수 내부에 두면 됨(CC 판단 · 중복 무해).

### 1-b. `todayCases(otRows, logs, memberTrainer, opts)` — 오늘 뷰 (export · 검증완료)

```js
/**
 * '오늘의 리포트' 건별 — 오늘(KST) 활동(관찰·2차OT·수업)이 있었던 회원의 코칭 카드.
 * 코칭 신호 = 관찰 얇음 · 브리핑 data_gaps · 클로징 실패/보류 · 일지 미작성.
 * 성공 클로징은 successCount만(리스트 제외) — 단 그 회원이 관찰 얇음/일지 미작성/gaps면 그 신호는 잡힘.
 * ⚠️ 재등록은 완료 시각 없어 제외(전체 뷰). 1차 사전무장 미캐시 → data_gaps는 2차만.
 * @param {Array} otRows  ot_log 행
 * @param {Array} logs    daily_workout_log 행
 * @param {Map}   memberTrainer  Map(user_id→trainer_id) — 호출부가 visible(!hidden)로 구성
 * @param {{today:string, thinBelow?:number}} opts  today='YYYY-MM-DD'(kstToday() 주입)
 * @returns {{successCount:number, sessionCount:number, obsCount:number,
 *            cases:[{user_id, trainer_id, signals:[{type,detail,missing?}]}]}}
 */
export function todayCases(otRows, logs, memberTrainer, { today, thinBelow = 0.5 } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const lg = Array.isArray(logs) ? logs : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const nz = (s) => typeof s === "string" && s.trim() !== "";
  const byMember = new Map();
  const getM = (uid) => { let c = byMember.get(uid); if (!c) { c = { signals: [] }; byMember.set(uid, c); } return c; };
  let successCount = 0, sessionCount = 0, obsCount = 0;

  // 오늘 round1 관찰(회원별 최신) → 충실도
  const r1 = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 1 || !r.report) continue;
    if (kstDay(r.created_at) !== today) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = r1.get(r.user_id);
    if (!cur || t >= cur.t) r1.set(r.user_id, { row: r, t });
  }
  for (const { row } of r1.values()) {
    obsCount++;
    const { score, missing } = obsFilled(row.report);
    if (score < thinBelow) getM(row.user_id).signals.push({ type: "obs_thin", detail: Math.round(score * 100) + "%", missing });
  }

  // 오늘 round2(회원별 최신) → data_gaps + 클로징 결과
  const r2 = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 2) continue;
    if (kstDay(r.created_at) !== today) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = r2.get(r.user_id);
    if (!cur || t >= cur.t) r2.set(r.user_id, { row: r, t });
  }
  for (const { row } of r2.values()) {
    const brief = row.report?.brief;
    const gaps = brief && Array.isArray(brief.data_gaps) ? brief.data_gaps.filter(nz) : [];
    if (gaps.length) getM(row.user_id).signals.push({ type: "gaps", detail: gaps });
    const res = row.closing_result;
    if (res === "success") successCount++;
    else if (res === "fail" || res === "hold") getM(row.user_id).signals.push({ type: "closing", detail: { result: res, reason: row.closing_reason || null } });
  }

  // 오늘 수업 → 일지 미작성
  for (const l of lg) {
    if (!l || l.voided || l.source === "noshow") continue;
    if (kstDay(l.session_at) !== today) continue;
    sessionCount++;
    const has = nz(l.ai_summary) || (Array.isArray(l.sets_structured) && l.sets_structured.length > 0);
    if (!has) getM(l.user_id).signals.push({ type: "log_missing", detail: null });
  }

  const cases = [...byMember.entries()]
    .filter(([, v]) => v.signals.length > 0)
    .map(([user_id, v]) => ({ user_id, trainer_id: mt.get(user_id) ?? "unknown", signals: v.signals }));
  return { successCount, sessionCount, obsCount, cases };
}
```
> **검증완료(Node):** 성공 카운트만(u3 제외)·성공+얇은관찰은 신호 잡힘(u4)·노쇼·전날 제외·`today` 미주입 시 전부 제외·빈입력 안전.

### 1-c. `observationQualityByTrainer(otRows, memberTrainer, opts)` — 전체 뷰 (export · 검증완료)

```js
/**
 * 트레이너별 1차 관찰 충실도(누적). round1(회원당 1행·다중이면 최신) · report 있는 것만. memberTrainer 귀속.
 * @returns {Map} trainer_id → { members, avgScore, thin, thinList:[{user_id, score, missing:[]}] }
 */
export function observationQualityByTrainer(otRows, memberTrainer, { thinBelow = 0.5 } = {}) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const latest = new Map();
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 1 || !r.report) continue;
    const t = Date.parse(r.created_at || "") || 0, cur = latest.get(r.user_id);
    if (!cur || t >= cur.t) latest.set(r.user_id, { row: r, t });
  }
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { members: 0, sumScore: 0, avgScore: null, thin: 0, thinList: [] }; map.set(tid, c); } return c; };
  for (const { row } of latest.values()) {
    const { score, missing } = obsFilled(row.report);
    const c = get(mt.get(row.user_id) ?? "unknown");
    c.members += 1; c.sumScore += score;
    if (score < thinBelow) { c.thin += 1; c.thinList.push({ user_id: row.user_id, score, missing }); }
  }
  for (const c of map.values()) { c.avgScore = c.members ? c.sumScore / c.members : null; delete c.sumScore; }
  return map;
}
```

### 1-d. `briefGapsByTrainer(otRows, contracts, memberTrainer)` — 전체 뷰 (export · 검증완료)

```js
/**
 * 트레이너별 AI 브리핑 data_gaps 노출(누적). OT 2차: ot_log round2 report.brief(user_id 귀속).
 * 재등록: session_log reg_brief(trainer_id 직접). ⚠️ 1차 미캐시 제외.
 * @returns {Map} trainer_id → { otBriefs, otGaps, regBriefs, regGaps, gapItems:[{scope:"ot"|"reg", user_id, gaps:[]}] }
 */
export function briefGapsByTrainer(otRows, contracts, memberTrainer) {
  const rows = Array.isArray(otRows) ? otRows : [];
  const cons = Array.isArray(contracts) ? contracts : [];
  const mt = memberTrainer instanceof Map ? memberTrainer : new Map();
  const map = new Map();
  const get = (tid) => { let c = map.get(tid); if (!c) { c = { otBriefs: 0, otGaps: 0, regBriefs: 0, regGaps: 0, gapItems: [] }; map.set(tid, c); } return c; };
  const gapsOf = (o) => (o && Array.isArray(o.data_gaps) ? o.data_gaps.filter((g) => typeof g === "string" && g.trim() !== "") : []);
  for (const r of rows) {
    if (!r || r.user_id == null || r.ot_round !== 2) continue;
    const brief = r.report?.brief; if (!brief) continue;
    const c = get(mt.get(r.user_id) ?? "unknown");
    c.otBriefs += 1;
    const g = gapsOf(brief); if (g.length) { c.otGaps += 1; c.gapItems.push({ scope: "ot", user_id: r.user_id, gaps: g }); }
  }
  for (const r of cons) {
    if (!r || !r.reg_brief) continue;
    const c = get(r.trainer_id ?? "unknown");
    c.regBriefs += 1;
    const g = gapsOf(r.reg_brief); if (g.length) { c.regGaps += 1; c.gapItems.push({ scope: "reg", user_id: r.user_id ?? null, gaps: g }); }
  }
  return map;
}
```
> 1-c·1-d **검증완료:** dedup·공백 gap 필터·brief 없는 행 제외·빈입력 size 0.

---

## PART 2 — `components/admin/TrainerQualityReport.jsx` (신규 파일 · `git add` 먼저)

읽기 전용. supabase/write 없음. props: `members(rows)·otRows·contracts·logs·trainers·ym`.
내부 `import { kstToday } from "@/lib/date"` 로 오늘 KST.

### 2-a. 파생(useMemo) — hidden 필터 = 컴포넌트 책임(CLAUDE.md)
```js
const visible = useMemo(() => (members||[]).filter((m) => m && !m.hidden), [members]);
const memberTrainer = useMemo(() => new Map(visible.filter(r=>r?.id).map(r => [r.id, r.trainer_id ?? "unknown"])), [visible]);
const nameById = useMemo(() => new Map((members||[]).filter(r=>r?.id).map(r => [r.id, r.name])), [members]);
const trainerName = (id) => (trainers.find(t=>t.id===id)?.name) ?? "미배정";
const today = kstToday();
// 오늘 뷰
const tc = useMemo(() => todayCases(otRows, logs, memberTrainer, { today }), [otRows, logs, memberTrainer, today]);
// 전체 뷰(토글 열릴 때만 렌더되지만 useMemo는 항상 돌아도 무해 — 시인성 규율)
const obsQ    = useMemo(() => observationQualityByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
const gapsMap = useMemo(() => briefGapsByTrainer(otRows, contracts, memberTrainer), [otRows, contracts, memberTrainer]);
const logRate = useMemo(() => logWriteRateByTrainer(logs, memberTrainer, ym), [logs, memberTrainer, ym]);
const closeRnd= useMemo(() => closingStatsByRoundByTrainer(otRows, memberTrainer), [otRows, memberTrainer]);
const reRegMap= useMemo(() => reregisterStatsByTrainer(contracts), [contracts]);
const [mode, setMode] = useState("today"); // "today" | "all"
```
import from `@/lib/memberStatus`: `todayCases, observationQualityByTrainer, briefGapsByTrainer, logWriteRateByTrainer, closingStatsByRoundByTrainer, reregisterStatsByTrainer`. from `@/lib/labels`: `labelOf, CLOSING_REASON_OPTS, REG_REASON_OPTS`.

### 2-b. 상단 상수(원장 조정 가능)
```js
const TH = { obsAvgWarn: 0.5, gapWarn: 0.34, logRateWarn: 0.8, minObs: 3, minBrief: 1, minLog: 3, minClose: 3 };
const OBS_MISSING_LABEL = { movements:"관찰 동작", plan2nd:"2차 계획", reactionMemo:"반응 메모", attitude:"태도 태그", goal:"목표 구체화", memberQuote:"회원 한마디", trainerNote:"종합 소견" };
const SIGNAL_LABEL = { obs_thin:"관찰 얇음", gaps:"브리핑 근거부족", closing:"클로징", log_missing:"일지 미작성" };
```

### 2-c. 헤더 + 토글
- 섹션 헤더 `Eyebrow`/`SectionHeader`: **"오늘의 리포트"** + 부제 "오늘 진행한 OT·수업의 부족한 부분 — 대면 코칭용".
- 토글 2버튼 `[오늘] [전체 누적]`(`mode`). 오늘=기본.

### 2-d. 오늘 뷰(`mode==="today"`) — `tc` 렌더
- **상단 요약 줄:** `오늘 성공 {tc.successCount}건 · 수업 {tc.sessionCount}건 · 코칭 {tc.cases.length}건`. 성공은 `text-cyan-700`, 코칭 건수는 있으면 `text-danger-text`.
- **코칭 카드**(`tc.cases`, 트레이너별 그룹핑): 각 카드 = 회원(`nameById.get(user_id)`) + `trainerName(trainer_id)` 배지 + 신호 칩들:
  - `obs_thin` → "관찰 얇음 {detail}" + 빠진 항목 칩(`missing.map(k=>OBS_MISSING_LABEL[k])`)
  - `gaps` → "브리핑 근거부족" + `detail`(문구 리스트)
  - `closing` → `detail.result==="hold"?"보류":"실패"` + `labelOf(CLOSING_REASON_OPTS, detail.reason)`
  - `log_missing` → "일지 미작성"
- **빈상태:** `tc.cases.length===0`이면 "오늘 챙길 부분 없어요 — 오늘 진행 {obsCount+sessionCount}건 모두 양호"(neutral). 오늘 활동 자체 0이면 "오늘 진행한 OT·수업이 아직 없어요".

### 2-e. 전체 뷰(`mode==="all"`) — 트레이너별 누적 요약(각 `trainers` 순회)
각 트레이너 행: 4신호 지표 + **코칭 포인트(가장 약한 고리) 한 줄**(룰기반) + 펼침 드릴다운.
- ① 관찰: `obsQ.get(id)` · `members<TH.minObs`→"—" · `avgScore` % · `<obsAvgWarn`→주의 · sub `얇음 {thin}/{members}`.
- ② 브리핑: `gapsMap.get(id)` · `tot=otBriefs+regBriefs` · `<minBrief`→"—" · 비율 `(otGaps+regGaps)/tot` · `>gapWarn`→주의.
- ③ 일지(이달): `logRate.get(id)` · `total<minLog`→"—" · `rate` · `<logRateWarn`→주의 / 높으면 우수. (라벨 "이달")
- ④ 클로징/재등록: `closeRnd.get(id)`(r2) · `reRegMap.get(id)` · 각 `attempted<minClose`→"—" · 낮으면 주의. sub `OT {r2.success}/{r2.attempted} · 재등록 {success}/{attempted}`.
- **코칭 포인트:** 위 중 '주의(표본 충분&임계 미달)'만 모아 임계 대비 낙차 최대 1개 → 결정적 문장(예: "관찰 기록이 얇어요 — 평균 32%"). 없으면 "특별히 챙길 부분 없어요"(neutral).
- **드릴다운(펼침 · 트레이너별 `detailOpen`):**
  - 관찰 얇은 회원: `obsQ.get(id).thinList` → `nameById` + `score%` + 빠진 항목 칩.
  - data_gaps 케이스: `gapsMap.get(id).gapItems` → scope 배지(OT/재등록) + `nameById` + gaps.
  - 클로징/재등록 실패·보류(표시용 인라인 필터):
    - OT: `otRows.filter(r=>r.ot_round===2 && (r.closing_result==="fail"||"hold") && memberTrainer.get(r.user_id)===id)` → 이름 + `labelOf(CLOSING_REASON_OPTS, r.closing_reason)` + (있으면)`r.closing_detail.reaction/outcome` 짧게.
    - 재등록: `contracts.filter(r=>r.trainer_id===id && (r.reg_result==="fail"||"hold"))` → 이름 + `labelOf(REG_REASON_OPTS, r.reg_reason)`.

### 2-f. 색·시인성 규율(CLAUDE.md admin 준수)
- 우수=`text-cyan-700` · 주의=`text-danger-text`(rose) · 표본부족/중립=`text-muted`. **DS 초록 금지.**
- 결론(요약/코칭포인트)→숫자→대상→근거(카드·드릴다운). `useMemo`는 항상 돌고 렌더만 지연.
- 반응형: 데스크 표/모바일 카드 — `TrainerScorecard` 패턴 따름.
- **각주(하단):** "재등록 코칭은 '전체 누적'에서 봅니다(결과 시각 데이터 한계)." · "1차 사전무장 브리핑은 저장되지 않아, 1차 품질은 관찰 충실도로 봅니다."

---

## PART 3 — `app/admin/page.jsx` 배선 (⚠️ mount-cache → git diff 리뷰)

**additive만. ATABS·기존 로드·다른 탭 불변. 새 fetch/state/useMemo 없음.**

### 3-a. import 추가
```js
import TrainerQualityReport from "@/components/admin/TrainerQualityReport";
```
### 3-b. `트레이너` 탭 하단에 섹션 추가 — 기존 `{atab === "perf"}` 블록들 **맨 끝**(클로징·재등록 상세 분석 `</section>` 뒤)에:
```jsx
{atab === "perf" && (
<section className="mb-8">
  <TrainerQualityReport members={rows} otRows={otRows} contracts={contracts} logs={logs} trainers={trainers} ym={ym} />
</section>
)}
```
> 기존 로드 배열 그대로 주입. ATABS 배열·다른 렌더 블록 손대지 않음.

---

## 검증 체크리스트
1. **lint green** · 새 파일 `git add` 먼저 · 미사용 import 0.
2. **위치** — `트레이너` 탭 하단에 "오늘의 리포트" 섹션. 새 탭 없음(ATABS 8). 다른 탭 무변.
3. **오늘 뷰** — 오늘 진행 회원의 코칭 카드(실패·보류·얇은관찰·미작성·gaps). **성공 건은 카드 X, 상단 카운트 O.** 성공+얇은관찰 회원은 관찰 신호로 카드에 뜸.
4. **날짜 컷** — 어제/노쇼/voided 건 오늘 뷰에서 빠짐. `kstToday` 경계.
5. **전체 뷰 토글** — 트레이너별 누적 요약 + 코칭 포인트 + 드릴다운. 재등록은 여기만.
6. **표본 부족 "—"**(neutral) · **hidden 제외 일관**(스코어카드와 정합).
7. **각주** — 재등록/1차 데이터 한계 명시.
8. **읽기 전용** — write·supabase 호출 없음.
9. **色 규율** — cyan/rose · 초록 미사용.
10. (mount-cache) `lib/memberStatus.js`·`app/admin/page.jsx` diff는 대수가 붙여넣어 재검토.

## 클로드코드 레일
- **배치1(커밋1):** `lib/memberStatus.js` — `obsFilled`·`kstDay`(로컬)+`todayCases`+`observationQualityByTrainer`+`briefGapsByTrainer` **append만**. 기존 함수 손대지 말 것. grep: `Select-String 'todayCases|observationQualityByTrainer|briefGapsByTrainer'`. lint · 커밋 `feat(admin): 품질 리포트 파생(오늘 건별·트레이너별 관찰/gaps)`.
- **배치2(커밋2):** `git add components/admin/TrainerQualityReport.jsx`(새 파일 먼저) → 작성 → `app/admin/page.jsx`(import+트레이너 탭 하단 섹션) → 파일지정 add · lint · 커밋 `feat(admin): 트레이너 탭 '오늘의 리포트'(원장 코칭용·읽기전용·오늘/전체 토글)` · `git show --stat HEAD`.
- SQL·마이그레이션·RLS **없음**. Windows PowerShell(`npm.cmd run lint`). `git add -A` 금지(스코프 add만 · `/lp` WIP·untracked 보존).
