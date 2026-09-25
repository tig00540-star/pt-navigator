/* =========================================================================
   TrainerHub — 로그인 후 첫 화면(홈). 트레이너가 "무엇을 할지" 한 화면에서 고른다.

   ── 왜 허브인가 ──
   기존 진입은 상단 워크플로우 탭 + 하단 4탭이었고, 회원을 고르기 전엔 OT/PT 탭이
   나타나지도 않아 "지금 뭘 할 수 있는지"가 화면에 없었다. 허브는 그 지도를 만든다.
   하단바는 그대로 둔다 — 허브는 첫 화면이고, 섹션 간 이동은 계속 하단바가 맡는다.

   ── 숫자는 파생만 ──
   조회 0건. 이미 로드된 members에서 viewFor로 센 수만 보여준다.
   실적·이탈 위험처럼 추가 조회가 필요한 숫자는 넣지 않는다(허브가 느려지면 의미가 없다).

   purge-safe: 색은 완성 클래스 정적 리터럴. 역할 색 위 글자는 -text 토큰(CLAUDE.md 규약).
   ========================================================================= */
"use client";

import { CalendarDays, ChevronRight, Award, Settings, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import { viewFor } from "@/lib/memberStatus";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function Tile({ icon: Icon, label, title, desc, tone, onClick }) {
  return (
    <Card as="button" interactive padding="md" onClick={onClick}
      className="flex min-h-[124px] flex-col items-start justify-between text-left active:scale-[0.97]">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        {Icon ? <Icon className="h-5 w-5" strokeWidth={2.2} /> : <span className="text-[13px] font-extrabold">{label}</span>}
      </span>
      <span className="mt-3 block">
        <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-1 block text-[12px] font-medium leading-relaxed text-muted">{desc}</span>
      </span>
    </Card>
  );
}

export default function TrainerHub({ members = [], trainerName, onGo, onAdd }) {
  const counts = { ot: 0, pt: 0, inactive: 0 };
  for (const m of members) {
    const v = viewFor(m);
    if (v in counts) counts[v] += 1;
  }

  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-medium text-muted">{dateLabel}</p>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ink">
          {trainerName ? `${trainerName} 트레이너님` : "오늘도 반갑습니다"}
        </h1>
      </div>

      <Card as="button" interactive padding="sm" onClick={() => onGo(8)}
        className="flex w-full items-center justify-between gap-3 text-left active:scale-[0.99]">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
            <Award className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-muted">이번 달 내 실적</span>
            <span className="block truncate text-[14px] font-extrabold tracking-[-0.02em] text-ink">
              등록과 재등록 현황 보기
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-line-strong" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          icon={CalendarDays} title="오늘" desc="스케줄과 오늘 할 일"
          tone="bg-primary-soft text-primary-strong"
          onClick={() => onGo(9)}
        />
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
        <Tile
          icon={Settings} title="설정" desc="목표 · 자료 · 가격"
          tone="bg-bg text-sub"
          onClick={() => onGo(7)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-sub shadow-sm transition hover:border-primary hover:text-primary-strong active:scale-95"
        >
          <UserPlus className="h-3.5 w-3.5" /> 신규 회원 등록
        </button>
        {counts.inactive > 0 && (
          <button
            onClick={() => onGo(0, { segment: "inactive" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-muted shadow-sm transition hover:text-ink active:scale-95"
          >
            지난 회원 {counts.inactive}명
          </button>
        )}
      </div>

    </div>
  );
}
