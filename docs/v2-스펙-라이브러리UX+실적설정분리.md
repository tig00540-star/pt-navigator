# v2 스펙 — 라이브러리 접기·검색 + 실적/설정 탭 분리 (Phase 1)

> 흐름: 웹Claude(스펙) → 트레이너 → 클로드코드(diff) → 트레이너(git diff) → 웹Claude(검토) → 폰.
> lint=`npm.cmd run lint` · 폰=Vercel 하드리프레시. SQL 없음(순수 프론트).

## 서브커밋
- **A. 라이브러리 접기+검색** — `TrainerLibrary.jsx`만. 추가 fetch 0(클라이언트 필터·접기).
- **B. 실적/설정 탭 분리** — 새 `SettingsView` 탭(id 7) + 설정 컴포넌트 5종 MyStats→설정 이동 + `TrainerGoalSetter` 자기완결 리팩터 + `page.jsx` 탭 추가.

A 먼저(작음·독립) → B. B가 TrainerLibrary를 설정탭으로 옮기지만, A의 검색 수정은 위치 무관(같은 파일).

---

## 2. 서브커밋 A — 라이브러리 접기 + 검색 (`TrainerLibrary.jsx`)

### A1. import 추가(lucide)
`import { BookMarked, Plus, Trash2, Pencil, X, ExternalLink } from "lucide-react";`
→ `Search, ChevronDown, ChevronRight` 추가.

### A2. state 추가(note state 아래)
```jsx
const [q, setQ] = useState("");
const [collapsed, setCollapsed] = useState({});   // category -> true면 접힘(기본 펼침)
```

### A3. 그룹핑 블록 교체 — 필터 먼저, 접힘 헬퍼
기존:
```jsx
const groups = {};
for (const r of rows) { const k = r.category || "기타"; (groups[k] ||= []).push(r); }
const cats = Object.keys(groups);
const existingCats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
```
→ 교체:
```jsx
const ql = q.trim().toLowerCase();
const filtered = ql
  ? rows.filter((r) =>
      (r.title || "").toLowerCase().includes(ql) ||
      (r.note || "").toLowerCase().includes(ql) ||
      (r.category || "").toLowerCase().includes(ql))
  : rows;
const groups = {};
for (const r of filtered) { const k = r.category || "기타"; (groups[k] ||= []).push(r); }
const cats = Object.keys(groups);
const existingCats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
const isOpen = (cat) => ql !== "" || !collapsed[cat];        // 검색 중이면 강제 펼침
const toggleCat = (cat) => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }));
```

### A4. 리스트 카드 교체 — 검색창 + 접기 헤더
기존 리스트 카드의 `rows.length === 0` 아닌 분기(카테고리 그룹 렌더)를 아래로:
```jsx
) : (
  <>
    {/* 검색 */}
    <div className="relative mt-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·메모·카테고리 검색"
        className="w-full rounded-lg border border-line bg-elevate py-2 pl-9 pr-3 text-sm text-ink placeholder-muted outline-none focus:border-primary" />
    </div>
    {cats.length === 0 ? (
      <p className="mt-3 text-sm text-muted">검색 결과가 없어요.</p>
    ) : (
      <div className="mt-3 space-y-3">
        {cats.map((cat) => (
          <div key={cat}>
            <button type="button" onClick={() => toggleCat(cat)} className="flex w-full items-center gap-1.5 py-1 text-left">
              {isOpen(cat) ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{cat}</span>
              <span className="rounded-full bg-elevate px-1.5 py-0.5 text-[10px] font-semibold text-sub">{groups[cat].length}</span>
            </button>
            {isOpen(cat) && (
              <ul className="mt-1.5 space-y-2">
                {groups[cat].map((r) => (
                  /* ── 기존 <li> 항목 그대로 ── */
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    )}
  </>
)}
```
> `<li>` 내용(링크·source 배지·메모·수정/삭제)은 **기존 그대로**. 바뀐 건: 그룹 위 검색창 · 카테고리 헤더가 토글 버튼(chevron+개수) · `isOpen(cat)`일 때만 `<ul>` 렌더 · 검색 0건 문구.

### A 엣지·검증
- 검색 중(`ql!==""`)엔 모든 매칭 그룹 강제 펼침(접힘 무시) → 결과 바로 보임.
- 접힘 상태는 in-memory(새로고침 시 초기화=전부 펼침). 개인 자료함 규모상 충분(localStorage 불필요).
- 빈 라이브러리(rows 0)는 기존 EmptyState 유지 · 검색 0건은 "검색 결과가 없어요".
- lint: `Search`·`ChevronDown`·`ChevronRight` 사용됨 확인.

---

## 3. 서브커밋 B — 실적/설정 탭 분리

**목적:** 지금 MyStats(내 실적)에 **읽기(실적 조회) + 쓰기(설정)** 가 섞임. 설정을 새 탭으로 분리 → 실적은 순수 조회, 설정은 한곳.

### B1. 새 파일 `components/views/SettingsView.jsx`
```jsx
"use client";
/* 설정 탭 — 트레이너 본인 설정 모음(실적 조회와 분리). 각 컴포넌트 자기완결. */
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import PasswordChange from "@/components/views/PasswordChange";

export default function SettingsView() {
  return (
    <div className="space-y-6">
      <TrainerGoalSetter />
      <TrainerProfileSettings />
      <TrainerLibrary />
      <PtPricingSettings />
      <PasswordChange />
    </div>
  );
}
```

