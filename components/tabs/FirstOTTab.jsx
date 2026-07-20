"use client";

/* =========================================================================
   탭1 · 1차 OT — 신 AI ① 블록(FirstOTAssist) 중심. (스텝5: 구 스캐폴드 은퇴 완료)
   회원 기본정보 카드(user_table 실데이터) + ① AI 지원 + 현장 메모(notes)만 남김.
   타임라인·타이머·구 대본(SALES_SCRIPT)·루틴(ROUTINE)·즉효운동(MOBILITY)·재정추정
   (FINANCE)·클로징 빌더(STIMULUS/KNEE/MOOD/buildClosing)는 전부 제거.
   ========================================================================= */

import { useState } from "react";
import { Activity, Brain, Briefcase, MapPin, Send } from "lucide-react";
import FirstOTAssist from "@/components/tabs/FirstOTAssist";
import { STATUS_OPTS, labelOf } from "@/lib/labels";
import { hasVal } from "@/lib/format";

// 상태 배지 색(정적 클래스맵 · Tailwind purge 안전 — 동적 조립 금지). 값=user_table.status.
const STATUS_TONE = {
  ot_active: "border-primary/30 bg-primary-soft text-primary-strong",
  pt_active: "border-primary/30 bg-primary-soft text-primary-strong",
  inactive:  "border-line bg-elevate text-sub",
};

// 유지(§0.1 파킹): [단계적] package_suggestion가 소비 예정. 현재 렌더 미소비.
const PACKAGES = [
  {
    id: "starter",
    name: "스타터",
    sessions: 12,
    weeks: "주 2회 · 6주",
    perSession: 65000,
    total: 780000,
    note: "감 잡기용. 목표엔 다소 부족.",
    recommended: false,
  },
  {
    id: "core",
    name: "바디프로필 코어",
    sessions: 24,
    weeks: "주 2~3회 · 12주",
    perSession: 60000,
    total: 1440000,
    note: "12주 역산 시 목표 데드라인에 정확히 도달.",
    recommended: true,
  },
  {
    id: "premium",
    name: "프리미엄",
    sessions: 36,
    weeks: "주 3회 · 12주",
    perSession: 55000,
    total: 1980000,
    note: "최단기간 완성 · 회당 단가 최저.",
    recommended: false,
  },
];

function Chip({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" />
      <div className="leading-tight">
        <div className="text-[10px] tracking-label-ko text-muted">{label}</div>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  );
}

export default function FirstOTTab({ member }) {
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([]);
  const goalSet = hasVal(member.goal) && member.goal !== "미설정";

  const addNote = () => {
    const v = note.trim();
    if (!v) return;
    setNotes((n) => [{ id: Date.now(), text: v }, ...n].slice(0, 12));
    setNote("");
  };

  return (
    <>
      <div className="mb-6">
        <FirstOTAssist member={member} />
      </div>
      {/* 회원 기본정보 카드 (user_table 실데이터 · ① AI 입력 소스) */}
        <section className="mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-sm p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary-soft blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className={`mb-2 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-label-ko ${STATUS_TONE[member.status] ?? "border-line bg-elevate text-sub"}`}>
                  {labelOf(STATUS_OPTS, member.status)}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                  {member.name}
                  {hasVal(member.age) && (
                    <span className="ml-2 font-mono text-lg font-normal text-muted">
                      {member.age}세
                    </span>
                  )}
                </h1>
                <p className="mt-1 text-sm text-sub">
                  {hasVal(member.job) && <>{member.job} · </>}목표{" "}
                  {goalSet
                    ? <span className="font-semibold text-primary-strong">{member.goal}</span>
                    : <span className="text-muted">미설정</span>}
                </p>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                {hasVal(member.residence) && <Chip icon={MapPin} label="거주" value={member.residence} />}
                {hasVal(member.mbti) && <Chip icon={Brain} label="MBTI" value={member.mbti} />}
                {hasVal(member.job) && <Chip icon={Briefcase} label="직업" value={member.job} />}
                {hasVal(member.pain) && <Chip icon={Activity} label="불편 부위" value={member.pain} />}
              </div>
            </div>
          </div>
        </section>

        {/* logged notes */}
        {notes.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {notes.map((n) => (
              <span
                key={n.id}
                className="rounded-full border border-line bg-card px-3 py-1 text-xs text-sub"
              >
                {n.text}
              </span>
            ))}
          </div>
        )}
        {/* 인플로우 카드 — 예전엔 `fixed inset-x-0 bottom-0 z-30`이었는데 전역 BottomNav도 bottom-0 z-40이라
            메모바가 탭바 뒤로 눌렸다(하단탭바 도입 때 안 올린 회귀). 바닥 고정 요소는 탭바 하나로 정리.
            루트의 pb-28(탭바 여백)은 유지 — 인플로우라 탭바에 가리지 않음. */}
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-sm">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="현장 메모 빠르게 남기기…"
            className="flex-1 rounded-xl border border-line bg-elevate px-4 py-2.5 text-sm text-ink placeholder-muted outline-none transition focus:border-primary"
          />
          <button
            onClick={addNote}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 transition active:scale-95"
            aria-label="메모 저장"
          >
            <Send className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
    </>
  );
}
