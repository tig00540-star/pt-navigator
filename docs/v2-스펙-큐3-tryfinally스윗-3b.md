# v2 스펙 — 큐3 배치 3-b (중간 위험) · try·finally 스윕

> 프레임워크(표준패턴 V1 · 변형규칙 [2] · V2 · 이탈중단 [3])는 `docs/v2-스펙-큐3-...-프레임워크+3a.md` 그대로. 여기선 3-b 8개 사이트만 상세.
> 전부 **V1**(자체 로딩 플래그 있음). 원칙·환경·커밋 동일. 라인번호 아님 코드 내용 매칭.
> 커밋 단위: **3-b 전체 1커밋**(파일 5개).

## 스코프 결정 2가지 (먼저 읽을 것)
1. **`PtInbodyTab.remove`(삭제)는 제외.** 로딩 플래그 없이 `confirmId` 2탭 확인으로만 동작 → 고착될 `setX`가 없어 hang 대상 아님. (throw 시 토스트 정도 개선 여지는 있으나 이 큐의 문제(무한로딩)와 무관 → 건드리지 않음.)
2. **`ScheduleBoard.book`의 catch는 토스트를 추가**한다. book의 기존 0행 경로는 **무음**(`setSaving(false)`만)이지만, 네트워크 throw까지 무음이면 사용자에게 아무 피드백이 없고 빈 `catch`는 lint(`no-empty`) 리스크라, `showToast`(이 컴포넌트에 이미 존재)로 안내한다. (0행 무음 경로 자체는 그대로 둠 — additive.)

## [3] 착수 전 대조
```
rg -n "setSaving|setActing|setRegSaving|setCSaving|setDirSaving" components/views/PtInbodyTab.jsx components/views/MemberEditForm.jsx components/views/RefundMember.jsx components/views/ScheduleBoard.jsx components/views/PtWorkoutTab.jsx components/views/PtReRegTab.jsx
```
각 사이트 현재 형태가 아래와 다르면 고치지 말고 멈추고 보고.

---

## 3-b-1. `PtInbodyTab.jsx` · `save` (인바디 저장)
상태 `saving`/`setSaving` · 에러 `showToast`. try는 데모 가드 뒤·DB insert 앞.
이 주석 줄 **아래에** `try {` 삽입:
```js
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패. .select() length>0로 확정.
```
함수 꼬리 교체:
```js
    setRows((p) => [data[0], ...p].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))); // measured_at 내림차순 — back-date 대비 재정렬
    resetForm();
    showToast("인바디 저장됨");
    setSaving(false);
  };
```
→
```js
    setRows((p) => [data[0], ...p].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))); // measured_at 내림차순 — back-date 대비 재정렬
    resetForm();
    showToast("인바디 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```
(중간 0행 return `showToast("저장 실패 — 다시 시도하세요");setSaving(false);return;`은 그대로 try 안.)

---

## 3-b-2. `MemberEditForm.jsx` · `save` (회원 정보 수정)
상태 `saving`/`setSaving` · 에러 `setErr` · 성공콜백 `onSaved()`(성공시만). try는 payload 빌드 뒤·`await` 앞, **`onSaved()`는 try 밖**.
이 주석 줄 **아래에** `try {` 삽입:
```js
    // error 없이 0행 = 조용한 실패. .select()로 확정.
```
꼬리 교체:
```js
    const { data, error } = await supabase.from("user_table").update(payload).eq("id", member.id).select();
    setSaving(false);
    if (error || !data || data.length === 0) { setErr(error ? error.message : "저장 실패 (0행 — 권한/정책 확인)"); return; }
    onSaved();
  };
```
→
```js
      const { data, error } = await supabase.from("user_table").update(payload).eq("id", member.id).select();
      setSaving(false);
      if (error || !data || data.length === 0) { setErr(error ? error.message : "저장 실패 (0행 — 권한/정책 확인)"); return; }
    } catch {
      setErr("저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return;
    } finally {
      setSaving(false);
    }
    onSaved();
  };
```
(기존 0행 branch의 `error.message` 노출은 §6-2 별건이라 이번엔 그대로 둠. 새 catch만 일반 문구.)

