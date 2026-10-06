"use client";

/* =========================================================================
   OT 신청서(공개 · 로그인 없음 · 2026-10-06) — 트레이너 QR · 센터 QR · 카톡 링크로 연다.
   2단계(회원이 중간에 접지 않게): ① 꼭 필요한 것(이름 · 번호 · 요일/시간 · 동의)만 받고 바로 신청 저장
   ② '1분만 더' 질문을 한 화면에 하나씩(components/intake/IntakeMore · 누를 때마다 저장 · 건너뛰기).
   신청이 저장되면:
     트레이너 QR → 그 트레이너의 OT 회원으로 바로 등록 · 센터 QR → 대표에게 '배정 대기'.
   저장은 /api/ot-intake(서버 · service_role · DB 함수) — 이 페이지는 DB에 직접 닿지 않는다.
   선택지는 트레이너 '신규 회원 등록'과 같은 lib/memberOptions · 동의 문구는 lib/consent.
   ========================================================================= */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ChevronDown } from "lucide-react";
import Wordmark from "@/components/ui/Wordmark";
import Button from "@/components/ui/Button";
import { GENERAL_CONSENT, LOG_CONFIRM_NOTICE } from "@/lib/consent";
import IntakeMore from "@/components/intake/IntakeMore";
import { DAY_LABELS, SLOT_HOURS } from "@/lib/slots";

const inputCls = "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[16px] text-ink placeholder-muted outline-none focus:border-primary";

// tight = 칸 그리드(요일 · 시간) — 칸 폭에 맞춰 여백 없이(360px 폰에서도 한 줄 7칸).
function Chip({ on, onClick, children, wide, tight }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[44px] rounded-full border text-[15px] transition ${tight ? "min-w-0 px-0" : wide ? "px-3.5" : "min-w-[44px] px-3.5"} ${on ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>
      {children}
    </button>
  );
}

// 시간 칸(6~23시 · 그 시각부터 1시간) — 360px 폰에서 한 줄 6칸
function HourGrid({ value, onToggle }) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {SLOT_HOURS.map((h) => <Chip key={h} tight on={value.includes(h)} onClick={() => onToggle(h)}>{h}시</Chip>)}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <h2 className="m-0 text-[16px] font-bold text-ink">{title}</h2>
      {hint && <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-sub">{hint}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Label({ children, optional }) {
  return <span className="mb-1.5 block text-[14px] font-semibold text-sub">{children}{optional && <span className="font-normal text-muted"> (선택)</span>}</span>;
}

