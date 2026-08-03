# 스펙 — 트레이너 스케줄표: OT 회원 예약 완료 처리 (2026-07-25)

> **버그 수정.** 트레이너 스케줄표(`ScheduleBoard`)에서 **OT 회원 예약을 완료 처리할 수 없다** — 탭하면 OT 준비 흐름으로 라우팅돼 완료/취소 모달을 못 만남.
> **협업 방식 그대로:** 웹Claude=스펙+diff리뷰 / CC=로컬 구현 / 대수=커밋. **단일 파일**(`components/views/ScheduleBoard.jsx`)만 수정 · **마이그레이션·RLS·payload·memberStatus 무변** · 코드 내용으로 매칭 · 1커밋 · Windows PowerShell(`npm.cmd`).

---

## 0. 원인 (정확)

`ScheduleBoard.jsx`의 `handleApptTap` — OT 회원이면 완료 모달(`openAction`) 대신 OT 준비 흐름으로 라우팅하고 `return`:

```js
const handleApptTap = async (a) => {
  const m = members.find((x) => x.id === a.user_id) || null;
  if (m && onSelect && viewFor(m) === "ot") {   // OT 회원이면
    const toTab = await otLandingTab(m);
    onSelect(a.user_id, toTab);                  // OT 준비 탭으로 이동
    return;                                      // 완료/취소 모달 스킵 → 완료 불가
  }
  openAction(a);                                 // PT만 여기 도달
};
```

트레이너 앱은 `onSelect`가 항상 넘어옴(`app/page.jsx`의 `<ScheduleBoard onSelect={(id,toTab)=>{...}} />`) → **OT는 무조건 라우팅 = 영영 완료 불가.** 부수효과로 OT 예약이 계속 `booked`로 남아 **#5 스케줄 "미처리 예약"에 누적**된다.

## 1. 결정 (대수 확정)

**OT "완료" = 예약 `status='done'`으로 닫기 끝.** 차감 없음(OT는 PT 계약 없음) · `daily_workout_log` 생성 없음(OT 기록 원천은 `ot_log`). 기록/참석로그 안 남김.

## 2. 방침

OT 회원 예약 탭도 **액션 모달을 연다.** 모달을 회원 view로 분기:
- **OT 회원:** [OT 준비 열기] · [수업 완료] · [예약 취소] — 음성/일지 입력 없음.
- **PT 회원:** 기존 그대로(음성·수업내용 textarea·완료·차감 / 차감 안 함 / 취소).

"OT 준비 열기"가 기존 탭 라우팅을 대신하므로 준비 흐름은 유지(한 번 더 눌러 진입). 완료는 이제 가능.

---

## 3. 수정 (`components/views/ScheduleBoard.jsx` · 3곳)

### 수정 A — `handleApptTap`: OT 자동 라우팅 제거 → 모두 액션 모달
```jsx
// 변경 후: 모든 회원이 액션 모달을 연다(OT 준비는 모달 안 버튼으로 이동).
const handleApptTap = (a) => openAction(a);
```
> `async` 뗀다. `otLandingTab`은 삭제 X(아래 `openOtPrep`에서 재사용). 호출부(주간 그리드 chip·오늘 뷰 카드 onClick)는 `handleApptTap(a)` 그대로.

### 수정 B — 핸들러 2개 추가 (`cancelAppt` 근처)
```jsx
// OT 준비 열기 — 기존 탭 라우팅을 모달 버튼으로 이동(빠른 준비 유지).
const openOtPrep = async (appt) => {
  const m = members.find((x) => x.id === appt.user_id) || null;
  if (!m || !onSelect) { openAction(appt); return; } // 라우팅 불가면 모달 유지
  const toTab = await otLandingTab(m);
  setAction(null);
  onSelect(appt.user_id, toTab);
};

// OT 수업 완료 — 예약 status='done'만(차감 X · daily_workout_log 생성 X). 교훈1 하드닝.
const completeOt = async (appt) => {
  if (acting) return;
  setActing(true);
  if (!supabase) {
    setAppts((p) => p.map((a) => (a.id === appt.id ? { ...a, status: "done" } : a)));
    showToast("OT 수업 완료"); setAction(null); setActing(false); return;
  }
  try {
    const { data, error } = await supabase.from("appointment").update({ status: "done" }).eq("id", appt.id).select();
    if (error || !data || data.length === 0) { showToast("완료 실패 — 다시 시도하세요"); setActing(false); return; }
    setAppts((p) => p.map((a) => (a.id === appt.id ? data[0] : a)));
    showToast("OT 수업 완료"); setAction(null); setActing(false);
  } catch {
    showToast("완료 실패 — 다시 시도하세요");
  } finally {
    setActing(false);
  }
};
```
> `completeOt`는 `cancelAppt` 패턴 그대로(`.select()` → `error||!data||data.length===0` 하드닝 · `try/catch/finally`). appointment `status='done'`만 세팅(`log_id`는 null 유지). RLS `auth_update_appointment`(with_check account_id)가 이미 허용 — 정책 무변.

