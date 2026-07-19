# v2 스펙 — 큐3 배치 3-d (조회 경로) · 로드 hang·조용한 실패 방지

> 프레임워크는 `docs/v2-스펙-큐3-...-프레임워크+3a.md`. 3-d는 **저장(V1)과 다른 조회용 표준 패턴**을 별도 정의(아래 [L1]).
> 원칙: 표시단 방어만·additive·무회귀. 라인번호 아님 코드 내용 매칭. 환경/커밋 동일(PowerShell 구버전, `npm.cmd run build`/`lint`).
> 대상: **9개 사이트 / 8파일**. 커밋 단위: **3-d 전체 1커밋**.

## 무엇을 막나
로드 `useEffect`(또는 `loadMembers`)가 `setLoading(true)` 후 `await`에서 throw하면 catch가 없어 **무한 "불러오는 중…"** 에 고착되거나(스피너형), 로딩 플래그가 없으면 **데이터가 조용히 비어** 실패가 안 보인다(조용한 실패형). `loadMembers`는 후자라 저장 후 재조회 실패 시 목록이 옛 상태로 되돌아 보인다.

## [L1] 조회용 표준 패턴 (한 번만 정의)
```
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (<데모/전제 가드>) { <기존 처리>; return; }   // 동기 → try 밖 그대로
    setLoading(true);                                // (로딩 플래그 있으면)
    try {
      <기존 await · cancelled 가드 · setter · setLoading(false) 전부 그대로>
    } catch {
      // 조회 실패 — finally에서 로딩만 해제(스피너 고착 방지). [에러상태 있으면 여기서 표기]
    } finally {
      if (!cancelled) setLoading(false);             // (로딩 플래그 있는 경우만)
    }
  })();
  return () => { cancelled = true; };
}, [deps]);
```
**저장(V1)과의 차이(핵심):**
1. finally/catch의 setState는 **`if (!cancelled)` 가드** — effect는 언마운트 cleanup으로 `cancelled=true`가 되므로 언마운트 후 setState 회피(교훈: 로드는 회원 전환·탭 이동으로 자주 언마운트됨).
2. 성공콜백·return 오인 이슈 없음(조회는 부수효과가 setter뿐).
3. **로딩 플래그 없는 조회**(AnnouncementGate)는 finally 없이 catch에서 `setErr`만. **`loadMembers`는 effect가 아니라 함수**라 `cancelled` 없음 → 가드 불필요, catch에서 `setDbNote`.
4. catch가 비어 보여도 finally가 실질 처리 → **catch 안에 주석 1줄**을 둬 `no-empty` lint 회피(주석 있는 블록은 `no-empty` 예외).

## [3] 착수 전 대조 · 이탈 중단
```
rg -n "setLoading\(true\)|loadMembers|let cancelled" app/page.jsx components/views/MyStats.jsx components/views/PTView.jsx components/views/ChurnRiskToday.jsx components/views/ScheduleBoard.jsx components/tabs/SecondOTTab.jsx components/views/PtInbodyTab.jsx components/AnnouncementGate.jsx
```
각 사이트 형태가 아래와 다르면 고치지 말고 멈추고 보고.

---

