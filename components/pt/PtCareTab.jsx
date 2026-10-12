"use client";

/* =========================================================================
   케어 탭(2026-10-11 · PT 회원 화면 넷째 칸) — 수업 밖에서 회원을 챙기는 것을 한곳에.
   대시보드가 4.5화면까지 길어져 나눴다: 대시보드 = 매일 보는 것 · 케어 = 한 번 만들고 가끔 고치는 것.
   순서: 현재 방향 · 목표 → 목표 로드맵 → 개인운동 루틴 → 회원 전용 페이지(셋 다 회원 화면에 보이는 것의 출발점).
   데이터: 계약 · 수업 기록은 PTView가 읽어 넘긴다. 각 카드는 자기 표를 스스로 읽는다(회원 1명 소량).
   ========================================================================= */

import DirectionCard from "@/components/pt/DirectionCard";
import DietCard from "@/components/diet/DietCard";
import { remainingSessions } from "@/lib/memberStatus";
import RoadmapCard from "@/components/pt/RoadmapCard";
import RoutineCard from "@/components/pt/RoutineCard";
import { Smartphone } from "lucide-react";
import MemberAppLink from "@/components/views/MemberAppLink";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

export default function PtCareTab({ member, contracts = [], setContracts, logs = [], onMemberPatch }) {
  return (
    <div className="space-y-6">
      <DirectionCard member={member} contracts={contracts} setContracts={setContracts} logs={logs} onMemberPatch={onMemberPatch} />
      {/* 식단 관리(2026-10-11 · 1단계) — 켜면 회원이 사진을 올리고 하루 한 번 피드백 · 요청 */}
      <DietCard member={member} noSessions={contracts.length > 0 && contracts.reduce((n, c) => n + remainingSessions(c, logs).total, 0) === 0} />
      {/* 목표 로드맵 — 회원 전용 페이지 '내 PT'에 보이는 단계(트레이너가 만들고 켤 때만 · 2026-10-03) */}
      <RoadmapCard member={member} contracts={contracts} logs={logs} />
      {/* 개인운동 루틴 — 회원 전용 페이지 '오늘 할 개인운동'(트레이너 확정 · 보이기 켤 때만 · 2026-10-04) */}
      <RoutineCard member={member} logs={logs} />
      {/* 회원 전용 페이지 링크 — 예전엔 자료남기기 '더 보기' 안(2026-10-11 여기로) */}
      <Card as="section">
        <SectionTitle icon={Smartphone}>회원 전용 페이지</SectionTitle>
        <p className="-mt-1.5 mb-3 text-[13px] leading-relaxed text-sub">로드맵 · 루틴 · 운동일지를 회원이 이 링크로 봐요.</p>
        <MemberAppLink member={member} onMemberPatch={onMemberPatch} plain />
      </Card>
    </div>
  );
}
