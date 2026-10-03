"use client";

/* 대표 피드백 — 트레이너가 받는 카드(2026-10-03). 대표가 아침 보고서의 '어제 결과'에 남긴 피드백 중 아직 확인 안 한 것.
   보이는 곳: 폰 홈(오늘 카드 바로 아래 · 편집 목록과 무관하게 있을 때만) · '오늘' 탭 · 넓은 홈.
   '확인했어요' = rpc mark_owner_feedback_seen(트레이너는 본문을 못 고친다 · 확인 표시만). 대표 화면에 '트레이너 확인함'으로 보인다.
   같은 피드백은 그 회원의 다음 OT · 재등록 리포트를 만들 때 AI가 읽는다(app/api/ot-brief).
   ⚠️ 대표 본인도 트레이너로 일하면 RLS상 계정 피드백 전체가 읽히므로 trainer_id = 나 로 거른다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import { hrefForMember } from "@/lib/nav";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";

const KIND_KO = { ot: "OT", rereg: "재등록", new: "신규 등록", other: "" };
const mdKo = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일` : "");

export default function OwnerFeedbackToday({ members = [], uid }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !uid) return;
      const { data, error } = await supabase.from("owner_feedback")
        .select("id, member_id, kind, ref_ymd, body, created_at")
        .eq("trainer_id", uid).is("seen_at", null).order("created_at", { ascending: false }).limit(10);
      if (error) { console.error("대표 피드백 조회 실패", error); return; }
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!rows.length) return null;
  const byId = new Map(members.map((m) => [m.id, m]));

  const seen = async (id) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc("mark_owner_feedback_seen", { fid: id });
      if (error) { console.error("확인 표시 실패", error); return; }
      setRows((r) => r.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ToneCard tone="brand">
      <SectionHeader tone="brand" icon={MessageSquare} title="대표 피드백" count={rows.length} hint="확인하면 사라져요. 그 회원의 다음 리포트에도 반영돼요." />
      <div className="grid gap-2">
        {rows.map((f) => {
          const m = byId.get(f.member_id);
          return (
            <div key={f.id} className="rounded-xl bg-elevate px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-sub">
                {m ? <Link href={hrefForMember(m.id, viewFor(m))} className="text-[15px] font-semibold text-ink no-underline hover:underline">{m.name}</Link> : <span className="text-[15px] font-semibold text-ink">회원</span>}
                <span>{mdKo(f.ref_ymd)} {KIND_KO[f.kind] || ""} 건</span>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">{f.body}</p>
              <button type="button" onClick={() => seen(f.id)} disabled={busy === f.id}
                className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-sub transition hover:text-ink disabled:opacity-60">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> 확인했어요
              </button>
            </div>
          );
        })}
      </div>
    </ToneCard>
  );
}
