"use client";

/* 설정 › 내 정보 '구독 관리'(2026-10-07 · 계획서 1단계 · 대표 · 개인 계정 주인만).
   · 지금 상태: 체험 중 / 이용 중(다음 결제일 · 월 금액) / 해지 예약됨 / 읽기 전용(○월 ○일까지) / 기간 없음(시범 계정)
   · [내 데이터 내려받기] = /api/export(엑셀 CSV 묶음 ZIP) · [해지 예약] · [해지 취소] = /api/billing/cancel
   · 해지 예약은 눈에 띄게 두지 않되 숨기지도 않는다(맨 아래 글자 버튼 · 정기결제 해지를 가입보다 어렵게 하지 않는다).
   · 계정 칸은 SELECT만(열 권한) · 쓰기는 서버 라우트만.
   · 2026-10-07 요금제 개편: 요금제 이름 · 월 금액(부가세 포함) · 이번 달 AI 사용량 · [프로로 올리기](차액만 결제 · 바로) ·
     [베이직으로 바꾸기](다음 결제일부터) · 센터 트레이너 자리(결제해야 열림 · 줄이기는 다음 결제일부터) = /api/billing/plan */

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { useAccount } from "@/lib/useAccount";
import { PLANS, SEAT_PRICE, planAmount } from "@/lib/plans";
import { useAiQuota, refreshAiQuota, KIND_LABEL } from "@/lib/useAiQuota";
import { won } from "@/lib/format";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { inputCls } from "@/components/ui/Field";
import AiPackSection from "@/components/views/AiPackSection";

const READ_ONLY_DAYS = 30;
const REASONS = ["가격이 부담돼요", "잘 안 쓰게 돼요", "다른 방법을 쓸게요", "센터 · 일을 그만둬요", "기타"];

const CHANGE_TITLE = { upgrade: "프로로 올릴까요?", downgrade: "베이직으로 바꿀까요?", keep: "프로를 그대로 쓸까요?", seat_add: "트레이너 자리를 하나 더할까요?", seat_remove: "트레이너 자리를 하나 줄일까요?" };
const CHANGE_DONE = { upgrade: "프로로 바꿨어요", downgrade: "다음 결제일부터 베이직으로 바뀌어요", keep: "프로를 그대로 써요", seat_add: "트레이너 자리를 하나 더했어요", seat_remove: "다음 결제일부터 자리가 하나 줄어요" };

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