## 3-d-1. `app/page.jsx` · `loadMembers` (함수 · 조용한 실패 특례)
`dbNote` 상태(로딩 플래그·cancelled 없음). try는 데모 가드 뒤·select 앞. **catch에서 `setDbNote` 안내**(§4 특례: 실패 시 목록이 조용히 비지 않게).
이 데모 가드 **아래에** `try {`:
```js
    if (!supabase) {
      setDbNote("데모 모드 — Supabase 키를 설정하면 실데이터가 연결됩니다.");
      return;
    }
```
꼬리 교체:
```js
    const { data, error } = await supabase
      .from("user_table")
      .select("*")
      .eq("hidden", false)                       // 소프트 삭제(환불) 회원 제외
      .order("created_at", { ascending: false });
    if (error) {
      setDbNote("불러오기 실패: " + error.message);
      return;
    }
    const mapped = (data || []).map(mapMemberRow);
    setMembers(mapped);
    setDbNote("");
    setSelectedId((prev) => prev ?? (mapped[0] ? mapped[0].id : null));
  };
```
→
```js
    try {
      const { data, error } = await supabase
        .from("user_table")
        .select("*")
        .eq("hidden", false)                       // 소프트 삭제(환불) 회원 제외
        .order("created_at", { ascending: false });
      if (error) {
        setDbNote("불러오기 실패: " + error.message);
        return;
      }
      const mapped = (data || []).map(mapMemberRow);
      setMembers(mapped);
      setDbNote("");
      setSelectedId((prev) => prev ?? (mapped[0] ? mapped[0].id : null));
    } catch {
      setDbNote("회원 목록을 불러오지 못했어요 — 잠시 후 새로고침 해주세요.");
    }
  };
```
- finally 없음(끌 로딩 플래그 없음). 기존 `error.message` 노출은 §6-2 별건 — 그대로. 새 catch만 일반 문구.

---

## 3-d-2. `components/views/MyStats.jsx` · 로드 effect
`loading`/`setLoading`. 데모 가드(`if(!supabase){setLoading(false);return;}`) 뒤·`auth.getUser` 앞.
이 줄 **아래에** `try {`:
```js
      if (!supabase) { setLoading(false); return; }
```
꼬리 교체 — 기존 본문의 마지막(`setLoading(false);`)과 IIFE 닫힘 사이:
```js
      setContractNames(names);
      setLoading(false);
    })();
```
→
```js
      setContractNames(names);
      setLoading(false);
    } catch {
      // 조회 실패 — finally에서 로딩 해제(무한 스피너 방지). MyStats는 별도 에러 표시 없음(빈 통계로 degrade).
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
```
(중간 `if(cancelled)return`·모든 setter 그대로 try 안.)

---

## 3-d-3. `components/views/PTView.jsx` · 로드 effect
`loading`/`setLoading`. 전제 가드(`if(!supabase||!member?.id){...return;}`)·`setLoading(true)` 뒤·Promise.all 앞.
이 줄 **아래에** `try {`:
```js
      setLoading(true);
```
꼬리 교체:
```js
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*").eq("user_id", member.id),
        supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
      ]);
      if (cancelled) return;
      setContracts(cs || []);
      setLogs(ls || []);
      setLoading(false);
    })();
```
→
```js
      try {
        const [{ data: cs }, { data: ls }] = await Promise.all([
          supabase.from("session_log").select("*").eq("user_id", member.id),
          supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
        ]);
        if (cancelled) return;
        setContracts(cs || []);
        setLogs(ls || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
```

---

## 3-d-4. `components/views/ChurnRiskToday.jsx` · 로드 effect
`loading`/`setLoading`. 데모 가드(`if(!supabase)return;`)·`setLoading(true)` 뒤·Promise.all 앞.
이 줄 **아래에** `try {`:
```js
      setLoading(true);
```
꼬리 교체:
```js
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("session_log").select("*"),
        supabase.from("daily_workout_log").select("user_id, session_at, created_at, voided, source"),
      ]);
      if (cancelled) return;
      setContracts(cs || []);
      setLogs(ls || []);
      setLoading(false);
    })();
```
→
```js
      try {
        const [{ data: cs }, { data: ls }] = await Promise.all([
          supabase.from("session_log").select("*"),
          supabase.from("daily_workout_log").select("user_id, session_at, created_at, voided, source"),
        ]);
        if (cancelled) return;
        setContracts(cs || []);
        setLogs(ls || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제(위젯은 빈 채로 숨김 degrade).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
```

---

