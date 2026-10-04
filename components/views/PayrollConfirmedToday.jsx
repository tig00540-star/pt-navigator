"use client";

/* 급여 확정 알림(2026-10-06) — 대표가 내 급여를 확정하면 트레이너 홈 · '오늘' · 넓은 홈에 카드로 뜬다.
   '확인했어요' = rpc mark_payroll_seen(본인 행만 · 트레이너는 금액을 고칠 수 없음). 대표가 다시 확정하면 다시 뜬다(seen_at 초기화).
   표(seen_at)가 없거나(SQL 전) 확인 전 행이 없으면 숨김. 폰 알림(웹 푸시)은 알림 기능을 붙일 때 같은 자리에서 보낸다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";

// 짧은 격려 한 줄 — 달마다 바뀐다(같은 달은 늘 같은 문장).
const CHEERS = [
  (m) => `${m}월 한 달 동안 정말 고생 많으셨어요!`,
  (m) => `${m}월에도 회원들 몸을 바꿔 주셔서 고마워요. 고생 많으셨어요!`,
  (m) => `${m}월도 꾸준히 달려 주셔서 고마워요!`,
  (m) => `${m}월 수업 하나하나가 쌓여 만든 결과예요. 고생하셨어요!`,
  (m) => `바쁜 ${m}월이었죠. 푹 쉬고 다음 달도 힘내요!`,
  (m) => `트레이너님 덕분에 ${m}월도 센터가 잘 돌아갔어요. 고생 많으셨어요!`,
];
const cheerOf = (ym) => CHEERS[(Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7))) % CHEERS.length](Number(ym.slice(5, 7)));

export default function PayrollConfirmedToday({ uid }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !uid) return;
      const { data, error } = await supabase.from("payroll_run").select("id, ym, final_total, updated_at")
        .eq("trainer_id", uid).not("final_total", "is", null).is("seen_at", null).order("ym", { ascending: false }).limit(3);
      if (error) { if (error.code !== "42703") console.error("급여 확정 조회 실패", error); return; } // 42703 = seen_at 칸 없음(SQL 전)
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!rows.length) return null;

  const seen = async (id) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc("mark_payroll_seen", { rid: id });
      if (error) { console.error("급여 확인 실패", error); return; }
      setRows((p) => p.filter((r) => r.id !== id));
    } finally { setBusy(null); }
  };

  return (
    <ToneCard tone="brand">
      <SectionHeader tone="brand" icon={Wallet} title="급여가 확정됐어요" count={rows.length} hint="대표님이 확정한 금액이에요. 자세한 내역은 '내 실적'에서 봐요." />
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-elevate px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">{Number(r.ym.slice(5))}월 급여</div>
              <div className="mt-0.5 font-mono text-[17px] font-bold text-primary-strong">{won(r.final_total)}</div>
              <div className="mt-1 text-[13px] text-sub">{cheerOf(r.ym)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/stats" className="text-[13px] font-semibold text-sub hover:text-ink">내역</Link>
              <button type="button" onClick={() => seen(r.id)} disabled={busy === r.id}
                className="min-h-[36px] rounded-lg bg-card px-3 text-[13px] font-semibold text-ink shadow-sm disabled:opacity-50">
                {busy === r.id ? "…" : "확인했어요"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToneCard>
  );
}
