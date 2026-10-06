"use client";

/* 설정 › 내 정보 '구독 관리'(2026-10-07 · 계획서 1단계 · 대표 · 개인 계정 주인만).
   · 지금 상태: 체험 중 / 이용 중(다음 결제일 · 월 금액) / 해지 예약됨 / 읽기 전용(○월 ○일까지) / 기간 없음(시범 계정)
   · [내 데이터 내려받기] = /api/export(엑셀 CSV 묶음 ZIP) · [해지 예약] · [해지 취소] = /api/billing/cancel
   · 해지 예약은 눈에 띄게 두지 않되 숨기지도 않는다(맨 아래 글자 버튼 · 정기결제 해지를 가입보다 어렵게 하지 않는다).
   · 계정 칸은 SELECT만(열 권한) · 쓰기는 서버 라우트만. */

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { useAccount } from "@/lib/useAccount";
import { PLANS } from "@/lib/plans";
import { won } from "@/lib/format";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { inputCls } from "@/components/ui/Field";

const READ_ONLY_DAYS = 30;
const REASONS = ["가격이 부담돼요", "잘 안 쓰게 돼요", "다른 방법을 쓸게요", "센터 · 일을 그만둬요", "기타"];

const dateKo = (iso) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 9 * 3600000);
  const thisYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
  return `${d.getUTCFullYear() !== thisYear ? `${d.getUTCFullYear()}년 ` : ""}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};
const plusDays = (iso, n) => (iso ? new Date(Date.parse(iso) + n * 86400000).toISOString() : null);

/** 데이터 내려받기 — 화면 어디서든(읽기 전용 띠에서도) */
export async function downloadMyData() {
  const res = await fetch("/api/export", { method: "POST", headers: await authHeader() });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "내려받지 못했어요. 다시 시도해 주세요.");
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "오직트레이너_데이터.zip";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function SubscriptionCard() {
  const acc = useAccount();
  const [st, setSt] = useState(null);       // { mode, end, cancel, plan, lastPay, untilRo }
  const [busy, setBusy] = useState("");     // "" | "export" | "cancel" | "resume"
  const [ask, setAsk] = useState(false);    // 해지 확인 창
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [allowLeave, setAllowLeave] = useState(true);   // 센터 해지 — 트레이너들이 개인 계정으로 이어 쓰게(기본 켬)
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.rpc("my_account_status"),
      supabase.from("account").select("billing_plan, last_payment_at, current_period_end, cancel_at_period_end, subscription_status").maybeSingle(),
    ]);
    const row = s?.[0] || {};
    const end = a?.current_period_end ?? row.current_period_end ?? null;
    const now = Date.now();
    const running = (a?.subscription_status ?? row.subscription_status) === "active" && (!end || Date.parse(end) > now);
    // SQL(2026-10-07)을 아직 안 돌렸으면 mode가 없다 → 같은 규칙으로 계산
    const mode = row.mode || (running ? "full" : end && Date.parse(end) > now - READ_ONLY_DAYS * 86400000 ? "read_only" : "locked");
    setSt({ mode, end, cancel: Boolean(a?.cancel_at_period_end ?? row.cancel_at_period_end), plan: a?.billing_plan || null, lastPay: a?.last_payment_at || null, untilRo: row.read_only_until || plusDays(end, READ_ONLY_DAYS) });
  }, []);

  useEffect(() => {
    if (!acc.isOwner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [acc.isOwner, load]);

  if (acc.loading || !acc.isOwner || !st) return null;

  const plan = st.plan ? PLANS[st.plan] : null;
  const trial = st.mode === "full" && st.end && !st.lastPay;

  const exportData = async () => {
    setBusy("export");
    try { await downloadMyData(); showToast("내려받기를 시작했어요"); }
    catch (e) { console.error("내려받기 실패", e); showToast(e.message || "내려받지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(""); }
  };

  const call = async (action) => {
    setBusy(action);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action, reason: action === "cancel" ? [reason, memo.trim()].filter(Boolean).join(" · ") : undefined, allowLeave: action === "cancel" && acc.isCenter ? allowLeave : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(j.error || "저장하지 못했어요. 다시 시도해 주세요."); return; }
      showToast(action === "cancel" ? "해지를 예약했어요" : "해지 예약을 취소했어요");
      setAsk(false); setReason(""); setMemo("");
      await load();
    } catch (e) {
      console.error("구독 변경 실패", e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(""); }
  };

  let line;
  if (st.mode === "read_only") line = <>이용 기간이 {dateKo(st.end)}에 끝났어요. <b className="text-ink">{dateKo(st.untilRo)}까지 볼 수만 있고</b>, 그 뒤 기록이 지워져요. 카드를 등록하면 바로 다시 쓸 수 있어요.</>;
  else if (!st.end) line = <>기간 제한 없이 쓰는 계정이에요.</>;
  else if (st.cancel) line = <><b className="text-ink">해지 예약됨</b> · {dateKo(st.end)}까지 그대로 써요. 그 뒤 {dateKo(st.untilRo)}까지 볼 수만 있고, 그다음 기록이 지워져요. 다음 결제는 없어요.</>;
  else if (trial) line = <><b className="text-ink">무료 체험 중</b> · {dateKo(st.end)}에 첫 결제가 돼요{plan ? `(월 ${won(plan.amount)})` : ""}.</>;
  else line = <><b className="text-ink">이용 중</b> · 다음 결제일 {dateKo(st.end)}{plan ? ` · 월 ${won(plan.amount)}` : ""}</>;

  return (
    <>
      <Card padding="lg">
        <SectionTitle icon={CreditCard}>구독 관리</SectionTitle>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">{line}</p>
        {plan && <p className="m-0 mt-1 text-[13px] text-muted">{plan.name} 요금제 · 부가세 별도</p>}

        <div className="mt-4 flex flex-col gap-2">
          <Button variant="ghost" size="md" fullWidth onClick={exportData} disabled={busy !== ""}>
            <Download className="h-4 w-4" aria-hidden="true" /> {busy === "export" ? "준비하는 중…" : "내 데이터 내려받기"}
          </Button>
          <p className="m-0 text-[12.5px] leading-relaxed text-muted">회원 · 계약 · 운동일지 · OT 기록 · 인바디 · 장부를 엑셀에서 열리는 파일로 묶어 드려요. 회원 개인정보가 들어 있으니 안전한 곳에 보관해 주세요.</p>
          {st.mode === "full" && st.end && st.cancel && (
            <Button variant="primary" size="md" fullWidth onClick={() => call("resume")} disabled={busy !== ""}>
              {busy === "resume" ? "처리하는 중…" : "해지 예약 취소하고 계속 쓰기"}
            </Button>
          )}
        </div>

        {st.mode === "full" && st.end && !st.cancel && (
          <button type="button" onClick={() => setAsk(true)}
            className="mt-4 min-h-[40px] text-[13px] font-semibold text-sub underline-offset-2 hover:text-ink hover:underline">
            구독 해지 예약
          </button>
        )}
      </Card>

      {ask && (
        <Modal title="구독을 해지할까요?" onClose={() => setAsk(false)}
          footer={(
            <div className="flex w-full gap-2">
              <Button variant="ghost" size="md" fullWidth onClick={() => setAsk(false)}>계속 쓸게요</Button>
              <Button variant="danger" size="md" fullWidth onClick={() => call("cancel")} disabled={busy !== ""}>
                {busy === "cancel" ? "처리하는 중…" : "해지 예약"}
              </Button>
            </div>
          )}>
          <ul className="m-0 list-none space-y-2 p-0 text-[14px] leading-relaxed text-ink">
            <li>· <b>{dateKo(st.end)}까지</b>는 지금처럼 그대로 써요. 다음 결제는 없어요.</li>
            <li>· 그 뒤 <b>{dateKo(plusDays(st.end, READ_ONLY_DAYS))}까지</b> 볼 수만 있어요(새 기록 · AI 안 됨). 이때 데이터를 내려받을 수 있어요.</li>
            <li>· 그다음 회원 · 기록이 <b className="text-danger-text">지워져요</b>. 회원 전용 페이지도 닫혀요.</li>
            <li>· 기간이 끝나기 전엔 언제든 해지 예약을 취소할 수 있어요.</li>
          </ul>
          {acc.isCenter && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-elevate px-3.5 py-3 text-[14px] leading-relaxed text-ink">
              <input type="checkbox" checked={allowLeave} onChange={(e) => setAllowLeave(e.target.checked)} className="mt-1 h-4 w-4 accent-red-600" />
              <span><b>트레이너들이 개인 계정으로 이어 쓸 수 있게 할게요.</b> 담당 회원이 동의하면 그 회원 기록도 트레이너와 함께 가요. 센터에는 정산용 기록(금액 · 날짜)만 남아요.</span>
            </label>
          )}
          <p className="m-0 mt-4 text-[13px] font-semibold text-sub">그만두시는 이유를 알려 주시면 고치는 데 써요(선택)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(reason === r ? "" : r)} aria-pressed={reason === r}
                className={`min-h-[36px] rounded-full border px-3 text-[13px] font-semibold ${reason === r ? "border-primary bg-primary-soft text-primary-strong" : "border-line bg-card text-sub"}`}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} rows={2} placeholder="더 하고 싶은 말(선택)"
            className={`${inputCls} mt-2`} />
        </Modal>
      )}
      <Toast message={toast} />
    </>
  );
}