## 3-d-5. `components/views/ScheduleBoard.jsx` · 예약 로드 effect
`loading`/`setLoading`. 데모 가드(`if(!supabase){if(!cancelled)setAppts([]);return;}`)·`setLoading(true)` 뒤·select 앞.
이 줄 **아래에** `try {`:
```js
      setLoading(true);
```
꼬리 교체:
```js
      const { data } = await supabase
        .from("appointment")
        .select("*")
        .gte("start_at", weekStart.toISOString())
        .lt("start_at", weekEnd.toISOString())
        .neq("status", "canceled");
      if (cancelled) return;
      setAppts(data || []);
      setLoading(false);
    })();
```
→
```js
      try {
        const { data } = await supabase
          .from("appointment")
          .select("*")
          .gte("start_at", weekStart.toISOString())
          .lt("start_at", weekEnd.toISOString())
          .neq("status", "canceled");
        if (cancelled) return;
        setAppts(data || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제(무한 스피너 방지).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
```
- **참고(범위 밖·선택):** 같은 파일의 트레이너 목록 effect(`supabase.from("trainer").select("id, name")`)는 로딩 플래그가 없어 hang 대상 아님(라벨용 보조 조회). 원하면 같은 패턴으로 catch만 얹을 수 있으나 이번 필수 아님.

---

## 3-d-6. `components/tabs/SecondOTTab.jsx` · 브리핑/관찰 로드 effect
`loading`/`setLoading`. `if(!canAI){...return;}` 전제 가드·`setLoading(true)` 뒤. 이 effect는 **await가 여러 곳**(round-1/2 Promise.all + D-3 케이스 조회)이라 본문 전체를 감싼다. `setLoading(false)`는 중간(Promise.all 뒤)에 이미 있으므로 finally는 안전망.
이 줄 **아래에** `try {`:
```js
      setLoading(true);
```
꼬리 교체 — IIFE 본문 끝(마지막 `else if (!cancelled)` 블록)과 `})();` 사이:
```js
      } else if (!cancelled) {
        setCaseGate({ on: false, tier: "off" });
        setCaseData([]);
      }
    })();
```
→
```js
      } else if (!cancelled) {
        setCaseGate({ on: false, tier: "off" });
        setCaseData([]);
      }
    } catch {
      // 조회 실패 — finally에서 로딩 해제. 부분(케이스) 실패는 해당 섹션 빈 채로 degrade.
    } finally {
      if (!cancelled) setLoading(false);
    }
    })();
```
- 사이 본문(setBrief(null)·Promise.all·`if(cancelled)return`·중간 `setLoading(false)`·프리필 setter·D-3 `await`들) 전부 그대로 try 안. 들여쓰기는 유지해도 무방.

---

## 3-d-7. `components/views/PtInbodyTab.jsx` · 이력 로드 effect
`loading`/`setLoading`. 전제 가드(`if(!supabase||!member?.id){if(!cancelled){setRows([]);setLoading(false);}return;}`)·`setLoading(true)` 뒤·select 앞.
이 줄 **아래에** `try {`:
```js
      setLoading(true);
```
꼬리 교체:
```js
      const { data } = await supabase
        .from("inbody_log")
        .select("*")
        .eq("user_id", member.id)
        .order("measured_at", { ascending: false });
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
```
→
```js
      try {
        const { data } = await supabase
          .from("inbody_log")
          .select("*")
          .eq("user_id", member.id)
          .order("measured_at", { ascending: false });
        if (cancelled) return;
        setRows(data || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
```

---

