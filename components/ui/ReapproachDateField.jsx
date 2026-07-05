"use client";

/* =========================================================================
   보류 클로징 재접근 예정일 입력 (B안: 프리셋 + 수동 오버라이드).
   closing_result==='hold'일 때만 노출. 값은 'YYYY-MM-DD'(date 컬럼). 비면 null 저장 → reader 제외.
   1차(ObservationTab)·2차(SecondOTTab) 공용. 날짜 계산은 lib/memberStatus의 순수 함수 사용.
   ========================================================================= */

import { reapproachPreset } from "@/lib/memberStatus";

const PRESETS = [
  { key: "2w", label: "2주" },
  { key: "1m", label: "1개월" },
  { key: "3m", label: "3개월" },
];

export default function ReapproachDateField({ value, onChange }) {
  // 오늘(로컬 달력일) — 컴포넌트는 now 읽어도 됨(순수 모듈이 아님). 프리셋 계산엔 순수 함수 주입.
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const todayISO = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-zinc-500">
        재접근 예정일 <span className="text-zinc-600">(보류 후속 · &lsquo;오늘 재접근&rsquo; 리스트 재료)</span>
      </label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(reapproachPreset(preset.key, todayISO))}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-lime-500/50 hover:text-lime-400 active:scale-95"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-lime-500/50"
      />
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        프리셋을 탭하면 오늘 기준으로 채워지고, 날짜를 직접 골라 덮어쓸 수 있어요. 비우면 저장은 되되 &lsquo;오늘 재접근&rsquo;엔 안 뜹니다.
      </p>
    </div>
  );
}
