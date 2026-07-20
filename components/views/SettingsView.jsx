"use client";
/* 설정 탭 — 서브탭 바는 상단 헤더(page.jsx)에서 렌더 · 여기선 sub prop으로 내용만 분기. 각 컴포넌트 자기완결. */
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import CenterMachineSettings from "@/components/views/CenterMachineSettings";
import PasswordChange from "@/components/views/PasswordChange";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";
import OunwanRewardSettings from "@/components/views/OunwanRewardSettings";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Card from "@/components/ui/Card";

// 상단 헤더 서브탭 바가 이 목록으로 렌더됨(page.jsx가 import). 라벨 단일 출처.
export const SETTINGS_SUBTABS = [
  { id: "me",      label: "내 정보" },
  { id: "money",   label: "정산" },
  { id: "gear",    label: "장비/큐" },
  { id: "library", label: "도서관" },
  { id: "reward",  label: "포상" },   // 오운완 누적 N회 → 보상 정의(회원앱 진행 바에 반영)
];

export default function SettingsView({ isSolo = false, sub = "me" }) {
  return (
    <div className="space-y-6">
      {sub === "me" && (
        <>
          <TrainerProfileSettings />
          <TrainerGoalSetter />
          <PasswordChange />
          {/* 로그아웃 — AuthGate의 전 화면 플로팅에서 이관(콘텐츠 가림 제거). signOut 시 onAuthStateChange가
              session=null로 만들어 로그인 폼으로 자동 전환(기존 흐름 재사용). supabase?는 데모모드 가드. */}
          <Card as="section">
            <Eyebrow icon={LogOut}>계정</Eyebrow>
            <button
              onClick={() => supabase?.auth.signOut()}
              className="mt-3 w-full rounded-lg border border-line bg-elevate px-4 py-2.5 text-sm font-medium text-sub transition hover:border-primary hover:text-primary-strong active:scale-95"
            >
              로그아웃
            </button>
          </Card>
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
      {sub === "reward" && <OunwanRewardSettings />}
    </div>
  );
}
