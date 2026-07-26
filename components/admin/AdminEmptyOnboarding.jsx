"use client";
/*
  빈상태 온보딩 배너 — admin 대시보드 상단(모든 탭 위).
  ★센터 전체가 비었을 때(visible 회원 0명)만 표시 → 회원이 한 명이라도 있으면 null(사라짐).
  부분 빈상태(특정 리스트만 빔)는 각 분석 컴포넌트의 기존 "~없습니다"가 담당한다.
  hidden(환불·소프트삭제) 제외는 이 컴포넌트가 책임(admin 관례 · members.filter(!hidden)).
  파생·저장 0 · 순수 표시.
*/

// 탭별 "이 화면은 이렇게 채워져요" 한 줄. atab id 기준(없으면 기본 문구).
const TAB_HINT = {
  briefing:  "회원을 등록하고 OT·수업을 진행하면, 매일 아침 ‘오늘 챙길 것 3가지’가 여기 떠요.",
  perf:      "회원을 배정하고 수업·클로징이 쌓이면 트레이너별 성적표가 채워져요.",
  revenue:   "등록·재등록 결제가 기록되면 매출 구성과 다음 달 예측이 채워져요.",
  funnel:    "OT 상담을 진행하면 등록으로 이어지는 전환 흐름이 채워져요.",
  retention: "회원이 쌓이면 만료 임박·이탈 위험 회원이 여기 떠요.",
  schedule:  "예약을 잡으면 시간대 밀도와 트레이너별 완료·노쇼가 채워져요.",
  payroll:   "급여 규칙을 정하고 수업이 쌓이면 트레이너별 급여가 계산돼요.",
  ops:       "트레이너를 초대하고 공지를 올리며 센터 운영을 시작하세요.",
};

export default function AdminEmptyOnboarding({ members = [], trainers = [], atab }) {
  const memberCount = members.filter((m) => !m.hidden).length;
  const trainerCount = trainers.length;
  if (memberCount > 0) return null; // 전체 빈상태에서만 노출

  const hint = TAB_HINT[atab] || "회원을 등록하면 이 대시보드가 채워지기 시작해요.";

  return (
    <div className="mb-6 rounded-2xl border border-line bg-elevate p-5">
      <div className="text-[11px] font-semibold tracking-label-ko text-primary-strong">
        센터를 시작하는 중
      </div>
      <h2 className="mt-1 text-base font-bold text-ink">아직 데이터가 쌓이기 전이에요</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{hint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
          현재 트레이너 <b className="text-ink">{trainerCount}명</b>
        </span>
        <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-sub">
          회원 <b className="text-ink">{memberCount}명</b>
        </span>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        회원 등록 → OT 진행 → 수업 기록이 쌓이면 각 탭이 자동으로 채워져요.
      </p>
    </div>
  );
}
