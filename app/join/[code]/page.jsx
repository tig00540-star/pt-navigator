"use client";

/* =========================================================================
   OT 신청서(공개 · 로그인 없음 · 2026-10-06) — 트레이너 QR · 센터 QR · 카톡 링크로 연다.
   회원이 사전 문진 · 원하는 요일/시간 · 동의를 남기면:
     트레이너 QR → 그 트레이너의 OT 회원으로 바로 등록 · 센터 QR → 대표에게 '배정 대기'.
   저장은 /api/ot-intake(서버 · service_role · DB 함수) — 이 페이지는 DB에 직접 닿지 않는다.
   선택지는 트레이너 '신규 회원 등록'과 같은 lib/memberOptions · 동의 문구는 lib/consent.
   ========================================================================= */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ChevronDown } from "lucide-react";
import Wordmark from "@/components/ui/Wordmark";
import Button from "@/components/ui/Button";
import { GENERAL_CONSENT, HEALTH_CONSENT, LOG_CONFIRM_NOTICE } from "@/lib/consent";
import { MEMBER_OPTS, GENDER_OPTS } from "@/lib/memberOptions";
import { DAY_LABELS, SLOT_HOURS } from "@/lib/slots";

const inputCls = "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[16px] text-ink placeholder-muted outline-none focus:border-primary";