### B2. `TrainerGoalSetter.jsx` 자기완결 리팩터 (props 제거)
지금은 MyStats가 props(uid·ym·target·revTotal·onSaved)로 주고 달성률 progress도 그림. 설정 탭으론 **목표값 편집만**(달성률은 실적에 남김 = 기존 중복 progress도 해소). 전체 교체:
```jsx
"use client";
/* 이달 목표매출 설정 — trainer_goal(월별 1행 · upsert). 자기완결(설정 탭).
   달성률 표시는 '내 실적'(MyStats)에 있음 — 여기선 목표값 편집만. */
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

export default function TrainerGoalSetter() {
  const ym = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7); // KST 이번달
  const [uid, setUid] = useState(null);
  const [current, setCurrent] = useState(null);   // 저장된 목표(원) or null
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      const { data: au } = await supabase.auth.getUser();
      const id = au?.user?.id ?? null;
      const { data } = await supabase.from("trainer_goal").select("target_revenue")
        .eq("trainer_id", id).eq("ym", ym).maybeSingle();
      if (cancelled) return;
      setUid(id);
      if (data?.target_revenue != null) { setCurrent(data.target_revenue); setValue(String(data.target_revenue)); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const save = async () => {
    if (saving) return;
    if (value === "" || isNaN(Number(value)) || Number(value) <= 0) return showToast("목표 금액을 입력하세요");
    const payload = { trainer_id: uid, ym, target_revenue: Number(value), updated_at: new Date().toISOString() };
    setSaving(true);
    if (!supabase) { setCurrent(Number(value)); showToast("저장됨(데모)"); setSaving(false); return; }
    const { data, error } = await supabase.from("trainer_goal").upsert(payload, { onConflict: "trainer_id,ym" }).select();
    if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
    setCurrent(data[0].target_revenue);
    showToast("이달 목표 저장됨");
    setSaving(false);
  };

  const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";
  return (
    <div className="space-y-4">
      <Eyebrow icon={Target}>이달 목표매출</Eyebrow>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div className="text-[11px] text-muted">{ym} · {loading ? "불러오는 중…" : current != null ? `현재 목표 ${won(current)}` : "목표 미설정"}</div>
        <div className="mt-3 flex gap-2">
          <input type="number" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} placeholder="목표 순매출(원)" className={inputCls} />
          <button onClick={save} disabled={saving}
            className="shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">달성률은 '내 실적'에서 확인돼요.</p>
      </section>
      <Toast message={toast} />
    </div>
  );
}
```

### B3. `MyStats.jsx` 트림 (실적 전용으로)
**제거:**
- import: `TrainerGoalSetter`, `TrainerProfileSettings`, `TrainerLibrary`, `PtPricingSettings`, `PasswordChange` (전부 SettingsView로 이동).
- 렌더: 위 5개 컴포넌트 렌더 블록 전부 삭제. `TrainerGoalSetter`에 넘기던 `onSaved`/goals 갱신 콜백도 삭제.

**유지(실적 조회 + 달성률):**
- `goals` state · Promise.all의 `trainer_goal` fetch · `goalRow`/`target` 파생 · **목표 달성 블록(display)** · 리포트로 `goals` 전달.
- 급여 헤드라인 · 매출/클로징 grid · 이번달 수업 · 매출 내역 · 월간 리포트 버튼/오버레이 · trainerName 로직.
> 결과: `goals`는 여전히 fetch·read(달성률·리포트)만, mutate 없음. `setGoals`는 effect에서만 사용 → 미사용 경고 없음. (탭 전환 시 MyStats 언마운트→재마운트라 설정탭에서 목표 저장 후 실적탭 오면 재fetch로 최신 반영.)

### B4. `app/page.jsx` 탭 추가
- import: `import SettingsView from "@/components/views/SettingsView";`
- TABS 배열 — 글로벌 그룹에 설정 추가(내 실적 아래):
  ```jsx
  { id: 8,  label: "내 실적",  always: true },
  { id: 7,  label: "설정",     always: true },   // ← 추가(id 7 미사용)
  ```
- 렌더 분기 — 기존 `tab === 8 ? (<div className="tab-anim"><MyStats members={members} /></div>) :` 뒤에 추가:
  ```jsx
  ) : tab === 7 ? (
    <div className="tab-anim"><SettingsView /></div>
  ) : tab === 8 ? (
    ...
  ```
  (순서 무관 · 기존 삼항 체인에 `tab === 7` 분기 하나 끼우면 됨.)

### B 엣지·검증
1. `npm.cmd run lint` — MyStats에서 뺀 import가 남지 않았는지, SettingsView/page.jsx 미사용 0.
2. 폰: **설정 탭** 생겼는지(오늘·회원·내 실적·설정) · 설정탭에 목표매출·프로필·라이브러리·PT가격·계정 다 뜨는지 · **내 실적 탭엔 조회+달성률만** 남았는지.
3. 설정탭에서 목표 저장 → 내 실적 탭 이동 시 **달성률 반영**(재마운트 재fetch) · 리포트 달성률도 반영.
4. 각 설정 컴포넌트 자기완결 동작(프로필·라이브러리·가격·비번) 그대로.

## 4. 순서
A(라이브러리 접기+검색) 커밋·검증 → B(탭 분리) 커밋·검증. B는 4파일(SettingsView 신규·TrainerGoalSetter 리팩터·MyStats 트림·page.jsx)이라 diff 좀 큼 — 단위로 봐줄게.
