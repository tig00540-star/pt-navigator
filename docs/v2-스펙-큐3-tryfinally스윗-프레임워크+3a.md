# v2 스펙 — 큐3: DB 저장/조회 try·finally 스윕 (프레임워크 + 배치 3-a)

> 성격: **수정 스펙**(클로드코드에 넘김). 근거: `docs/v2-종합점검-리포트-2026-07-19.md` §4. 핸드오프 다음작업큐 3번.
> 원칙: **로직·payload·에러표기 수단 불변 · additive-only**. 라인번호 아님 **코드 내용 매칭**. 커밋은 대수가 직접.
> 환경: PowerShell 구버전 — `&&` 금지. 빌드 `npm.cmd run build`, 린트 `npm.cmd run lint`.
> **이 문서는 프레임워크(전 배치 공통) + 배치 3-a만 상세.** 3-b/3-c/3-d는 사이트만 열거(상세는 3-a 리뷰 후).

---

## [1] 표준 패턴 (한 번만 정의 — 이하 "V1")
비동기 저장/조회 함수가 자체 로딩 플래그(`setSaving`/`setActing`/`setLoading` 등, 이하 `setX`)를 켠 뒤 `await`로 실패 시 플래그가 고착돼 버튼이 영구 비활성 되는 걸 막는다.

```
setX(true);                       // ← 기존 위치 그대로 (아래 [2](a) 참조)
try {
  <기존 await 본문 — 기존 setX(false)·에러 return·성공 처리 전부 그대로 유지>
} catch {
  <이 사이트가 이미 쓰는 에러 표기 수단으로 사용자 안내>  // showToast / setErr / setDbNote 중 그 사이트 것
} finally {
  setX(false);                    // 안전망 — 기존 setX(false)와 이중 호출돼도 무해([2](b))
}
```

- `catch`는 **원본 에러 객체를 화면·콘솔에 그대로 노출하지 않는다**(리포트 §6-2 정합). 그 사이트가 이미 쓰는 실패 문구를 재사용한다(문구는 각 사이트 항목에 명시).
- React 19(Next 16)라 언마운트 후 setState 경고는 없음 → finally의 이중 `setX(false)`는 안전.

## [2] 변형 결정 규칙 (핵심)

### (a) try를 여는 위치 — **데모 가드 뒤, 첫 실제 `await` 직전**
- `if (!supabase) { ...동기 낙관 반영...; return; }` 같은 **데모 분기는 동기라 try 밖**에 둔다(감쌀 필요 없음, 도달 시 return으로 빠짐).
- 따라서 `setX(true)`가 데모 가드보다 **앞**에 있어도, **try는 데모 가드 아래·DB `await` 직전**에서 연다. (`setX(true)` 자체를 try 안으로 옮기지 않는다 — 위치 이동 금지, diff 최소.)
- **명시 예외 — 데모 가드 앞의 클립보드 `await`**: `saveLog`·`complete`처럼 데모 가드 전에 `await copyToClipboard(...)`가 있는 경우, 그 클립보드 await는 **try 밖에 그대로 둔다**. `copyToClipboard`는 내부 try/catch로 절대 throw하지 않음(값 반환)이 확인됨(`lib/clipboard.js`, `ScheduleBoard.jsx:51-58`). 감싸는 대상은 **DB await 블록만**.

### (b) 기존 `setX(false)` / `setLoading(false)`는 **그대로 둔다**
- 지우지 않는다. finally는 **안전망으로만 추가**. 이중 호출은 무해하고, diff가 최소가 되며, additive-only 원칙과 일치. (지우면 diff만 커지고 회귀 위험 상승.)

### (c) 변형 V2 — **boolean 반환 · 자체 로딩상태 없음**
`confirmPtActive`처럼 함수가 `true/false`만 반환하고 로딩 플래그는 **호출자**가 관리하는 경우:
- 이 함수엔 **finally 없음**(끌 `setX`가 없음). `try/catch`만: catch에서 **기존 실패 표기(`setDbNote`) 후 `return false`**.
- 목적은 "throw가 호출자로 새어나가 호출자의 busy가 고착되는 것"을 막는 것 → throw를 `return false`로 강등.
- 호출자 쪽은 별도 항목에서 V1(또는 그에 준하는 finally)로 따로 처리.

