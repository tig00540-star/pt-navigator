# v2 스펙 — 큐3 배치 3-c (설정류 · 저위험) · try·finally 스윕

> 프레임워크(표준패턴 V1 · 변형규칙 [2] · 이탈중단 [3])는 `docs/v2-스펙-큐3-...-프레임워크+3a.md` 그대로. 여기선 3-c만 상세.
> 전부 **V1**. try는 **데모 가드 뒤 · 첫 `await` 직전**. 기존 `setX(false)`는 그대로(finally는 안전망). 성공콜백은 try 밖.
> 대상: **10개 함수 / 9파일**(AdminPayrollSettings는 2함수). 커밋 단위: **3-c 전체 1커밋**.
> 라인번호 아님 코드 내용 매칭. 환경/커밋 규약 동일(PowerShell 구버전, `npm.cmd run build`/`lint`).

## 스코프 결정 (먼저 읽을 것)
**제외 — 로딩 플래그 없는 삭제/토글**(고착될 `setX` 없음 → hang 대상 아님, 3-b의 `PtInbodyTab.remove` 제외와 동일 규칙):
- `TodoManual.toggle` · `TodoManual.remove`
- `CenterMachineSettings.remove` · `PtPricingSettings.remove` · `TrainerLibrary.remove`
- `AnnouncementGate`의 fetch effect 2곳·재열람 auto-ack effect — 조회/이펙트라 버튼 락 아님. **3-d(조회)/리포트 §7 소관**으로 미룸.

**포함 특례:**
- `AdminPayrollSettings.removeOverride` — 삭제지만 `setSaving`을 쓰므로 포함.
- `AnnouncementGate.ackAll` — 삭제 아님. **필수확인 게이트의 "확인했습니다" 버튼**이 `acking`으로 고착되면 공지를 못 닫아 앱이 막히므로 포함(체감 위험은 저위험 아님, 배치만 3-c).

## [3] 착수 전 대조
```
rg -n "setSaving|setAcking" components/views/TrainerGoalSetter.jsx components/views/TrainerLibrary.jsx components/views/TrainerProfileSettings.jsx components/views/CenterMachineSettings.jsx components/views/PtPricingSettings.jsx components/views/TodoManual.jsx components/views/PasswordChange.jsx components/AdminPayrollSettings.jsx components/AnnouncementGate.jsx
```
각 사이트 현재 형태가 아래와 다르면 고치지 말고 멈추고 보고.

---

## 3-c-1. `components/views/TrainerGoalSetter.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드(한 줄) 뒤·upsert 앞.
이 줄 **아래에** `try {`:
```js
    if (!supabase) { setCurrent(Number(value)); showToast("저장됨(데모)"); setSaving(false); return; }
```
꼬리 교체:
```js
    const { data, error } = await supabase.from("trainer_goal").upsert(payload, { onConflict: "trainer_id,ym" }).select();
    if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
    setCurrent(data[0].target_revenue);
    showToast("이달 목표 저장됨");
    setSaving(false);
  };
```
→
```js
      const { data, error } = await supabase.from("trainer_goal").upsert(payload, { onConflict: "trainer_id,ym" }).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      setCurrent(data[0].target_revenue);
      showToast("이달 목표 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```

---

## 3-c-2. `components/views/TrainerProfileSettings.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드(한 줄) 뒤·upsert 앞.
이 줄 **아래에** `try {`:
```js
    if (!supabase) { showToast("저장됨(데모)"); setSaving(false); return; }
```
꼬리 교체:
```js
    // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id → upsert.
    const { data, error } = await supabase.from("trainer_profile")
      .upsert(payload, { onConflict: "trainer_id" }).select();
    if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
    showToast("프로필 저장됨");
    setSaving(false);
  };
```
→
```js
      // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id → upsert.
      const { data, error } = await supabase.from("trainer_profile")
        .upsert(payload, { onConflict: "trainer_id" }).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      showToast("프로필 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```

---

## 3-c-3. `components/views/CenterMachineSettings.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드 블록 뒤·`if (editingId)` 앞. 문구는 기존 그대로("권한(대표만)·정책 확인").
이 데모 가드 블록 닫는 `}` **아래에** `try {`:
```js
    if (!supabase) {
      if (editingId) setRows((p) => p.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      else setRows((p) => [...p, { ...payload, id: `demo-${Date.now()}` }]);
      resetForm(); showToast("저장됨(데모)"); setSaving(false); return;
    }
```
꼬리 교체:
```js
    resetForm(); setSaving(false);
  };
```
→
```js
    resetForm(); setSaving(false);
    } catch {
      showToast("저장 실패 — 권한(대표만)·정책 확인");
    } finally {
      setSaving(false);
    }
  };
```
(중간 `if(editingId){...}else{...}` 두 갈래와 각 0행 return은 그대로 try 안.)

