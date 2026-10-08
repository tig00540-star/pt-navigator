"use client";

/* 설정 › 내 정보 '다른 아이디에서 내 자료 가져오기'(2026-10-08 · 대표 결정 '분리 방식').
   아이디는 처음 만든 곳 것이다. 센터 → 개인 · 개인 → 센터로 아이디를 바꿀 때 '내 것'만 복사해 온다(원래 아이디에도 그대로 남음).
   ① 가져올 아이디의 이메일 · 비밀번호 → 미리 보기(/api/import-id) ② 고르기 → 가져오기.
   개인 아이디 → 센터 아이디일 때만 '개인 회원에게 센터로 옮길지 묻기'(동의한 회원만 이동). */

import { useState } from "react";
import { ArrowDownToLine, CheckCircle2 } from "lucide-react";
import { authHeader } from "@/lib/authHeader";
import { useAccount } from "@/lib/useAccount";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

const ITEMS = [
  { k: "packages", label: "PT 가격표" },
  { k: "library", label: "내 라이브러리" },
  { k: "profile", label: "트레이너 프로필" },
  { k: "cases", label: "포트폴리오 사례" },
];

export default function ImportFromIdCard() {
  const acc = useAccount();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pv, setPv] = useState(null);
  const [pick, setPick] = useState({ packages: true, library: true, profile: true, cases: true, members: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  if (acc.loading || !acc.uid) return null;

  const call = async (apply) => {
    if (busy) return;
    if (!email.trim() || !pw) { setErr("가져올 아이디의 이메일과 비밀번호를 입력해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/import-id", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ email: email.trim(), password: pw, apply: apply ? pick : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "가져오지 못했어요. 다시 시도해 주세요."); return; }
      if (apply) { setDone(j.done); setPw(""); } else setPv(j.preview);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  const count = (k) => (k === "profile" ? (pv?.profile ? "있음" : "없음") : `${pv?.[k] ?? 0}개`);
  const nothing = pv && !pv.packages && !pv.library && !pv.profile && !pv.cases && !pv.members;

  if (!open) {
    return (
      <p className="m-0 px-1 text-[13px] leading-relaxed text-muted">
        예전에 쓰던 다른 아이디가 있나요?{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-sub underline underline-offset-2">다른 아이디에서 내 자료 가져오기</button>
      </p>
    );
  }

  return (
    <Card padding="lg">
      <SectionTitle icon={ArrowDownToLine}>다른 아이디에서 내 자료 가져오기</SectionTitle>
      {done ? (
        <div>
          <p className="m-0 flex items-center gap-1.5 text-[15px] font-bold text-ink"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />가져왔어요</p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[14px] leading-relaxed text-sub">
            {done.packages > 0 && <li>· PT 가격표 {done.packages}개</li>}
            {done.library > 0 && <li>· 라이브러리 {done.library}개</li>}
            {done.profile && <li>· 트레이너 프로필</li>}
            {done.cases > 0 && <li>· 포트폴리오 사례 {done.cases}개</li>}
            {done.members > 0 && <li>· 회원 {done.members}명에게 센터로 옮길지 물었어요. 동의한 회원부터 이 아이디로 들어와요.</li>}
            {done.skipped > 0 && <li>· 이미 있거나 사진을 찾지 못한 사례 {done.skipped}개는 건너뛰었어요.</li>}
            {!done.packages && !done.library && !done.profile && !done.cases && !done.members && <li>· 새로 가져온 것이 없어요(이미 다 있어요).</li>}
          </ul>
          <Button variant="ghost" size="md" fullWidth className="mt-4" onClick={() => { setOpen(false); setDone(null); setPv(null); setEmail(""); }}>닫기</Button>
        </div>
      ) : (
        <>
          <p className="m-0 text-[14px] leading-relaxed text-sub">
            센터를 옮기거나 개인으로 일하게 돼 아이디가 바뀌었을 때 <b className="text-ink">내 것만</b> 복사해 와요. 원래 아이디에도 그대로 남아요.
            센터 회원 기록은 센터 것이라 가져오지 않고, 회원이 &lsquo;트레이너 포트폴리오 활용&rsquo;에 동의한 사례만 가져와요.
          </p>
          {!pv && (
            <div className="mt-4 space-y-2.5">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="가져올 아이디(이메일)" autoComplete="off" className={inputCls} />
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="그 아이디의 비밀번호" autoComplete="off" className={inputCls} />
            </div>
          )}
          {pv && (
            <div className="mt-4">
              <p className="m-0 text-[14px] font-bold text-ink">{pv.source.name} · {pv.source.account || (pv.source.type === "solo" ? "개인" : "센터")} 아이디에서</p>
              <div className="mt-2 space-y-1.5">
                {ITEMS.map((it) => (
                  <label key={it.k} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-elevate px-3.5 text-[14px] text-ink">
                    <input type="checkbox" checked={pick[it.k]} onChange={(e) => setPick((p) => ({ ...p, [it.k]: e.target.checked }))} className="h-4 w-4 accent-red-600" />
                    <span className="flex-1">{it.label}</span>
                    <span className="text-[13px] text-sub">{count(it.k)}{it.k === "cases" && pv.casesTotal > pv.cases ? ` · 동의 없는 ${pv.casesTotal - pv.cases}개 제외` : ""}</span>
                  </label>
                ))}
                {pv.members != null && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-elevate px-3.5 py-3 text-[14px] leading-relaxed text-ink">
                    <input type="checkbox" checked={pick.members} onChange={(e) => setPick((p) => ({ ...p, members: e.target.checked }))} className="mt-1 h-4 w-4 accent-red-600" />
                    <span>개인 회원 {pv.members}명에게 <b>센터로 옮길지</b> 묻기<span className="block text-[13px] text-sub">회원 페이지에 질문이 떠요. 동의한 회원만 운동일지 · 인바디 · 사진 · 남은 수업이 이 아이디로 옮겨지고, 나머지는 개인 아이디에 그대로 남아요.</span></span>
                  </label>
                )}
              </div>
              {nothing && <p className="m-0 mt-2 text-[13px] text-sub">가져올 자료가 없어요.</p>}
            </div>
          )}
          {err && <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">{err}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" size="md" onClick={() => { setOpen(false); setPv(null); setPw(""); setErr(""); }}>닫기</Button>
            {!pv
              ? <Button variant="primary" size="md" fullWidth onClick={() => call(false)} disabled={busy}>{busy ? "확인하는 중…" : "확인하기"}</Button>
              : <Button variant="primary" size="md" fullWidth onClick={() => call(true)} disabled={busy || nothing}>{busy ? "가져오는 중…" : "가져오기"}</Button>}
          </div>
        </>
      )}
    </Card>
  );
}
