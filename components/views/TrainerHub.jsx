/* =========================================================================
   TrainerHub — 폰 홈(로그인 후 첫 화면). 넓은 화면은 components/home/WideHome(고정 · 편집 없음).

   2026-10-02 개편(OT · PT 회원 화면과 같은 모양):
     ① 인사(날짜 + 이름)
     ② 오늘 카드(고정) — 오늘 수업 수 · 오늘 신규 OT · 다음 수업 바로가기(OT면 준비하기, PT면 회원 대시보드)
     ③ 바로가기 칸 ④ 정보 카드 ⑤ 신규 회원 등록 · 지난 회원 · 홈 편집
   2026-10-03 위젯 편집(대표: "트레이너가 넣고 뺄 수 있게"): ③·④는 트레이너가 고른다(components/home/homeLayout ·
     이 기기에 저장). 처음 상태 = 바로가기 4칸(OT 회원 · PT 회원 · 세일즈북 · 내 실적) + 오운완 랭킹.
     정보 카드는 '오늘' 탭과 같은 컴포넌트(숫자 기준 하나) · 해당 회원이 없으면 카드가 스스로 숨는다.
   조회: 오늘 예약 1콜 + 고른 카드가 각자 조회. 회원 수는 이미 로드된 members에서 센다.
   범위: 내 담당(직접 맡은 회원이 없는 대표는 센터 전체 · WideHome과 같은 규칙).
   purge-safe: 색은 완성 클래스 정적 리터럴. 역할 색 위 글자는 -text 토큰.
   ========================================================================= */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Award, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Images, LayoutGrid, Minus, Plus,
  Presentation, Receipt, UserPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import { viewFor } from "@/lib/memberStatus";
import { hrefFor, hrefForMember } from "@/lib/nav";
import OunwanRanking from "@/components/home/OunwanRanking";
import MonthNumbers from "@/components/home/MonthNumbers";
import { useHomeLayout, TILE_IDS, CARD_IDS, DEFAULT_LAYOUT } from "@/components/home/homeLayout";
import RegisterDueToday from "@/components/views/RegisterDueToday";
import ChurnRiskToday from "@/components/views/ChurnRiskToday";
import UnconfirmedConfirmToday from "@/components/views/UnconfirmedConfirmToday";
import ReapproachToday from "@/components/views/ReapproachToday";
import OwnerFeedbackToday from "@/components/views/OwnerFeedbackToday";
import InbodyDueToday from "@/components/views/InbodyDueToday";
import RoutineRequestToday from "@/components/views/RoutineRequestToday";
import PtEndToday from "@/components/views/PtEndToday";
import PriceSheet from "@/components/salesbook/PriceSheet";
import { useSalesbookAssets } from "@/components/salesbook/DeckLauncher";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const ymdKST = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

// 바로가기 칸 — 이름·설명·색. 설명이 회원 수에 따라 바뀌는 칸은 desc(counts).
const TILES = {
  ot: { label: "OT", title: "OT 회원", desc: (c) => (c.ot > 0 ? `${c.ot}명 · 등록 전` : "등록 전 회원"), tone: "bg-ot-soft text-ot-text" },
  pt: { label: "PT", title: "PT 회원", desc: (c) => (c.pt > 0 ? `${c.pt}명 · 진행 중` : "수업 중인 회원"), tone: "bg-pt-soft text-pt-text" },
  salesbook: { icon: Presentation, title: "세일즈북", desc: () => "발표 자료 · 변화 사례", tone: "bg-elevate text-sub" },
  stats: { icon: Award, title: "내 실적", desc: () => "등록 · 재등록 현황", tone: "bg-primary-soft text-primary-strong" },
  schedule: { icon: CalendarDays, title: "스케줄", desc: () => "예약 · 오늘 일정", tone: "bg-primary-soft text-primary-strong" },
  cases: { icon: Images, title: "사례 보관함", desc: () => "비포 · 애프터 · 후기", tone: "bg-elevate text-sub" },
  price: { icon: Receipt, title: "PT 가격표", desc: () => "회원에게 바로 보여주기", tone: "bg-elevate text-sub" },
  add: { icon: UserPlus, title: "신규 회원 등록", desc: () => "OT · PT 회원 추가", tone: "bg-primary-soft text-primary-strong" },
};
const CARDS = {
  ranking: { title: "오운완 랭킹", hint: "이번 달 · 연속일 상위 회원" },
  numbers: { title: "이번 달 내 숫자", hint: "신규 등록 · 재등록 · 매출" },
  regdue: { title: "재등록 타이밍", hint: "남은 수업 10회 미만 회원" },
  churn: { title: "이탈 위험", hint: "2주 넘게 수업이 없는 회원" },
  unconfirmed: { title: "운동일지 미확인", hint: "오늘 오는 회원 중 확인 안 한 일지" },
  reapproach: { title: "OT 다시 연락할 회원", hint: "보류한 OT 회원 중 연락할 날이 된 회원" },
  inbody: { title: "인바디 잴 회원", hint: "마지막 측정이 2주 · 4주 넘은 PT 회원" },
};

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

