"use client";

/* 회원 전용 페이지 '운동일지 알림 받기'(2026-10-06) — 트레이너가 운동일지를 쓰면 폰으로 '확인해 주세요' 알림.
   켜져 있으면 한 줄(끄기)만, 꺼져 있으면 켜기 버튼 · 아이폰(사파리)은 홈 화면에 추가 안내.
   지난 회원(읽기 전용)에겐 안 보인다(호출부). */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { pushState, enablePush, disablePush, notifyPush } from "@/lib/pushClient";

export default function MemberPushCard({ supabase }) {
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

  if (state === "on") {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-line bg-card px-4 py-2.5 text-[14px] text-sub shadow-sm">
        <Bell className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 운동일지 알림을 받고 있어요
        <button type="button" disabled={busy} onClick={off} className="ml-auto min-h-[36px] px-2 text-[13px] font-semibold text-sub">끄기</button>
      </div>
    );
  }
  return (
    <section className="mb-6 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <h2 className="m-0 flex items-center gap-1.5 text-[15px] font-bold text-ink"><Bell className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 운동일지 알림 받기</h2>
      <p className="m-0 mt-1 text-[14px] leading-relaxed text-sub">트레이너가 운동일지를 쓰면 폰으로 알려 드려요. 확인을 놓치지 않게 켜 두세요.</p>
      {state === "ios_install" ? (
        <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed text-sub">
          <li>사파리 아래 <b className="text-ink">공유 버튼(네모에 위 화살표)</b>을 눌러요</li>
          <li><b className="text-ink">홈 화면에 추가</b>를 눌러요</li>
          <li>홈 화면에 생긴 아이콘으로 열고, 여기서 <b className="text-ink">알림 켜기</b>를 눌러요</li>
        </ol>
      ) : state === "denied" ? (
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">알림이 막혀 있어요. 폰 설정이나 브라우저의 사이트 설정에서 알림을 허용해 주세요.</p>
      ) : (
        <button type="button" disabled={busy} onClick={on} className="mt-3 min-h-[44px] w-full rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-40">
          {busy ? "켜는 중…" : "알림 켜기"}
        </button>
      )}
      {msg && <p className="m-0 mt-2 text-[13px] text-danger-text">{msg}</p>}
    </section>
  );
}
