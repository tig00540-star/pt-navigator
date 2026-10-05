"use client";
/* =========================================================================
   할일 파생 위젯 — "운동일지 확인 요청"(트레이너 '오늘' · 폰 홈 카드 후보).

   2026-10-06 개편(48시간 자동 확인 도입 · 대표 결정):
   ① 회원이 '내용이 달라요'를 누른 일지(맨 위 · 가장 급함) — 자동 확인이 멈춰 있어서 트레이너가
      고치거나(고치면 회원에게 다시 확인) 받지 않은 수업이면 삭제(void)해야 끝난다. 내 PT 회원 · 최근 60일.
   ② 오늘 오는 회원 중 미확인 일지 — 48시간 전이라도 그 자리에서 받으면 회원이 직접 누른 확인이 남는다
      (자동 확인보다 증거로 힘이 세다).
   ※ 옛 '수업 뒤 2일 넘게 미확인'은 자동 확인이 처리하므로 뺐다.

   ★리마인더+진입일 뿐 — 트레이너가 회원 대신 확인할 수 없다(확인은 회원 JWT로만).
   조회 전용(write 0). '열린 이의' 규칙은 lib/workoutHash openDispute 한 곳.
   ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchByIds } from "@/lib/fetchByIds";
import { confirmDue, openDispute } from "@/lib/workoutHash";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

// KST(UTC+9 고정 · DST 없음) 달력일 "YYYY-MM-DD". 회원 게이트(app/m)·오운완 집계와 동일 기준.
function ymdKST(dLike) {
  const t = new Date(dLike).getTime() + 9 * 3600 * 1000;
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const fmtMd = (iso) => { const d = ymdKST(iso); return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`; };
const LOG_COLS = "id, user_id, session_at, created_at, voided, source";

export default function UnconfirmedConfirmToday({ members, uid, onSelect }) {
  // disputes: [{ user_id, log_id, at, note }] · today: [{ user_id, count, start_at }]
  const [data, setData] = useState({ disputes: [], today: [] });
  // 내 PT 회원(숨김 · 지난 회원 제외) — '내용이 달라요'는 예약과 상관없이 본다. 바뀔 때만 다시 조회.
  const ptKey = useMemo(() => (members || []).filter((m) => !m.hidden && m.status === "pt_active").map((m) => m.id).sort().join(","), [members]);

  useEffect(() => {
    if (!supabase || !uid) return; // 데모/스코프 불가 → 카드 미표시
    let cancelled = false;
    (async () => {
      try {
        // ① 오늘(KST) booked 예약(내 담당만 · PastDueAppointments와 동일).
        const todayStr = ymdKST(new Date());
        const startMs = new Date(`${todayStr}T00:00:00+09:00`).getTime();
        const { data: appts } = await supabase
          .from("appointment")
          .select("user_id, start_at")
          .eq("status", "booked")
          .eq("trainer_id", uid)
          .gte("start_at", new Date(startMs).toISOString())
          .lt("start_at", new Date(startMs + 86400000).toISOString());
        const firstStart = new Map();
        for (const a of appts || []) {
          const prev = firstStart.get(a.user_id);
          if (prev == null || a.start_at < prev) firstStart.set(a.user_id, a.start_at);
        }
        const memberIds = [...new Set([...firstStart.keys(), ...(ptKey ? ptKey.split(",") : [])])];
        if (!memberIds.length) { if (!cancelled) setData({ disputes: [], today: [] }); return; }

        // ② 최근 60일(수업 날짜 기준) 일지 + 확인 · 이의. edited_at은 2026-10-06 SQL 뒤에만 있어 없으면 빼고 다시.
        const since60 = new Date(Date.now() - 60 * 86400000).toISOString();
        const win = (q) => q.or(`session_at.gte.${since60},and(session_at.is.null,created_at.gte.${since60})`);
        let lr = await fetchByIds(supabase, "daily_workout_log", `${LOG_COLS}, edited_at`, "user_id", memberIds, win);
        if (lr.error) lr = await fetchByIds(supabase, "daily_workout_log", LOG_COLS, "user_id", memberIds, win);
        const cr = await fetchByIds(supabase, "workout_log_confirmation", "log_id, result, dispute_note, confirmed_at", "member_id", memberIds, (q) => q.gte("confirmed_at", since60));
        if (cancelled) return;

        const confByLog = new Map();
        for (const c of cr.data || []) { const a = confByLog.get(c.log_id) || []; a.push(c); confByLog.set(c.log_id, a); }
        const nowMs = Date.now();
        const disputes = [];
        const counts = new Map();
        for (const l of lr.data || []) {
          if (l.voided === true || (l.source ?? "") === "noshow") continue;
          const cs = confByLog.get(l.id) || [];
          const d = openDispute(l, cs);
          if (d) { disputes.push({ user_id: l.user_id, log_id: l.id, at: l.session_at ?? l.created_at, note: d.dispute_note || "" }); continue; }
          if (!firstStart.has(l.user_id)) continue;                 // 미확인은 오늘 오는 회원만
          if (cs.some((c) => c.result === "confirm") || !confirmDue(l, nowMs)) continue;
          counts.set(l.user_id, (counts.get(l.user_id) || 0) + 1);
        }
        const today = [...counts.entries()].map(([user_id, count]) => ({ user_id, count, start_at: firstStart.get(user_id) }));
        setData({ disputes: disputes.sort((a, b) => (a.at < b.at ? -1 : 1)), today: today.sort((a, b) => (a.start_at < b.start_at ? -1 : 1)) });
      } catch {
        // 조회 실패 — 이전 상태 유지(write 없음).
      }
    })();
    return () => { cancelled = true; };
  }, [uid, ptKey]);

  const { disputes, today } = data;
  if (!disputes.length && !today.length) return null;

  const knownName = (id) => members?.find((m) => m.id === id)?.name || "";
  const nameOfEl = (id) => {
    const n = knownName(id);
    return n ? n : <span className="font-normal not-italic text-muted">이름 미상</span>;
  };
  const time = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });

  return (
    <ToneCard tone={disputes.length ? "danger" : "reapproach"}>
      <SectionHeader
        tone={disputes.length ? "danger" : "reapproach"}
        icon={ClipboardCheck}
        title="운동일지 확인 요청"
        count={disputes.length + today.length}
        hint={disputes.length
          ? "회원이 '내용이 달라요'를 누른 일지는 고치거나, 받지 않은 수업이면 삭제해 주세요"
          : "오늘 오는 회원에게 그 자리에서 확인받아 주세요"}
      />
      <div className="grid gap-2">
        {disputes.map((r) => (
          <ListRow key={r.log_id} tone="danger" name={nameOfEl(r.user_id)} onClick={() => onSelect(r.user_id)}>
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-sub">
              <b className="text-danger-text">내용이 달라요</b> · {fmtMd(r.at)} 수업
              {r.note && <span className="block text-ink">&ldquo;{r.note}&rdquo;</span>}
            </div>
          </ListRow>
        ))}
        {today.map((r) => (
          <ListRow key={r.user_id} tone="reapproach" name={nameOfEl(r.user_id)} onClick={() => onSelect(r.user_id)}>
            <div className="mt-0.5 text-[12.5px] text-sub">
              확인 안 한 일지 <b className="text-ot-text">{r.count}개</b> · 오늘 {time(r.start_at)} 수업
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
