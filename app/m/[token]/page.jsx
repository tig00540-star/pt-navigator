"use client";

/* =========================================================================
   회원 홈 (/m/<member_token>) — 읽기전용. 끝4 로그인(S1 라우트) → setSession →
   안전 뷰 3개(member_me·member_workout_log·member_inbody) 조회. 자가입력 없음·매출요소 0.
   트레이너 앱과 같은 토큰(bg·card·ink·line·primary)이되 회원용이라 글씨 크게·정보 밀도 낮게.
   ========================================================================= */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { NotebookPen, Scale, TrendingUp, TrendingDown, Minus, LogOut } from "lucide-react";
import { memberSupabase } from "@/lib/memberSupabase";
import { INBODY_FIELDS } from "@/lib/labels";
import Eyebrow from "@/components/ui/Eyebrow";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";

// purge-safe delta 색 맵(PtInbodyTab 재사용 패턴 · 동적 조립 금지).
const DELTA_TONE = { good: "text-primary-strong", bad: "text-rose-600", flat: "text-muted" };

// 변화 방향 → 좋음/나쁨/중립. before·cur 하나라도 null이면 null(표시 안 함).
function deltaTone(field, cur, before) {
  if (cur == null || before == null) return null;
  const d = cur - before;
  if (d === 0 || !field.goodDir) return "flat";
  if ((d > 0 && field.goodDir === "up") || (d < 0 && field.goodDir === "down")) return "good";
  return "bad";
}

// 미니 스파크라인(오래된→최신 · 값 2개 미만이면 안 그림).
function Sparkline({ values }) {
  const w = 100, h = 28, pad = 3;
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const stepX = w / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = i * stepX;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="mt-1 text-primary/70">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// 날짜 표기(브라우저=KST 전제). arg 있는 new Date라 purity 규칙 무관.
function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}
const fmtDelta = (d) => (d > 0 ? "+" : "") + (Math.round(d * 10) / 10);