---

## 3-c-4. `components/views/PtPricingSettings.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드 블록 뒤·`if (editingId)` 앞.
이 데모 가드 블록 닫는 `}` **아래에**(빈 줄 다음) `try {`:
```js
    if (!supabase) {
      if (editingId) {
        setRows((p) => sortRows(p.map((r) => (r.id === editingId ? { ...r, ...payload } : r))));
      } else {
        setRows((p) => sortRows([...p, { ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }]));
      }
      resetForm();
      showToast("저장됨(데모)");
      setSaving(false);
      return;
    }
```
꼬리 교체:
```js
    resetForm();
    setSaving(false);
  };
```
→
```js
    resetForm();
    setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```
(중간 `if(editingId){...}else{...}` 두 갈래·각 0행 return 그대로.)

---

## 3-c-5. `components/views/TrainerLibrary.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드 블록 뒤·`if (editingId)` 앞.
이 데모 가드 블록 닫는 `}` **아래에** `try {`:
```js
    if (!supabase) {
      if (editingId) setRows((p) => p.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      else setRows((p) => [...p, { ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }]);
      resetForm(); showToast("저장됨(데모)"); setSaving(false); return;
    }
```
꼬리 교체:
```js
    resetForm(); setSaving(false);
  };
```
→
```js
    resetForm(); setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```
(중간 두 갈래·0행 return 그대로.)

---

## 3-c-6. `components/views/TodoManual.jsx` · `add`
`saving`/`setSaving` · `setErr`. 데모 가드는 `setSaving(true)` 앞(도달 시 return). try는 `setSaving(true)` 뒤·payload 빌드 뒤·insert 앞. 성공콜백 없음.
이 두 줄:
```js
    setSaving(true);
    const payload = { body: b };
    if (due) payload.due_date = due;
```
바로 아래(즉 `if (due) ...` 다음)에 `try {`. 꼬리 교체:
```js
    const { data, error } = await supabase.from("trainer_todo").insert(payload).select();
    setSaving(false);
    if (error || !data || data.length === 0) { setErr("추가 실패 — 저장 안 됨"); return; }
    setTodos((t) => [data[0], ...t]);
    setBody(""); setDue("");
  };
```
→
```js
    try {
      const { data, error } = await supabase.from("trainer_todo").insert(payload).select();
      setSaving(false);
      if (error || !data || data.length === 0) { setErr("추가 실패 — 저장 안 됨"); return; }
      setTodos((t) => [data[0], ...t]);
      setBody(""); setDue("");
    } catch {
      setErr("추가 실패 — 저장 안 됨");
    } finally {
      setSaving(false);
    }
  };
```

---

## 3-c-7. `components/views/PasswordChange.jsx` · `submit`
`saving`/`setSaving` · `showToast` · 성공콜백 `onDone?.()`(성공시만). 데모 가드(`if(!supabase) return ...`)는 `setSaving(true)` 앞. try는 `setSaving(true)` 뒤·`auth.updateUser` 앞. **`onDone`은 try 밖**, catch에 `return`(실패 시 onDone 금지).
이 줄 **아래에** `try {`:
```js
    setSaving(true);
```
꼬리 교체:
```js
    // 비번 교체 + 강제 플래그 해제를 한 번에(자율 변경 때도 무해 — 이미 false면 그대로).
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_pw: false } });
    if (error) { showToast("변경 실패 — " + (error.message || "다시 시도")); setSaving(false); return; }
    setPw(""); setPw2("");
    showToast("비밀번호가 변경되었어요");
    setSaving(false);
    if (onDone) onDone(); // forced 게이트 → AuthGate가 세션 재조회해 앱 오픈
```
→
```js
    // 비번 교체 + 강제 플래그 해제를 한 번에(자율 변경 때도 무해 — 이미 false면 그대로).
    try {
      const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_pw: false } });
      if (error) { showToast("변경 실패 — " + (error.message || "다시 시도")); setSaving(false); return; }
      setPw(""); setPw2("");
      showToast("비밀번호가 변경되었어요");
      setSaving(false);
    } catch {
      showToast("변경 실패 — 다시 시도하세요");
      return;
    } finally {
      setSaving(false);
    }
    if (onDone) onDone(); // forced 게이트 → AuthGate가 세션 재조회해 앱 오픈
```
(기존 error.message 노출은 §6-2 별건 — 그대로. 새 catch만 일반 문구.)

