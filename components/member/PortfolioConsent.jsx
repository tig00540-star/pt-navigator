"use client";

/* 회원 '트레이너 포트폴리오 활용 동의'(2026-10-08 · 선택).
   place="photo" = 사진 올리는 칸 아래 한 덩어리(설명 + 켜기/끄기) · place="footer" = 맨 아래 한 줄.
   저장은 /api/member-portfolio(끄면 다른 아이디로 복사된 사례까지 지움). consent가 null이면(조회 실패) 숨긴다. */

import { useState } from "react";
import { memberSupabase } from "@/lib/memberSupabase";
import { PORTFOLIO_CONSENT } from "@/lib/consent";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

export default function PortfolioConsent({ consent, onChanged, place = "footer", trainerName }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  if (!consent || !memberSupabase) return null;
  const on = Boolean(consent.portfolio?.agreed);
  const who = trainerName ? `${trainerName} 트레이너` : "담당 트레이너";

  const save = async (agree) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const { data: sess } = await memberSupabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setErr("다시 로그인해 주세요."); return; }
      const res = await fetch("/api/member-portfolio", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agree }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.rows) { setErr(j.error || "바꾸지 못했어요. 다시 시도해 주세요."); return; }
      onChanged?.(j.rows);
      setOpen(false);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const sheet = open && (
    <Modal title={PORTFOLIO_CONSENT.title} onClose={() => setOpen(false)}
      footer={(
        <div className="flex w-full flex-col gap-2">
          {on
            ? <Button variant="ghost" size="md" fullWidth onClick={() => save(false)} disabled={busy}>{busy ? "바꾸는 중…" : "동의 끄기"}</Button>
            : <Button variant="primary" size="md" fullWidth onClick={() => save(true)} disabled={busy}>{busy ? "저장하는 중…" : "동의할게요"}</Button>}
          <Button variant="ghost" size="md" fullWidth onClick={() => setOpen(false)}>닫기</Button>
        </div>
      )}>
      <p className="m-0 text-[15px] leading-relaxed text-ink">{who}가 회원님의 변화를 <b>이름 없이</b> 다른 회원 상담 때 보여 줘도 될까요?</p>
      <dl className="m-0 mt-3 space-y-2 text-[14px] leading-relaxed">
        {PORTFOLIO_CONSENT.rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-elevate px-3 py-2">
            <dt className="text-[13px] font-semibold text-sub">{k}</dt>
            <dd className="m-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {err && <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">{err}</p>}
    </Modal>
  );

  if (place === "photo") {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}
          className="mt-3 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-elevate px-3.5 py-2.5 text-left text-[13.5px] leading-snug text-sub">
          <span>트레이너 포트폴리오 활용(선택): <b className={on ? "text-primary-strong" : "text-ink"}>{on ? "동의했어요" : "동의하지 않았어요"}</b></span>
          <span className="shrink-0 font-semibold text-ink underline underline-offset-2">{on ? "바꾸기" : "자세히"}</span>
        </button>
        {sheet}
      </>
    );
  }
  return (
    <>
      <p className="mt-1">
        트레이너 포트폴리오 활용: <b className="font-semibold text-sub">{on ? "동의했어요" : "동의하지 않았어요"}</b>{" "}
        <button type="button" onClick={() => setOpen(true)} className="ml-1 font-semibold text-sub underline underline-offset-2 hover:text-ink">
          {on ? "동의 끄기" : "자세히 · 동의하기"}
        </button>
      </p>
      {sheet}
    </>
  );
}
