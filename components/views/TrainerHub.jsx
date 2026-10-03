/* =========================================================================
   TrainerHub — 폰 홈(로그인 후 첫 화면). 넓은 화면은 components/home/WideHome.

   2026-10-02 개편(OT · PT 회원 화면과 같은 모양 · 대표: "홈 탭부터"):
     ① 인사(날짜 + 이름)
     ② 오늘 카드 — 오늘 수업 수 · 오늘 신규 OT · 다음 수업 바로가기(OT면 준비하기, PT면 회원 대시보드)
     ③ 바로가기 4칸 — OT 회원 · PT 회원 · 세일즈북 · 내 실적(예전 '실적 보기' 줄 카드를 칸으로)
     ④ 이번 달 출석 랭킹 ⑤ 신규 회원 등록 · 지난 회원
   조회: 오늘 예약 1콜 + 출석 랭킹 rpc 1콜(둘 다 오늘·집계만이라 가볍다). 회원 수는 이미 로드된 members에서 센다.
   범위: 내 담당(직접 맡은 회원이 없는 대표는 센터 전체 · WideHome과 같은 규칙).
   purge-safe: 색은 완성 클래스 정적 리터럴. 역할 색 위 글자는 -text 토큰.
   ========================================================================= */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, CalendarDays, ChevronRight, Presentation, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import { viewFor } from "@/lib/memberStatus";
import { hrefForMember } from "@/lib/nav";
import AttendanceRanking from "@/components/home/AttendanceRanking";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const ymdKST = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

function Tile({ icon: Icon, label, title, desc, tone, onClick }) {
  return (
    <Card as="button" interactive padding="md" onClick={onClick}
      className="flex min-h-[112px] flex-col items-start justify-between text-left active:scale-[0.98]">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
        {Icon ? <Icon className="h-[18px] w-[18px]" aria-hidden="true" /> : <span className="text-[12px] font-bold">{label}</span>}
      </span>
      <span className="mt-3 block">
        <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
      </span>
    </Card>
  );
}

function Stat({ label, value, sub, accent = false }) {
  return (
    <div className="rounded-xl bg-elevate px-3.5 py-3">
      <span className="block text-[12px] text-muted">{label}</span>
      <span className={`mt-0.5 block text-[18px] font-bold tracking-[-0.02em] ${accent ? "text-primary-strong" : "text-ink"}`}>{value}</span>
      {sub && <span className="block truncate text-[12px] text-sub">{sub}</span>}
    </div>
  );
}

export default function TrainerHub({ members = [], uid, trainerName, onGo, onAdd }) {
  const counts = { ot: 0, pt: 0, inactive: 0 };
  for (const m of members) {
    const v = viewFor(m);
    if (v in counts) counts[v] += 1;
  }

  // 오늘 예약(내 담당 · 취소 제외). 키 없는 데모 모드는 빈 채로.
  const centerWide = Boolean(uid) && members.length > 0 && !members.some((m) => m.trainer_id === uid);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [appts, setAppts] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !uid) return;
      const startMs = new Date(`${ymdKST(new Date())}T00:00:00+09:00`).getTime();
      let q = supabase.from("appointment").select("id, user_id, start_at, status").neq("status", "canceled")
        .gte("start_at", new Date(startMs).toISOString()).lt("start_at", new Date(startMs + 86400000).toISOString())
        .order("start_at", { ascending: true });
      if (!centerWide) q = q.eq("trainer_id", uid);
      const { data, error } = await q;
      if (error) console.error("오늘 예약 조회 실패", error);
      if (!cancelled) setAppts(data || []);
    })();
    return () => { cancelled = true; };
  }, [uid, centerWide]);

  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`;
  const list = appts || [];
  const done = list.filter((a) => a.status === "done").length;
  const isOt = (a) => { const m = byId.get(a.user_id); return Boolean(m && viewFor(m) === "ot"); };
  const newOt = list.filter(isOt).length;
  const next = list.find((a) => a.status !== "done" && new Date(a.start_at).getTime() > now.getTime() - 30 * 60000) || null;
  const nextMember = next ? byId.get(next.user_id) : null;
  const nextIsOt = next ? isOt(next) : false;

  return (
    <div className="space-y-4 break-keep text-pretty">
      <div>
        <p className="text-[13px] text-muted">{dateLabel}</p>
        <h1 className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">
          {trainerName ? `${trainerName} 트레이너님` : "오늘도 반가워요"}
        </h1>
      </div>

      {/* 오늘 — 숫자 2칸 + 다음 수업 바로가기 */}
      <Card as="section">
        <SectionTitle icon={CalendarDays} aside={
          <button type="button" onClick={() => onGo(9)} className="inline-flex min-h-[32px] items-center gap-0.5 font-semibold text-sub hover:text-ink">
            스케줄 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }>오늘</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="오늘 수업" value={appts ? `${list.length}건` : "…"} sub={list.length ? `완료 ${done} · 남음 ${list.length - done}` : appts ? "예약 없음" : null} />
          <Stat label="오늘 신규 OT" value={appts ? `${newOt}명` : "…"} accent={newOt > 0}
            sub={newOt ? list.filter(isOt).map((a) => byId.get(a.user_id)?.name).filter(Boolean).join(", ") : appts ? "없음" : null} />
        </div>
        {next && (
          <Link href={nextIsOt ? `/ot/${next.user_id}/prep` : hrefForMember(next.user_id, nextMember ? viewFor(nextMember) : "pt")}
            className="mt-3 flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-primary px-4 text-white no-underline transition hover:bg-primary-strong">
            <span className="min-w-0">
              <span className="block text-[12px] text-white/80">다음 수업 · {hhmm(next.start_at)}</span>
              <span className="block truncate text-[16px] font-bold tracking-[-0.02em]">
                {nextMember?.name || "회원"} · {nextIsOt ? "OT 준비하기" : "회원 자료 보기"}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="OT" title="OT 회원" desc={counts.ot > 0 ? `${counts.ot}명 · 등록 전` : "등록 전 회원"}
          tone="bg-ot-soft text-ot-text"
          onClick={() => onGo(0, { segment: "ot" })}
        />
        <Tile
          label="PT" title="PT 회원" desc={counts.pt > 0 ? `${counts.pt}명 · 진행 중` : "수업 중인 회원"}
          tone="bg-pt-soft text-pt-text"
          onClick={() => onGo(0, { segment: "pt" })}
        />
        {/* 설정은 하단바에 있어 타일 자리를 세일즈북(사례 보관함)에 내준다(폰엔 하단바 칸이 없음). */}
        <Tile
          icon={Presentation} title="세일즈북" desc="발표 자료 · 변화 사례"
          tone="bg-elevate text-sub"
          onClick={() => onGo("salesbook")}
        />
        <Tile
          icon={Award} title="내 실적" desc="등록 · 재등록 현황"
          tone="bg-primary-soft text-primary-strong"
          onClick={() => onGo(8)}
        />
      </div>

      {/* 이번 달 출석 랭킹(오운완 기준 · 칭찬 · 포상할 회원) */}
      <AttendanceRanking members={members} uid={uid} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAdd}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-[13px] font-semibold text-ink shadow-sm transition hover:border-line-strong active:scale-[0.98]">
          <UserPlus className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 신규 회원 등록
        </button>
        {counts.inactive > 0 && (
          <button type="button" onClick={() => onGo(0, { segment: "inactive" })}
            className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-[13px] text-sub transition hover:text-ink">
            지난 회원 {counts.inactive}명
          </button>
        )}
      </div>
    </div>
  );
}
