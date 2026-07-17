"use client";
/* 트레이너 읽기 전용 — 회원 자가입력 운동 스케줄(schedule_check) 요약. 최근 20건 + 이번 달 합계.
   쓰기 없음(회원 소유). 트레이너 select 정책(account 조인)으로 자기 회원만.
   기록 0건·데모(키 없음)면 섹션 자체 숨김. M1 MemberCardioSummary 패턴. */
import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";

const SCHEDULE_KINDS = { personal: "개인운동", pt: "PT" };

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

// 이번 달(로컬) 구분별 횟수. on_date(date)만 사용.
function monthCounts(rows) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  let personal = 0, pt = 0;
  for (const r of rows) {
    const d = new Date(r.on_date);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    if (r.kind === "personal") personal += 1;
    else if (r.kind === "pt") pt += 1;
  }
  return { personal, pt };
}

export default function MemberScheduleSummary({ member }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // 회원 변경 시 조회. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("schedule_check")
        .select("*")
        .eq("user_id", member.id)
        .order("on_date", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  if (!supabase) return null;                 // 데모: 스케줄은 회원 입력이라 트레이너 데모 데이터 없음
  if (!loading && rows.length === 0) return null; // 기록 없으면 섹션 숨김

  const mc = monthCounts(rows);

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <Eyebrow icon={CalendarCheck}>운동 스케줄</Eyebrow>
      {(mc.personal > 0 || mc.pt > 0) && (
        <div className="mt-1 text-xs font-semibold text-primary-strong">
          이번 달 개인운동 {mc.personal}회 · PT {mc.pt}회
        </div>
      )}
      {loading ? (
        <p className="mt-2 text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 font-medium text-sub">{fmtDay(s.on_date)}</span>
              <span
                className={
                  s.kind === "personal"
                    ? "shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary-strong"
                    : "shrink-0 rounded-md bg-elevate px-1.5 py-0.5 text-[11px] font-semibold text-sub"
                }
              >
                {SCHEDULE_KINDS[s.kind] || s.kind}
              </span>
              {s.note && <span className="min-w-0 flex-1 truncate text-ink">{s.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