---

## 3-b-3. `RefundMember.jsx` · `doRefund` (환불 · 2테이블 write)
상태 `saving`/`setSaving` · 에러 `showToast` · 성공콜백 `onDone?.()`(성공시만). 모든 가드·데모 가드가 `setSaving(true)` 앞이라, try는 **`setSaving(true)` 바로 뒤**. `onDone`은 try 밖.
이 줄 **아래에** `try {` 삽입:
```js
    setSaving(true);
```
꼬리 교체:
```js
    showToast("환불 처리 및 회원 정리 완료");
    setSaving(false);
    if (onDone) onDone(); // 목록 재로드 + 목록 복귀
  };
```
→
```js
    showToast("환불 처리 및 회원 정리 완료");
      setSaving(false);
    } catch {
      showToast("환불 처리 중 오류 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
    if (onDone) onDone(); // 목록 재로드 + 목록 복귀
  };
```
(중간 두 0행 return은 그대로 try 안. 첫 return의 `setConfirming(false)`도 유지 — catch에선 confirming 안 건드림, 무해.)

---

## 3-b-4. `ScheduleBoard.jsx` · `book` (예약 생성)
상태 `saving`/`setSaving` · 에러 기존 무음 → **catch에 `showToast` 추가**(스코프 결정 2). try는 데모 가드 뒤·insert 앞.
이 데모 가드 블록 **아래에** `try {` 삽입:
```js
    if (!supabase) {
      setAppts((p) => [...p, { ...payload, id: `demo-${Date.now()}`, status: "booked" }]);
      setPick(null); setQ(""); setSaving(false); return;
    }
```
꼬리 교체:
```js
    const { data, error } = await supabase.from("appointment").insert(payload).select();
    if (error || !data || data.length === 0) { setSaving(false); return; }
    setAppts((p) => [...p, data[0]]);
    setPick(null); setQ(""); setSaving(false);
  };
```
→
```js
    const { data, error } = await supabase.from("appointment").insert(payload).select();
    if (error || !data || data.length === 0) { setSaving(false); return; }
    setAppts((p) => [...p, data[0]]);
    setPick(null); setQ(""); setSaving(false);
    } catch {
      showToast("예약 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```

---

## 3-b-5. `ScheduleBoard.jsx` · `cancelAppt` (예약 취소)
상태 `acting`/`setActing` · 에러 `showToast`. try는 데모 가드 뒤·update 앞.
이 데모 가드 블록 **아래에** `try {` 삽입:
```js
    if (!supabase) {
      setAppts((p) => p.filter((a) => a.id !== appt.id));
      setAction(null); setActing(false); return;
    }
```
꼬리 교체:
```js
    const { data, error } = await supabase.from("appointment").update({ status: "canceled" }).eq("id", appt.id).select();
    if (error || !data || data.length === 0) { showToast("취소 실패 — 다시 시도하세요"); setActing(false); return; }
    setAppts((p) => p.filter((a) => a.id !== appt.id));
    setAction(null); setActing(false);
  };
```
→
```js
    const { data, error } = await supabase.from("appointment").update({ status: "canceled" }).eq("id", appt.id).select();
    if (error || !data || data.length === 0) { showToast("취소 실패 — 다시 시도하세요"); setActing(false); return; }
    setAppts((p) => p.filter((a) => a.id !== appt.id));
    setAction(null); setActing(false);
    } catch {
      showToast("취소 실패 — 다시 시도하세요");
    } finally {
      setActing(false);
    }
  };
```

---

