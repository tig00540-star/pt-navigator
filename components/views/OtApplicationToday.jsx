"use client";

/* 새 OT 회원 알림(2026-10-06) — OT 신청서(QR · 링크)로 나에게 온 회원.
   · 내 QR로 신청 → 바로 내 OT 회원 · 센터 QR → 대표가 나에게 배정.
   · 같은 번호의 기존 회원이 다시 신청하면 새로 만들지 않고 그 회원에 연결(원하는 시간만 갱신) — '다시 신청'으로 표시.
   누르면 그 회원 OT 화면 + 알림 확인(rpc mark_ot_application_seen) · '확인했어요'만 눌러도 사라진다.
   조회 = ot_application(내 담당 · 확인 안 한 것). 폰 홈(오늘 카드 아래) · '오늘' 탭 맨 위 · 넓은 홈. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { hrefForMember } from "@/lib/nav";
import { formatSlots } from "@/lib/slots";
import { useMembers } from "@/components/app/MembersProvider";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m || 1}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

export default function OtApplicationToday({ uid }) {
  const router = useRouter();
  const { members, loadMembers } = useMembers();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!supabase || !uid) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("ot_application")
        .select("id, member_id, duplicate_of, source, name, slots, created_at, assigned_at")
        .eq("trainer_id", uid).eq("status", "assigned").is("seen_at", null)
        .order("created_at", { ascending: false }).limit(20);
      if (error) { console.error("새 OT 회원 알림 읽기 실패", error); return; }
      if (alive) setRows(data || []);
    })();
    return () => { alive = false; };
  }, [uid]);

  // 방금 생긴 회원이 회원 목록에 아직 없으면 한 번 다시 불러온다(목록 · 회원 화면이 바로 열리게).
  const missing = rows.some((r) => r.member_id && !members.some((m) => m.id === r.member_id));
  useEffect(() => { if (missing) loadMembers?.(); }, [missing, loadMembers]);

  if (!rows.length) return null;

  const seen = async (r) => {
    setRows((p) => p.filter((x) => x.id !== r.id));
    const { error } = await supabase.rpc("mark_ot_application_seen", { p_app: r.id });
    if (error) console.error("알림 확인 실패", error);
  };
  const open = (r) => { seen(r); if (r.member_id) router.push(hrefForMember(r.member_id, "ot")); };

  return (
    <ToneCard tone="brand">
      <SectionHeader tone="brand" icon={UserPlus} title="새 OT 회원" count={rows.length}
        hint="OT 신청서로 들어왔어요. 원하는 시간을 보고 첫 OT를 잡아 주세요" />
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-stretch gap-2 rounded-xl bg-elevate">
            <button type="button" onClick={() => open(r)} className="min-w-0 flex-1 px-3.5 py-2.5 text-left">
              <div className="text-[15px] font-semibold text-ink">{r.name}
                <span className="ml-1.5 text-[12.5px] font-normal text-sub">
                  {r.duplicate_of ? "이미 있는 회원이 다시 신청" : r.source === "center" ? "대표가 배정" : "내 QR로 신청"} · {ago(r.assigned_at || r.created_at)}
                </span>
              </div>
              <div className="mt-0.5 text-[13px] text-sub">{formatSlots(r.slots) ? `원하는 시간 · ${formatSlots(r.slots)}` : "원하는 시간은 안 남겼어요"}</div>
            </button>
            <button type="button" onClick={() => seen(r)} className="shrink-0 px-3 text-[13px] font-semibold text-sub hover:text-ink">확인</button>
          </div>
        ))}
      </div>
    </ToneCard>
  );
}