// 가격표 — 누를 때만 패키지를 읽는다(홈이 열릴 때마다 조회하지 않게).
function PriceLauncher({ onClose }) {
  const { packages, trainer, ready } = useSalesbookAssets();
  if (!ready) return null;
  return <PriceSheet packages={packages} trainerName={trainer?.display_name || ""} onClose={onClose} />;
}

// 편집 — 한 묶음(바로가기 칸 / 정보 카드). 위·아래로 순서, 빼기, 아래 '추가할 수 있어요'에서 넣기.
function EditGroup({ title, ids, all, meta, onChange }) {
  const move = (i, d) => {
    const next = [...ids];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const hidden = all.filter((id) => !ids.includes(id));
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-sub transition hover:bg-elevate hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-sub">{title}</p>
      {ids.length === 0 ? (
        <p className="rounded-xl bg-elevate px-3.5 py-3 text-[13px] text-muted">아직 없어요. 아래에서 넣어 주세요.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
          {ids.map((id, i) => (
            <li key={id} className="flex min-h-[52px] items-center gap-1 pl-3.5 pr-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{meta[id].title}</span>
                {meta[id].hint && <span className="block truncate text-[12px] text-muted">{meta[id].hint}</span>}
              </span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${meta[id].title} 위로`} className={iconBtn}>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`${meta[id].title} 아래로`} className={iconBtn}>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`${meta[id].title} 빼기`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-danger-text transition hover:bg-elevate">
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <>
          <p className="mb-2 mt-3 text-[12px] text-muted">추가할 수 있어요</p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((id) => (
              <button key={id} type="button" onClick={() => onChange([...ids, id])}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-line bg-card px-3 text-[13px] text-ink transition hover:border-line-strong">
                <Plus className="h-3.5 w-3.5 text-primary-strong" aria-hidden="true" /> {meta[id].title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function TrainerHub({ members = [], uid, trainerName, onGo, onAdd }) {
  const router = useRouter();
  const [layout, saveLayout] = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const counts = { ot: 0, pt: 0, inactive: 0 };
  for (const m of members) {
    const v = viewFor(m);
    if (v in counts) counts[v] += 1;
  }

  // 내 담당(직접 맡은 회원이 없는 대표는 센터 전체).
  const centerWide = Boolean(uid) && members.length > 0 && !members.some((m) => m.trainer_id === uid);
  const scoped = useMemo(() => (uid && !centerWide ? members.filter((m) => m.trainer_id === uid) : members), [members, uid, centerWide]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // 오늘 예약(내 담당 · 취소 제외). 키 없는 데모 모드는 빈 채로.
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

  const go = (id, toTab) => router.push(hrefFor(toTab, id));
  const tileAction = {
    ot: () => onGo(0, { segment: "ot" }),
    pt: () => onGo(0, { segment: "pt" }),
    salesbook: () => onGo("salesbook"),
    stats: () => onGo(8),
    schedule: () => onGo(9),
    cases: () => router.push("/salesbook/cases"),
    price: () => setPriceOpen(true),
    add: onAdd,
  };
  // 카드 — 위젯마다 ToneCard의 아래 여백(mb-4)이 있어 홈 간격과 겹치지 않게 감싼 쪽에서 지운다.
  const renderCard = (id) => {
    switch (id) {
      case "ranking": return <OunwanRanking members={members} uid={uid} />;
      case "numbers": return <MonthNumbers uid={uid} />;
      case "regdue": return <RegisterDueToday members={scoped} onSelect={(mid) => go(mid, 11)} />;
      case "churn": return <ChurnRiskToday members={scoped} onSelect={(mid, t) => go(mid, t ?? 10)} />;
      case "unconfirmed": return <UnconfirmedConfirmToday members={scoped} uid={uid} onSelect={(mid) => go(mid, 10)} />;
      case "reapproach": return <ReapproachToday members={scoped} onSelect={(mid) => go(mid, 1)} />;
      case "inbody": return <InbodyDueToday members={scoped} onSelect={(mid) => go(mid, 12)} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4 break-keep text-pretty">
      <div>
        <p className="text-[13px] text-muted">{dateLabel}</p>
        <h1 className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">
          {trainerName ? `${trainerName} 트레이너님` : "오늘도 반가워요"}
        </h1>
      </div>

      {/* 오늘 — 고정. 숫자 2칸 + 다음 수업 바로가기 */}
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

      {/* 대표 피드백 — 편집 목록과 무관하게, 확인 안 한 게 있을 때만 */}
      <div className="[&>section]:mb-0 empty:hidden"><OwnerFeedbackToday members={members} uid={uid} /></div>
      {/* 루틴 요청 — 있을 때만(회원이 회원 전용 페이지에서 요청) */}
      <div className="[&>section]:mb-0 empty:hidden"><RoutineRequestToday members={scoped} onSelect={(mid) => go(mid, 10)} /></div>
      {/* PT 종료 처리할까요? — 남은 수업 0회 회원이 있을 때만 */}
      <div className="[&>section]:mb-0 empty:hidden"><PtEndToday members={scoped} onSelect={(mid) => go(mid, 11)} /></div>

      {editing ? (
        <Card as="section" className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={LayoutGrid} className="mb-0">홈 편집</SectionTitle>
            <button type="button" onClick={() => setEditing(false)}
              className="inline-flex min-h-[40px] items-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-strong">
              완료
            </button>
          </div>
          <p className="-mt-3 text-[13px] text-sub">바꾼 구성은 바로 저장돼요. 이 폰에만 적용돼요.</p>
          <EditGroup title="바로가기 칸" ids={layout.tiles} all={TILE_IDS} meta={TILES}
            onChange={(tiles) => saveLayout({ ...layout, tiles })} />
          <EditGroup title="정보 카드" ids={layout.cards} all={CARD_IDS} meta={CARDS}
            onChange={(cards) => saveLayout({ ...layout, cards })} />
          <p className="text-[12px] leading-relaxed text-muted">정보 카드는 해당하는 회원이 있을 때만 홈에 보여요.</p>
          <button type="button" onClick={() => saveLayout(null)}
            disabled={JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT)}
            className="min-h-[36px] text-[13px] font-semibold text-sub underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 disabled:hover:no-underline">
            처음 구성으로 되돌리기
          </button>
        </Card>
      ) : (
        <>
          {layout.tiles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {layout.tiles.map((id) => {
                const t = TILES[id];
                return <Tile key={id} icon={t.icon} label={t.label} title={t.title} desc={t.desc(counts)} tone={t.tone} onClick={tileAction[id]} />;
              })}
            </div>
          )}
          {layout.cards.map((id) => (
            <div key={id} className="[&>section]:mb-0 empty:hidden">{renderCard(id)}</div>
          ))}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!layout.tiles.includes("add") && (
          <button type="button" onClick={onAdd}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-[13px] font-semibold text-ink shadow-sm transition hover:border-line-strong active:scale-[0.98]">
            <UserPlus className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 신규 회원 등록
          </button>
        )}
        {counts.inactive > 0 && (
          <button type="button" onClick={() => onGo(0, { segment: "inactive" })}
            className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-[13px] text-sub transition hover:text-ink">
            지난 회원 {counts.inactive}명
          </button>
        )}
        {!editing && (
          <button type="button" onClick={() => setEditing(true)}
            className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-sub transition hover:text-ink">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> 홈 편집
          </button>
        )}
      </div>

      {priceOpen && <PriceLauncher onClose={() => setPriceOpen(false)} />}
    </div>
  );
}