function ScreenMsg({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function LoginCard({ last4, setLast4, onSubmit, busy, err }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-ink">내 운동 기록</div>
          <div className="mt-1 text-sm text-muted">본인 확인 후 열람할 수 있어요</div>
        </div>
        <label className="mb-1.5 block text-sm font-medium text-sub">휴대폰 뒤 4자리</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          placeholder="0000"
          className="w-full rounded-lg border border-line bg-elevate px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] text-ink placeholder-muted outline-none focus:border-primary"
        />
        {err && <div className="mt-2 text-sm text-rose-600">{err}</div>}
        <div className="mt-4">
          <Button variant="primary" size="md" fullWidth onClick={onSubmit} disabled={busy}>
            {busy ? "확인 중…" : "확인"}
          </Button>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          담당 트레이너가 보내준 링크로 접속하셨어요. 본인 기록만 안전하게 열람됩니다.
        </p>
      </div>
    </div>
  );
}

function HomeView({ me, logs, inbody, onSignOut }) {
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-ink">정보를 불러오지 못했어요</div>
          <p className="mt-2 text-sm text-muted">다시 로그인해 주세요.</p>
          <div className="mt-4">
            <Button variant="ghost" size="md" fullWidth onClick={onSignOut}>다시 로그인</Button>
          </div>
        </div>
      </div>
    );
  }

  const latest = inbody.length ? inbody[inbody.length - 1] : null;
  const prev = inbody.length > 1 ? inbody[inbody.length - 2] : null;

  return (
    <div className="min-h-screen bg-bg pb-16 text-ink antialiased">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {/* 프로필 헤더 */}
        <header className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-strong">MY RECORD</div>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">{me.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-sub">
            {me.goal && <span className="rounded-full bg-elevate px-3 py-1">목표 · {me.goal}</span>}
            {me.goal_deadline && <span className="rounded-full bg-elevate px-3 py-1">시점 · {me.goal_deadline}</span>}
            {me.trainer_name && <span className="rounded-full bg-elevate px-3 py-1">담당 · {me.trainer_name}</span>}
          </div>
        </header>

        {/* 수업일지 타임라인 */}
        <section className="mb-8">
          <Eyebrow icon={NotebookPen}>내 수업일지</Eyebrow>
          {logs.length === 0 ? (
            <EmptyState className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
              아직 기록된 수업일지가 없어요.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {logs.map((l) => (
                <li key={l.id} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-primary-strong">{fmtDay(l.created_at)}</div>
                  {l.ai_summary ? (
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{l.ai_summary}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted">이 수업은 상세 내용이 없어요.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 인바디 추이 */}
        <section className="mb-8">
          <Eyebrow icon={Scale}>인바디 변화</Eyebrow>
          {!latest ? (
            <EmptyState className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
              아직 인바디 기록이 없어요.
            </EmptyState>
          ) : (
            <>
              <div className="mb-2 text-xs text-muted">최근 측정 · {fmtDay(latest.measured_at)}{prev ? " (직전 대비)" : ""}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {INBODY_FIELDS.map((f) => {
                  const cur = latest[f.key];
                  const before = prev?.[f.key];
                  const tone = deltaTone(f, cur, before);
                  const d = tone && before != null ? cur - before : 0;
                  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
                  return (
                    <div key={f.key} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-wider text-muted">{f.label}</div>
                      <div className="mt-1 font-mono text-2xl font-bold text-ink">
                        {cur == null ? "–" : cur}
                        <span className="ml-1 text-xs font-normal text-muted">{f.unit}</span>
                      </div>
                      {tone && (
                        <div className={`mt-1 flex items-center gap-1 text-[13px] font-semibold ${DELTA_TONE[tone]}`}>
                          <Icon className="h-3.5 w-3.5" /> {fmtDelta(d)}{f.unit}
                        </div>
                      )}
                      <Sparkline values={inbody.map((r) => r[f.key])} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* 로그아웃 */}
        <div className="text-center">
          <button onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:text-ink">
            <LogOut className="h-3.5 w-3.5" /> 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemberHome() {
  const { token } = useParams();
  const [phase, setPhase] = useState("checking"); // checking | login | home
  const [me, setMe] = useState(null);
  const [logs, setLogs] = useState([]);
  const [inbody, setInbody] = useState([]);
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadHome = useCallback(async () => {
    if (!memberSupabase) return;
    const [meRes, logRes, inbodyRes] = await Promise.all([
      memberSupabase.from("member_me").select("*").maybeSingle(),
      memberSupabase.from("member_workout_log").select("*").order("created_at", { ascending: false }),
      memberSupabase.from("member_inbody").select("*").order("measured_at", { ascending: true }),
    ]);
    setMe(meRes.data ?? null);
    setLogs(logRes.data ?? []);
    setInbody(inbodyRes.data ?? []);
    setPhase("home");
  }, []);

  // 기존 세션 있으면 바로 홈, 없으면 로그인. setState는 async IIFE 안에서(set-state-in-effect 회피).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!memberSupabase) { if (alive) setPhase("login"); return; }
      const { data } = await memberSupabase.auth.getSession();
      if (!alive) return;
      if (data.session) loadHome();
      else setPhase("login");
    })();
    return () => { alive = false; };
  }, [loadHome]);

  const submit = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드 — 키가 없어 로그인할 수 없어요."); return; }
    if (!/^\d{4}$/.test(last4)) { setErr("휴대폰 뒤 4자리를 입력하세요."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/member-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phoneLast4: last4 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) { setErr(json.error || "확인에 실패했습니다."); setBusy(false); return; }
      await memberSupabase.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      });
      await loadHome();
    } catch {
      setErr("네트워크 오류. 잠시 후 다시 시도하세요.");
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (memberSupabase) await memberSupabase.auth.signOut();
    setMe(null); setLogs([]); setInbody([]); setLast4(""); setPhase("login");
  };

  if (phase === "checking") return <ScreenMsg>불러오는 중…</ScreenMsg>;
  if (phase === "login")
    return <LoginCard last4={last4} setLast4={setLast4} onSubmit={submit} busy={busy} err={err} />;
  return <HomeView me={me} logs={logs} inbody={inbody} onSignOut={signOut} />;
}
