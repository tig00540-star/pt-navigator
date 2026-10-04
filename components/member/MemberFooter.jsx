"use client";

/* 회원 전용 페이지 맨 아래 고지(2026-10-05) — 운영 주체(센터) · 서비스 제공 · 개인정보처리방침 · 안전 안내 · 건강정보 동의 바꾸기.
   동의 바꾸기 = member_consent에 새 행(덧붙이기만). consent가 null이면(표 없음 · 조회 실패) 바꾸기 줄은 숨긴다. */

import { useState } from "react";
import { CONSENT_VERSION, SAFETY_NOTE } from "@/lib/consent";

export default function MemberFooter({ supabase, me, consent, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const healthOk = Boolean(consent?.health?.agreed);

  const toggle = async () => {
    if (busy || !supabase) return;
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.from("member_consent")
        .insert({ member_id: me.id, kind: "health", agreed: !healthOk, method: "member_page", version: CONSENT_VERSION })
        .select("kind, agreed, created_at, version");
      if (error || !data || data.length === 0) {
        console.error("건강정보 동의 변경 실패", error);
        setErr("바꾸지 못했어요. 다시 시도해 주세요.");
        return;
      }
      onChanged?.(data);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="mt-10 break-keep text-pretty border-t border-line pt-5 text-[12.5px] leading-relaxed text-muted">
      <p className="text-sub">{SAFETY_NOTE}</p>
      {consent && (
        <p className="mt-3">
          건강정보 수집 · 이용: <b className="font-semibold text-sub">{healthOk ? "동의했어요" : "동의하지 않았어요"}</b>{" "}
          <button type="button" onClick={toggle} disabled={busy}
            className="ml-1 font-semibold text-sub underline underline-offset-2 hover:text-ink disabled:opacity-50">
            {busy ? "바꾸는 중…" : healthOk ? "동의 철회" : "동의하기"}
          </button>
        </p>
      )}
      {err && <p className="mt-1 text-danger-text">{err}</p>}
      <p className="mt-3">
        운영: {me?.center_name || "담당 센터"}<span className="mx-1.5">·</span>서비스 제공: 오직 트레이너
      </p>
      <p className="mt-1">
        <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">개인정보처리방침</a>
        <span className="mx-1.5">·</span>
        <a href="/legal/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">이용약관</a>
      </p>
    </footer>
  );
}
