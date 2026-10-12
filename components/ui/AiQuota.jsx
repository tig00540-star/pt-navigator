"use client";

/* AI 남은 횟수 한 줄 · 다 썼을 때 잠금 카드(2026-10-07 요금제 개편).
   - AiQuotaNote: 베이직은 늘("무료 3번 중 2번 남았어요"), 프로 · 센터는 얼마 안 남았을 때만. 한도는 결제일마다 다시 채움(2026-10-12).
   - AiLockCard: 남은 수 0일 때 AI 버튼 자리에. 베이직 = 프로 안내 · 프로/센터 = 다음 결제일 · 추가 팩(대표만).
   숫자가 없으면(읽기 실패 · 데모) 둘 다 아무것도 안 그린다 — 잠그는 건 서버(402)가 한다. */

import Link from "next/link";
import { Lock } from "lucide-react";
import { useAiQuota, KIND_LABEL } from "@/lib/useAiQuota";
import { useAccount } from "@/lib/useAccount";
import { PLANS } from "@/lib/plans";
import { won } from "@/lib/format";

const SOON = { voice: 10, prep: 3, inbody: 5, roadmap: 5, diet: 20 };
// 받침이 있으면 '을', 없으면 '를'(음성일지를 · 대본을)
const eulReul = (w) => { const c = (w || "").charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? "을" : "를"; };

export function AiQuotaNote({ kind, className = "" }) {
  const { tier, info, resetsKo } = useAiQuota();
  const v = info(kind);
  if (!v || v.left <= 0) return null;
  const total = v.limit + (v.extra || 0);
  if (tier === "basic") {
    return <p className={`m-0 text-[13px] text-muted ${className}`}>무료 {total}번 중 <b className="text-ink">{v.left}번</b> 남았어요{resetsKo ? ` · ${resetsKo}에 다시 채워져요` : ""}</p>;
  }
  if (v.left > (SOON[v.group] ?? 3)) return null;
  return <p className={`m-0 text-[13px] text-muted ${className}`}>{KIND_LABEL[v.group]} <b className="text-ink">{v.left}번</b> 남았어요{resetsKo ? ` · ${resetsKo}에 다시 채워져요` : ""}</p>;
}

/** 남은 수가 0이면 true — 버튼 대신 AiLockCard를 그릴지 고를 때 */
export function useAiLocked(kind) {
  const { info } = useAiQuota();
  const v = info(kind);
  return Boolean(v && v.left <= 0);
}

export function AiLockCard({ kind, className = "", children }) {
  const { tier, info, resetsKo } = useAiQuota();
  const acc = useAccount();
  const v = info(kind);
  if (!v || v.left > 0) return null;
  const label = KIND_LABEL[v.group] || "AI";
  const basic = tier === "basic";
  return (
    <div className={`rounded-xl border border-line bg-elevate px-4 py-3.5 ${className}`}>
      <p className="m-0 flex items-center gap-1.5 text-[14px] font-bold text-ink">
        <Lock className="h-4 w-4 text-muted" aria-hidden="true" />
        {basic ? `${label} 무료 ${v.limit}번을 다 썼어요` : `${label} 한도를 다 썼어요`}
      </p>
      <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-sub">
        {basic
          ? <>프로({won(PLANS.solo.amount)}/월)는 음성일지 월 {PLANS.solo.ai.voice}건 · OT · 재등록 대본 월 {PLANS.solo.ai.prep}번을 쓸 수 있어요. {resetsKo || "다음 결제일"}에 무료 3번이 다시 채워져요.</>
          : <>{resetsKo || "다음 결제일"}에 다시 채워져요. {acc.isOwner ? "추가 팩을 사면 바로 이어 쓸 수 있어요." : "급하면 대표에게 추가 팩을 부탁해 주세요."}</>}
      </p>
      {children}
      {acc.isOwner && (
        <Link href="/settings/me#subscription"
          className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-primary px-4 text-[14px] font-bold text-white no-underline">
          {basic ? "프로로 올리기" : "추가 팩 보기"}
        </Link>
      )}
    </div>
  );
}
