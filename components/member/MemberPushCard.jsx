"use client";

/* 회원 전용 페이지 '알림 받기'(2026-10-06) — 운동일지 확인 · 예약 결과 · 이벤트를 폰으로.
   홈엔 꺼져 있을 때만 한 줄(켜기 · 아이폰 사파리는 홈 화면 추가 방법) · 켜져 있으면 맨 아래(footer)에 '알림 받는 중 · 끄기'.
   지난 회원(읽기 전용)에겐 안 보인다(호출부). */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { pushState, enablePush, disablePush, notifyPush } from "@/lib/pushClient";

export default function MemberPushCard({ supabase, place = "home" }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => { const s = await pushState(); if (alive) setState(s); })();
    return () => { alive = false; };
  }, []);
  const headers = async () => {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  if (state === null || state === "unsupported") return null;

  const on = async () => {
    setBusy(true); setMsg("");
    const s = await enablePush(await headers());
    setBusy(false);
    if (s === "on") { setState("on"); notifyPush(headers(), "test", ""); }
    else if (s === "denied") { setState("denied"); }
    else setMsg("알림을 켜지 못했어요. 다시 시도해 주세요.");
  };
  const off = async () => { setBusy(true); const s = await disablePush(await headers()); setBusy(false); if (s === "off") setState("off"); };

  // place='home' = 꺼져 있을 때만 한 줄(켜기) · place='footer' = 켜져 있을 때 '알림 받는 중 · 끄기' 한 줄(2026-10-06 홈 정리).
  if (place === "footer") {
    if (state !== "on") return null;
    return (
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted">
        <Bell className="h-3.5 w-3.5" aria-hidden="true" /> 폰 알림 받는 중
        <button type="button" disabled={busy} onClick={off} className="min-h-[32px] px-1 font-semibold text-sub underline-offset-2 hover:underline">끄기</button>
      </p>
    );
  }
  if (state === "on" || state === "denied") return null;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-card px-4 py-2.5 shadow-sm">
      {state === "ios_install" ? (
        <details className="group">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[14px] text-ink [&::-webkit-details-marker]:hidden">
            <Bell className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
            <span className="min-w-0 flex-1">운동일지 · 예약 알림을 받으려면 홈 화면에 추가해 주세요</span>
            <span className="shrink-0 text-[13px] font-semibold text-primary-strong">방법</span>
          </summary>
          <ol className="m-0 mt-1 list-decimal space-y-1 pb-1 pl-5 text-[14px] leading-relaxed text-sub">
            <li>사파리 아래 <b className="text-ink">공유 버튼(네모에 위 화살표)</b>을 눌러요</li>
            <li><b className="text-ink">홈 화면에 추가</b>를 눌러요</li>
            <li>홈 화면에 생긴 아이콘으로 열고, 여기서 <b className="text-ink">켜기</b>를 눌러요</li>
          </ol>
        </details>
      ) : (
        <div className="flex min-h-[40px] items-center gap-2">
          <Bell className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[14px] text-ink">운동일지 · 예약 · 이벤트 알림 받기</span>
          <button type="button" disabled={busy} onClick={on} className="min-h-[36px] shrink-0 rounded-lg bg-primary px-3.5 text-[14px] font-bold text-white disabled:opacity-40">{busy ? "켜는 중…" : "켜기"}</button>
        </div>
      )}
      {msg && <p className="m-0 mt-1 text-[13px] text-danger-text">{msg}</p>}
    </div>
  );
}