---

## 3-c-8. `components/AdminPayrollSettings.jsx` · `save`
`saving`/`setSaving` · `showToast`. 데모 가드 블록 뒤·`if (existing?.id)` 앞.
이 데모 가드 블록 닫는 `}` **아래에** `try {`:
```js
    if (!supabase) {
      const row = { ...(existing || {}), ...payload, id: existing?.id || `demo-${Date.now()}` };
      setSchemes((p) => (existing ? p.map((s) => (s.id === existing.id ? row : s)) : [...p, row]));
      showToast("저장됨(데모)");
      setSaving(false);
      return;
    }
```
꼬리 교체:
```js
    showToast("급여 스킴이 저장되었어요");
    setSaving(false);
  };
```
→
```js
    showToast("급여 스킴이 저장되었어요");
    setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
```
(중간 `if(existing?.id){...}else{...}` 두 갈래·0행 return 그대로.)

---

## 3-c-9. `components/AdminPayrollSettings.jsx` · `removeOverride`
`saving`/`setSaving` · `showToast`. 데모 가드 블록 뒤·delete 앞.
이 데모 가드 블록 닫는 `}` **아래에** `try {`:
```js
    if (!supabase) {
      setSchemes((p) => p.filter((s) => s.id !== row.id));
      selectScope(null);
      showToast("삭제됨(데모)");
      setSaving(false);
      return;
    }
```
꼬리 교체:
```js
    const { data, error } = await supabase.from("pay_scheme").delete().eq("id", row.id).select();
    if (error || !data || data.length === 0) { showToast("삭제 실패 — 권한/정책을 확인하세요"); setSaving(false); return; }
    setSchemes((p) => p.filter((s) => s.id !== row.id));
    selectScope(null);
    showToast("이 트레이너 정책 삭제 — 계정 기본을 따릅니다");
    setSaving(false);
  };
```
→
```js
      const { data, error } = await supabase.from("pay_scheme").delete().eq("id", row.id).select();
      if (error || !data || data.length === 0) { showToast("삭제 실패 — 권한/정책을 확인하세요"); setSaving(false); return; }
      setSchemes((p) => p.filter((s) => s.id !== row.id));
      selectScope(null);
      showToast("이 트레이너 정책 삭제 — 계정 기본을 따릅니다");
      setSaving(false);
    } catch {
      showToast("삭제 실패 — 권한/정책을 확인하세요");
    } finally {
      setSaving(false);
    }
  };
```

---

## 3-c-10. `components/AnnouncementGate.jsx` · `ackAll` (필수확인 게이트 버튼)
`acking`/`setAcking` · `setErr`. 가드(`if(!supabase||acking||!list.length) return;`)는 `setAcking(true)` 앞. try는 `setAcking(true)` 뒤. 성공콜백 없음.
이 줄 **아래에** `try {`:
```js
    setAcking(true);
```
꼬리 교체:
```js
    const rows = list.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
    const { error } = await supabase
      .from("announcement_read")
      .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
      .select();
    if (error) { setErr("확인 반영 실패 — 정책 확인"); setAcking(false); return; }
    setReadIds((prev) => { const n = new Set(prev); for (const a of list) n.add(a.id); return n; });
    setErr("");
    setAcking(false);
  };
```
→
```js
      const rows = list.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
      const { error } = await supabase
        .from("announcement_read")
        .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
        .select();
      if (error) { setErr("확인 반영 실패 — 정책 확인"); setAcking(false); return; }
      setReadIds((prev) => { const n = new Set(prev); for (const a of list) n.add(a.id); return n; });
      setErr("");
      setAcking(false);
    } catch {
      setErr("확인 반영 실패 — 정책 확인");
    } finally {
      setAcking(false);
    }
  };
```

---

## 3-c 검증 (스모크)
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- 정상 무회귀: 목표금액·프로필·보유장비/큐·PT패키지·라이브러리·투두 추가·비번변경·급여스킴 저장/삭제·공지 확인 — 각각 성공 시 이전과 동일.
- (선택) 네트워크 차단 후: 각 저장 버튼 재활성 + 실패 안내(무한 로딩/버튼 잠김 아님). 특히 **비번변경 실패 시 앱으로 안 넘어가야**(onDone 미호출), **공지 "확인했습니다"가 다시 눌리는지**(게이트 잠김 해제).

## 커밋 제안(대수가 직접)
- `fix(hang): 설정류 저장 경로 try·finally 스윕(3-c) — 목표/프로필/장비/패키지/라이브러리/투두/비번/급여/공지`
