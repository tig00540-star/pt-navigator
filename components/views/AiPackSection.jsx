"use client";

/* 구독 관리 › 추가 팩(2026-10-07 · 요금제 개편 계획서 4) — 프로 · 센터 대표만.
   · 사기 전 확인 창에 환불 규칙을 미리 알린다(디지털 콘텐츠 청약철회 제한 · 전자상거래법 제17조 제2항 · 제6항):
     산 날부터 1개월(2026-10-11 · 예전 그달 말까지 · 종류마다 작은 팩 · 큰 팩) · 산 뒤 7일 안 하나도 안 썼으면 전액 환불 · 그 뒤나 한 번이라도 쓰면 환불 없음.
   · 결제 = 토스 결제창(일반결제 · 매번 카드 인증) → /billing/pack → /api/billing/pack 승인.
   · 쓰고 있는 팩 목록(남은 수 · 끝나는 날) · [환불](조건 맞을 때만). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { useAccount } from "@/lib/useAccount";
import { PACK_GROUPS, packsOf, perUnit } from "@/lib/plans";
import { refreshAiQuota } from "@/lib/useAiQuota";
import { won } from "@/lib/format";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

const dayKo = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
// 끝나는 날(DB expires_at = 그 다음 날 0시 · 한국 시간) → 마지막으로 쓸 수 있는 날
const lastDayKo = (iso) => dayKo(new Date(Date.parse(iso) - 1).toISOString());
// 오늘 사면 언제까지(산 날 + 1개월 − 1일 · DB 기본값과 같은 규칙)
const buyEndKo = () => { const d = new Date(Date.now() + 9 * 3600000); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate() - 1)); return `${e.getUTCMonth() + 1}월 ${e.getUTCDate()}일`; };
// 추가 팩 결제창 키(2026-10-19) — 일반결제 상점 키가 따로 있으면 그것, 없으면 자동결제 키가 아직 테스트 키일 때만(실제 키는 상점이 달라 결제창이 안 열림)
const BILL_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";
const PACK_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_PAY_CLIENT_KEY || (BILL_KEY.startsWith("test_") ? BILL_KEY : "");
const PACK_UNIT = { prep: ["대본", "번"], voice: ["음성일지", "건"], diet: ["식단 AI", "건"] };

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
    const clientKey = PACK_CLIENT_KEY;
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
      <p className="m-0 text-[13px] font-bold text-ink">추가 팩 <span className="font-medium text-muted">· 산 날부터 1개월</span></p>
      {!PACK_CLIENT_KEY && BILL_KEY && <p className="m-0 mt-1 text-[12px] text-muted">추가 팩 결제는 곧 열려요. 조금만 기다려 주세요.</p>}
      <div className="mt-2 space-y-2.5">
        {PACK_GROUPS.map((g) => (
          <div key={g.kind}>
            <p className="m-0 mb-1 text-[12px] font-semibold text-sub">{g.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {packsOf(g.kind).map((p) => (
                <button key={p.key} type="button" onClick={() => { setBuy(p); setAgree(false); }} disabled={busy !== "" || (!PACK_CLIENT_KEY && !!BILL_KEY)}
                  className="flex min-h-[52px] flex-col items-start justify-center rounded-lg border border-line bg-card px-3 py-2 text-left hover:border-line-strong disabled:opacity-50">
                  <span className="text-[14px] font-bold text-ink">{p.amount}{g.unit} · {won(p.price)}</span>
                  <span className="text-[12px] text-muted">{g.unit}당 {won(perUnit(p))}{p.big ? <b className="ml-1 font-semibold text-primary-strong">더 저렴</b> : null}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {packs?.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
          {packs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="text-sub">
                {dayKo(c.created_at)} · {(PACK_UNIT[c.kind] || [c.kind, "건"])[0]} {c.amount}{(PACK_UNIT[c.kind] || [c.kind, "건"])[1]}
                {c.refunded ? " · 환불함" : c.expired ? ` · 기간 끝남(${c.used} 사용)` : ` · ${c.amount - c.used} 남음 · ${lastDayKo(c.expires_at)}까지`}
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
            <li>· 결제하면 바로 <b>{buy.name}</b>이 더해져요. 매달 기본 한도를 먼저 쓰고, 다 쓰면 팩에서 나가요.</li>
            <li>· 산 날부터 1개월, <b>{buyEndKo()}까지</b> 쓸 수 있어요. 그날까지 안 쓴 건 사라져요.</li>
            <li>· 요금제를 바꿔도 남은 팩은 그날까지 그대로 써요.</li>
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