## [3] 이탈 시 중단 규칙
- 아래 열거된 각 사이트의 **현재 형태가 이 문서에 적힌 것과 다르면**(함수 시그니처·데모 가드 유무·`setX` 이름/개수·에러 표기 수단이 불일치), **고치지 말고 멈추고 보고**할 것.
- 열거에 **없는** 함수는 이번 배치에서 건드리지 않는다.
- 착수 전 대조 권장: `rg -n "setSaving|setActing|setBusy|setLoading" app/page.jsx components/views/PtWorkoutTab.jsx components/views/ScheduleBoard.jsx components/views/PtConfirmBanner.jsx`

---

# 배치 3-a — 고위험 (데이터 유실 / 모달 잠김 가능)
> 4개 사이트, 파일 3개 + confirmPtActive는 2파일 연동. **한 커밋 = 3-a 전체**(되돌릴 단위).

## 3-a-1. `app/page.jsx` — `MemberForm.save` (신규 회원 등록 · 입력값 소실 위험)
- 상태: `saving`/`setSaving`. 에러 표기: `setErr`. 성공 콜백: `onSaved()`(성공시에만·언마운트 유발).
- 현재 형태: 검증·데모 가드(`if (!supabase)`, `if (isCarry && ...)`) → `setSaving(true)` → `setErr("")` → `await user_table.insert().select()` → 0행 return(`setSaving(false);setErr;return`) → 조건부 `await session_log.insert().select()` → 0행 return → `setSaving(false)` → `onSaved()`.
- try는 **`setErr("")` 다음, 첫 `await`(user_table insert) 직전**에 연다. **`onSaved()`는 try 밖**(성공시에만 호출, 실패로 오인 방지).

적용:
```js
    setSaving(true);
    setErr("");
```
바로 **아래에** `try {` 삽입. 그리고 기존 성공 꼬리:
```js
    setSaving(false);
    onSaved();
  };
```
를 아래로 교체(= `setSaving(false)` 다음에서 try를 닫고 catch/finally, `onSaved()`는 밖):
```js
      setSaving(false);
    } catch {
      setErr("등록 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return;
    } finally {
      setSaving(false);
    }
    onSaved();
  };
```
- 중간의 기존 두 에러 return(`setSaving(false); setErr(...); return;`)은 **그대로** 둔다(try 안에서 return→finally 통과, 정상).

## 3-a-2. `components/views/PtWorkoutTab.jsx` — `saveLog` (수업일지 저장 + 세션 차감)
- 상태: `saving`/`setSaving`. 에러 표기: `showToast`.
- 현재 형태: `if (saving) return;` → `setSaving(true)` → (데모가드 앞) `await copyToClipboard(body)` → payload/clearForm 정의 → 데모 가드(`if (!supabase){...setSaving(false);return;}`) → `await daily_workout_log.insert().select()` → 0행 return(`showToast("저장 실패 — 차감 안 됨. 다시 시도하세요");setSaving(false);return;`) → 성공 처리 → `setSaving(false)`.
- [2](a) 예외 적용: 클립보드 await·데모 가드는 **밖**. try는 **데모 가드 뒤, `await supabase.from("daily_workout_log")` 직전**에 연다.

적용 — 이 주석 줄:
```js
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 성공 확정.
```
**아래에** `try {` 삽입. 그리고 함수 꼬리:
```js
    setSaving(false);
  };
```
를 교체:
```js
      setSaving(false);
    } catch {
      showToast("저장 실패 — 차감 안 됨. 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```
- 중간 0행 return(`showToast(...);setSaving(false);return;`)은 그대로.

