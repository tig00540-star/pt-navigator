"use client";

/* 회원 전용 페이지 첫 화면 동의(2026-10-05) — 개인정보(필수) · 건강정보(선택)를 따로 묻고 member_consent에 남긴다.
   필수 동의 전에는 기록을 보여 주지 않는다. 표가 없거나(SQL 전) 조회 실패면 호출부가 이 화면을 건너뛴다(잠금 금지).
   문구는 lib/consent.js 한 곳. */

import { useState } from "react";
import Wordmark from "@/components/ui/Wordmark";
import Button from "@/components/ui/Button";
import { CONSENT_VERSION, GENERAL_CONSENT, HEALTH_CONSENT, LOG_CONFIRM_NOTICE } from "@/lib/consent";

function Block({ c, checked, onChange }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary" />
        <span className="text-[16px] font-bold leading-snug text-ink">
          <span className={c.required ? "text-primary-strong" : "text-sub"}>[{c.required ? "필수" : "선택"}]</span> {c.title}
        </span>
      </label>
      <dl className="mt-3 space-y-2 border-t border-line pt-3">
        {c.rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[72px_1fr] gap-2 text-[13.5px] leading-relaxed">
            <dt className="font-semibold text-sub">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// prev = 지난 동의(latestConsent 결과 · 없으면 null) — 문구가 바뀌어 다시 묻는 경우 '바뀐 것'을 먼저 알리고,
//   건강정보에 이미 동의했으면 그 칸은 다시 안 묻는다(동의는 그대로 유지).
export default function ConsentGate({ supabase, me, onDone, onSignOut, prev = null }) {
  const again = Boolean(prev?.general?.agreed);
  const healthKept = Boolean(prev?.health?.agreed);
  const [general, setGeneral] = useState(false);
  const [logRule, setLogRule] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!general || !logRule || busy) return;
    setBusy(true); setErr("");
    try {
      // 건강정보는 체크했을 때만 남긴다 — 안 체크한 건 '아직 동의 안 함'(기록 없음)이지 '철회'가 아니다(2026-10-06).
      //   철회 기록이 생기면 트레이너가 종이 동의를 받아도 체크할 수 없게 막히기 때문.
      const rows = [{ member_id: me.id, kind: "general", agreed: true, method: "member_page", version: CONSENT_VERSION }];
      if (health) rows.push({ member_id: me.id, kind: "health", agreed: true, method: "member_page", version: CONSENT_VERSION });
      const { data, error } = await supabase.from("member_consent").insert(rows).select("kind, agreed, created_at, version");
      if (error || !data || data.length === 0) {
        console.error("동의 저장 실패", error);
        setErr("저장하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      onDone?.(data);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen break-keep bg-bg text-pretty text-ink antialiased">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="오직 트레이너" className="h-7 w-7 rounded-lg" />
          <Wordmark className="text-[13px] font-extrabold tracking-[-0.05em]" />
        </div>
        <h1 className="mt-4 text-[24px] font-extrabold leading-tight tracking-[-0.03em]">{again ? <>바뀐 내용이 있어요<br />확인해 주세요</> : <>시작하기 전에<br />확인해 주세요</>}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-sub">
          {again
            ? "운동일지 확인 방법이 바뀌었어요. 확인할 때 손가락으로 서명하고, 수업 뒤 24시간 안에 확인하지 않으면 확인한 것으로 봐요(폰 알림으로 알려 드려요). 아래 내용을 읽고 다시 동의해 주세요."
            : `${me.center_name ? `${me.center_name}에서` : "센터에서"} ${me.name} 회원님의 운동 기록을 이 페이지로 보여 드려요. 아래 내용을 읽고 동의해 주세요.`}
        </p>

        <div className="mt-5 space-y-3">
          <Block c={LOG_CONFIRM_NOTICE} checked={logRule} onChange={setLogRule} />
          <Block c={GENERAL_CONSENT} checked={general} onChange={setGeneral} />
          {!healthKept && <Block c={HEALTH_CONSENT} checked={health} onChange={setHealth} />}
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          AI 처리를 위한 국외 이전 등 자세한 내용은{" "}
          <a href="/legal/privacy" target="_blank" rel="noreferrer" className="font-semibold text-sub underline underline-offset-2">개인정보처리방침</a>
          에서 볼 수 있어요. 건강정보 동의는 이 페이지 맨 아래에서 언제든 바꿀 수 있어요.
        </p>

        {err && <p className="mt-3 text-[14px] text-danger-text">{err}</p>}
        <div className="mt-5">
          <Button variant="primary" size="md" fullWidth onClick={submit} disabled={!general || !logRule || busy}>
            {busy ? "저장 중…" : general && logRule ? "동의하고 시작하기" : "필수 항목에 동의해 주세요"}
          </Button>
        </div>
        <div className="mt-3 text-center">
          <button type="button" onClick={onSignOut} className="px-3 py-2 text-[13px] font-medium text-muted hover:text-ink">나가기</button>
        </div>
      </div>
    </div>
  );
}
