"use client";

/* =========================================================================
   OwnerHub — 대표 화면의 첫 화면(홈). 9개 탭을 5개 묶음으로 보여준다.

   ── 왜 ──
   대표는 하루에 여러 번 열지 않는다. 오랜만에 열었을 때 "뭐부터 보지"가 되지 않도록
   할 일 → 돈 → 사람 → 회원 흐름 → 운영 순서로 줄을 세운다.

   ── 숫자는 파생만 ──
   admin이 이미 로드한 배열을 props로 받아 lib/memberStatus 파생 함수로 계산한다.
   DB 조회 0건 · 마이그레이션 0 · RLS 무변(대시보드 규율 그대로).
   ⚠️ hidden(환불·소프트삭제) 필터는 컴포넌트 책임 — 여기서 걸러 넘긴다.
   ========================================================================= */

import { AlertTriangle, ChevronRight, Users, Wallet, Repeat2, Settings2, Receipt } from "lucide-react";
import Card from "@/components/ui/Card";
import { won } from "@/lib/format";
import {
  ownerBriefing,
  revenueCompositionInMonth,
  otFunnel,
  reregisterStats,
} from "@/lib/memberStatus";

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
// 큰 금액은 만원 단위로 접어 읽기 쉽게(대시보드 막대 라벨과 같은 규칙).
const manwon = (n) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString("ko-KR")}만원` : won(n));

function Tile({ icon: Icon, title, desc, tone, onClick }) {
  return (
    <Card as="button" interactive padding="md" onClick={onClick}
      className="flex min-h-[124px] flex-col items-start justify-between text-left active:scale-[0.97]">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="mt-3 block">
        <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-1 block text-[12px] font-medium leading-relaxed text-muted">{desc}</span>
      </span>
    </Card>
  );
}

export default function OwnerHub({
  members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [],
  trainers = [], ym, centerName, onGoTab,
}) {
  const visible = members.filter((m) => !m.hidden);
  const nowISO = new Date().toISOString();

  const brief = ownerBriefing({ members: visible, otRows, contracts, logs, appts, goals, ym, nowISO });
  const top = brief.slice(0, 3);
  const atRisk = top.reduce((s, c) => s + (c.impact || 0), 0);

  const rev = revenueCompositionInMonth(contracts, ym);
  const funnel = otFunnel(visible, otRows);
  const rereg = reregisterStats(contracts);
  const convRate = funnel.intake ? funnel.confirmed / funnel.intake : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-medium text-muted">{ym}</p>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ink">
          {centerName || "내 센터"} 현황
        </h1>
      </div>

      {/* 가장 먼저 봐야 할 한 줄 — 지금 손쓰면 지킬 수 있는 금액. 브리핑 top3의 영향액 합. */}
      <Card as="button" interactive padding="sm" onClick={() => onGoTab("briefing")}
        className="flex w-full items-center justify-between gap-3 border-primary/30 bg-primary-soft text-left active:scale-[0.99]">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary-strong">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-primary-strong">지금 손쓰면 지킬 수 있는 매출</span>
            <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-ink">
              {top.length === 0 ? "오늘은 급한 건이 없습니다" : `약 ${manwon(atRisk)} · ${top.length}건`}
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary-strong" />
      </Card>

      <div className="stagger grid grid-cols-2 gap-3">
        <Tile
          icon={AlertTriangle} title="오늘 챙길 것"
          desc={brief.length ? `${brief.length}건 · 금액 큰 순서` : "지금은 비어 있어요"}
          tone="bg-admin-soft text-admin-text"
          onClick={() => onGoTab("briefing")}
        />
        <Tile
          icon={Wallet} title="매출"
          desc={`이달 ${manwon(rev.net)} · 신규 ${rev.cntNew}건 · 재등록 ${rev.cntRe}건`}
          tone="bg-primary-soft text-primary-strong"
          onClick={() => onGoTab("revenue")}
        />
        <Tile
          icon={Users} title="트레이너"
          desc={trainers.length ? `${trainers.length}명 · 성과와 급여` : "아직 초대 전이에요"}
          tone="bg-ot-soft text-ot-text"
          onClick={() => onGoTab("perf")}
        />
        <Tile
          icon={Repeat2} title="회원 흐름"
          desc={`전환 ${pct(convRate)} · 재등록 ${pct(rereg.rate)}`}
          tone="bg-pt-soft text-pt-text"
          onClick={() => onGoTab("funnel")}
        />
        <Tile
          icon={Settings2} title="운영"
          desc="스케줄 · 초대 · 공지 · 회원 배정"
          tone="bg-bg text-sub"
          onClick={() => onGoTab("schedule")}
        />
        <Tile
          icon={Receipt} title="정산"
          desc="기간 매출·지출·순이익 · FC매출 입력"
          tone="bg-primary-soft text-primary-strong"
          onClick={() => onGoTab("settle")}
        />
        <Tile
          icon={ChevronRight} title="한눈에"
          desc="센터 전체 지표를 한 화면에서"
          tone="bg-elevate text-sub"
          onClick={() => onGoTab("overview")}
        />
      </div>
    </div>
  );
}