## 3-a-3. `components/views/ScheduleBoard.jsx` — `complete` (완료 처리 · 2테이블 write)
- 상태: `acting`/`setActing`. 에러 표기: `showToast`.
- 현재 형태: `if (acting) return;` → `setActing(true)` → (데모가드 앞) `await copyToClipboard(body)` → `doneMsg` 정의 → 데모 가드(`if (!supabase){...setActing(false);return;}`) → (deduct 시) `await Promise.all([...2 selects])` → `await daily_workout_log.insert().select()` → 0행 return → `await appointment.update().select()` → 0행 return → 성공(`setAppts;doneMsg;setAction(null);setActing(false)`).
- try는 **데모 가드 뒤**(`if (!supabase){...}` 블록 다음), 첫 `await`(Promise.all 또는 insert) 직전. 클립보드 await는 밖.

적용 — 데모 가드 블록:
```js
    if (!supabase) {
      setAppts((p) => p.map((a) => (a.id === appt.id ? { ...a, status: "done" } : a)));
      doneMsg(); setAction(null); setActing(false); return;
    }
```
**아래에** `try {` 삽입. 그리고 함수 꼬리:
```js
    doneMsg(); setAction(null); setActing(false);
  };
```
를 교체:
```js
    doneMsg(); setAction(null); setActing(false);
    } catch {
      showToast("완료 실패 — 다시 시도하세요");
    } finally {
      setActing(false);
    }
  };
```
- 중간 두 개 0행 return은 그대로.

## 3-a-4. `confirmPtActive`(app/page.jsx) + `PtConfirmBanner.doConfirm` — 모달 잠김
이 둘은 **한 쌍**(같은 커밋). 확정 버튼 눌러 DB throw 시 `busy` 고착 → 취소·확정 both disabled로 **모달이 닫히지도 않음**.

### (i) `app/page.jsx` `confirmPtActive` — 변형 **V2** (boolean 반환·자체 상태 없음)
- 현재: 데모 가드(`if (!supabase){ setMemberStatus(...,"pt_active"); return true; }`) → `await session_log.select()`(멱등) → 조건부 `await session_log.insert().select()`(실패 시 `setDbNote;return false`) → `await user_table.update().select()`(실패 시 `setDbNote;return false`) → `setMemberStatus(...,"pt_active"); return true;`
- try는 **데모 가드 뒤, 첫 `await`(session_log select) 직전**. **finally 없음.** catch → `setDbNote` + `return false`.

적용 — 이 주석 줄:
```js
    // 1) 멱등 가드 — 이미 계약 있으면(재시도) INSERT 스킵.
```
**아래에** `try {` 삽입. 그리고 함수 꼬리:
```js
    setMemberStatus(member.id, "pt_active"); // 확정 성공 후에만 뷰 전환(깜빡임 방지)
    return true;
  };
```
를 교체:
```js
    setMemberStatus(member.id, "pt_active"); // 확정 성공 후에만 뷰 전환(깜빡임 방지)
    return true;
    } catch {
      setDbNote("PT 등록 확정 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return false;
    }
  };
```
- 중간 두 개 `return false`(setDbNote 포함)은 그대로. **들여쓰기 주의**: try 블록 안이므로 기존 본문 들여쓰기는 그대로 둬도 되고(동작 무관), 정돈하려면 한 단계 들이되 **로직 변경 금지**.

### (ii) `components/views/PtConfirmBanner.jsx` `doConfirm` — V1(안전망), `mounted` 가드 유지
- 현재: 검증 return → `setErr("")` → contractInput 구성 → `setBusy(true)` → `const ok = await onConfirm(contractInput);` → `if(!ok){ if(mounted.current){setBusy(false);setErr("저장 실패 — 다시 시도하세요");} return; }` → 성공(`if(mounted.current){setBusy(false);setConfirming(false);}`).
- (i)에서 confirmPtActive가 더는 throw하지 않으므로 이 finally는 **이중 안전망**. 기존 `mounted.current` 가드 스타일을 그대로 따른다.

