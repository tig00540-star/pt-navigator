"use client";

/* =========================================================================
   지난 회원(status inactive) 화면 — 2026-10-05.
   PT를 끝낸 날 · 회원 전용 페이지 상태(6개월 동안 볼 수만 있음 → 그 뒤 닫힘) · 링크 끄기 · [다시 PT 시작하기].
   다시 시작 = status pt_active(같은 회원 · 기록 그대로 이어짐) + 'PT 종료 처리할까요?' 7일 미루기(새 계약을 적을 시간).
   6개월 판정은 DB(auth_member_id)가 한다 — 여기 날짜는 안내용으로 같은 규칙을 계산만.
   ========================================================================= */

import { useState } from "react";
import { ChevronLeft, UserX, Link2, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toPtActive } from "@/lib/memberStatus";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import MemberAppLink from "@/components/views/MemberAppLink";

const fmtDate = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
const plus6m = (iso) => { const d = new Date(iso); d.setMonth(d.getMonth() + 6); return d; };

export default function InactiveView({ member, onGoList, onMemberPatch }) {
  const [busy, setBusy] = useState(false);
  const { toast, showToast } = useToast();
  const endedAt = member.status_changed_at ? new Date(member.status_changed_at) : null;
  const until = member.status_changed_at ? plus6m(member.status_changed_at) : null;
  // eslint-disable-next-line react-hooks/purity -- 안내 문구용 현재 시각(렌더마다 달라도 무해)
  const closed = until ? until.getTime() < Date.now() : false;

  const restart = async () => {
    if (busy) return;
    const patch = { ...toPtActive(member), pt_end_snooze_until: new Date(Date.now() + 7 * 86400000).toISOString() };
    if (!supabase) { onMemberPatch?.(member.id, patch); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("user_table").update(patch).eq("id", member.id).select("id");
      if (error || !data || data.length === 0) {
        console.error("다시 PT 시작 실패", error);
        showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
        return;
      }
      onMemberPatch?.(member.id, patch); // 화면이 PT 회원 화면으로 바뀐다
    } catch {
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 break-keep text-pretty">
      {onGoList && (
        <button onClick={onGoList} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sub transition hover:text-primary-strong">
          <ChevronLeft className="h-4 w-4" /> 회원 목록
        </button>
      )}

      <Card as="section">
        <SectionTitle icon={UserX}>지난 회원</SectionTitle>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">{member.name}</h1>
        <p className="mt-1 text-[14px] text-sub">
          {endedAt ? `${fmtDate(endedAt)}에 PT를 마쳤어요.` : "PT를 마친 회원이에요."}
          {member.status_note ? ` (${member.status_note})` : ""}
        </p>
        <Button variant="primary" size="md" fullWidth className="mt-4" onClick={restart} disabled={busy}>
          <RotateCcw className="h-4 w-4" /> {busy ? "바꾸는 중…" : "다시 PT 시작하기"}
        </Button>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          지금까지 기록이 그대로 이어져요. 바꾼 뒤 새 계약(횟수 · 단가)을 적어 주세요.
        </p>
      </Card>

      <Card as="section">
        <SectionTitle icon={Link2}>회원 전용 페이지</SectionTitle>
        <p className="mb-3 text-[14px] leading-relaxed text-sub">
          {!member.member_token
            ? "꺼져 있어요."
            : closed
            ? "PT를 마친 지 6개월이 지나 닫혔어요."
            : until
            ? `${fmtDate(until)}까지 기록을 볼 수만 있어요. 새로 적거나 지울 수는 없어요.`
            : "기록을 볼 수만 있어요. 새로 적거나 지울 수는 없어요."}
        </p>
        {member.member_token && <MemberAppLink member={member} onMemberPatch={onMemberPatch} readOnly />}
      </Card>
      <Toast message={toast} />
    </div>
  );
}
