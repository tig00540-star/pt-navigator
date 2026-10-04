"use client";

/* =========================================================================
   PtDashboard — PT 회원을 누르면 처음 뜨는 화면의 윗부분(2026-10-02 · OT 대시보드와 같은 틀).
   한눈에: 누구인지(몇 번째 계약) → 숫자 6칸 → 이번 계약 진행 → 지금 할 일(버튼 하나) → 달라진 것.
   아래 '지난 수업'과 '더 보기(무게 그래프·인바디·회원 기록)'는 PtWorkoutTab(mode="view")가 그린다.
   데이터: 계약·수업 기록은 PTView가 읽어 넘긴다. 예약·인바디·오운완만 여기서 읽는다(회원 1명 소량).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, CalendarClock, Flame, Pencil, Scale, Ticket } from "lucide-react";
import { useAppUi } from "@/components/app/AppChrome";
import { supabase } from "@/lib/supabaseClient";
import { activeContract, remainingSessions, reregisterDue } from "@/lib/memberStatus";
import { buildExerciseSeries } from "@/lib/workout";
import { hasVal } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import RoadmapCard from "@/components/pt/RoadmapCard";
import RoutineCard from "@/components/pt/RoutineCard";
import RegistrationHistory from "@/components/pt/RegistrationHistory";

const KST_TODAY = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstDay = (iso) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : null);
const shortDate = (iso) => {
  if (!iso) return null;
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const dayLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (same(d, today)) return `오늘 ${time}`;
  if (same(d, tomorrow)) return `내일 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
};
const daysAgo = (iso) => {
  if (!iso) return null;
  const n = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return n <= 0 ? "오늘" : `${n}일 전`;
};
const delta = (a, b, unit) => {
  const d = Math.round((b - a) * 10) / 10;
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}${unit}`;
};

function Stat({ icon: Icon, label, value, sub, accent, onClick }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[12px] text-muted"><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}</div>
      <div className={`mt-1 text-[16px] font-semibold tracking-[-0.02em] ${accent ? "text-danger-text" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-sub">{sub}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="block rounded-xl bg-elevate px-3.5 py-3 text-left transition hover:bg-line/60">{body}</button>
  ) : (
    <div className="rounded-xl bg-elevate px-3.5 py-3">{body}</div>
  );
}

export default function PtDashboard({ member, contracts = [], logs = [], confirms = [] }) {
  const { openMemberEdit } = useAppUi();
  const [nextAppt, setNextAppt] = useState(null);
  const [todayAppt, setTodayAppt] = useState(false);
  const [inbody, setInbody] = useState([]);
  const [ounwan, setOunwan] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) return;
      const now = new Date();
      const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
      const [nx, td, ib, ow] = await Promise.all([
        supabase.from("appointment").select("start_at").eq("user_id", member.id).eq("status", "booked")
          .gte("start_at", now.toISOString()).order("start_at", { ascending: true }).limit(1),
        supabase.from("appointment").select("id").eq("user_id", member.id).neq("status", "canceled")
          .gte("start_at", startToday.toISOString()).lte("start_at", endToday.toISOString()).limit(1),
        supabase.from("inbody_log").select("measured_at, weight, skeletal_muscle, body_fat_pct")
          .eq("user_id", member.id).order("measured_at", { ascending: true }),
        // 오운완(개인운동 포함 출석일) — 회원 전용 페이지와 같은 서버 집계. 계정 전체 행에서 이 회원만 고른다.
        supabase.rpc("ounwan_ranking"),
      ]);
      if (cancelled) return;
      setNextAppt(nx.data?.[0] || null);
      setTodayAppt(Boolean(td.data?.length));
      setInbody(ib.data || []);
      setOunwan((ow.data || []).find((r) => r.user_id === member.id) || null);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const d = useMemo(() => {
    const active = activeContract(contracts, logs);
    const rem = remainingSessions(active, logs);
    const due = reregisterDue(active, logs, { contracts });
    const done = logs.filter((l) => !l.voided && l.source !== "noshow");
    const sorted = [...done].sort((a, b) => new Date(b.session_at ?? b.created_at) - new Date(a.session_at ?? a.created_at));
    const last = sorted[0] || null;
    const ym = KST_TODAY().slice(0, 7);
    const month = done.filter((l) => (kstDay(l.session_at ?? l.created_at) || "").startsWith(ym)).length;
    const wroteToday = logs.some((l) => !l.voided && kstDay(l.session_at ?? l.created_at) === KST_TODAY());
    const confirmed = new Set((confirms || []).filter((c) => c.result === "confirm").map((c) => c.log_id));
    const unconfirmed = done.filter((l) => !confirmed.has(l.id) && (kstDay(l.session_at ?? l.created_at) || "") < KST_TODAY()).length;
    // 몇 번째 계약 — 시작일 순서(인계로 닫힌 계약 포함 · 회원 입장에선 이어진 등록).
    const ordered = [...contracts].sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
    const nth = active ? ordered.findIndex((c) => c.id === active.id) + 1 : ordered.length;
    const total = active ? (active.sessions_total ?? 0) + (active.service_sessions ?? 0) : 0;
    const used = active ? total - rem.total : 0;
    // 달라진 것 — 운동: 처음과 지금 최고중량이 많이 는 종목 2개.
    const lifts = buildExerciseSeries(logs)
      .map((s) => { const p = s.points.filter((x) => x.topWeight != null); return p.length >= 2 ? { name: s.exercise, a: p[0].topWeight, b: p[p.length - 1].topWeight } : null; })
      .filter((x) => x && x.b !== x.a)
      .sort((x, y) => (y.b - y.a) - (x.b - x.a))
      .slice(0, 2);
    return { active, rem, due, last, month, wroteToday, unconfirmed, nth, total, used, lifts };
  }, [contracts, logs, confirms]);

  // 인바디 — 목표가 근력·벌크면 골격근·체중, 아니면 체중·체지방률.
  const ib = useMemo(() => {
    if (!inbody.length) return null;
    const first = inbody[0], latest = inbody[inbody.length - 1];
    const bulk = /벌크|근력|근육|증량/.test(String(member.goal || ""));
    const keys = bulk ? [["skeletal_muscle", "골격근", "kg"], ["weight", "체중", "kg"]] : [["weight", "체중", "kg"], ["body_fat_pct", "체지방률", "%"]];
    const parts = keys.filter(([k]) => latest[k] != null).map(([k, label, unit]) => ({
      label, now: `${latest[k]}${unit}`,
      d: inbody.length > 1 && first[k] != null ? delta(first[k], latest[k], unit === "%" ? "%p" : unit) : null,
    }));
    const changes = inbody.length > 1 ? [["weight", "체중", "kg"], ["skeletal_muscle", "골격근량", "kg"], ["body_fat_pct", "체지방률", "%"]]
      .filter(([k]) => first[k] != null && latest[k] != null && first[k] !== latest[k])
      .map(([k, label, unit]) => ({ label, a: `${first[k]}${unit}`, b: `${latest[k]}${unit}` })) : [];
    return { date: latest.measured_at, count: inbody.length, parts, changes };
  }, [inbody, member.goal]);

  const showInbody = () => {
    const el = document.getElementById("pt-more");
    if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };

  // 지금 할 일 — 가장 급한 하나만.
  const todo = !d.active && !contracts.length ? null
    : todayAppt && !d.wroteToday ? { href: `/pt/${member.id}/write`, title: "오늘 운동일지 쓰기", sub: "오늘 수업이 있어요" }
    : d.due || !d.active ? { href: `/pt/${member.id}/renewal`, title: "재등록 준비하기", sub: d.active ? `남은 수업 ${d.rem.total}회` : "진행 중인 계약이 없어요" }
    : d.unconfirmed > 0 ? { href: null, title: `회원 확인 대기 ${d.unconfirmed}건`, sub: "회원 전용 페이지에서 확인해 달라고 알려 주세요" }
    : null;

  const facts = [hasVal(member.age) && `${member.age}세`, hasVal(member.job) && member.job, hasVal(member.residence) && member.residence].filter(Boolean);
  const goalSet = hasVal(member.goal) && member.goal !== "미설정";
  const changes = [...(ib?.changes || []), ...d.lifts.map((l) => ({ label: l.name, a: `${l.a}kg`, b: `${l.b}kg` }))].slice(0, 4);

  return (
    <div className="space-y-4 break-keep text-pretty">
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pt-soft text-[15px] font-bold text-pt-text" aria-hidden="true">
            {(member.name || "?").slice(-2)}
          </div>
          <button type="button" onClick={() => openMemberEdit(member.id)}
            className="order-last inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[12px] text-sub transition hover:text-ink">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> 정보 수정
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">{member.name}</h1>
              <Badge tone="pt">{d.nth > 0 ? `PT · ${d.nth}번째 계약` : "PT"}</Badge>
            </div>
            {facts.length > 0 && <p className="mt-0.5 text-[13px] text-sub">{facts.join(" · ")}</p>}
            <p className="mt-1 text-[13px] text-sub">
              목표 {goalSet ? <span className="font-medium text-ink">{member.goal}</span> : <span className="text-muted">미설정</span>}
              {hasVal(member.pain) && <> · 불편 부위 <span className="font-medium text-ink">{member.pain}</span></>}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat icon={Ticket} label="남은 수업" value={d.active ? `${d.rem.total}회` : "계약 없음"}
            sub={d.active ? `유료 ${d.rem.paid} · 서비스 ${d.rem.service}` : "자료남기기에서 등록"} accent={d.due} />
          <Stat icon={CalendarClock} label="다음 수업" value={nextAppt ? dayLabel(nextAppt.start_at) : "예약 없음"}
            sub={nextAppt ? null : "스케줄에서 잡아 주세요"} accent={Boolean(nextAppt && dayLabel(nextAppt.start_at)?.startsWith("오늘"))} />
          <Stat icon={CalendarCheck2} label="최근 수업" value={d.last ? shortDate(d.last.session_at ?? d.last.created_at) : "아직 없음"}
            sub={d.last ? daysAgo(d.last.session_at ?? d.last.created_at) : null} />
          <Stat icon={Flame} label="이번 달 출석" value={`${d.month}회`} sub={ounwan ? `오운완 ${ounwan.month_count}일` : null} />
          <div className="col-span-2">
            <Stat icon={Scale} label={ib ? `인바디 · ${shortDate(ib.date)}${ib.count > 1 ? ` · ${ib.count}회 측정` : ""}` : "인바디"}
              value={ib && ib.parts.length ? (
                <span className="flex flex-wrap gap-x-3">
                  {ib.parts.map((p) => <span key={p.label} className="whitespace-nowrap">{p.label} {p.now}{p.d && <span className="ml-1 text-[13px] font-medium text-sub">({p.d})</span>}</span>)}
                </span>
              ) : "아직 측정 없음"}
              sub={ib ? "누르면 전체 보기" : "자료남기기에서 입력해요"} onClick={ib ? showInbody : undefined} />
          </div>
        </div>

        {d.active && d.total > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-muted">이번 계약</span>
              <span className="font-semibold text-ink">{d.used}/{d.total}회</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevate">
              <div className="h-full rounded-full bg-pt" style={{ width: `${Math.min(100, Math.round((d.used / d.total) * 100))}%` }} />
            </div>
          </div>
        )}
      </Card>

      {todo && (todo.href ? (
        <Link href={todo.href} className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-primary px-5 text-white no-underline shadow-sm transition hover:bg-primary-strong">
          <span>
            <span className="block text-[12px] text-white/80">지금 할 일 · {todo.sub}</span>
            <span className="block text-[17px] font-bold tracking-[-0.02em]">{todo.title}</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      ) : (
        <div className="rounded-2xl border border-line bg-card px-5 py-3.5">
          <span className="block text-[12px] text-muted">지금 할 일 · {todo.sub}</span>
          <span className="block text-[16px] font-bold tracking-[-0.02em] text-ink">{todo.title}</span>
        </div>
      ))}

      {/* 목표 로드맵 — 회원 전용 페이지 '내 PT'에 보이는 단계(트레이너가 만들고 켤 때만 · 2026-10-03) */}
      <RoadmapCard member={member} contracts={contracts} logs={logs} />

      {/* 개인운동 루틴 — 회원 전용 페이지 '오늘 할 개인운동'(트레이너 확정 · 보이기 켤 때만 · 2026-10-04) */}
      <RoutineCard member={member} logs={logs} />

      {/* 등록 이력 — 처음 계약부터 지금까지(2026-10-06 대표 요청) */}
      <RegistrationHistory contracts={contracts} logs={logs} />

      {changes.length > 0 && (
        <Card padding="none">
          <h2 className="px-5 pb-1 pt-4 text-[15px] font-bold text-ink">처음보다 달라진 것</h2>
          <ul className="divide-y divide-line">
            {changes.map((c) => (
              <li key={c.label} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[14px]">
                <span className="text-sub">{c.label}</span>
                <span className="text-ink">{c.a} → <b className="font-semibold">{c.b}</b></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