## 3-b-6. `PtWorkoutTab.jsx` · `saveContract` (계약 등록)
상태 `cSaving`/`setCSaving` · 에러 `setCErr`. try는 데모 가드 뒤·insert 앞.
이 데모 가드 블록 **아래에** `try {` 삽입:
```js
    if (!supabase) {
      setContracts((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      setShowContract(false);
      setCSaving(false);
      showToast(isReReg ? "재등록됨(데모) · 기존 잔여 소진 후 적용" : "계약 등록됨(데모)");
      return;
    }
```
꼬리 교체:
```js
    setContracts((p) => [...p, data[0]]); // 낙관적 → 잔여 즉시 반영
    setShowContract(false);
    setCSaving(false);
    showToast(isReReg ? "재등록됨 · 기존 잔여 소진 후 적용" : "계약 등록됨 · 잔여 반영");
  };
```
→
```js
    setContracts((p) => [...p, data[0]]); // 낙관적 → 잔여 즉시 반영
    setShowContract(false);
    setCSaving(false);
    showToast(isReReg ? "재등록됨 · 기존 잔여 소진 후 적용" : "계약 등록됨 · 잔여 반영");
    } catch {
      setCErr("계약 저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setCSaving(false);
    }
  };
```
(중간 0행 return `setCErr("저장 실패 — 다시 시도하세요");setCSaving(false);return;`은 그대로.)

---

## 3-b-7. `PtWorkoutTab.jsx` · `saveDirection` (현재 방향 저장)
상태 `dirSaving`/`setDirSaving` · 에러 `showToast`. try는 데모 가드 뒤·update 앞.
이 데모 가드 블록 **아래에** `try {` 삽입:
```js
    if (!supabase) {
      onMemberPatch?.(member.id, { pt_direction: next });
      setEditingDir(false);
      setDirSaving(false);
      showToast("방향 저장됨(데모)");
      return;
    }
```
꼬리 교체:
```js
    onMemberPatch?.(member.id, { pt_direction: next });
    setEditingDir(false);
    setDirSaving(false);
    showToast("현재 방향 저장됨");
  };
```
→
```js
    onMemberPatch?.(member.id, { pt_direction: next });
    setEditingDir(false);
    setDirSaving(false);
    showToast("현재 방향 저장됨");
    } catch {
      showToast("방향 저장 실패 — 다시 시도하세요");
    } finally {
      setDirSaving(false);
    }
  };
```
(중간 0행 return `showToast("방향 저장 실패 — 다시 시도하세요");setDirSaving(false);return;`은 그대로.)

---

## 3-b-8. `PtReRegTab.jsx` · `saveReg` (재등록 결과 기록)
상태 `regSaving`/`setRegSaving` · 에러 `showToast`. try는 데모 가드 뒤·update 앞.
이 주석 줄 **아래에** `try {` 삽입:
```js
    // ⚠️ 교훈1 — error 없이 0행 = 조용한 실패(UPDATE 정책 없으면). .select() length>0로 확정.
```
꼬리 교체:
```js
    setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
    showToast("재등록 결과 저장됨");
    setRegSaving(false);
  };
```
→
```js
      setContracts((p) => p.map((c) => (c.id === data[0].id ? data[0] : c)));
      showToast("재등록 결과 저장됨");
      setRegSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setRegSaving(false);
    }
  };
```
(중간 0행 return `showToast("저장 실패 — 다시 시도하세요");setRegSaving(false);return;`은 그대로.)

---

## 3-b 검증 (스모크)
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- 정상 경로 무회귀: 인바디 저장 · 회원정보 수정 · 환불 · 예약 생성/취소 · 계약 등록 · 방향 저장 · 재등록 결과 저장 — 각각 성공 시 이전과 동일.
- (선택) 네트워크 차단 후 각 버튼: 버튼 재활성 + 실패 토스트/에러문구(무한로딩 아님). 특히 book은 이제 무음 대신 "예약 실패" 토스트가 떠야 함.

## 커밋 제안(대수가 직접)
- `fix(hang): 중간위험 저장 경로 try·finally 스윕(3-b) — 인바디/수정/환불/예약/계약/방향/재등록`
