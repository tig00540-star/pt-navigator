"use client";

/* =========================================================================
   PT 뷰 — §5 하이브리드 의도의 빈 껍데기(내용물은 로드맵 ③).
   목적 = 만족도 관리(재등록은 그 결과). 본체는 운동일지 타임라인·현재 방향/목표,
   재등록은 그 위에 얹히는 축. origin 독립(인계·외부 PT도 OT 기록 없이 성립).
   지금은 회원 기본정보 + 플레이스홀더만. session_log·payment 붙는 ③에서 채운다.
   ========================================================================= */

import { Dumbbell } from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";

export default function PTView({ member }) {
  return (
    <div className="space-y-6">
      {/* 회원 기본정보 (간단) */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
          PT 회원
        </span>
        <h1 className="mt-2 text-2xl font-bold text-zinc-50">
          {member.name}
          <span className="ml-2 font-mono text-base font-normal text-zinc-500">{member.age}세</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {member.job} · 목표 <span className="font-semibold text-emerald-400">{member.goal}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">거주 {member.residence}</span>
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">MBTI {member.mbti}</span>
          <span className="rounded-md bg-zinc-800/70 px-2 py-1">불편 {member.pain}</span>
        </div>
      </section>

      {/* §5 의도 플레이스홀더 (③에서 구현) */}
      <section className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/20 p-6">
        <Eyebrow icon={Dumbbell}>PT 관리 뷰 (③에서 구현)</Eyebrow>
        <p className="text-sm leading-relaxed text-zinc-300">
          만족도 관리로 재등록까지 잇는 뷰. 본체는 <b className="text-zinc-100">운동일지 타임라인</b>(음성 AI 일지)과{" "}
          <b className="text-zinc-100">현재 방향/목표</b>이고, 재등록(만기·잔여세션·타이밍)은 그 위에 얹힙니다.
          <span className="text-zinc-500"> origin 독립 — 인계·외부 PT 회원도 OT 기록 없이 성립.</span>
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          ※ 내용물은 로드맵 ③(`daily_workout_log` 타임라인 · `user_table` 현재 방향 · `session_log`·`payment`)에서
          채웁니다. 지금은 뷰 자리만.
        </p>
      </section>
    </div>
  );
}
