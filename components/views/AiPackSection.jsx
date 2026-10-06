"use client";

/* 구독 관리 › 추가 팩(2026-10-07 · 요금제 개편 계획서 4) — 프로 · 센터 대표만.
   · 사기 전 확인 창에 환불 규칙을 미리 알린다(디지털 콘텐츠 청약철회 제한 · 전자상거래법 제17조 제2항 · 제6항):
     그달 말까지 · 산 뒤 7일 안 하나도 안 썼으면 전액 환불 · 그 뒤나 한 번이라도 쓰면 환불 없음.
   · 결제 = 토스 결제창(일반결제 · 매번 카드 인증) → /billing/pack → /api/billing/pack 승인.
   · 이번 달 산 팩 목록 · [환불](조건 맞을 때만). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { useAccount } from "@/lib/useAccount";
import { PACKS } from "@/lib/plans";
import { refreshAiQuota } from "@/lib/useAiQuota";
import { won } from "@/lib/format";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

const dayKo = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const monthEndKo = () => { const d = new Date(Date.now() + 9 * 3600000); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); return `${e.getUTCMonth() + 1}월 ${e.getUTCDate()}일`; };

export default function AiPackSection({ showToast }) {
  const acc = useAccount();
  const [packs, setPacks] = useState(null);
  const [buy, setBuy] = useState(null);     // 사려는 팩
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/pack", { headers: await authHeader() });
      const j = await res.json().catch(() => ({}));
      setPacks(res.ok ? j.packs || [] : []);
    } catch (e) { console.error("추가 팩 목록 실패", e); setPacks([]); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const pay = async () => {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!buy || !agree) return;
    if (!clientKey || !supabase) { showToast("결제가 곧 열려요. 잠시만 기다려 주세요."); return; }
    setBusy("pay");
    try {
      const { data: t } = await supabase.from("trainer").select("account_id").eq("id", acc.uid).maybeSingle();
      if (!t?.account_id) { showToast("계정을 확인하지 못했어요. 다시 로그인해 주세요."); return; }
      const { loadTossPayments } = await import("@tosspayments/payment-sdk");
      const toss = await loadTossPayments(clientKey);
      const origin = window.location.origin;
      await toss.requestPayment("카드", {
        amount: buy.price,
        orderId: `pack_${buy.key}_${t.account_id}_${Date.now()}`,
        orderName: `AI 추가 팩 · ${buy.name}`,
        successUrl: `${origin}/billing/pack`,
        failUrl: `${origin}/billing/fail?kind=pack`,
      });
    } catch (e) {
      console.error("결제창 열기 실패", e);
      showToast("결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally { setBusy(""); }
  };

  const refund = async (id) => {
    setBusy(id);
    try {
      const res = await fetch("/api/billing/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: "refund", creditId: id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(j.error || "환불하지 못했어요. 다시 시도해 주세요."); return; }
      showToast("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요");
      await load();
      refreshAiQuota();
    } catch (e) { console.error("팩 환불 실패", e); showToast("인터넷 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(""); }
  };

  return (
    <div className="mt-3 rounded-xl border border-line px-3.5 py-3">
      <p className="m-0 text-[13px] font-bold text-ink">추가 팩 <span className="font-medium text-muted">· 이번 달 말일까지</span></p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.values(PACKS).map((p) => (
          <Button key={p.key} variant="ghost" size="md" fullWidth onClick={() => { setBuy(p); setAgree(false); }} disabled={busy !== ""}>
            {p.name} · {won(p.price)}
          </Button>
        ))}
      </div>
      {packs?.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
          {packs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="text-sub">
                {dayKo(c.created_at)} · {c.kind === "prep" ? "준비" : "음성일지"} {c.amount}{c.kind === "prep" ? "번" : "건"}
                {c.refunded ? " · 환불함" : c.used ? ` · ${c.used} 사용` : " · 아직 안 씀"}
              </span>
              {c.refundable && (
                <button type="button" onClick={() => refund(c.id)} disabled={busy !== ""}
                  className="min-h-[36px] text-[13px] font-semibold text-sub underline underline-offset-2 hover:text-ink">
                  {busy === c.id ? "환불하는 중…" : "환불"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {buy && (
        <Modal title={`${buy.name}을 살까요?`} onClose={() => setBuy(null)}
          footer={(
            <div className="flex w-full gap-2">
              <Button variant="ghost" size="md" fullWidth onClick={() => setBuy(null)}>그만두기</Button>
              <Button variant="primary" size="md" fullWidth onClick={pay} disabled={!agree || busy !== ""}>
                {busy === "pay" ? "결제창 여는 중…" : `${won(buy.price)} 결제하기`}
              </Button>
            </div>
          )}>
          <ul className="m-0 list-none space-y-2 p-0 text-[14px] leading-relaxed text-ink">
            <li>· 결제하면 바로 이번 달 한도에 <b>{buy.name}</b>이 더해져요. 기본 한도를 먼저 쓰고, 넘친 만큼 팩에서 나가요.</li>
            <li>· <b>{monthEndKo()}까지</b> 쓸 수 있어요. 남은 건 다음 달로 넘어가지 않아요.</li>
            <li>· 산 뒤 <b>7일 안에 하나도 안 썼으면 전액 환불</b>할 수 있어요(구독 관리 › 추가 팩).</li>
            <li>· 7일이 지났거나 <b className="text-danger-text">한 번이라도 썼으면 환불할 수 없어요.</b></li>
            <li>· 부가세 포함 금액이에요.</li>
          </ul>
          <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-elevate px-3.5 text-[14px] font-semibold text-ink">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-red-600" />
            위 내용(환불 규칙)을 확인했어요
          </label>
        </Modal>
      )}
    </div>
  );
}
