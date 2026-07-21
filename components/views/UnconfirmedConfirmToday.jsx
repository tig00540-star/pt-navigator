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

   조회 전용(write 0) · 새 테이블/마이그레이션 없음. PastDueAppointments 골격 재사용.
   ========================================================================= */
import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
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

export default function UnconfirmedConfirmToday({ members, uid, onSelect }) {
  // rows: [{ user_id, count, start_at }] — 오늘 예약 있고 미확인 수업 있는 회원.
  const [rows, setRows] = useState([]);

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
        const memberIds = [...firstStart.keys()];
        if (!memberIds.length) { if (!cancelled) setRows([]); return; }

        // ② 이 회원들의 수업로그 + 확인(confirm)만. 소수(.in) 조회라 fetchAllRows 불필요.
        const [{ data: ls }, { data: cf }] = await Promise.all([
          supabase.from("daily_workout_log")
            .select("id, user_id, session_at, created_at, voided, source")
            .in("user_id", memberIds),
          supabase.from("workout_log_confirmation")
            .select("log_id")
            .eq("result", "confirm")
            .in("member_id", memberIds),
        ]);
        if (cancelled) return;

        const confirmed = new Set((cf || []).map((c) => c.log_id));
        const today = todayStr;
        const counts = new Map();
        for (const l of ls || []) {
          // §1 미확인 정의(회원 게이트와 동일): 확인 대상 실수업 + 오늘 이전(유예) + confirm 없음.
          if (l.voided === true) continue;                       // coalesce(voided,false)=false
          if ((l.source ?? "") === "noshow") continue;           // coalesce(source,'')<>'noshow'
          if (ymdKST(l.session_at ?? l.created_at) >= today) continue; // 오늘 수업은 유예
          if (confirmed.has(l.id)) continue;                     // 이미 회원 확인함
          counts.set(l.user_id, (counts.get(l.user_id) || 0) + 1);
        }

        const out = [];
        for (const id of memberIds) {
          const c = counts.get(id) || 0;
          if (c > 0) out.push({ user_id: id, count: c, start_at: firstStart.get(id) });
        }
        setRows(out);
      } catch {
        // 조회 실패 — 초기/이전 상태 유지(P1-8 로딩 가드 · write 없어 교훈1 대상 아님).
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!rows.length) return null;

  const knownName = (id) => members?.find((m) => m.id === id)?.name || "";
  // 명단 밖(숨김·환불) 회원은 muted "이름 미상"(PastDueAppointments 패턴 · nested-component lint 회피).
  const nameOfEl = (id) => {
    const n = knownName(id);
    return n ? n : <span className="font-normal not-italic text-muted">이름 미상</span>;
  };
  // 곧 오는 회원부터 — 오늘 예약 시각 이른 순.
  const list = [...rows].sort((a, b) => (a.start_at < b.start_at ? -1 : 1));

  return (
    <ToneCard tone="reapproach">
      <SectionHeader
        tone="reapproach"
        icon={ClipboardCheck}
        title="미확인 수업 확인 요청"
        count={list.length}
        hint="오늘 오는 회원 · 그 자리에서 폰으로 확인받기"
      />
      <div className="grid gap-2">
        {list.map((r) => (
          <ListRow
            key={r.user_id}
            tone="reapproach"
            name={nameOfEl(r.user_id)}
            onClick={() => onSelect(r.user_id)}
          >
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-sub">
              <span>미확인 수업 <b className="text-ot-text">{r.count}건</b></span>
              <span className="text-muted">· 확인 요청</span>
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}
