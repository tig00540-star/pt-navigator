"use client";
/* 트레이너 읽기 전용 — 회원 자가입력 유산소(cardio_log) 요약. 최근 10건 + 이번 주 합계(분).
   쓰기 없음(회원 소유 데이터). 트레이너 select 정책(user_table account 조인)으로 자기 회원만 조회.
   기록 0건·데모(키 없음)면 섹션 자체 숨김(잡음 방지). */
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Card from "@/components/ui/Card";

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

// 이번 주(월~일) 합계 분 — 로컬 기준. performed_on(date)만 사용.
function weekMinutes(rows) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 월=0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  return rows.reduce((sum, r) => {
    if (r.minutes == null) return sum;
    const d = new Date(r.performed_on);
    return d >= monday ? sum + r.minutes : sum;
  }, 0);
}

export default function MemberCardioSummary({ member }) {
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
        .from("cardio_log")
        .select("*")
        .eq("user_id", member.id)
        .order("performed_on", { ascending: false })
        .limit(10);
      if (cancelled) return;
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  if (!supabase) return null;                 // 데모: 유산소는 회원 입력이라 트레이너 데모 데이터 없음
  if (!loading && rows.length === 0) return null; // 기록 없으면 섹션 숨김

  const wk = weekMinutes(rows);

  return (
    <Card as="section">
      <Eyebrow icon={Activity}>유산소 기록</Eyebrow>
      {wk > 0 && <div className="mt-1 text-xs font-semibold text-primary-strong">이번 주 합계 {wk}분</div>}
      {loading ? (
        <p className="mt-2 text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 font-medium text-sub">{fmtDay(c.performed_on)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {c.kind || "유산소"}
                {c.note ? <span className="text-muted"> · {c.note}</span> : null}
              </span>
              {c.minutes != null && <span className="shrink-0 font-mono font-semibold text-ink">{c.minutes}분</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