적용 — 이 줄:
```js
    setBusy(true);
    const ok = await onConfirm(contractInput);
```
에서 `setBusy(true);` **다음 줄부터** try로 감싼다. 성공 꼬리:
```js
    // ok면 부모가 pt_active로 flip → 언마운트(현행). 도달 시엔 busy 정리만.
    if (mounted.current) {
      setBusy(false);
      setConfirming(false);
    }
  };
```
를 교체(전체 블록을 try/catch/finally로):
```js
    setBusy(true);
    try {
      const ok = await onConfirm(contractInput);
      if (!ok) {
        if (mounted.current) {
          setBusy(false);
          setErr("저장 실패 — 다시 시도하세요");
        }
        return;
      }
      // ok면 부모가 pt_active로 flip → 언마운트(현행). 도달 시엔 busy 정리만.
      if (mounted.current) {
        setBusy(false);
        setConfirming(false);
      }
    } catch {
      if (mounted.current) {
        setBusy(false);
        setErr("저장 실패 — 다시 시도하세요");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
```
- 기존 `if(!ok){...}` 블록은 try 안으로 그대로 이동(내용 무변). `mounted.current` 가드 전부 보존.

## 3-a 검증 (스모크)
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- 정상 경로 무회귀: 신규 회원 등록·수업일지 저장(차감)·예약 완료(차감·2테이블)·PT 확정 모달 각각 **성공 시 이전과 동일** 동작.
- (선택) 네트워크 차단 후 각 버튼 눌러 **버튼이 다시 활성/토스트 뜨는지**(무한 로딩 아님), PT 확정 모달의 **취소가 눌리는지**(잠김 해제) 확인.

---

# 다음 배치 — 사이트 열거 (상세는 3-a 리뷰 후)
> [3] 이탈 규칙·[1][2] 패턴 그대로 적용 예정. 형태 확인 후 각 배치 커밋 단위로 상세화.

## 3-b — 중간
- `PtInbodyTab.jsx` : `save`(인바디 저장) / delete 경로
- `PtReRegTab.jsx` : `saveReg`
- `MemberEditForm.jsx` : `save`
- `RefundMember.jsx` : `doRefund`
- `ScheduleBoard.jsx` : `book` · `cancelAppt`
- `PtWorkoutTab.jsx` : `saveContract` · `saveDirection`

## 3-c — 설정류 · 저위험
- `TrainerGoalSetter.jsx` · `TrainerLibrary.jsx` · `TrainerProfileSettings.jsx` · `CenterMachineSettings.jsx` · `PtPricingSettings.jsx` · `TodoManual.jsx` · `PasswordChange.jsx` · `AdminPayrollSettings`(admin) · `AnnouncementGate.jsx`

## 3-d — 조회(loading) 경로 (별도 묶음)
> 패턴 동일(setLoading true 후 catch 없음 → 무한 "불러오는 중…"). catch에서 로딩 해제 + 실패 표기.
- `MyStats.jsx` · `PTView.jsx` · `SecondOTTab.jsx`(브리핑 로드) · `PtInbodyTab.jsx`(이력 로드) · `ChurnRiskToday.jsx` · `ScheduleBoard.jsx`(초기 로드 `setLoading`) · `app/page.jsx` `loadMembers`
- **특례 — `app/page.jsx` `loadMembers`**: 실패 시 `dbNote`도 안 뜨고 목록이 **조용히 빈다**(저장 후 `onSaved` 재조회에서도 발생 → 저장됐는데 옛 데이터로 되돌아 보임). catch에서 로딩 해제뿐 아니라 **`setDbNote`로 "회원 목록을 불러오지 못했어요 — 새로고침" 안내**까지 넣어 사용자 오인 방지. (상세는 3-d에서.)

## 커밋 제안(대수가 직접 · 배치별 1커밋)
- 3-a: `fix(hang): 고위험 저장/확정 경로 try·finally — 무한로딩·모달잠김 방지`