### 수정 C — 액션 모달: OT 분기 추가
현재 2분기(`done` / PT 완료·취소)를 **3분기**로. `actionMember`·`viewFor`는 이미 있음(추가 import 0):
```jsx
{action.status === "done" ? (
  <p className="text-sm text-sub">완료 처리된 수업입니다. (완료 취소는 후속)</p>
) : actionMember && viewFor(actionMember) === "ot" ? (
  /* OT 회원 — 차감/일지 없음. 준비 이동 · 완료 · 취소 */
  <div className="space-y-3">
    <p className="text-xs text-muted">OT 상담 예약이에요. 준비 화면으로 가거나, 진행한 수업을 완료 처리하세요.</p>
    <Button variant="primary" size="md" fullWidth onClick={() => openOtPrep(action)} disabled={acting}>OT 준비 열기</Button>
    <Button variant="ghost" size="md" fullWidth onClick={() => completeOt(action)} disabled={acting}>{acting ? "처리 중…" : "수업 완료"}</Button>
    <Button variant="danger" size="md" fullWidth onClick={() => cancelAppt(action)} disabled={acting}>예약 취소</Button>
  </div>
) : (
  /* PT 회원 — 기존 그대로(음성·textarea·완료·차감 / 차감 안 함 / 취소). 무변. */
  <div className="space-y-3">
    …기존 코드 그대로…
  </div>
)}
```
> OT 분기엔 음성(`VoiceLogTab`)·수업내용 textarea 안 넣음(둘 다 `daily_workout_log`용이라 OT엔 불필요). `actionMember`가 null(명단 밖·hidden)이면 OT 분기 아님 → PT 분기로 폴백(그쪽 "차감 안 함"이 계약 없어도 안전).

---

## 4. 성격 / 회귀 체크
- **단일 파일** 변경(`ScheduleBoard.jsx`). DB 스키마·RLS·마이그레이션·`memberStatus`·admin 무변.
- **payload 무변:** appointment `status` 업데이트는 기존 `cancelAppt`(canceled)·`complete`(done)가 쓰던 컬럼. OT완료는 `status:'done'`만(log_id 미변경).
- **PT 흐름 무변:** PT 회원 탭 → 기존 완료·차감/차감 안 함/취소 그대로.
- **행동 변화(의도):** OT 회원 탭이 "즉시 OT 준비 이동" → "액션 모달(준비 열기·완료·취소)". 준비 진입이 1탭 늘지만 완료가 가능해짐.
- **부수효과(좋음):** OT 예약을 닫을 수 있어 #5 스케줄 "미처리 예약" 오염 해소.

## 5. 검증 (폰)
1. **OT 회원** 예약 탭 → 모달에 [OT 준비 열기 · 수업 완료 · 예약 취소] 표시(음성/일지 입력 없음).
2. "수업 완료" → 토스트 · 주간/오늘 뷰에서 done(취소선/완료 배지)로 즉시 반영 · 새로고침 후에도 done 유지(DB status).
3. "OT 준비 열기" → 기존처럼 해당 OT 회원의 준비 탭(1차/2차)으로 이동.
4. **PT 회원** 예약 탭 → 완료·차감 / 차감 안 함 / 취소 전부 기존대로.
5. done 상태 예약 탭 → "완료 처리된 수업입니다".
6. `npm.cmd run build`/`lint` green(신규 경고 0 · 미사용 import 0 — `otLandingTab`은 `openOtPrep`이 계속 사용).

## 6. 커밋 (1커밋 = revert 단위)
```
git commit -m "fix(schedule): OT 회원 예약 완료 처리(status done · 차감/일지 없음) + 준비 열기 분기" -- components/views/ScheduleBoard.jsx
```
