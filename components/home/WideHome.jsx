"use client";

/* =========================================================================
   WideHome — 태블릿 가로·PC(lg 1024px~) 전용 홈(2026-10-02 미리보기 · 대표 요청).
   폰 홈(TrainerHub = 바로가기 타일)과 따로 — 넓은 화면에선 '오늘 할 일'을 한 화면에 다 펼친다.
     위: 인사 + 숫자 4칸(오늘 수업 · 오늘 신규 OT · 운동일지 확인 대기 · 회원 페이지 새 기록)
     3열: ① 오늘 일정  ② 오늘 챙길 회원(재접근·재등록·클로징 미마감·이탈 위험)  ③ 회원 쪽 소식(확인 대기·새 기록·다음 예약 없음)
   ②·③의 기존 위젯은 '오늘' 화면과 같은 컴포넌트를 그대로 쓴다(숫자 기준 하나). 새로 만든 건 일정·확인 대기·새 기록뿐.
   범위: 트레이너 본인 담당(대표는 '내 담당' — TodoTab과 같은 규칙). 읽기 전용(쓰기 0).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Camera, CheckCircle2, ClipboardCheck, Footprints, HeartPulse, Sparkles, UserPlus, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import { hrefFor, hrefForMember } from "@/lib/nav";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ReapproachToday from "@/components/views/ReapproachToday";
import RegisterDueToday from "@/components/views/RegisterDueToday";
import RegisterReapproachToday from "@/components/views/RegisterReapproachToday";
import UnclosedClosingToday from "@/components/views/UnclosedClosingToday";
import ChurnRiskToday from "@/components/views/ChurnRiskToday";
import NoNextBookingToday from "@/components/views/NoNextBookingToday";
import PastDueAppointments from "@/components/views/PastDueAppointments";
import TodoManual from "@/components/views/TodoManual";
import OwnerFeedbackToday from "@/components/views/OwnerFeedbackToday";
import InbodyDueToday from "@/components/views/InbodyDueToday";
import OunwanRanking from "@/components/home/OunwanRanking";
import SectionTitle from "@/components/ui/SectionTitle";

const ymdKST = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayAgo = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "오늘" : days === 1 ? "어제" : `${days}일 전`;
};

function Stat({ icon: Icon, label, value, sub, tone = "ink" }) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === "primary" ? "bg-primary-soft text-primary-strong" : tone === "ot" ? "bg-ot-soft text-ot-text" : "bg-elevate text-sub"}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] text-muted">{label}</span>
        <span className="block text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink">{value}</span>
        {sub && <span className="block truncate text-[12px] text-sub">{sub}</span>}
      </span>
    </Card>
  );
}

function Column({ title, icon: Icon, children, empty }) {
  return (
    <section className="min-w-0 space-y-3">
      <SectionTitle icon={Icon} className="mb-0">{title}</SectionTitle>
      {children}
      {empty}
    </section>
  );
}

export default function WideHome({ members = [], uid, trainerName, go }) {
  // 대표는 계정 전체가 넘어온다 → 홈은 '내 담당'만(TodoTab과 같은 규칙). 트레이너는 이미 본인 것뿐.
  //   단, 직접 맡은 회원이 없는 대표는 센터 전체를 본다(회원 목록과 같은 규칙).
  const centerWide = Boolean(uid) && members.length > 0 && !members.some((m) => m.trainer_id === uid);
  const scoped = useMemo(() => (uid && !centerWide ? members.filter((m) => m.trainer_id === uid) : members), [members, uid, centerWide]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [appts, setAppts] = useState([]);
  const [unconfirmed, setUnconfirmed] = useState([]); // [{user_id, n}]
  const [activity, setActivity] = useState([]); // [{user_id, items:[{kind,label,at}]}]
  const idsKey = scoped.map((m) => m.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !uid) return;
      const today = ymdKST(new Date());
      const startMs = new Date(`${today}T00:00:00+09:00`).getTime();
      const ids = idsKey ? idsKey.split(",") : [];
      const since30 = new Date(startMs - 30 * 86400000).toISOString();
      const since3 = new Date(startMs - 2 * 86400000).toISOString(); // 그제 0시부터 = 최근 3일
      let apQ = supabase.from("appointment").select("id, user_id, start_at, status").neq("status", "canceled");
      if (!centerWide) apQ = apQ.eq("trainer_id", uid);
      const [ap, logs, conf, cardio, photo, sched] = await Promise.all([
        apQ
          .gte("start_at", new Date(startMs).toISOString()).lt("start_at", new Date(startMs + 86400000).toISOString())
          .order("start_at", { ascending: true }),
        ids.length ? supabase.from("daily_workout_log").select("id, user_id, session_at, created_at, voided, source").in("user_id", ids).gte("created_at", since30) : { data: [] },
        ids.length ? supabase.from("workout_log_confirmation").select("log_id").eq("result", "confirm").in("member_id", ids) : { data: [] },
        ids.length ? supabase.from("cardio_log").select("user_id, kind, minutes, created_at").in("user_id", ids).gte("created_at", since3) : { data: [] },
        ids.length ? supabase.from("member_photo").select("user_id, label, created_at").in("user_id", ids).gte("created_at", since3) : { data: [] },
        ids.length ? supabase.from("schedule_check").select("user_id, kind, created_at").in("user_id", ids).gte("created_at", since3) : { data: [] },
      ]);
      if (cancelled) return;
      setAppts(ap.data || []);

      // 운동일지 확인 대기 — 회원 게이트와 같은 정의: 실수업(무효·노쇼 제외) + 오늘 이전 + 확인 없음.
      const ok = new Set((conf.data || []).map((c) => c.log_id));
      const cnt = new Map();
      for (const l of logs.data || []) {
        if (l.voided === true || (l.source ?? "") === "noshow" || ok.has(l.id)) continue;
        if (ymdKST(new Date(l.session_at ?? l.created_at)) >= today) continue;
        cnt.set(l.user_id, (cnt.get(l.user_id) || 0) + 1);
      }
      setUnconfirmed([...cnt].map(([user_id, n]) => ({ user_id, n })).sort((a, b) => b.n - a.n));

      // 회원 페이지 새 기록(최근 3일) — 회원이 직접 남긴 것.
      const acts = new Map();
      const push = (uidM, item) => { const a = acts.get(uidM) || []; a.push(item); acts.set(uidM, a); };
      for (const c of cardio.data || []) push(c.user_id, { kind: "cardio", label: `유산소${c.minutes ? ` ${c.minutes}분` : ""}`, at: c.created_at });
      for (const p of photo.data || []) push(p.user_id, { kind: "photo", label: `사진${p.label ? ` · ${p.label}` : ""}`, at: p.created_at });
      for (const s of sched.data || []) push(s.user_id, { kind: "self", label: "개인운동", at: s.created_at });
      setActivity([...acts].map(([user_id, items]) => ({ user_id, items: items.sort((a, b) => (a.at < b.at ? 1 : -1)) }))
        .sort((a, b) => (a.items[0].at < b.items[0].at ? 1 : -1)));
    })();
    return () => { cancelled = true; };
  }, [uid, idsKey, centerWide]);

  const todayOt = appts.filter((a) => byId.get(a.user_id) && viewFor(byId.get(a.user_id)) === "ot");
  const done = appts.filter((a) => a.status === "done").length;
  const now = new Date();
  const dateLabel = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const nameOf = (id) => byId.get(id)?.name || "회원";
  const open = (id) => { const m = byId.get(id); return hrefForMember(id, m ? viewFor(m) : "ot"); };

  return (
    <div className="space-y-6 break-keep text-pretty">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">{dateLabel}</p>
          <h1 className="mt-0.5 text-[24px] font-bold tracking-[-0.03em] text-ink">{trainerName ? `${trainerName}님, 오늘 할 일이에요` : "오늘 할 일이에요"}</h1>
          {centerWide && <p className="mt-0.5 text-[12px] text-muted">직접 맡은 회원이 없어서 센터 전체 기준으로 보여드려요.</p>}
        </div>
        <Link href={hrefFor(9)} className="text-[13px] text-sub hover:text-ink">스케줄 전체 보기 →</Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat icon={CalendarDays} label="오늘 수업" value={`${appts.length}건`} sub={appts.length ? `완료 ${done} · 남음 ${appts.length - done}` : "예약 없음"} />
        <Stat icon={UserPlus} label="오늘 신규 OT" value={`${todayOt.length}명`} sub={todayOt.length ? todayOt.map((a) => nameOf(a.user_id)).join(", ") : "없음"} tone="ot" />
        <Stat icon={ClipboardCheck} label="운동일지 확인 대기" value={`${unconfirmed.length}명`} sub={unconfirmed.length ? `${unconfirmed.reduce((s, u) => s + u.n, 0)}건` : "다 확인됐어요"} tone={unconfirmed.length ? "primary" : "ink"} />
        <Stat icon={Sparkles} label="회원 페이지 새 기록" value={`${activity.length}명`} sub="최근 3일" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ① 오늘 일정 */}
        <Column title="오늘 일정" icon={CalendarDays}>
          <Card padding="none">
            {appts.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">오늘 예약이 없어요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {appts.map((a) => {
                  const m = byId.get(a.user_id);
                  const isOt = m && viewFor(m) === "ot";
                  const past = new Date(a.start_at) < now;
                  return (
                    <li key={a.id}>
                      <Link href={isOt ? `/ot/${a.user_id}/prep` : open(a.user_id)}
                        className={`flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-elevate ${a.status === "done" ? "opacity-60" : ""}`}>
                        <span className={`w-12 shrink-0 font-mono text-[14px] ${past && a.status !== "done" ? "text-danger-text" : "text-ink"}`}>{hhmm(a.start_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{nameOf(a.user_id)}</span>
                        {isOt ? <Badge tone="ot">OT · 준비</Badge> : <Badge tone="pt">PT</Badge>}
                        {a.status === "done" && <CheckCircle2 className="h-4 w-4 text-muted" aria-label="완료" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <TodoManual />
        </Column>

        {/* ② 오늘 챙길 회원 — '오늘' 화면과 같은 위젯 */}
        <Column title="오늘 챙길 회원" icon={Users}>
          <OwnerFeedbackToday members={members} uid={uid} />
          <ReapproachToday members={scoped} onSelect={(id) => go(id, 1)} />
          <RegisterDueToday members={scoped} onSelect={(id) => go(id, 11)} />
          <RegisterReapproachToday members={scoped} onSelect={(id) => go(id, 11)} />
          <UnclosedClosingToday members={scoped} onSelect={(id) => go(id, 5)} />
          <ChurnRiskToday members={scoped} onSelect={(id, t) => go(id, t ?? 10)} />
          <InbodyDueToday members={scoped} onSelect={(id) => go(id, 12)} />
          <p className="text-[12px] text-muted">해당하는 회원이 있을 때만 카드가 떠요.</p>
        </Column>

        {/* ③ 회원 쪽 소식 */}
        <Column title="회원 쪽 소식" icon={HeartPulse}>
          <Card padding="none">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-[14px] font-bold text-ink">운동일지 확인 대기</span>
              <span className="text-[12px] text-muted">회원이 아직 확인 안 함</span>
            </div>
            {unconfirmed.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-[13px] text-muted">모두 확인됐어요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {unconfirmed.slice(0, 6).map((u) => (
                  <li key={u.user_id}>
                    <Link href={hrefFor(10, u.user_id)} className="flex items-center justify-between px-4 py-2.5 text-[14px] no-underline hover:bg-elevate">
                      <span className="font-medium text-ink">{nameOf(u.user_id)}</span>
                      <span className="text-[12px] text-primary-strong">미확인 {u.n}건</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="none">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-[14px] font-bold text-ink">회원 페이지 새 기록</span>
              <span className="text-[12px] text-muted">최근 3일</span>
            </div>
            {activity.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-[13px] text-muted">새 기록이 없어요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {activity.slice(0, 6).map((a) => (
                  <li key={a.user_id}>
                    <Link href={open(a.user_id)} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-elevate">
                      <span className="w-16 shrink-0 truncate text-[14px] font-medium text-ink">{nameOf(a.user_id)}</span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12px] text-sub">
                        {a.items[0].kind === "photo" ? <Camera className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}
                        {a.items.slice(0, 2).map((i) => i.label).join(" · ")}{a.items.length > 2 ? ` 외 ${a.items.length - 2}` : ""}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">{dayAgo(a.items[0].at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <OunwanRanking members={members} uid={uid} />
          <NoNextBookingToday members={scoped} uid={uid} onSelect={(id) => go(id, 9)} limit={5} />
          <PastDueAppointments members={scoped} uid={uid} onSelect={(id) => go(id, 9)} />
        </Column>
      </div>
    </div>
  );
}
