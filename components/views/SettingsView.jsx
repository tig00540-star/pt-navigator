"use client";
/* 설정 탭 — 트레이너 본인 설정 모음(실적 조회와 분리). 각 컴포넌트 자기완결. */
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import PasswordChange from "@/components/views/PasswordChange";

export default function SettingsView() {
  return (
    <div className="space-y-6">
      <TrainerGoalSetter />
      <TrainerProfileSettings />
      <TrainerLibrary />
      <PtPricingSettings />
      <PasswordChange />
    </div>
  );
}
