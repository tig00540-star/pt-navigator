"use client";

/* =========================================================================
   P3b — 환불 처리 · PT 회원 삭제(소프트). PT 뷰 하단 위험 액션 카드.
   최신 '유료(counts_as_revenue)' 계약에 환불 기록(refund_amount·refunded_at)
   + 회원 hidden=true → 목록에서 사라지고 이달 매출 차감(P3a 헬퍼 반영).
   PT 회원은 이 액션(환불)으로만 삭제된다(별도 삭제 없음). 기록은 보존.
   ========================================================================= */

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { won } from "@/lib/format";

// KST 오늘 'YYYY-MM-DD'(처리월 판정은 P3a kstYm과 일관).
const kstToday = () => new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default function RefundMember({ member, contracts, onDone }) {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false); // 인라인 2단계 확인
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  // 대상 = 최신 유료(counts_as_revenue) 계약. 인계·외부(false)엔 환불 안 붙여 매출 오차감 방지.
  const revContracts = (contracts || []).filter((c) => c && c.counts_as_revenue);
  const target = revContracts.length
    ? revContracts.reduce((a, b) => ((a.started_at ?? "") > (b.started_at ?? "") ? a : b))
    : null;

  const doRefund = async () => {
    if (saving) return;
    if (!supabase) return showToast("데모 모드 — 키 설정 시 사용 가능");
    if (!target) return showToast("환불 가능한 유료 계약이 없어요");
    const amt = Number(amount);
    if (!(amt > 0)) return showToast("환불 금액을 입력하세요");
    if (!confirming) { setConfirming(true); return; } // 1탭: 확인 대기
    setSaving(true);
    // 1) 계약에 환불 기록(처리월 = 오늘) — .select() 하드닝(0행 = 조용한 실패).
    const { data: up, error: ue } = await supabase.from("session_log")
      .update({ refund_amount: amt, refunded_at: kstToday() }).eq("id", target.id).select();
    if (ue || !up || up.length === 0) { showToast("환불 기록 실패 — 다시 시도"); setSaving(false); setConfirming(false); return; }
    // 2) 회원 소프트 삭제(hidden) — .select() 하드닝.
    const { data: hd, error: he } = await supabase.from("user_table")
      .update({ hidden: true }).eq("id", member.id).select();
    if (he || !hd || hd.length === 0) { showToast("회원 숨김 실패 — 환불은 기록됐어요(권한 확인)"); setSaving(false); return; }
    showToast("환불 처리 및 회원 정리 완료");
    setSaving(false);
    if (onDone) onDone(); // 목록 재로드 + 목록 복귀
  };

  return (
    <details className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 shadow-sm">
      <summary className="cursor-pointer list-none">
        <Eyebrow icon={Undo2}>환불 처리 · 회원 삭제</Eyebrow>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[12px] leading-relaxed text-muted">
          환불하면 이 회원은 목록에서 사라지고, 이달 매출에서 환불금이 차감됩니다.
          PT 회원은 환불로만 삭제돼요. (기록은 보존)
        </p>
        {target ? (
          <div className="rounded-lg border border-rose-500/20 bg-card px-3 py-2 text-[12px] text-sub">
            대상 계약: <b className="text-ink">{won(target.amount_total ?? 0)}</b>
            {target.started_at && (
              <span className="ml-2 text-muted">
                {new Date(target.started_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] text-muted">
            환불 가능한 유료 계약이 없어요.
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">환불 금액</span>
          <NumberInput
            value={amount}
            onValueChange={setAmount}
            disabled={saving || !target}
            placeholder={target ? String(target.amount_total ?? "") : "0"}
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-rose-500 disabled:opacity-50"
          />
        </label>
        {confirming ? (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-rose-700">정말 환불·삭제할까요?</p>
            <div className="flex gap-2">
              <Button variant="danger" size="md" onClick={doRefund} disabled={saving} className="flex-1 font-bold">
                {saving ? "처리 중…" : "확정"}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setConfirming(false)} disabled={saving}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" size="md" fullWidth onClick={doRefund} disabled={saving || !target} className="gap-2 font-bold">
            <Undo2 className="h-4 w-4" strokeWidth={2.5} /> 환불 처리
          </Button>
        )}
      </div>
      <Toast message={toast} />
    </details>
  );
}
