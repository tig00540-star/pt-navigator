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
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-sm font-medium text-zinc-100">{value}</div>
      </div>
    </div>
  );
}

export default function FirstOTTab({ member }) {
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([]);

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
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-lime-400">
                    {member.session} · LIVE
                  </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
                  {member.name}
                  <span className="ml-2 font-mono text-lg font-normal text-zinc-500">
                    {member.age}세
                  </span>
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {member.job} · 목표{" "}
                  <span className="font-semibold text-lime-400">{member.goal}</span>
                </p>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                <Chip icon={MapPin} label="거주" value={member.residence} />
                <Chip icon={Brain} label="MBTI" value={member.mbti} />
                <Chip icon={Briefcase} label="직업" value={member.job} />
                <Chip icon={Activity} label="불편 부위" value={member.pain} />
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
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300"
              >
                {n.text}
              </span>
            ))}
          </div>
        )}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="현장 메모 빠르게 남기기…"
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-lime-500/50"
            />
            <button
              onClick={addNote}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95"
              aria-label="메모 저장"
            >
              <Send className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
    </>
  );
}
