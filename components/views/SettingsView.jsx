"use client";
/* 설정 탭 — 서브탭 바는 상단 헤더(page.jsx)에서 렌더 · 여기선 sub prop으로 내용만 분기. 각 컴포넌트 자기완결. */
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import CenterMachineSettings from "@/components/views/CenterMachineSettings";
import PasswordChange from "@/components/views/PasswordChange";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";

// 상단 헤더 서브탭 바가 이 목록으로 렌더됨(page.jsx가 import). 라벨 단일 출처.
export const SETTINGS_SUBTABS = [
  { id: "me",      label: "내 정보" },
  { id: "money",   label: "정산" },
  { id: "gear",    label: "장비/큐" },
  { id: "library", label: "도서관" },
];

export default function SettingsView({ isSolo = false, sub = "me" }) {
  return (
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
  );
}
