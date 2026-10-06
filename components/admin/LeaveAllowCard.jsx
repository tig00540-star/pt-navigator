"use client";

/* 대표 운영 탭 '트레이너 독립 허락'(2026-10-07 · 계획서 3단계).
   트레이너가 센터를 떠나 개인 계정으로 이어 쓸 때, 담당 회원을 데려가도 되는지 대표가 정한다.
   · [회원과 함께 허락] = 담당 회원에게 '기록을 함께 옮길까요?'를 물을 수 있음(동의한 회원만 · 센터엔 정산용 기록만 남음)
   · [회원 없이 허락] = 같은 로그인 · 본인 가격표만(허락이 없어도 트레이너가 스스로 할 수 있는 것과 같음 · 안내용)
   rpc allow_trainer_leave · cancel_leave_allow(대표만) · 목록 = leave_allow(대표 SELECT). 허락은 60일. */

import { useCallback, useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { personName } from "@/lib/format";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const day = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export default function LeaveAllowCard({ trainers = [] }) {
  const [allows, setAllows] = useState(null);
  const [busy, setBusy] = useState("");
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("leave_allow").select("id, trainer_id, with_members, expires_at, used_at, canceled_at").order("created_at", { ascending: false });
    if (error) { console.error("독립 허락 읽기 실패", error); setAllows([]); return; }
    const now = Date.now();
    setAllows((data || []).map((a) => ({ ...a, live: !a.used_at && !a.canceled_at && Date.parse(a.expires_at) > now })));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const staff = trainers.filter((t) => t.role === "trainer" && t.active !== false);
  if (allows === null || staff.length === 0) return null;

  const allow = async (t, withMembers) => {
    setBusy(t.id);
    const { error } = await supabase.rpc("allow_trainer_leave", { p_trainer: t.id, p_with_members: withMembers });
    setBusy("");
    if (error) { console.error("독립 허락 실패", error); showToast("저장하지 못했어요. 대표만 할 수 있어요."); return; }
    showToast(`${personName(t.name)} 트레이너에게 ${withMembers ? "회원과 함께 " : ""}독립을 허락했어요`);
    load();
  };
  const cancel = async (a) => {
    setBusy(a.trainer_id);
    const { error } = await supabase.rpc("cancel_leave_allow", { p_id: a.id });
    setBusy("");
    if (error) { console.error("허락 끄기 실패", error); showToast("끄지 못했어요. 다시 시도해 주세요."); return; }
    showToast("허락을 껐어요");
    load();
  };

  return (
    <Card padding="lg">
      <SectionTitle icon={DoorOpen}>트레이너 독립 허락</SectionTitle>
      <p className="m-0 text-[14px] leading-relaxed text-sub">
        트레이너가 센터를 떠나도 같은 로그인으로 개인 계정을 이어 쓸 수 있어요. <b className="text-ink">담당 회원을 데려가려면 대표 허락</b>이 필요하고, 회원이 동의한 경우에만 옮겨져요. 센터에는 그 회원 계약의 금액 · 날짜만 정산용으로 남아요.
      </p>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {staff.map((t) => {
          const a = allows.find((x) => x.trainer_id === t.id && x.live);
          const used = allows.find((x) => x.trainer_id === t.id && x.used_at);
          return (
            <li key={t.id} className="rounded-xl bg-elevate px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-ink">{personName(t.name)}</span>
                <span className="text-[13px] text-sub">{a ? `${a.with_members ? "회원과 함께" : "회원 없이"} 허락 · ${day(a.expires_at)}까지` : used ? "독립함" : "허락 안 함"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a ? (
                  <button type="button" disabled={busy === t.id} onClick={() => cancel(a)} className="min-h-[36px] rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-sub disabled:opacity-50">허락 끄기</button>
                ) : (
                  <>
                    <button type="button" disabled={busy === t.id} onClick={() => allow(t, true)} className="min-h-[36px] rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-ink disabled:opacity-50">회원과 함께 허락</button>
                    <button type="button" disabled={busy === t.id} onClick={() => allow(t, false)} className="min-h-[36px] rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-sub disabled:opacity-50">회원 없이 허락</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Toast message={toast} />
    </Card>
  );
}
