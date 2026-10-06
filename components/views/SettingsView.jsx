"use client";
/* 설정 탭 — 화면 안 알약 탭(2026-10-03 · PT · OT 회원 화면과 같은 모양 · 예전엔 헤더의 작은 탭) + sub prop으로 내용 분기.
   각 컴포넌트 자기완결. 주소는 그대로(/settings/{me|money|gear|library|reward}). */
import TrainerGoalSetter from "@/components/views/TrainerGoalSetter";
import TrainerProfileSettings from "@/components/views/TrainerProfileSettings";
import TrainerLibrary from "@/components/views/TrainerLibrary";
import PtPricingSettings from "@/components/views/PtPricingSettings";
import CenterMachineSettings from "@/components/views/CenterMachineSettings";
import PasswordChange from "@/components/views/PasswordChange";
import AdminPayrollSettings from "@/components/AdminPayrollSettings";
import OunwanRewardSettings from "@/components/views/OunwanRewardSettings";
import MyIntakeCard from "@/components/intake/MyIntakeCard";
import BookingPrefCard from "@/components/booking/BookingPrefCard";
import NotifySettings from "@/components/notify/NotifySettings";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// 화면 안 알약 탭 목록. 라벨 단일 출처. 'money'는 주소만 옛 이름 — 화면 글은 '가격표'(대표 화면 '정산'과 헷갈려서 · 2026-10-03).
export const SETTINGS_SUBTABS = [
  { id: "me",      label: "내 정보" },
  { id: "money",   label: "가격표" },
  { id: "gear",    label: "장비 · 큐" },
  { id: "library", label: "도서관" },
  { id: "reward",  label: "포상" },   // 오운완 누적 N회 → 보상 정의(회원앱 진행 바에 반영)
  { id: "notify",  label: "알림" },   // 폰 푸시 알림 켜기 · 종류별 on/off(2026-10-06)
];

export default function SettingsView({ isSolo = false, sub = "me" }) {
  return (
    <div className="space-y-6 break-keep text-pretty">
      <div className="flex overflow-x-auto">
        <nav className="flex gap-1 rounded-full bg-elevate p-[3px]" aria-label="설정">
          {SETTINGS_SUBTABS.map((t) => {
            const on = t.id === sub;
            return (
              <Link key={t.id} href={`/settings/${t.id}`} aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full px-3.5 text-[14px] transition ${on ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
                {isSolo && t.id === "money" ? "가격 · 급여" : t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {sub === "me" && (
        /* 넓은 화면(lg~): 왼쪽 세일즈북(길다) | 오른쪽 목표·비밀번호·계정. 폰은 순서 그대로 한 줄. */
        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
          <TrainerProfileSettings />
          <div className="space-y-6">
          <MyIntakeCard />
          <BookingPrefCard />
          <TrainerGoalSetter />
          <PasswordChange />
          {/* 로그아웃 — AuthGate의 전 화면 플로팅에서 이관(콘텐츠 가림 제거). signOut 시 onAuthStateChange가
              session=null로 만들어 로그인 폼으로 자동 전환(기존 흐름 재사용). supabase?는 데모모드 가드. */}
          {/* 로그아웃 — 카드 · 제목 없이 버튼 하나('계정' 제목이 비밀번호 카드와 겹쳐 보였다 · 2026-10-03). */}
          <button
            type="button"
            onClick={() => supabase?.auth.signOut()}
            className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border border-line bg-card px-4 text-[14px] font-semibold text-sub shadow-sm transition hover:border-primary hover:text-primary-strong active:scale-[0.99]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> 로그아웃
          </button>
          </div>
        </div>
      )}
      {sub === "money" && (
        /* 입력 폼이라 너무 넓으면 읽기 어렵다 — 넓은 화면에선 폭을 묶는다. */
        <div className="space-y-6 lg:max-w-3xl">
          <PtPricingSettings />
          {isSolo && <AdminPayrollSettings trainers={[]} solo />}
        </div>
      )}
      {sub === "gear" && <CenterMachineSettings />}
      {sub === "library" && <TrainerLibrary />}
      {sub === "reward" && <OunwanRewardSettings />}
      {sub === "notify" && <NotifySettings />}
    </div>
  );
}