/** 이번 달 AI 사용량(베이직 = 기능 5개 · 프로/센터 = 음성일지 · 준비) */
function AiUsage({ quota }) {
  if (!quota.q?.groups) return null;
  const groups = quota.tier === "basic" ? ["voice", "ot", "rereg", "inbody", "roadmap"] : ["voice", "prep"];
  return (
    <div className="mt-4 rounded-xl bg-elevate px-3.5 py-3">
      <p className="m-0 text-[13px] font-bold text-ink">이번 달 AI{quota.trial ? " · 체험 중엔 프로와 같아요" : ""}</p>
      <ul className="m-0 mt-2 list-none space-y-2 p-0">
        {groups.map((g) => {
          const v = quota.q.groups[g];
          if (!v) return null;
          const total = v.limit + (v.extra || 0);
          const pct = total ? Math.min(100, Math.round((v.used / total) * 100)) : 0;
          return (
            <li key={g}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-sub">{KIND_LABEL[g]}</span>
                <span className="tabular-nums text-ink"><b>{v.used}</b> / {total}{v.extra ? ` (팩 ${v.extra})` : ""}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${v.left === 0 ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-2 text-[12px] text-muted">매달 1일에 다시 채워져요.{quota.tier === "basic" ? "" : " 인바디 분석 · 로드맵 초안은 따로 세지 않아요."}</p>
    </div>
  );
}

export default function SubscriptionCard() {
  const acc = useAccount();
  const [st, setSt] = useState(null);       // { mode, end, cancel, plan, lastPay, untilRo, nextPlan, seats, nextSeats }
  const [busy, setBusy] = useState("");     // "" | "export" | "cancel" | "resume" | 요금제 바꾸기 action
  const [ask, setAsk] = useState(false);    // 해지 확인 창
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [allowLeave, setAllowLeave] = useState(true);   // 센터 해지 — 트레이너들이 개인 계정으로 이어 쓰게(기본 켬)
  const [change, setChange] = useState(null);           // { action, amount, trial } — 요금제 · 자리 바꾸기 확인 창
  const { toast, showToast } = useToast();
  const quota = useAiQuota();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.rpc("my_account_status"),
      supabase.from("account").select("billing_plan, next_billing_plan, extra_seats, next_extra_seats, last_payment_at, current_period_end, cancel_at_period_end, subscription_status").maybeSingle(),
    ]);
    const row = s?.[0] || {};
    const end = a?.current_period_end ?? row.current_period_end ?? null;
    const now = Date.now();
    const running = (a?.subscription_status ?? row.subscription_status) === "active" && (!end || Date.parse(end) > now);
    // SQL(2026-10-07)을 아직 안 돌렸으면 mode가 없다 → 같은 규칙으로 계산
    const mode = row.mode || (running ? "full" : end && Date.parse(end) > now - READ_ONLY_DAYS * 86400000 ? "read_only" : "locked");
    setSt({
      mode, end, cancel: Boolean(a?.cancel_at_period_end ?? row.cancel_at_period_end), plan: a?.billing_plan || null,
      lastPay: a?.last_payment_at || null, untilRo: row.read_only_until || plusDays(end, READ_ONLY_DAYS),
      nextPlan: a?.next_billing_plan || null, seats: a?.extra_seats || 0, nextSeats: a?.next_extra_seats ?? null,
    });
  }, []);

  useEffect(() => {
    if (!acc.isOwner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [acc.isOwner, load]);

  if (acc.loading || !acc.isOwner || !st) return null;

  const plan = st.plan ? PLANS[st.plan] : null;
  const monthly = st.plan ? planAmount(st.plan, st.seats) : null;
  const trial = st.mode === "full" && st.end && !st.lastPay;
  const live = st.mode === "full" && st.end && !st.cancel;

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

  // 요금제 · 자리 바꾸기 — 결제가 있는 것(올리기 · 자리 더하기)은 먼저 금액을 보여 주고 확인받는다
  const askChange = async (action) => {
    if (action !== "upgrade" && action !== "seat_add") { setChange({ action, amount: 0 }); return; }
    setBusy(action);
    try {
      const res = await fetch(`/api/billing/plan?action=${action}`, { headers: await authHeader() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(j.error || "불러오지 못했어요. 다시 시도해 주세요."); return; }
      setChange({ action, amount: j.amount || 0, trial: Boolean(j.trial) });
    } catch (e) {
      console.error("요금제 금액 확인 실패", e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(""); }
  };
  const doChange = async () => {
    if (!change) return;
    setBusy(change.action);
    try {
      const res = await fetch("/api/billing/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: change.action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(j.error || "바꾸지 못했어요. 다시 시도해 주세요."); return; }
      showToast(CHANGE_DONE[change.action] || "바꿨어요");
      setChange(null);
      await load();
      refreshAiQuota();
    } catch (e) {
      console.error("요금제 바꾸기 실패", e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(""); }
  };

  let line;
  if (st.mode === "read_only") line = <>이용 기간이 {dateKo(st.end)}에 끝났어요. <b className="text-ink">{dateKo(st.untilRo)}까지 볼 수만 있고</b>, 그 뒤 기록이 지워져요. 카드를 등록하면 바로 다시 쓸 수 있어요.</>;
  else if (!st.end) line = <>기간 제한 없이 쓰는 계정이에요.</>;
  else if (st.cancel) line = <><b className="text-ink">해지 예약됨</b> · {dateKo(st.end)}까지 그대로 써요. 그 뒤 {dateKo(st.untilRo)}까지 볼 수만 있고, 그다음 기록이 지워져요. 다음 결제는 없어요.</>;
  else if (trial) line = <><b className="text-ink">무료 체험 중</b> · {dateKo(st.end)}에 첫 결제가 돼요{monthly ? `(월 ${won(monthly)})` : ""}.</>;
  else line = <><b className="text-ink">이용 중</b> · 다음 결제일 {dateKo(st.end)}{monthly ? ` · 월 ${won(monthly)}` : ""}</>;

  const centerSeats = PLANS.center.trainerSeats + st.seats;

  return (
    <>
      <Card padding="lg" id="subscription" className="scroll-mt-20">
        <SectionTitle icon={CreditCard}>구독 관리</SectionTitle>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">{line}</p>
        {plan && <p className="m-0 mt-1 text-[13px] text-muted">{plan.name} 요금제{st.plan === "center" ? ` · 트레이너 ${centerSeats}명` : ""} · 부가세 포함</p>}
        {st.nextPlan === "basic" && st.mode === "full" && (
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-sub">
            {dateKo(st.end)} 결제부터 <b className="text-ink">베이직(월 {won(PLANS.basic.amount)})</b>으로 바뀌어요.{" "}
            <button type="button" onClick={() => askChange("keep")} disabled={busy !== ""} className="font-semibold text-primary-strong underline underline-offset-2">그대로 프로 쓰기</button>
          </p>
        )}
        {st.plan === "center" && st.nextSeats != null && st.nextSeats !== st.seats && st.mode === "full" && (
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-sub">{dateKo(st.end)} 결제부터 트레이너 {PLANS.center.trainerSeats + st.nextSeats}명 자리로 바뀌어요.</p>
        )}

        {st.mode === "full" && <AiUsage quota={quota} />}

        {live && st.plan === "basic" && (
          <Button variant="primary" size="md" fullWidth className="mt-3" onClick={() => askChange("upgrade")} disabled={busy !== ""}>
            {busy === "upgrade" ? "확인하는 중…" : `프로로 올리기(월 ${won(PLANS.solo.amount)})`}
          </Button>
        )}
        {live && st.plan === "center" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-[13.5px] text-sub">트레이너 자리 <b className="text-ink">{centerSeats}명</b> · 1명 추가 월 {won(SEAT_PRICE)}</span>
            <span className="flex gap-1.5">
              {st.seats > 0 && <Button variant="ghost" size="sm" onClick={() => askChange("seat_remove")} disabled={busy !== ""}>줄이기</Button>}
              <Button variant="primary" size="sm" onClick={() => askChange("seat_add")} disabled={busy !== ""}>{busy === "seat_add" ? "확인하는 중…" : "1명 더하기"}</Button>
            </span>
          </div>
        )}

        {live && (st.plan === "solo" || st.plan === "center") && !trial && <AiPackSection showToast={showToast} />}

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

        <div className="mt-4 flex flex-wrap gap-x-5">
          {live && st.plan === "solo" && !st.nextPlan && (
            <button type="button" onClick={() => askChange("downgrade")}
              className="min-h-[40px] text-[13px] font-semibold text-sub underline-offset-2 hover:text-ink hover:underline">
              베이직으로 바꾸기
            </button>
          )}
          {live && (
            <button type="button" onClick={() => setAsk(true)}
              className="min-h-[40px] text-[13px] font-semibold text-sub underline-offset-2 hover:text-ink hover:underline">
              구독 해지 예약
            </button>
          )}
        </div>
      </Card>

      {change && (
        <Modal title={CHANGE_TITLE[change.action]} onClose={() => setChange(null)}
          footer={(
            <div className="flex w-full gap-2">
              <Button variant="ghost" size="md" fullWidth onClick={() => setChange(null)}>그만두기</Button>
              <Button variant="primary" size="md" fullWidth onClick={doChange} disabled={busy !== ""}>
                {busy ? "처리하는 중…" : change.amount ? `${won(change.amount)} 결제하고 바꾸기` : "바꾸기"}
              </Button>
            </div>
          )}>
          <ul className="m-0 list-none space-y-2 p-0 text-[14px] leading-relaxed text-ink">
            {change.action === "upgrade" && <>
              <li>· <b>지금 바로 프로</b>로 바뀌어요. 음성일지 월 {PLANS.solo.ai.voice}건 · OT · 재등록 대본 월 {PLANS.solo.ai.prep}번을 쓸 수 있어요.</li>
              <li>· {change.amount ? <>남은 기간({dateKo(st.end)}까지) 차액 <b>{won(change.amount)}</b>만 지금 결제돼요.</> : <>{change.trial ? "체험 중이라" : "남은 기간이 짧아"} 지금 결제는 없어요.</>}</li>
              <li>· {dateKo(st.end)}부터 매달 {won(PLANS.solo.amount)}이 결제돼요.</li>
            </>}
            {change.action === "downgrade" && <>
              <li>· <b>{dateKo(st.end)}까지는 프로</b> 그대로 써요. 환불은 없어요.</li>
              <li>· 그날부터 매달 {won(PLANS.basic.amount)} · AI는 기능마다 매달 3번이에요.</li>
              <li>· 그 전에 언제든 &lsquo;그대로 프로 쓰기&rsquo;로 되돌릴 수 있어요.</li>
            </>}
            {change.action === "keep" && <li>· 베이직으로 바꾸려던 예약을 취소하고 프로를 그대로 써요.</li>}
            {change.action === "seat_add" && <>
              <li>· 결제가 끝나면 <b>바로 트레이너를 한 명 더</b> 추가할 수 있어요. 센터 AI 한도도 음성일지 100건 · 대본 20번 늘어나요.</li>
              <li>· {change.amount ? <>남은 기간({dateKo(st.end)}까지) 금액 <b>{won(change.amount)}</b>이 지금 결제돼요.</> : <>{change.trial ? "체험 중이라" : "남은 기간이 짧아"} 지금 결제는 없어요.</>}</li>
              <li>· {dateKo(st.end)}부터 매달 {won(planAmount("center", st.seats + 1))}이 결제돼요.</li>
            </>}
            {change.action === "seat_remove" && <>
              <li>· {dateKo(st.end)}까지는 지금 자리 그대로예요. 그날부터 한 자리 줄고 월 {won(SEAT_PRICE)} 덜 나가요.</li>
              <li>· 쓰는 트레이너가 자리보다 많으면 줄일 수 없어요. 먼저 운영 탭에서 트레이너를 정리해 주세요.</li>
            </>}
          </ul>
        </Modal>
      )}

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
