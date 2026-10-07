"use client";

/* 개인 계정으로 이어 쓰기(2026-10-07 · 계획서 3단계) — 센터 소속 트레이너가 센터를 떠나 혼자 쓴다.
   로그인 필요(AuthGate · 센터 구독이 끝나 잠겼어도 이 화면은 열림). 미리 보기 GET /api/move/leave → 일하는 방식 · 상호 → POST.
   독립하면: 같은 로그인 · 새 개인 계정(체험 없음 · 카드 등록하면 바로 첫 결제) · 본인 가격표 · 프로필 · QR이 따라옴 ·
   대표가 '회원과 함께' 허락했으면 결제를 마친 뒤 담당 회원에게 '기록을 함께 옮길까요?'(동의한 회원만). */

import { useEffect, useState } from "react";
import { DoorOpen, CheckCircle2 } from "lucide-react";
import { authHeader } from "@/lib/authHeader";
import { PLANS } from "@/lib/plans";
import { won } from "@/lib/format";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";

const MODES = [
  { k: "employed", l: "센터 소속", d: "다른 센터에서 급여 · 수수료를 받아요" },
  { k: "freelance", l: "프리랜서", d: "회원비를 직접 받아요(대관 · 개인 스튜디오 · 출장)" },
];

export default function LeaveCenterPage() {
  const [p, setP] = useState(null);
  const [mode, setMode] = useState("freelance");
  const [brand, setBrand] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/move/leave", { headers: await authHeader() });
        const j = await res.json().catch(() => ({}));
        if (alive) setP(res.ok ? j : { error: j.error || "정보를 불러오지 못했어요." });
      } catch {
        if (alive) setP({ error: "인터넷 연결을 확인하고 다시 시도해 주세요." });
      }
    })();
    return () => { alive = false; };
  }, []);

  const leave = async () => {
    if (busy || !ok) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/move/leave", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ work_mode: mode, brand: brand.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "독립하지 못했어요. 다시 시도해 주세요."); return; }
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
            <p className="m-0 text-[16px] font-bold text-ink">개인 계정으로 이어 쓰기</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">{p.error}</p>
            <Button as="a" href="/" variant="ghost" size="md" fullWidth className="mt-4">홈으로</Button>
          </Card>
        )}

        {p && !p.error && !done && (
          <Card padding="lg">
            <div className="flex items-center gap-2 text-primary-strong"><DoorOpen className="h-5 w-5" aria-hidden="true" /><span className="text-[14px] font-bold">개인 계정으로 이어 쓰기</span></div>
            <h1 className="m-0 mt-2 text-[22px] font-black leading-snug tracking-[-0.03em] text-ink">{p.center_name}을 떠나 혼자 쓸까요?</h1>
            <ul className="m-0 mt-4 list-none space-y-2.5 p-0 text-[14.5px] leading-relaxed text-ink">
              <li>· <b>같은 로그인</b>으로 내 개인 계정이 돼요. 본인 가격표 · 프로필 · 내 OT 신청 QR이 함께 가요.</li>
              {p.with_members
                ? <li>· 대표가 <b>회원과 함께</b> 허락했어요. 담당 회원 {p.members}명에게 &lsquo;기록을 함께 옮길까요?&rsquo;를 물어요(카드 등록을 마친 뒤 · 동의한 회원만 · 14일).</li>
                : <li>· 회원은 함께 가지 않아요{p.allowed ? "(대표가 회원 없이 허락)" : ""}. 회원을 데려가려면 대표의 허락이 필요해요.</li>}
              <li>· 카드를 등록하면 바로 첫 달이 결제돼요(베이직 {won(PLANS.basic.amount)} · 프로 {won(PLANS.solo.amount)} 중 선택 · 부가세 포함).</li>
              <li>· {p.center_name}에서는 바로 빠져요. 센터 회원 · 기록은 더 볼 수 없어요.</li>
            </ul>

            <p className="m-0 mt-5 text-[14px] font-bold text-ink">일하는 방식</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)} aria-pressed={mode === m.k}
                  className={`rounded-xl border px-3 py-2.5 text-left ${mode === m.k ? "border-primary bg-primary-soft" : "border-line bg-card"}`}>
                  <span className={`block text-[14px] font-bold ${mode === m.k ? "text-primary-strong" : "text-ink"}`}>{m.l}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-sub">{m.d}</span>
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="text-[14px] font-bold text-ink">상호(선택)</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={40} placeholder="예: ○○ 출장 PT · 소속 센터 이름" className={`${inputCls} mt-1.5`} />
              <span className="mt-1 block text-[12.5px] text-muted">회원 전용 페이지 · OT 신청서에 &lsquo;상호 · 내 이름 트레이너&rsquo;로 나와요.</span>
            </label>

            <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-elevate px-3.5 text-[14px] font-semibold text-ink">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-4 w-4 accent-red-600" />
              위 내용을 확인했어요
            </label>
            {err && <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">{err}</p>}
            <Button variant="primary" size="md" fullWidth className="mt-4" onClick={leave} disabled={!ok || busy}>
              {busy ? "처리하는 중…" : "개인 계정으로 독립하기"}
            </Button>
            <Button as="a" href="/" variant="ghost" size="md" fullWidth className="mt-2">나중에 할게요</Button>
          </Card>
        )}

        {done && (
          <Card padding="lg">
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
            <h1 className="m-0 mt-2 text-[22px] font-black tracking-[-0.03em] text-ink">개인 계정이 준비됐어요</h1>
            <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-sub">
              카드를 등록하면 바로 쓸 수 있어요.{done.with_members && done.members > 0 ? ` 등록을 마치면 담당 회원 ${done.members}명에게 기록을 옮길지 물어요.` : ""}
            </p>
            <Button variant="primary" size="md" fullWidth className="mt-5" onClick={() => { window.location.href = "/"; }}>카드 등록하러 가기</Button>
          </Card>
        )}
      </div>
    </main>
  );
}
