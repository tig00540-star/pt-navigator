"use client";
/* 설정 탭 — 트레이너 본인 설정 모음. 내부 서브탭으로 분리(내 정보/정산/장비·큐/도서관). 각 컴포넌트 자기완결. */
import { useState } from "react";
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import CenterMachineSettings from "@/components/views/CenterMachineSettings";
import PasswordChange from "@/components/views/PasswordChange";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";

const SUBTABS = [
  { id: "me",      label: "내 정보" },
  { id: "money",   label: "정산" },
  { id: "gear",    label: "장비/큐" },
  { id: "library", label: "도서관" },
];

export default function SettingsView({ isSolo = false }) {
  const [sub, setSub] = useState("me");
  return (
    <div className="space-y-6">
      <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap border-b border-line">
        {SUBTABS.map((t) => {
          const on = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${on ? "text-primary-strong" : "text-muted hover:text-ink"}`}
            >
              {t.label}
              {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      <div className="space-y-6">
        {sub === "me" && (
          <>
            <TrainerProfileSettings />
            <TrainerGoalSetter />
            <PasswordChange />
          </>
        )}
        {sub === "money" && (
          <>
            <PtPricingSettings />
            {isSolo && <AdminPayrollSettings trainers={[]} solo />}
          </>
        )}
        {sub === "gear" && <CenterMachineSettings />}
        {sub === "library" && <TrainerLibrary />}
      </div>
    </div>
  );
}
