"use client";
/* 오운완 랭킹 — 내 실적 탭. 회원별 오운완 집계를 횟수/연속일로 정렬해 보여준다.
   자기완결: rpc("ounwan_ranking") 1콜(account 스코프 서버 집계). 데모/0건 숨김. ChurnRiskToday 골격 미러.

   ⚠️ raw 테이블 무필터 조회 금지 — 서버가 집계행만 반환하므로 max-rows(1000) 잘림과 무관하다.
      클라에서 daily_workout_log 등을 직접 긁으면 1000행에서 조용히 잘려 순위가 틀린다(오운완 초안 버그).
   ⚠️ 회원앱엔 노출 금지(트레이너 전용). 회원은 자기 진행률만 본다 — 하위권 사기저하 방지. */
import { useEffect, useMemo, useState } from "react";
import { Flame, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import MemberBadge from "@/components/ui/MemberBadge";
import { viewFor } from "@/lib/memberStatus";

const TOP_N = 10; // 상위 N명만 — 목록이 길어지면 '실적' 화면의 초점이 흐려진다

/* 정렬 기준 — 정적 맵(purge-safe · 동적 조립 금지).
   순수 횟수는 고빈도 회원이 유리하므로 연속일 뷰를 함께 제공(빈도 낮아도 1등 가능). */
const MODES = {
  month:  { label: "이번달 횟수", key: "month_count", unit: "회" },
  streak: { label: "연속일",      key: "streak",      unit: "일" },
};

export default function OunwanRanking({ members = [], onSelect }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("month");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return; // 데모: 집계 없음 → 위젯 숨김
      setLoading(true);
      try {
        const { data } = await supabase.rpc("ounwan_ranking");
        if (cancelled) return;
        setRows(data || []);
      } catch {
        // 조회 실패 — finally에서 로딩 해제(위젯은 빈 채로 숨김 degrade).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 이름 매핑 + 선택 기준 내림차순. 훅은 early return 앞에.
  const ranked = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const k = MODES[mode].key;
    return rows
      .map((r) => ({ ...r, member: byId.get(r.user_id) }))
      .filter((r) => r.member)          // 목록에 없는 회원(hidden 등)은 제외
      .filter((r) => (r[k] ?? 0) > 0)   // 0인 회원은 순위에 안 넣음(빈 줄만 늘어남)
      .sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0))
      .slice(0, TOP_N);
  }, [rows, members, mode]);

  if (!supabase) return null;
  if (loading || ranked.length === 0) return null;

  const unit = MODES[mode].unit;
  const k = MODES[mode].key;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow icon={Flame}>오운완 랭킹</Eyebrow>
        {/* 기준 토글 — 선택/비선택 클래스는 완성된 문자열 삼항(동적 조립 금지) */}
        <div className="mb-4 flex shrink-0 gap-1">
          <button
            onClick={() => setMode("month")}
            className={mode === "month"
              ? "rounded-lg bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-strong ring-1 ring-primary/30"
              : "rounded-lg bg-elevate px-2.5 py-1 text-[11px] font-medium text-muted"}
          >
            {MODES.month.label}
          </button>
          <button
            onClick={() => setMode("streak")}
            className={mode === "streak"
              ? "rounded-lg bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-strong ring-1 ring-primary/30"
              : "rounded-lg bg-elevate px-2.5 py-1 text-[11px] font-medium text-muted"}
          >
            {MODES.streak.label}
          </button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {ranked.map((r, i) => (
          <li key={r.user_id}>
            <button
              onClick={() => onSelect?.(r.user_id)}
              disabled={!onSelect}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-elevate px-3 py-2.5 text-left transition hover:border-primary disabled:hover:border-line"
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs font-bold text-muted">{i + 1}</span>
              <span className="truncate text-sm font-semibold text-ink">{r.member.name}</span>
              <MemberBadge view={viewFor(r.member)} />
              <span className="ml-auto shrink-0 text-sm font-extrabold text-primary-strong">
                {r[k]}<span className="ml-0.5 text-[11px] font-bold text-muted">{unit}</span>
              </span>
              {onSelect && <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
            </button>
          </li>
        ))}
      </ul>

      {/* 한 줄로 유지 — 390px 폰에서 이 자리의 가용 폭은 316px인데 원래 문구는 373px이라
          "요."만 둘째 줄로 넘어가 여백만 잡아먹었다. 뒤 문장("회원에게는 자기 진행률만 보여요")을
          덜어 정의만 남긴다. 둘 다 넣으려면 315px까지 줄여야 하는데 여유가 1px이라,
          폰트가 폴백(맑은 고딕, 약 16% 넓음)으로 잡히는 순간 다시 두 줄이 된다.
          nowrap은 일부러 안 건다 — 기기 글자 크기를 키운 사용자에겐 줄바꿈이 안전밸브다. */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        오운완 = 유산소·개인운동·PT 중 하나라도 기록된 날
      </p>
    </section>
  );
}