function Chip({ on, onClick, children, wide }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[44px] rounded-full border px-3.5 text-[15px] transition ${wide ? "" : "min-w-[44px]"} ${on ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>
      {children}
    </button>
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

// 하나만 고르는 칩(다시 누르면 해제) · 목록에 없으면 직접 쓰기
function OneOf({ opts, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => <Chip key={o} wide on={value === o} onClick={() => onChange(value === o ? "" : o)}>{o}</Chip>)}
    </div>
  );
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
  const [f, setF] = useState({ name: "", phone: "", age: "", gender: "", goal: "", goal_deadline: "", job: "",
    exercise_level: "", past_exercise: "", quit_reason: "", activity_level: "", training_pace: "", member_note: "",
    pain: "", injury_history: "" });
  const [days, setDays] = useState([]);
  const [hours, setHours] = useState([]);
  const [slotNote, setSlotNote] = useState("");
  const [agree, setAgree] = useState({ general: false, log_rule: false, health: false });
  const [hp, setHp] = useState("");   // 봇 막기(사람 눈엔 안 보임)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

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
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async () => {
    setErr("");
    if (!f.name.trim()) { setErr("이름을 입력해 주세요."); return; }
    if (!/^01[0-9]{8,9}$/.test(f.phone.replace(/[^0-9]/g, ""))) { setErr("휴대폰 번호를 확인해 주세요. 예: 010-1234-5678"); return; }
    if (!agree.general || !agree.log_rule) { setErr("필수 항목에 동의해 주세요."); return; }
    setBusy(true);
    try {
      const { pain, injury_history, ...rest } = f;
      const res = await fetch("/api/ot-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, name: f.name, phone: f.phone, website: hp,
          answers: { ...rest, ...(agree.health ? { pain, injury_history } : {}) },
          slots: { days, hours, note: slotNote },
          consent: agree,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setDone(d.kind || info?.kind || "trainer"); try { window.scrollTo({ top: 0 }); } catch { /* 무시 */ } return; }
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
  if (done) {
    return shell(
      <div className="mt-10 rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <p className="m-0 mt-3 text-[20px] font-extrabold tracking-[-0.02em]">신청했어요</p>
        <p className="m-0 mt-2 text-[15px] leading-relaxed text-sub">
          {done === "center" ? "센터에서 담당 트레이너를 정해 곧 연락드려요." : `${who || "담당 트레이너"}가 곧 연락드려요.`}
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
        {" "}미리 알려 주시면 첫 OT를 회원님께 맞춰 준비해요.
      </p>

      <div className="mt-5 space-y-4">
        <Section title="기본 정보">
          <label className="block"><Label>이름</Label>
            <input value={f.name} onChange={set("name")} maxLength={40} autoComplete="name" placeholder="홍길동" className={inputCls} /></label>
          <label className="block"><Label>휴대폰 번호</Label>
            <input value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" className={inputCls} />
            <span className="mt-1 block text-[13px] text-muted">트레이너가 OT 일정을 잡을 때 연락드리는 번호예요.</span></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><Label optional>나이</Label>
              <input value={f.age} onChange={(e) => set("age")(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} inputMode="numeric" placeholder="34" className={inputCls} /></label>
            <div><Label optional>성별</Label>
              <div className="flex gap-2">{GENDER_OPTS.map(([v, l]) => <Chip key={v} wide on={f.gender === v} onClick={() => set("gender")(f.gender === v ? "" : v)}>{l}</Chip>)}</div></div>
          </div>
        </Section>

        <Section title="원하는 요일 · 시간" hint="OT를 받을 수 있는 요일과 시간을 모두 눌러 주세요. 여러 개 골라도 돼요.">
          <div><Label>요일</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((d, i) => <Chip key={d} on={days.includes(i + 1)} onClick={() => toggle(days, setDays, i + 1)}>{d}</Chip>)}
            </div></div>
          <div><Label>시간 <span className="font-normal text-muted">(그 시각부터 1시간)</span></Label>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
              {SLOT_HOURS.map((h) => <Chip key={h} on={hours.includes(h)} onClick={() => toggle(hours, setHours, h)}>{h}시</Chip>)}
            </div></div>
          <label className="block"><Label optional>덧붙일 말</Label>
            <input value={slotNote} onChange={(e) => setSlotNote(e.target.value)} maxLength={100} placeholder="예: 화요일은 8시 이후만 돼요" className={inputCls} /></label>
        </Section>

        <Section title="운동 목표" hint="모두 선택이에요. 알려 주실수록 첫 OT가 잘 맞춰져요.">
          <div><Label optional>목표</Label><OneOf opts={MEMBER_OPTS.goal} value={f.goal} onChange={set("goal")} /></div>
          <label className="block"><Label optional>언제까지 · 계기</Label>
            <input value={f.goal_deadline} onChange={set("goal_deadline")} maxLength={60} placeholder="예: 8월 결혼식" className={inputCls} /></label>
          <div><Label optional>원하는 페이스</Label><OneOf opts={MEMBER_OPTS.training_pace} value={f.training_pace} onChange={set("training_pace")} /></div>
        </Section>

        <Section title="운동 · 생활" hint="모두 선택이에요.">
          <div><Label optional>운동 경험</Label><OneOf opts={MEMBER_OPTS.exercise_level} value={f.exercise_level} onChange={set("exercise_level")} /></div>
          <div><Label optional>받아 본 유료 운동</Label><OneOf opts={MEMBER_OPTS.past_exercise} value={f.past_exercise} onChange={set("past_exercise")} /></div>
          <div><Label optional>예전에 그만둔 이유</Label><OneOf opts={MEMBER_OPTS.quit_reason} value={f.quit_reason} onChange={set("quit_reason")} /></div>
          <div><Label optional>하루 활동량</Label><OneOf opts={MEMBER_OPTS.activity_level} value={f.activity_level} onChange={set("activity_level")} /></div>
          <label className="block"><Label optional>직업</Label>
            <input value={f.job} onChange={set("job")} maxLength={60} placeholder="예: 사무직" className={inputCls} /></label>
          <label className="block"><Label optional>트레이너에게 바라는 점</Label>
            <textarea value={f.member_note} onChange={set("member_note")} maxLength={300} rows={3} placeholder="예: 허리가 자주 뻐근해요. 천천히 배우고 싶어요." className={inputCls} /></label>
        </Section>

        <Section title="동의">
          <ConsentBox c={GENERAL_CONSENT} checked={agree.general} onChange={(v) => setAgree((a) => ({ ...a, general: v }))} />
          <ConsentBox c={LOG_CONFIRM_NOTICE} checked={agree.log_rule} onChange={(v) => setAgree((a) => ({ ...a, log_rule: v }))} />
          <ConsentBox c={HEALTH_CONSENT} checked={agree.health} onChange={(v) => setAgree((a) => ({ ...a, health: v }))} />
          {agree.health && (
            <div className="space-y-3 rounded-xl border border-line p-3.5">
              <label className="block"><Label optional>불편한 부위</Label>
                <input value={f.pain} onChange={set("pain")} maxLength={120} placeholder="예: 오른쪽 무릎" className={inputCls} /></label>
              <label className="block"><Label optional>부상 · 수술 이력</Label>
                <input value={f.injury_history} onChange={set("injury_history")} maxLength={120} placeholder="예: 없음 / 2년 전 무릎 수술" className={inputCls} /></label>
            </div>
          )}
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
