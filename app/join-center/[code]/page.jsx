"use client";

/* 센터 합류(2026-10-07 · 계획서 2단계) — 개인 계정 트레이너가 대표에게 받은 초대 링크를 연다.
   로그인 필요(AuthGate · 개인 구독이 끝났어도 이 화면은 열림). 미리 보기 GET /api/move/join → [합류하기] POST.
   합류하면: 같은 로그인으로 센터 소속 · 가격표 · 사례 · QR · 개인 일정은 바로 · 회원은 동의한 사람부터(14일) ·
   개인 구독은 오늘 끝나고 남은 날짜만큼 자동 환불(A안). */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Building2 } from "lucide-react";
import { authHeader } from "@/lib/authHeader";
import { won } from "@/lib/format";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function JoinCenterPage({ params }) {
  const { code } = use(params);
  const [p, setP] = useState(null);        // 미리 보기 | { error }
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/move/join?code=${encodeURIComponent(code)}`, { headers: await authHeader() });
        const j = await res.json().catch(() => ({}));
        if (alive) setP(res.ok ? j : { error: j.error || "초대 링크를 확인하지 못했어요.", center_name: j.center_name });
      } catch {
        if (alive) setP({ error: "인터넷 연결을 확인하고 다시 시도해 주세요." });
      }
    })();
    return () => { alive = false; };
  }, [code]);

  const join = async () => {
    if (busy || !ok) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/move/join", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "합류하지 못했어요. 다시 시도해 주세요."); return; }
      setDone(j);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-[520px]">
        {!p && <p className="text-center text-[14px] text-muted">불러오는 중…</p>}

        {p?.error && (
          <Card padding="lg">
            <p className="m-0 text-[16px] font-bold text-ink">{p.center_name ? `${p.center_name} 합류` : "센터 합류"}</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">{p.error}</p>
            <Button as="a" href="/" variant="ghost" size="md" fullWidth className="mt-4">홈으로</Button>
          </Card>
        )}

        {p && !p.error && !done && (
          <Card padding="lg">
            <div className="flex items-center gap-2 text-primary-strong"><Building2 className="h-5 w-5" aria-hidden="true" /><span className="text-[14px] font-bold">센터 합류 초대</span></div>
            <h1 className="m-0 mt-2 text-[22px] font-black leading-snug tracking-[-0.03em] text-ink">{p.center_name}에 합류할까요?</h1>
            <ul className="m-0 mt-4 list-none space-y-2.5 p-0 text-[14.5px] leading-relaxed text-ink">
              <li>· <b>같은 로그인</b>으로 그대로 써요. 앞으로 {p.center_name} 소속 트레이너가 돼요.</li>
              <li>· 가격표 · 사례 보관함 · OT 신청 QR · 개인 일정은 <b>바로 함께</b> 옮겨져요.</li>
              <li>· 회원 {p.members}명에게 &lsquo;기록을 함께 옮길까요?&rsquo;를 물어요. <b>동의한 회원부터</b> 센터로 옮겨지고, 14일 안에 답이 없으면 옮기지 않아요(그 회원 기록은 30일 뒤 지워져요).</li>
              <li>· 개인 구독은 오늘 끝나요. {p.refund?.amount > 0
                ? <>남은 {p.refund.days}일치 <b>{won(p.refund.amount)}</b>은 결제한 카드로 돌려드려요(카드사에 따라 3~7일).</>
                : <>결제한 금액이 남아 있지 않아 돌려드릴 금액은 없어요.</>}</li>
              <li>· 급여 방식은 센터 대표 것을 따르고, 일하는 방식 · 상호 칸은 없어져요. 개인 장부(매출 · 지출)는 옮기지 않아요. 필요하면 먼저 <Link href="/settings" className="font-semibold text-primary-strong underline">설정 › 구독 관리 › 내 데이터 내려받기</Link>를 해 두세요.</li>
            </ul>
            <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-elevate px-3.5 text-[14px] font-semibold text-ink">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-4 w-4 accent-red-600" />
              위 내용을 확인했어요
            </label>
            {err && <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">{err}</p>}
            <Button variant="primary" size="md" fullWidth className="mt-4" onClick={join} disabled={!ok || busy}>
              {busy ? "합류하는 중…" : `${p.center_name}에 합류하기`}
            </Button>
            <Button as="a" href="/" variant="ghost" size="md" fullWidth className="mt-2">나중에 할게요</Button>
          </Card>
        )}

        {done && (
          <Card padding="lg">
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
            <h1 className="m-0 mt-2 text-[22px] font-black tracking-[-0.03em] text-ink">{done.center_name}에 합류했어요</h1>
            <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[14.5px] leading-relaxed text-sub">
              <li>· 회원 {done.members}명에게 기록을 옮길지 물었어요. 회원 전용 페이지를 열면 바로 물어봐요. 동의한 회원부터 내 회원 목록에 들어와요.</li>
              {done.refund > 0 && (done.refunded
                ? <li>· 남은 기간 {won(done.refunded)}을 결제한 카드로 돌려드렸어요(카드사에 따라 3~7일).</li>
                : <li>· 남은 기간 {won(done.refund)} 환불이 늦어지고 있어요. 고객센터에서 바로 처리해 드릴게요.</li>)}
            </ul>
            <Button variant="primary" size="md" fullWidth className="mt-5" onClick={() => { window.location.href = "/"; }}>센터 앱으로 가기</Button>
          </Card>
        )}
      </div>
    </main>
  );
}