## 3-d-8. `components/AnnouncementGate.jsx` · 공지 fetch effect (로딩 플래그 없음 · setErr)
로딩 플래그 없음 → **finally 없이 catch에서 `setErr`**. 전제 가드(`if(!supabase||!uid)return;`)는 effect 최상단(IIFE 밖)이라 그대로. try는 IIFE 안 Promise.all 전체.
이 IIFE 본문 교체:
```js
    (async () => {
      const [a, r] = await Promise.all([
        supabase.from("announcement").select("*"),
        supabase.from("announcement_read").select("announcement_id"),
      ]);
      if (cancelled) return;
      setAnns(a.data || []);
      setReadIds(new Set((r.data || []).map((x) => x.announcement_id)));
    })();
```
→
```js
    (async () => {
      try {
        const [a, r] = await Promise.all([
          supabase.from("announcement").select("*"),
          supabase.from("announcement_read").select("announcement_id"),
        ]);
        if (cancelled) return;
        setAnns(a.data || []);
        setReadIds(new Set((r.data || []).map((x) => x.announcement_id)));
      } catch {
        if (!cancelled) setErr("공지를 불러오지 못했어요 — 새로고침 해주세요.");
      }
    })();
```
- **가시성 한계 명시(§7):** `err`는 게이트 오버레이 안에서만 렌더되므로, 공지 fetch가 실패해 `anns`가 비면 오버레이 자체가 안 떠 이 문구가 안 보일 수 있다. 그래도 wrap의 실익은 **미처리 rejection 방지 + 로그 흔적**. 근본 가시화(항상 보이는 배너)는 §7 후속. 이번엔 최소 방어까지만.

---

## 3-d-9. `components/AnnouncementGate.jsx` · 재열람 auto-ack effect (로딩 플래그 없음 · setErr)
로딩 플래그 없음. 전제 가드(`if(!reviewOpen||!supabase)return;`)·`if(!unread.length)return;`는 그대로. try는 rows/upsert 감싼다. catch에서 `setErr`.
이 IIFE 본문 교체:
```js
    (async () => {
      const unread = unreadAnnouncements(anns, readIds, uid).filter((a) => !a.must_ack);
      if (!unread.length) return;
      const rows = unread.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
      const { error } = await supabase
        .from("announcement_read")
        .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
        .select();
      if (cancelled) return;
      if (error) { setErr("확인 반영 실패 — 정책 확인"); return; }
      setReadIds((prev) => { const n = new Set(prev); for (const a of unread) n.add(a.id); return n; });
    })();
```
→
```js
    (async () => {
      const unread = unreadAnnouncements(anns, readIds, uid).filter((a) => !a.must_ack);
      if (!unread.length) return;
      const rows = unread.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
      try {
        const { error } = await supabase
          .from("announcement_read")
          .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
          .select();
        if (cancelled) return;
        if (error) { setErr("확인 반영 실패 — 정책 확인"); return; }
        setReadIds((prev) => { const n = new Set(prev); for (const a of unread) n.add(a.id); return n; });
      } catch {
        if (!cancelled) setErr("확인 반영 실패 — 정책 확인");
      }
    })();
```
- `unread`/`rows` 계산은 동기라 try 밖 유지(가독성). await(upsert)만 감싼다.

---

## 3-d 검증 (스모크)
- `npm.cmd run build` / `npm.cmd run lint` 초록.
- 정상 무회귀: 회원목록·MyStats 통계·PT뷰(계약/로그)·오늘탭 이탈위험·주간 스케줄·2차 브리핑·인바디 이력·공지 — 각각 정상 로드 그대로.
- (선택) 네트워크 차단 후 각 화면 진입: **무한 "불러오는 중…"이 아니라 빈 상태로 degrade**(스피너 해제). 특히 **loadMembers 실패 시 목록이 조용히 비지 않고 `dbNote` 안내**가 떠야 함(저장 후 재조회 실패 케이스 포함).

## 커밋 제안(대수가 직접)
- `fix(hang): 조회 경로 try·catch 스윕(3-d) — 로드 스피너 고착·조용한 실패 방지(회원목록/통계/PT뷰/이탈/스케줄/2차OT/인바디/공지)`

---

## 큐3 전체 종료
3-a(고위험 저장/확정) · 3-b(중간 저장) · 3-c(설정류 저장) · 3-d(조회) 로 **리포트 §4 hang/조용한 실패 경로 스윕 완료.** 남은 다음 작업 큐(핸드오프 기준): §5 성능(ChurnRiskToday useMemo·관리자 대시보드 월범위), §3-3 `DEMO_MODE=1` 옵트인, §6-3 마이그레이션 기록본 백필, 나중 정리(motion 제거·아이콘 압축·중복헬퍼).
