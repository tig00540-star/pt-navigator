"use client";
/* =========================================================================
   할일 파생 위젯 — "미확인 수업 확인 요청": 오늘 스케줄 잡힌 회원 중,
   지난 수업일지에 회원 확인(confirm)이 없는 로그가 남아 있는 사람을 띄운다.
   회원 '이의' 버튼을 제거(반응형→능동형)하며 생기는 "미확인 방치" 구멍을 메운다:
   회원이 오늘 오니 그 자리에서 폰으로 확인받도록 유도한다.

   ★리마인더+진입일 뿐 — 트레이너가 회원 대신 확인할 수 없다(확인은 회원 JWT로만).
     탭하면 그 회원 회원자료(타임라인·미확인 뱃지)가 열리고, 트레이너는
     (a) 회원에게 "폰에서 확인 눌러주세요" 요청(회원앱 소프트 게이트) 하거나
     (b) 안 받은 수업이면 void(수정/삭제) 한다. 위젯 자체엔 확인 버튼이 없다.

   2026-10-06 대표: 예약이 없어도 **수업 뒤 2일 넘게 미확인**이면 띄운다(회원이 페이지를 안 여는 경우 ·
     트레이너가 링크를 다시 보내거나 다음 수업 때 받도록). 대상 = 내 PT 회원(숨김 · 지난 회원 제외 — 지난 회원은 확인 불가).
     조회 범위 = 최근 60일 일지(그보다 오래된 미확인은 다루지 않음 · 조회량 제한).

   조회 전용(write 0) · 새 테이블/마이그레이션 없음. PastDueAppointments 골격 재사용.
   ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchByIds } from "@/lib/fetchByIds";
import { confirmDue } from "@/lib/workoutHash";
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

const STALE_MS = 2 * 86400000;   // 수업 뒤 2일 넘게 미확인 → 예약 없어도 표시
const fmtMd = (iso) => { const d = ymdKST(iso); return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`; };

export default function UnconfirmedConfirmToday({ members, uid, onSelect }) {
  // rows: [{ user_id, count, start_at, oldest }] — 오늘 예약 있고 미확인이 있거나, 2일 넘은 미확인이 있는 회원.
  const [rows, setRows] = useState([]);
  // 내 PT 회원(숨김 · 지난 회원 제외) — 예약 없는 회원도 보려고. 바뀔 때만 다시 조회.
  const ptKey = useMemo(() => (members || []).filter((m) => !m.hidden && m.status === "pt_active").map((m) => m.id).sort().join(","), [members]);

  useEffect(() => {
    if (!supabase || !uid) return; // 데모/스코프 불가 → 초기 [] 유지(카드 미표시 · 라이브 전용, 형제와 결 동일)
    let cancelled = false;
    (async () => {
      try {
        // ① 오늘(KST) booked 예약 → 오늘 오는 회원 집합. appointment RLS는 account 스코프까지만이라
        //    원장은 계정 전체가 넘어옴 → 할일은 내 담당만(trainer_id=uid) — PastDueAppointments와 동일.
        const todayStr = ymdKST(new Date());
        const startMs = new Date(`${todayStr}T00:00:00+09:00`).getTime();
        const startISO = new Date(startMs).toISOString();
        const endISO = new Date(startMs + 86400000).toISOString();
        const { data: appts } = await supabase
          .from("appointment")
          .select("user_id, start_at, status, trainer_id")
          .eq("status", "booked")
          .eq("trainer_id", uid)
          .gte("start_at", startISO)
          .lt("start_at", endISO);

        // 회원별 가장 이른 오늘 예약 시각(정렬용). 예약 없으면 렌더 없음.
        const firstStart = new Map();
        for (const a of appts || []) {
          const prev = firstStart.get(a.user_id);
          if (prev == null || a.start_at < prev) firstStart.set(a.user_id, a.start_at);
        }
        const memberIds = [...new Set([...firstStart.keys(), ...(ptKey ? ptKey.split(",") : [])])];
        if (!memberIds.length) { if (!cancelled) setRows([]); return; }
        const since60 = new Date(Date.now() - 60 * 86400000).toISOString();

        // ② 이 회원들의 수업로그 + 확인(confirm)만. 소수(.in) 조회라 fetchAllRows 불필요.
        // 끝까지(1000행 잘림 방지 · 2026-10-06) — 회원 몇 명의 1년치 일지 · 확인만으로도 1000을 넘는다.
        const [{ data: ls }, { data: cf }] = await Promise.all([
          fetchByIds(supabase, "daily_workout_log", "id, user_id, session_at, created_at, voided, source", "user_id", memberIds, (q) => q.or(`session_at.gte.${since60},and(session_at.is.null,created_at.gte.${since60})`)),   // 수업 날짜 기준 60일
          fetchByIds(supabase, "workout_log_confirmation", "log_id", "member_id", memberIds, (q) => q.eq("result", "confirm").gte("confirmed_at", since60)),
        ]);
        if (cancelled) return;

        const confirmed = new Set((cf || []).map((c) => c.log_id));
        const nowMs = Date.now();
        const counts = new Map();
        const stale = new Map();   // user_id → 2일 넘은 미확인 중 가장 오래된 수업 시각
        for (const l of ls || []) {
          // §1 미확인 정의(회원 게이트와 동일): 확인 대상 실수업 + 수업 1시간 지남 + confirm 없음.
          if (l.voided === true) continue;                       // coalesce(voided,false)=false
          if ((l.source ?? "") === "noshow") continue;           // coalesce(source,'')<>'noshow'
          if (!confirmDue(l, nowMs)) continue;                   // 수업 1시간 뒤부터
          if (confirmed.has(l.id)) continue;                     // 이미 회원 확인함
          counts.set(l.user_id, (counts.get(l.user_id) || 0) + 1);
          const at = l.session_at ?? l.created_at;
          if (Date.parse(at) + STALE_MS <= nowMs && (!stale.has(l.user_id) || at < stale.get(l.user_id))) stale.set(l.user_id, at);
        }

        const out = [];
        for (const id of memberIds) {
          const c = counts.get(id) || 0;
          if (!c) continue;
          const today = firstStart.get(id) ?? null;
          if (today || stale.has(id)) out.push({ user_id: id, count: c, start_at: today, oldest: stale.get(id) ?? null });
        }
        setRows(out);
      } catch {
        // 조회 실패 — 초기/이전 상태 유지(P1-8 로딩 가드 · write 없어 교훈1 대상 아님).
      }
    })();
    return () => { cancelled = true; };
  }, [uid, ptKey]);

  if (!rows.length) return null;

  const knownName = (id) => members?.find((m) => m.id === id)?.name || "";
  // 명단 밖(숨김·환불) 회원은 muted "이름 미상"(PastDueAppointments 패턴 · nested-component lint 회피).
  const nameOfEl = (id) => {
    const n = knownName(id);
    return n ? n : <span className="font-normal not-italic text-muted">이름 미상</span>;
  };
  // 오늘 오는 회원(예약 시각 순) 먼저 → 예약 없는 회원(오래 묵은 순).
  const list = [...rows].sort((a, b) =>
    a.start_at && b.start_at ? (a.start_at < b.start_at ? -1 : 1)
      : a.start_at ? -1 : b.start_at ? 1
      : (a.oldest < b.oldest ? -1 : 1));
  const anyToday = list.some((r) => r.start_at);

  return (
    <ToneCard tone="reapproach">
      <SectionHeader
        tone="reapproach"
        icon={ClipboardCheck}
        title="운동일지 확인 요청"
        count={list.length}
        hint={anyToday ? "오늘 오는 회원은 그 자리에서, 나머지는 회원 전용 페이지 링크를 다시 보내 주세요" : "회원 전용 페이지 링크를 다시 보내거나 다음 수업 때 확인받아 주세요"}
      />
      <div className="grid gap-2">
        {list.map((r) => (
          <ListRow
            key={r.user_id}
            tone="reapproach"
            name={nameOfEl(r.user_id)}
            onClick={() => onSelect(r.user_id)}
          >
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-sub">
              <span>미확인 <b className="text-ot-text">{r.count}건</b></span>
              {r.start_at
                ? <span className="text-muted">· 오늘 {new Date(r.start_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" })} 수업</span>
                : <span className="text-muted">· {fmtMd(r.oldest)} 수업부터</span>}
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
