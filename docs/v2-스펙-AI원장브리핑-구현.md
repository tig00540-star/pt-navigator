# 스펙 — 원장 분석 대시보드 #6 AI 원장 브리핑 "오늘 챙길 것 3가지" (2026-07-25)

> **범위:** admin(원장) 대시보드 **#6 브리핑** — #1~#5 파생을 **임팩트(₩)순 top 3**로 조립한 "오늘 챙길 것". **새 '브리핑' 탭 · 기본 랜딩.** **룰 기반(무료·결정적) 먼저 · AI 서술은 defer(§8).**
> **협업 방식 그대로:** 웹Claude=스펙+diff리뷰+순수함수 실행검증 / CC=로컬 구현 / 대수=커밋. additive 우선 · 로직·RLS·payload 불변 · 코드 내용으로 매칭 · 새 파일 `git add` 먼저 · 배치별 1커밋 · Windows PowerShell(`npm.cmd`).
> **웹Claude 실행검증 선행 완료:** `ownerBriefing`을 실제 `memberStatus.js`(#3·#5 파생 포함)에 붙여 토이 데이터로 로컬 실행 — 6신호 임팩트순 정렬·표본 가드·빈데이터 [] 전부 통과(§2 로그).

---

## 0. 판정 요약

- **전부 additive · 새 데이터/스키마/fetch 0.** admin이 이미 로드한 배열(members·otRows·contracts·logs·appts·goals·trainers)만 조합. `ownerBriefing`은 기존 파생(`expiringMembers`·`avgReregisterAmount`·`closingDueSoon`·`churnRiskMembers`·`pastDueAppointments`·`revenueInMonth`·`apptOutcomeByTrainer`·`noshowByTrainer`·`avgNewAmount`)을 오케스트레이션만.
- **배치:** 새 '브리핑' 탭 + **기본 랜딩**(`atab` 기본값 perf→briefing). 원장이 들어오면 "오늘 챙길 것"이 첫 화면.
- **룰 기반만(확정).** 결정적·무료·즉시. AI 문단화는 나중 폴리시(§8 · 룰 결과가 그대로 재료).
- **"실적 급락 트레이너" → "주의 트레이너"로 대체:** 전월 스냅샷이 없어 추세(급락) 불가 → 현재 임계(완료율<50%·노쇼율>15%, 표본≥5) 넘은 최악 1명. 추세는 히스토리 쌓이면 별도.

**신호(각각 count>0/해당 시만 후보 · 임팩트 ₩ 내림차순):**

| 신호 | 원천 | 임팩트(₩) |
|------|------|-----------|
| 재등록 기회(만료임박) | `expiringMembers` × `avgReregisterAmount` | 명수 × 재등록 평균계약 |
| 이번주 등록 임박(클로징) | `closingDueSoon` × `avgNewAmount` | 명수 × 신규 평균계약 |
| 이탈 위험 | `churnRiskMembers` | 방치 잔여세션 × 평균 회당단가 |
| 매출 목표 뒤처짐 | `revenueInMonth` vs Σ`goals`(진도 대비) | 진도 대비 부족액 |
| 미처리 예약 | `pastDueAppointments` | 건수 × 회당단가 × 0.4(위생·하향) |
| 주의 트레이너 | `apptOutcomeByTrainer`·`noshowByTrainer` | 취소+미처리(또는 노쇼) × 회당단가 |

---

## 1. `lib/memberStatus.js` — 신규 파생 `ownerBriefing` (파일 끝 append · 검증본)

> 순수(기준시각 주입 · 모듈 내 무인자 `new Date()`/`Date.now()`/`Math.random()` 금지). 인자 많아 **객체 인자**(기존 위치인자 스타일과 다름 — 조립 함수라 가독 우선). 회원은 **visible 주입**(hidden 제외=호출부). `memberTrainer`는 노쇼 귀속용(#5 규율 = 전체 회원으로 구성).

```js
/* =========================================================================
   #6 원장 브리핑 — "오늘 챙길 것" 조립(룰 기반·결정적). 기존 파생 오케스트레이션만.
   각 후보 {kind,tab,title,detail,count,amount,impact}(+trainer는 trainer_id). impact(₩) 내림차순.
   ========================================================================= */
export function ownerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], memberTrainer, ym, nowISO } = {}) {
  const now = typeof nowISO === "string" ? nowISO : "";
  const kstMs = (Date.parse(now) || 0) + 9 * 3600 * 1000;
  const kd = new Date(kstMs);
  const tISO = new Date(kstMs).toISOString().slice(0, 10);
  const hISO = new Date(kstMs + 7 * 86400000).toISOString().slice(0, 10);

  const priced = (contracts || []).filter((c) => c && c.counts_as_revenue && typeof c.price_per_session === "number" && c.price_per_session > 0);
  const avgSessionPrice = priced.length ? Math.round(priced.reduce((s, c) => s + c.price_per_session, 0) / priced.length) : 0;
  const avgRe = avgReregisterAmount(contracts);
  const avgNew = avgNewAmount(contracts);
  const pkgProxy = avgSessionPrice ? avgSessionPrice * 10 : 500000; // avgRe/avgNew 표본0일 때 랭킹용 프록시

  const mt = memberTrainer instanceof Map ? memberTrainer : new Map((members || []).map((m) => [m.id, m.trainer_id]));
  const cands = [];

  // 1) 재등록 기회(만료임박)
  const expiring = expiringMembers(members, contracts, logs, { nowISO: now });
  if (expiring.length > 0) {
    const amount = avgRe != null ? expiring.length * avgRe : null;
    cands.push({ kind: "reregister", tab: "retention", count: expiring.length, amount,
      impact: amount ?? expiring.length * pkgProxy,
      title: `재등록 챙길 회원 ${expiring.length}명`,
      detail: amount != null ? "곧 만료 · 예상 재등록 매출" : "곧 만료 · 재등록 이력 쌓이면 예상매출 표시" });
  }

  // 2) 이번주 등록 임박(클로징) — user_id dedup
  const otIds = new Set((members || []).filter((m) => viewFor(m) === "ot").map((m) => m.id));
  const validIds = new Set((members || []).map((m) => m.id));
  const due = closingDueSoon(otRows, { todayISO: tISO, horizonISO: hISO, otMemberIds: otIds, validMemberIds: validIds });
  const dueCount = new Set(due.map((d) => d.user_id)).size;
  if (dueCount > 0) {
    const amount = avgNew != null ? dueCount * avgNew : null;
    cands.push({ kind: "closing", tab: "funnel", count: dueCount, amount,
      impact: amount ?? dueCount * pkgProxy,
      title: `이번 주 등록 임박 ${dueCount}명`,
      detail: amount != null ? "2차 미결정·재상담 · 예상 신규매출" : "2차 미결정·재상담 챙기기" });
  }

  // 3) 이탈 위험
  const churn = churnRiskMembers(members, contracts, logs, { nowISO: now });
  if (churn.length > 0) {
    const idle = churn.reduce((s, c) => s + (c.rem?.total ?? 0), 0);
    const amount = avgSessionPrice ? idle * avgSessionPrice : null;
    cands.push({ kind: "churn", tab: "retention", count: churn.length, amount,
      impact: amount ?? churn.length * pkgProxy * 0.5,
      title: `이탈 위험 회원 ${churn.length}명`,
      detail: `14일+ 무수업 · 방치 ${idle}회` });
  }

  // 4) 미처리 예약(#5) — 위생(매출 손실 아님 · 랭킹 하향 ×0.4)
  const pastDue = pastDueAppointments(appts, now);
  if (pastDue.length > 0) {
    cands.push({ kind: "pastdue", tab: "schedule", count: pastDue.length, amount: null,
      impact: (avgSessionPrice ? pastDue.length * avgSessionPrice : pastDue.length * 10000) * 0.4,
      title: `미처리 예약 ${pastDue.length}건`,
      detail: "완료·취소로 정리(통계 정확도)" });
  }

  // 5) 매출 목표 뒤처짐(#3) — 진도(경과일 비율) 대비 미달
  const target = (goals || []).filter((g) => g && g.ym === ym && g.target_revenue != null).reduce((s, g) => s + (g.target_revenue || 0), 0);
  if (target > 0 && ym) {
    const net = revenueInMonth(contracts, ym);
    const dim = new Date(Date.UTC(kd.getUTCFullYear(), kd.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = Math.min(1, kd.getUTCDate() / dim);
    const shortfall = Math.round(target * elapsed - net);
    if (shortfall > 0) {
      cands.push({ kind: "goal", tab: "revenue", count: null, amount: shortfall, impact: shortfall,
        title: "매출 목표 뒤처짐",
        detail: `이달 ${Math.round((net / target) * 100)}% 달성 · 진도 대비 부족` });
    }
  }

  // 6) 주의 트레이너 — 완료율<50%(예약≥5) or 노쇼율>15%(수업≥5) 중 최악 1명
  const outcome = apptOutcomeByTrainer(appts, now);
  const noshow = noshowByTrainer(logs, mt, {});
  let worst = null;
  for (const o of outcome) {
    if (o.total >= 5 && o.doneRate != null && o.doneRate < 0.5) {
      const sev = (o.canceled + o.pastDue) * (avgSessionPrice || 10000);
      if (!worst || sev > worst.impact) worst = { trainer_id: o.trainer_id, impact: sev, reason: `완료율 ${Math.round(o.doneRate * 100)}%` };
    }
  }
  for (const n of noshow) {
    if (n.total >= 5 && n.noshowRate != null && n.noshowRate > 0.15) {
      const sev = n.noshow * (avgSessionPrice || 10000);
      if (!worst || sev > worst.impact) worst = { trainer_id: n.trainer_id, impact: sev, reason: `노쇼율 ${Math.round(n.noshowRate * 100)}%` };
    }
  }
  if (worst) {
    cands.push({ kind: "trainer", tab: "perf", trainer_id: worst.trainer_id, count: null, amount: null,
      impact: worst.impact, title: "관리 필요 트레이너", detail: worst.reason });
  }

  return cands.sort((a, b) => b.impact - a.impact);
}
```

**검증 로그(웹Claude 로컬 실행):** 토이 데이터에서 후보 5종 생성 · 임팩트순 `goal(223만) > closing(190만) > churn(117만) > reregister(80만) > pastdue(4.6만)` · 재등록 amount = 1×avgRe(80만) · 목표 shortfall = 경과일(25/31)×목표 − net · 표본<5 트레이너 신호 억제 · 빈 입력 → `[]` · 목표 미설정 → goal 후보 없음. 전부 ✅.

---

## 2. `app/admin/page.jsx` 배선

### (a) import + ATABS + 기본 랜딩
- import: `import OwnerBriefing from "@/components/admin/OwnerBriefing";`
- **ATABS 맨 앞에 '브리핑' 추가:**
```js
const ATABS = [
  { id: "briefing",  label: "브리핑" },   // ← 추가(#6) · 기본 랜딩
  { id: "perf",      label: "트레이너" },
  { id: "revenue",   label: "매출" },
  { id: "funnel",    label: "전환" },
  { id: "retention", label: "리텐션" },
  { id: "schedule",  label: "스케줄" },
  { id: "qc",        label: "QC" },
  { id: "payroll",   label: "급여" },
  { id: "ops",       label: "운영" },
];
```
- **기본 탭 변경:** `const [atab, setAtab] = useState("perf");` → **`useState("briefing")`**. 주석도 `기본=브리핑`으로.
- ⚠️ 데이터는 `atab`과 무관하게 항상 로드됨(useEffect 마운트 1회 · 탭은 게이팅만) — 브리핑이 첫 화면이어도 members·appts·goals 등 이미 fetch됨. 문제 없음.

### (b) 섹션 렌더 (맨 위 · 실적 섹션 앞)
```jsx
{/* ===== 브리핑 — 오늘 챙길 것(#6) ===== */}
{atab === "briefing" && (
<section className="mb-8">
  <OwnerBriefing
    members={rows} otRows={otRows} contracts={contracts} logs={logs}
    appts={appts} goals={goals} trainers={trainers} ym={ym}
    onGoTab={(id) => setAtab(id)} />
</section>
)}
```
> `onGoTab`으로 카드의 "가서 보기"가 해당 탭으로 전환(atab state). members엔 `rows`(hidden 포함) 넘기고 컴포넌트가 visible/전체맵 분리.

---

## 3. `components/admin/OwnerBriefing.jsx` (신규)

> top 3 카드 렌더. **파생 호출·렌더만.** hidden 분리: 회원신호=visible / 노쇼 트레이너맵=전체. 색: 돈/기회=cyan · 위험/주의=rose · 위생=muted. emerald 금지.

### 3-1. 골격 + 카드 메타
```jsx
"use client";
/* =========================================================================
   #6 원장 브리핑 — admin '브리핑' 탭(기본 랜딩). "오늘 챙길 것 3가지".
   ownerBriefing(기존 파생 조립)의 top 3을 카드로. 룰 기반·결정적(AI 서술은 후속).
   회원신호=visible · 노쇼 트레이너 귀속=전체 회원맵. 색: 기회 cyan · 위험 rose · 위생 muted.
   ========================================================================= */
import { useMemo, useState } from "react";
import { RefreshCw, Filter, TrendingDown, CalendarClock, UserX, Target, CheckCircle2, ChevronRight } from "lucide-react";
import { ownerBriefing } from "@/lib/memberStatus";
import { won, personName } from "@/lib/format";
import Card from "@/components/ui/Card";

// kind별 카드 메타(아이콘·강조색·이동 라벨). 전부 정적 리터럴.
const META = {
  reregister: { icon: RefreshCw,     accent: "cyan", go: "리텐션 보기" },
  closing:    { icon: Filter,        accent: "cyan", go: "전환 보기" },
  churn:      { icon: TrendingDown,  accent: "rose", go: "리텐션 보기" },
  goal:       { icon: Target,        accent: "rose", go: "매출 보기" },
  pastdue:    { icon: CalendarClock, accent: "muted", go: "스케줄 보기" },
  trainer:    { icon: UserX,         accent: "rose", go: "트레이너 보기" },
};
const accentText = (a) => (a === "cyan" ? "text-cyan-700" : a === "rose" ? "text-danger-text" : "text-muted");

export default function OwnerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], trainers = [], ym, onGoTab }) {
  const [nowISO] = useState(() => new Date().toISOString());
  const visible = useMemo(() => members.filter((m) => m && !m.hidden), [members]);
  const memberTrainer = useMemo(() => new Map(members.map((m) => [m.id, m.trainer_id])), [members]); // 전체(노쇼 귀속)
  const cands = useMemo(
    () => ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO }),
    [visible, otRows, contracts, logs, appts, goals, memberTrainer, ym, nowISO]
  );
  const top = cands.slice(0, 3);
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || "트레이너";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">오늘 챙길 것</h2>
        <p className="mt-0.5 text-[12px] text-sub">지표에서 <b className="text-ink">돈과 급한 순서</b>로 3가지만 뽑았어요.</p>
      </div>

      {top.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2 py-4 text-sub">
            <CheckCircle2 className="h-5 w-5 text-cyan-700" />
            <span className="text-sm">지금 급히 챙길 건 없어요. 지표가 안정적이에요.</span>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {top.map((c, i) => {
            const m = META[c.kind] || META.pastdue;
            const Icon = m.icon;
            const title = c.kind === "trainer" ? `${nameOf(c.trainer_id)} — 관리 필요` : c.title;
            return (
              <Card key={c.kind} interactive onClick={() => onGoTab?.(c.tab)}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevate text-sm font-extrabold text-muted">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${accentText(m.accent)}`} />
                      <span className="text-sm font-bold text-ink">{title}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-sub">{c.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.amount != null && <div className={`font-mono text-sm font-extrabold ${accentText(m.accent)}`}>≈ {won(c.amount)}</div>}
                    <div className="mt-0.5 inline-flex items-center text-[11px] text-muted">{m.go} <ChevronRight className="h-3 w-3" /></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-muted">돈·긴급도 규칙으로 자동 정렬한 요약이에요. 금액은 과거 평균 기반 추정입니다.</p>
    </div>
  );
}
```
> `Card`에 `interactive`·`onClick` 지원 확인(있음 — TrainerScorecard 등에서 사용). 없으면 `<button>` 래퍼로. amount 없는 카드(미처리·트레이너)는 금액 줄 생략. 금액은 "추정" 명시(캡션).

---

## 4. 색·워딩
- **emerald 금지.** 기회(재등록·클로징)=cyan · 위험(이탈·목표·트레이너)=rose · 위생(미처리)=muted. 전부 정적 리터럴.
- **쉬운말:** "재등록 챙길 회원·이번 주 등록 임박·이탈 위험·매출 목표 뒤처짐·미처리 예약·관리 필요 트레이너". 은어 없음.
- **추정 명시:** 금액은 과거 평균 기반 추정(캡션). 허위 정밀도 금지.
- 표본 부족·해당 없음 = 후보 미생성(카드 안 뜸). 전부 안정적이면 "급히 챙길 건 없어요" 긍정 빈상태.

---

## 5. 검증 (구현 후)
- **웹Claude 실행검증:** 배치1(`ownerBriefing`) 토이 데이터 로컬 실행 — **완료(§1 로그).** CC diff 오면 코드 대조.
- `npm.cmd run build`/`lint` green(신규 경고 0 · 미사용 import 0).
- **폰:** admin 진입 시 **브리핑 탭이 기본**으로 열림 · top 3 카드(번호·아이콘·제목·설명·금액·"…보기") · 카드 탭 시 해당 탭(리텐션/전환/매출/스케줄/트레이너)으로 전환 · 데이터 적은 베타 초기엔 카드 적거나 "급히 챙길 건 없어요" · 색 cyan/rose/muted만.
- **정합성:** 재등록 카드 명수 = 리텐션탭 만료임박 · 이탈 카드 명수 = 리텐션탭 이탈위험 · 클로징 카드 명수 = 전환탭 이번주 임박 · 미처리 카드 건수 = 스케줄탭 미처리 · 목표 카드 = 매출탭 게이지 달성률.

---

## 6. 커밋 배치 (배치별 1커밋 = revert 단위)
1. `feat(stats): 원장 브리핑 조립 파생 추가(ownerBriefing)` — `lib/memberStatus.js`
   - `git commit -m "feat(stats): 원장 브리핑 조립 파생 추가(ownerBriefing · 임팩트순 top3)" -- lib/memberStatus.js`
2. `feat(admin): 브리핑 탭(#6) + 기본 랜딩` — `components/admin/OwnerBriefing.jsx`(신규 · **`git add` 먼저**) + `app/admin/page.jsx`(ATABS '브리핑' · 기본탭 briefing · 섹션)
   - `git add components/admin/OwnerBriefing.jsx`
   - `git commit -m "feat(admin): 원장 브리핑 탭(#6 오늘 챙길 것 top3) + 기본 랜딩" -- components/admin/OwnerBriefing.jsx app/admin/page.jsx`

---

## 7. 성격
- **전부 additive:** DB 쿼리 0 · 마이그레이션 0 · RLS/payload 무변. `ownerBriefing`은 기존 파생 조립.
- **결정적·무료:** AI 호출 없음. 룰 기반이라 같은 데이터=같은 결과.
- 기본 랜딩 변경(perf→briefing)은 탭 게이팅만 · 데이터 로드·다른 탭 무변.

## 8. AI 서술 계층 (후속 · 이번 스코프 밖)
룰 기반 top 3(`ownerBriefing` 결과)를 재료로 서버 AI(`ot-brief` 패턴 · Sonnet)가 자연 문단화. **룰 결과가 그대로 프롬프트 입력** → 지금 배치를 안 버림. 비용·대기·키 폴백 고려해 토글/캐시로. 원장 요청 시 별도 스펙.

## 9. 다음 (참고)
- **빈상태 처리(즉효)** — 베타 첫날 온보딩 빈상태(#1~#6 각 탭). 브리핑은 이미 "급히 챙길 건 없어요" 빈상태 포함.
- AI 서술 계층(§8).
- 진짜 가동률(정원 스키마)·미수금(수납 스키마)·실적 급락(월 스냅샷) — 스키마 확장 필요분.