function ConsentBox({ c, checked, onChange }) {
  return (
    <div className="rounded-xl border border-line bg-elevate p-3.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
        <span className="text-[15px] font-bold leading-snug text-ink">
          <span className={c.required ? "text-primary-strong" : "text-sub"}>[{c.required ? "필수" : "선택"}]</span> {c.title}
        </span>
      </label>
      <details className="group mt-2">
        <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-sub [&::-webkit-details-marker]:hidden">
          내용 보기 <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mt-1 space-y-1.5">
          {c.rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[64px_1fr] gap-2 text-[13px] leading-relaxed">
              <dt className="font-semibold text-sub">{k}</dt><dd className="m-0 text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

export default function JoinPage() {
  const { code } = useParams();
  const [info, setInfo] = useState(null);   // null=불러오는 중 · {ok,...} · {error}
  const [f, setF] = useState({ name: "", phone: "" });
  // 원하는 요일 · 시간(2026-10-06 v2) — 요일을 고르고, 기본은 '고른 요일 모두 같은 시간' 한 줄.
  //   '요일마다 시간이 달라요'를 켜면 요일마다 시간 줄이 따로 생긴다(트레이너가 '월 7시'인지 '수 7시'인지 헷갈리지 않게).
  const [days, setDays] = useState([]);
  const [common, setCommon] = useState([]);   // 같은 시간일 때
  const [perDay, setPerDay] = useState({});   // 요일마다: { 1: [19,20], ... }
  const [split, setSplit] = useState(false);
  const [slotNote, setSlotNote] = useState("");
  const [agree, setAgree] = useState({ general: false, log_rule: false });
  const [hp, setHp] = useState("");   // 봇 막기(사람 눈엔 안 보임)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);      // 1단계 저장 결과 { kind, app, token }
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/ot-intake?code=${encodeURIComponent(code || "")}`);
        const d = await res.json().catch(() => ({ error: "invalid" }));
        if (alive) setInfo(d);
      } catch { if (alive) setInfo({ error: "network" }); }
    })();
    return () => { alive = false; };
  }, [code]);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value }));
  const flip = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const toggleDay = (d) => setDays((x) => flip(x, d));
  // 같은 시간 → 요일마다로 바꿀 때 지금 고른 시간을 요일마다 채워 둔다(처음부터 다시 누르지 않게) · 반대로 돌아오면 첫 요일 시간을 공통으로.
  const toggleSplit = (on) => {
    if (on) setPerDay(Object.fromEntries(days.map((d) => [d, [...common]])));
    else { const first = [...days].sort((a, b) => a - b)[0]; setCommon([...(perDay[first] || common)]); }
    setSplit(on);
  };
  const dayList = [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d - 1]).join("·");

  const submit = async () => {
    setErr("");
    if (!f.name.trim()) { setErr("이름을 입력해 주세요."); return; }
    if (!/^01[0-9]{8,9}$/.test(f.phone.replace(/[^0-9]/g, ""))) { setErr("휴대폰 번호를 확인해 주세요. 예: 010-1234-5678"); return; }
    if (!agree.general || !agree.log_rule) { setErr("필수 항목에 동의해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/ot-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, name: f.name, phone: f.phone, website: hp,
          answers: {},
          slots: { by_day: Object.fromEntries(days.map((d) => [d, split ? perDay[d] || [] : common])), note: slotNote },
          consent: agree,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setDone({ kind: d.kind || info?.kind || "trainer", app: d.app, token: d.token }); try { window.scrollTo({ top: 0 }); } catch { /* 무시 */ } return; }
      setErr(d.error === "busy" ? "지금 신청이 많아요. 잠시 뒤 다시 시도해 주세요."
        : d.error === "invalid" || d.error === "closed" ? "이 신청서는 닫혔어요. 센터에 새 링크를 요청해 주세요."
        : "신청하지 못했어요. 다시 시도해 주세요.");
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const shell = (children) => (
    <div className="min-h-screen break-keep bg-bg text-pretty text-ink antialiased">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
          <Wordmark className="text-[13px] font-extrabold tracking-[-0.05em]" />
        </div>
        {children}
      </div>
    </div>
  );

  if (info === null) return shell(<p className="mt-16 text-center text-[15px] text-sub">불러오는 중이에요</p>);
  if (!info.ok) {
    return shell(
      <div className="mt-10 rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <p className="m-0 text-[17px] font-bold">{info.error === "network" ? "신청서를 열지 못했어요" : "이 신청서는 닫혔어요"}</p>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">
          {info.error === "network" ? "인터넷 연결을 확인하고 다시 열어 주세요." : "링크가 바뀌었거나 센터가 신청을 받지 않고 있어요. 센터에 새 링크를 요청해 주세요."}
        </p>
      </div>
    );
  }

  const who = info.kind === "trainer" && info.trainer ? `${info.trainer} 트레이너` : null;
  if (done && !finished && done.app && done.token) {
    return shell(<IntakeMore app={done.app} token={done.token} kind={done.kind} onDone={() => { setFinished(true); try { window.scrollTo({ top: 0 }); } catch { /* 무시 */ } }} />);
  }
  if (done) {
    return shell(
      <div className="mt-10 rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <p className="m-0 mt-3 text-[20px] font-extrabold tracking-[-0.02em]">신청했어요</p>
        <p className="m-0 mt-2 text-[15px] leading-relaxed text-sub">
          {done.kind === "center" ? "센터에서 담당 트레이너를 정해 곧 연락드려요." : `${who || "담당 트레이너"}가 곧 연락드려요.`}
          <br />남겨 주신 시간에 맞춰 첫 OT를 잡아 드릴게요.
        </p>
      </div>
    );
  }

  return shell(
    <>
      <h1 className="m-0 mt-4 text-[24px] font-extrabold leading-tight tracking-[-0.03em]">OT 신청서</h1>
      <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-sub">
        {info.center ? `${info.center} · ` : ""}{who ? `${who}가 받아요.` : "센터에서 담당 트레이너를 정해 연락드려요."}
        {" "}30초면 신청돼요.
      </p>

      <div className="mt-5 space-y-4">
        <Section title="기본 정보">
          <label className="block"><Label>이름</Label>
            <input value={f.name} onChange={set("name")} maxLength={40} autoComplete="name" placeholder="홍길동" className={inputCls} /></label>
          <label className="block"><Label>휴대폰 번호</Label>
            <input value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" className={inputCls} />
            <span className="mt-1 block text-[13px] text-muted">트레이너가 OT 일정을 잡을 때 연락드리는 번호예요.</span></label>
        </Section>

        <Section title="원하는 요일 · 시간" hint="OT를 받을 수 있는 요일을 고르고, 그 요일에 되는 시간을 눌러 주세요. 여러 개 골라도 돼요.">
          <div><Label>요일</Label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((d, i) => <Chip key={d} tight on={days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>{d}</Chip>)}
            </div></div>
          {days.length > 1 && (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-elevate px-3.5">
              <input type="checkbox" checked={split} onChange={(e) => toggleSplit(e.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="text-[15px] text-ink">요일마다 되는 시간이 달라요</span>
            </label>
          )}
          {days.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">요일을 먼저 골라 주세요.</p>
          ) : !split ? (
            <div><Label>{days.length > 1 ? `시간 (${dayList} 모두)` : `${DAY_LABELS[days[0] - 1]}요일 시간`} <span className="font-normal text-muted">· 그 시각부터 1시간</span></Label>
              <HourGrid value={common} onToggle={(h) => setCommon((x) => flip(x, h))} /></div>
          ) : (
            [...days].sort((a, b) => a - b).map((d, idx, arr) => (
              <div key={d} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink">{DAY_LABELS[d - 1]}요일</span>
                  {idx > 0 && (
                    <button type="button" onClick={() => setPerDay((p) => ({ ...p, [d]: [...(p[arr[idx - 1]] || [])] }))}
                      className="min-h-[36px] px-1 text-[13px] font-semibold text-sub">{DAY_LABELS[arr[idx - 1] - 1]}요일과 같게</button>
                  )}
                </div>
                <HourGrid value={perDay[d] || []} onToggle={(h) => setPerDay((p) => ({ ...p, [d]: flip(p[d] || [], h) }))} />
              </div>
            ))
          )}
          <label className="block"><Label optional>덧붙일 말</Label>
            <input value={slotNote} onChange={(e) => setSlotNote(e.target.value)} maxLength={100} placeholder="예: 둘째 주 화요일은 안 돼요" className={inputCls} /></label>
        </Section>

        <Section title="동의">
          <ConsentBox c={GENERAL_CONSENT} checked={agree.general} onChange={(v) => setAgree((a) => ({ ...a, general: v }))} />
          <ConsentBox c={LOG_CONFIRM_NOTICE} checked={agree.log_rule} onChange={(v) => setAgree((a) => ({ ...a, log_rule: v }))} />
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            자세한 내용은 <a href="/legal/privacy" target="_blank" rel="noreferrer" className="font-semibold text-sub underline underline-offset-2">개인정보처리방침</a>에서 볼 수 있어요.
          </p>
        </Section>

        {/* 봇 막기 — 화면 밖 칸(사람은 못 봄 · 채워지면 서버가 조용히 버림) */}
        <input value={hp} onChange={(e) => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />

        {err && <p className="m-0 text-[14px] text-danger-text" role="alert">{err}</p>}
        <Button variant="primary" size="md" fullWidth onClick={submit} disabled={busy}>
          {busy ? "보내는 중…" : "OT 신청하기"}
        </Button>
        <p className="m-0 pb-6 text-center text-[13px] text-muted">신청하면 트레이너가 남겨 주신 번호로 연락드려요.</p>
      </div>
    </>
  );
}
